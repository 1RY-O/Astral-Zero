/**
 * Astral Zero — Validated combat triggers (Phase 3).
 * ============================================================
 * ONE fire path for every shot and swing, no matter who pulled it:
 *  - the tick loop (intent.fire / intent.melee from humans + bot brains), and
 *  - the socket handlers (legacy player_shoot / player_melee in-room bridge).
 *
 * RULES (shared, documented once):
 *  - Dead entities can't shoot. Cooldowns are per-entity (weapon cadence ×
 *    the entity's cooldownScale — practice bots shoot slower by construction).
 *  - Aim is always re-anchored at the SERVER body position; client muzzle
 *    claims are ignored (muzzle spoofing would let hackers shoot around walls
 *    that don't exist yet — and around corners that do).
 *  - Every accepted shot emits a room-scoped `player_shoot` tracer with
 *    SERVER values, so old FX code renders exactly what the sim resolves.
 *  - Every accepted swing emits room-scoped `player_melee` the same way.
 *  - Returns structured results so handlers can ack honestly
 *    ({ ok, tick } vs { ok:false, error: 'COOLDOWN' | 'DEAD' }).
 */

import { WEAPONS, weaponFor, MELEE } from './weapons.js';
import { spawnProjectile } from './projectiles.js';
import { meleeSwing } from './damage.js';
import config from '../server-config.js';

/**
 * Attempt a validated shot.
 *
 * Phase 4 bloom: sustained fire heats the barrel (entity.heat 0..1);
 * effective spread = weapon spread + heat × heat.maxBloom. Heat is added
 * here and decayed per-tick in the loop — clients see honest spread because
 * the ANGLE actually fired rides the tracer event.
 *
 * @param {object} room internal room
 * @param {object} e sim entity firing
 * @param {number} aimX / aimY world aim (already clamped by caller)
 * @param {object} io Socket.io server
 * @param {object} EV event registry
 * @param {number} now server ms
 * @returns {{ ok: boolean, error?: string, angle?: number, weaponId?: string }}
 */
export function tryFire(room, e, aimX, aimY, io, EV, now = Date.now()) {
  if (!e?.alive) return { ok: false, error: 'DEAD' };
  if (now < (e.fireCooldownUntil || 0)) return { ok: false, error: 'COOLDOWN' };
  const weapon = weaponFor(e.weaponId);
  e.fireCooldownUntil = now + weapon.cooldownMs * (e.cooldownScale || 1);
  e.lastAimX = aimX;
  e.lastAimY = aimY;

  // Bloom widens each shot's cone; single taps stay laser-true.
  const heatCfg = config.sim?.heat || {};
  e.heat = Math.min(1, (e.heat || 0) + (heatCfg.perShot ?? 0.22));
  const hot = { ...weapon, spread: weapon.spread + e.heat * (heatCfg.maxBloom ?? 0.075) };

  const proj = spawnProjectile(e, aimX, aimY, hot);
  if (!proj) return { ok: false, error: 'BAD_AIM' };
  room.sim?.projectiles?.push(proj);
  // Phase 5 telemetry: accepted pulls feed accuracy + room totals.
  e.shots = (e.shots || 0) + 1;
  if (room.sim?.stats) room.sim.stats.shots = (room.sim.stats.shots || 0) + 1;

  io.to(room.id).emit(EV.PLAYER_SHOOT, {
    id: e.id,
    x: Math.round(proj.x),
    y: Math.round(proj.y),
    angle: Math.round(proj.angle * 1000) / 1000,
    weaponId: e.weaponId,
    speed: weapon.speed,
    tick: room.sim?.tick || 0,
    timestamp: now,
  });
  return { ok: true, angle: proj.angle, weaponId: e.weaponId };
}

/**
 * Attempt a validated mop swing.
 * @returns {{ ok: boolean, error?: string, hits?: number }}
 */
export function tryMelee(room, e, io, EV, now = Date.now()) {
  if (!e?.alive) return { ok: false, error: 'DEAD' };
  if (now < (e.meleeCooldownUntil || 0)) return { ok: false, error: 'COOLDOWN' };
  e.meleeCooldownUntil = now + MELEE.cooldownMs;

  const hits = meleeSwing(room, e, io, EV, now);
  io.to(room.id).emit(EV.PLAYER_MELEE, {
    id: e.id,
    x: Math.round(e.x),
    y: Math.round(e.y),
    direction: e.facing,
    tick: room.sim?.tick || 0,
    timestamp: now,
  });
  return { ok: true, hits: hits.length };
}

/** Known weapon ids (for handler-side switching validation). */
export function knownWeaponIds() {
  return Object.keys(WEAPONS);
}
