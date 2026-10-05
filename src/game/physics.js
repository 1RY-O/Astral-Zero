/**
 * Astral Zero — Server physics step (Phase 3).
 * ============================================================
 * Integrates ONE entity for ONE tick (dt = 1/tickHz) from its intent:
 *
 *   intent = { moveX (-1..1), jump (edge), jumpHeld, aimX, aimY }
 *
 * MODEL (side-view arena jumper, Phaser-arcade-flavoured):
 *  - Horizontal: velocity approaches moveX×maxSpeed fast (snappy, janitor
 *    boots have grip). Airborne control scaled by airControl.
 *  - Vertical: gravity always; jump impulse when grounded OR inside coyote
 *    time; jump pressed slightly early is BUFFERED and fires on landing.
 *  - Facing follows aim (mouse side) when aim is far enough away, else
 *    follows motion — drives tracer direction + melee arc + sprite flip.
 *  - Collision via arena.moveAndCollide (axis-separated, walls/floor/platforms).
 *  - Dead entities don't integrate (corpses don't slide).
 *
 * Units: px, px/s, seconds. Pure function over (entity, intent, dt) apart
 * from reading tuning — trivially unit-testable (see smoke/unit checks).
 */

import config from '../server-config.js';
import { moveAndCollide } from './arena.js';
import { gravityAt } from './maps.js';

const sim = () => config.sim || {};

/**
 * Step one entity. Mutates the entity in place (tick-loop owned).
 *
 * Phase 5: gravity scales inside low-grav volumes (maps.gravityAt) —
 * floaty cryo-vent jumps, same code path. Pass a resolved map def (or
 * nothing for orbital_junkyard, i.e. legacy behavior exactly).
 * @param {object} e sim entity
 * @param {object} intent cleaned intent (see inputs.js)
 * @param {number} dt tick delta in seconds
 * @param {number} now server ms
 * @param {object|string|null} map map def or id (default: orbital_junkyard)
 */
export function stepEntity(e, intent, dt, now = Date.now(), map = null) {
  if (!e.alive) {
    e.vx = 0;
    e.vy = 0;
    return;
  }
  const maxSpeed = sim().maxSpeed || 260;
  const airControl = sim().airControl ?? 0.7;
  const gravity = sim().gravity || 1800;
  const jumpV = sim().jumpVelocity || 640;
  const radius = sim().entityRadius || 14;

  // -- Horizontal: exponential approach to target velocity -------------------
  // k≈12 grounded (snappy), scaled in air. Frame-rate independent via dt.
  const target = intent.moveX * maxSpeed;
  const k = (e.grounded ? 12 : 12 * airControl) * dt;
  e.vx += (target - e.vx) * Math.min(1, k);
  if (Math.abs(e.vx) < 1 && intent.moveX === 0) e.vx = 0;

  // -- Jump: edge → buffer; fire when grounded/coyote ----------------------------
  if (intent.jump) {
    e.jumpBufferUntil = now + (sim().jumpBufferMs || 120);
  }
  const canJump = e.grounded || now <= (e.coyoteUntil || 0);
  if (now <= (e.jumpBufferUntil || 0) && canJump) {
    e.vy = -jumpV;
    e.grounded = false;
    e.coyoteUntil = 0;
    e.jumpBufferUntil = 0;
  }

  // Variable jump height: releasing early halves upward velocity (feels right,
  // costs one branch). Only when moving up.
  if (!intent.jumpHeld && e.vy < -jumpV * 0.45) {
    e.vy = -jumpV * 0.45;
  }

  // -- Gravity (Phase 5: low-grav volumes scale it) --------------------------------
  e.vy += gravity * gravityAt(map, e.x, e.y) * dt;
  // Terminal velocity cap (prevents absurd falls after long drops).
  const terminal = 1100;
  if (e.vy > terminal) e.vy = terminal;

  // -- Integrate + collide --------------------------------------------------------
  const wasGrounded = e.grounded;
  const res = moveAndCollide(e.x, e.y, e.vx * dt, e.vy * dt, radius, map);
  e.x = res.x;
  e.y = res.y;
  if (res.hitWall) e.vx = 0;
  if (res.hitHead && e.vy < 0) e.vy = 0;
  if (res.landed) {
    e.vy = 0;
    e.grounded = true;
  } else {
    // Just walked off an edge? Start coyote time.
    if (wasGrounded) e.coyoteUntil = now + (sim().coyoteMs || 100);
    e.grounded = false;
  }

  // -- Facing: aim side wins (aim 12px+ away), else motion -------------------------
  const dx = intent.aimX - e.x;
  if (Math.abs(dx) > 12) e.facing = dx >= 0 ? 1 : -1;
  else if (Math.abs(e.vx) > 30) e.facing = e.vx > 0 ? 1 : -1;
}
