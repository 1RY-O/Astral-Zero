/**
 * Astral Zero — Weapon table (Phase 3).
 * ============================================================
 * Every ranged shot in the sim references one of these rows by weaponId.
 * Unknown client-sent weaponIds fall back to 'scrap-rifle' (never trust,
 * never crash). Damage numbers are deliberately chunky: ~4-6 rifle hits to
 * drop 100 HP keeps time-to-kill humane at 20 Hz with travel time.
 *
 * FIELDS:
 *  damage    HP per clean hit
 *  cooldownMs  min ms between shots from one entity
 *  speed     projectile px/s
 *  range     max travel px (projectile dies past this)
 *  radius    hit circle px (generous: netcode + 20 Hz steps need slack)
 *  spread    radians of random aim error per shot
 *  splash    AoE radius px (0 = direct-hit only)
 *  knockback horizontal shove applied on hit (juice + disrupts aim)
 */

export const WEAPONS = Object.freeze({
  'scrap-rifle': Object.freeze({
    damage: 16,
    cooldownMs: 320,
    speed: 760,
    range: 560,
    radius: 10,
    spread: 0.035,
    splash: 0,
    knockback: 60,
  }),
  'mop-cannon': Object.freeze({
    damage: 26,
    cooldownMs: 700,
    speed: 560,
    range: 480,
    radius: 12,
    spread: 0.02,
    splash: 0,
    knockback: 140,
  }),
  'debris-launcher': Object.freeze({
    damage: 34,
    cooldownMs: 1100,
    speed: 430,
    range: 420,
    radius: 12,
    spread: 0.05,
    splash: 90, // AoE around impact (hurts everyone except owner + teammates)
    knockback: 220,
  }),
});

export const DEFAULT_WEAPON = 'scrap-rifle';

/** Melee (mop swing): instant arc check, no projectile. */
export const MELEE = Object.freeze({
  damage: 25,
  cooldownMs: 500,
  range: 78,
  halfArc: Math.PI / 3, // ±60° around facing/aim
  knockback: 260,
});

/** Resolve any client/AI weapon id to a real row (fallback: rifle). */
export function weaponFor(id) {
  return WEAPONS[id] || WEAPONS[DEFAULT_WEAPON];
}
