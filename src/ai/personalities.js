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

/**
 * Canonical difficulty tiers, in ascending order. These are the FOUR the game
 * design asks for, mapped onto the three modifier rows above (advanced shares
 * the aggressive profile — see below). Server-authoritative: a client may
 * REQUEST a tier, but the server validates it against THIS list and silently
 * falls back to `normal` for anything unrecognised, so a tampered payload can
 * never spawn an undefined behaviour.
 */
export const DIFFICULTY_TIERS = Object.freeze(['beginner', 'normal', 'advanced', 'elite']);

/**
 * Alias table: the design's four named tiers → the profile row that implements
 * them. `advanced` and `elite` both lean on `aggressive`; `elite` is tightened
 * a touch further at roll time (see profileFor). `beginner` == `easy`.
 */
const TIER_TO_PROFILE = Object.freeze({
  beginner: 'easy',
  normal: 'normal',
  advanced: 'aggressive',
  elite: 'aggressive',
});

/**
 * Validate a client-requested difficulty tier. Returns a canonical tier name,
 * or `null` when the input is not one we recognise (caller decides the
 * fallback — matchmaking uses `normal`).
 * @param {unknown} input
 * @returns {'beginner'|'normal'|'advanced'|'elite'|null}
 */
export function normaliseDifficulty(input) {
  if (typeof input !== 'string') return null;
  const key = input.trim().toLowerCase();
  return DIFFICULTY_TIERS.includes(key) ? key : null;
}

/** The profile row that implements a tier (defaults to normal). */
function profileForTier(tier) {
  const profileKey = TIER_TO_PROFILE[tier] || 'normal';
  const base = PROFILES[profileKey] || PROFILES.normal;
  // Elite is the aggressive row with a slightly tighter reaction + aim, so the
  // top tier is genuinely harder without a separate frozen profile to drift.
  if (tier === 'elite') {
    return {
      ...base,
      difficulty: 'elite',
      reactionMs: Math.max(80, Math.round(base.reactionMs * 0.7)),
      missMul: base.missMul * 0.85,
    };
  }
  return { ...base, difficulty: tier };
}

const MIX_BY_MODE = {
  bot_practice: [['easy', 0.7], ['normal', 1.0]],
  ffa: [['easy', 0.2], ['normal', 0.8], ['aggressive', 1.0]],
  tdm: [['easy', 0.1], ['normal', 0.7], ['aggressive', 1.0]],
};

/**
 * Roll a difficulty for a mode (cumulative table above) and return a
 * FRESH modifier object (never the frozen profile — callers may jitter).
 *
 * @param {string} mode
 * @param {string|null} [forcedTier] - When the room pinned a difficulty (e.g. a
 *   Bot Practice room the player configured), EVERY bot rolls that tier instead
 *   of the per-mode mix. Server-authoritative: the tier was already validated
 *   by `normaliseDifficulty` before it reached the room.
 */
export function rollPersonality(mode = 'ffa', forcedTier = null) {
  if (forcedTier) {
    const base = profileForTier(forcedTier);
    return {
      ...base,
      aggression: base.aggression * (0.9 + Math.random() * 0.2),
    };
  }
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
 * @param {object} entity
 * @param {string} mode
 * @param {string|null} [forcedTier] - Pin every bot to this validated tier.
 * @returns the personality row
 */
export function ensurePersonality(entity, mode = 'ffa', forcedTier = null) {
  if (!entity.personality) entity.personality = rollPersonality(mode, forcedTier);
  return entity.personality;
}
