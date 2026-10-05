/**
 * Astral Zero — Bot personalities / difficulty tiers (Phase 4).
 * ============================================================
 * One bot is no longer like another. Each bot rolls a difficulty at spawn:
 *
 *   easy:       slow trigger, wild aim, flees early, drifts (not strafes).
 *               The practice-room majority — newbies get lessons, not camps.
 *   normal:     the Phase 3 brain, unchanged numbers (backwards compatible).
 *   aggressive: fast trigger, tight aim, holds fire longer, closes harder.
 *
 * MIX PER MODE (bot_practice stays gentle by construction):
 *   practice → 70% easy / 30% normal / 0% aggressive (kamikazes retrained —
 *              see botBrain: they behave as chasers, melee is a rarity).
 *   ffa      → 20% easy / 60% normal / 20% aggressive.
 *   tdm      → 10% easy / 60% normal / 30% aggressive (war is war).
 *
 * A personality is a plain modifier row stored on `entity.personality`
 * (serialized nowhere — in-memory only, like everything else). think()
 * reads it every tick; absent personality = normal (so unit-context bots
 * without sim init behave exactly like Phase 3).
 */

const PROFILES = {
  easy: Object.freeze({
    difficulty: 'easy',
    cooldownMul: 1.5, // trigger cadence multiplier (compounds mode temperament)
    missMul: 2.0, // aim error multiplier
    reactionMs: 450, // must track a NEW target this long before opening fire
    fleeAt: 0.45, // retreat below this HP fraction
    strafeSpeed: 0.6, // strafe drift magnitude
    aggression: 0.7, // <1 keeps slightly MORE range (cautious)
  }),
  normal: Object.freeze({
    difficulty: 'normal',
    cooldownMul: 1.0,
    missMul: 1.0,
    reactionMs: 250,
    fleeAt: 0.3,
    strafeSpeed: 0.8,
    aggression: 1.0,
  }),
  aggressive: Object.freeze({
    difficulty: 'aggressive',
    cooldownMul: 0.7,
    missMul: 0.6,
    reactionMs: 120,
    fleeAt: 0.18,
    strafeSpeed: 1.0,
    aggression: 1.3, // closes harder (preferred range shrinks a little)
  }),
};

const MIX_BY_MODE = {
  bot_practice: [['easy', 0.7], ['normal', 1.0]],
  ffa: [['easy', 0.2], ['normal', 0.8], ['aggressive', 1.0]],
  tdm: [['easy', 0.1], ['normal', 0.7], ['aggressive', 1.0]],
};

/**
 * Roll a difficulty for a mode (cumulative table above) and return a
 * FRESH modifier object (never the frozen profile — callers may jitter).
 */
export function rollPersonality(mode = 'ffa') {
  const table = MIX_BY_MODE[mode] || MIX_BY_MODE.ffa;
  const r = Math.random();
  let difficulty = table[table.length - 1][0];
  for (const [name, edge] of table) {
    if (r < edge) {
      difficulty = name;
      break;
    }
  }
  const base = PROFILES[difficulty];
  return {
    ...base,
    // Per-bot jitter so two normals don't strafe in lockstep.
    aggression: base.aggression * (0.9 + Math.random() * 0.2),
  };
}

/** Modifier row for a difficulty name (for tests + sim init). */
export function profileFor(difficulty) {
  return { ...(PROFILES[difficulty] || PROFILES.normal) };
}

/**
 * Attach a rolled personality to a sim entity (idempotent).
 * @returns the personality row
 */
export function ensurePersonality(entity, mode = 'ffa') {
  if (!entity.personality) entity.personality = rollPersonality(mode);
  return entity.personality;
}
