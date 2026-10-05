/**
 * Astral Zero — Projectiles (Phase 3).
 * ============================================================
 * Server-spawned, server-stepped, server-resolved. A projectile is:
 *
 *   { id, ownerId, ownerTeam, ownerIsBot, weaponId,
 *     x, y, vx, vy, damage, radius, splash, knockback,
 *     travelled, range, dead }
 *
 * STEP MODEL (runs inside the 20 Hz tick):
 *  - Move linearly (no gravity on bolts — arena shooters feel better flat).
 *  - Die past `range`, outside the arena, or on first entity contact.
 *  - Contact test: circle overlap with entity feet-point raised by ~20 px
 *    (feet y − 20 ≈ torso; bodies are ~28 px tall, radius-14 circles).
 *    Skips: the owner, dead entities, same-team entities (friendly fire OFF),
 *    and entities under spawn protection.
 *  - Splash weapons ALSO damage enemies near the impact point (same skip
 *    rules, half damage at edge — simple linear falloff).
 *
 * Every impact returns structured hit events so damage.js can credit kills,
 * and the loop can fan out tracers (already emitted at fire time).
 * Pure stepping (no io) — damage application + emits live in damage.js.
 */

import config from '../server-config.js';
import { rewindCircleTest } from '../lagcomp/rewind.js';

let projSeq = 0;

/**
 * Spawn a projectile from an entity toward an aim point.
 * @param {object} owner sim entity firing
 * @param {number} aimX / aimY world aim point (already validated/clamped)
 * @param {object} weapon weapons.js row
 * @returns {object} projectile
 */
export function spawnProjectile(owner, aimX, aimY, weapon) {
  projSeq += 1;
  const dx = aimX - owner.x;
  const dy = aimY - (owner.y - 20);
  if (dx === 0 && dy === 0) return null; // degenerate aim: no shot, no crash
  // Muzzle ≈ body edge toward aim (so bolts don't start inside the owner).
  const r = config.sim?.entityRadius || 14;
  const spread = (Math.random() - 0.5) * 2 * (weapon.spread || 0);
  const ang = Math.atan2(dy, dx) + spread;
  return {
    id: `pr_${projSeq}`,
    ownerId: owner.id,
    ownerTeam: owner.team,
    ownerIsBot: owner.isBot,
    weaponId: owner.weaponId || 'scrap-rifle',
    x: owner.x + Math.cos(ang) * (r + 6),
    y: owner.y - 20 + Math.sin(ang) * (r + 6),
    vx: Math.cos(ang) * weapon.speed,
    vy: Math.sin(ang) * weapon.speed,
    angle: ang,
    damage: weapon.damage,
    radius: weapon.radius,
    splash: weapon.splash || 0,
    knockback: weapon.knockback || 0,
    travelled: 0,
    range: weapon.range,
    // Phase 4 lag comp: who fired + how stale their view was. The step
    // function re-tests grace-band misses against rewound positions.
    shooterLatencyMs: owner.lastLatencyMs || 0,
    firedAt: Date.now(),
    dead: true === false, // always false; explicit for shape clarity
  };
}

/** Feet-point torso position (shared hit-test anchor). */
export function torso(e) {
  return { x: e.x, y: e.y - 20 };
}

function enemiesOnly(owner, e, now) {
  if (!e.alive || e.id === owner.ownerId) return false;
  if (owner.ownerTeam && e.team && owner.ownerTeam === e.team) return false;
  if (now < (e.protectedUntil || 0)) return false;
  return true;
}

/**
 * Step all projectiles one tick. Mutates the array in place (dead ones are
 * spliced). Hit callbacks are PURE data — the caller applies damage.
 * @param {object[]} projectiles room.sim.projectiles (mutated)
 * @param {Map} entities room.sim.entities
 * @param {number} dt tick seconds
 * @param {number} now server ms
 * @param {object} bounds { minX, maxX, ceilingY, groundY } arena clip
 * @returns {object[]} hits [{ proj, victim, direct: bool, falloff }]
 */
export function stepProjectiles(projectiles, entities, dt, now, bounds) {
  const hits = [];
  const bodyR = config.sim?.entityRadius || 14;
  for (const p of projectiles) {
    if (p.dead) continue;
    const stepLen = Math.hypot(p.vx, p.vy) * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.travelled += stepLen;

    // Out of bounds or past range → fizzle (splash still pops on walls).
    const oob =
      p.x < bounds.minX - 20 || p.x > bounds.maxX + 20 || p.y < bounds.ceilingY - 20 || p.y > bounds.groundY + 40;
    if (p.travelled >= p.range || oob) {
      p.dead = true;
      if (p.splash > 0 && !oob) {
        splashHits(p, entities, now, hits, p.x, p.y);
      }
      continue;
    }

    // Entity contact: first valid body along the path wins.
    // Phase 4: the rewind test INCLUDES the direct fast path, then falls
    // back to a grace-band rewound test so 50–120 ms shooters register hits
    // they visibly earned (flagged lagComp for telemetry).
    let struck = null;
    let struckLagComp = false;
    for (const e of entities.values()) {
      if (!enemiesOnly(p, e, now)) continue;
      const rr = p.radius + bodyR * 0.8;
      const rw = rewindCircleTest(p, e, p.x, p.y, rr, now);
      if (rw.hit) {
        struck = e;
        struckLagComp = rw.lagComp;
        break;
      }
    }
    if (struck) {
      p.dead = true;
      hits.push({ proj: p, victim: struck, direct: true, falloff: 1, lagComp: struckLagComp });
      if (p.splash > 0) splashHits(p, entities, now, hits, p.x, p.y, struck.id);
    }
  }
  // Compact in place (swap-remove keeps it O(n) with no garbage spike).
  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    if (projectiles[i].dead) projectiles.splice(i, 1);
  }
  return hits;
}

/** AoE around (x, y): half damage at edge, skips the direct victim (already full). */
function splashHits(p, entities, now, hits, x, y, skipId = null) {
  const bodyR = config.sim?.entityRadius || 14;
  for (const e of entities.values()) {
    if (e.id === skipId || !enemiesOnly(p, e, now)) continue;
    const t = torso(e);
    const d = Math.hypot(t.x - x, t.y - y);
    if (d <= p.splash + bodyR) {
      hits.push({ proj: p, victim: e, direct: false, falloff: Math.max(0.4, 1 - d / (p.splash + bodyR)) });
    }
  }
}
