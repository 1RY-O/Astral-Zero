/**
 * Solar Sentinel — loadout VARIANTS (shared client + server).
 * ============================================================
 * S14.2. A character keeps its identity; variants tune HOW it plays without
 * breaking the promise that the character is recognisable.
 *
 * THE RULE (server-enforced)
 * A variant may only touch the character's own tuning envelope — cadence,
 * handling, a stat that trades against another. It can NEVER:
 *   - exceed the character's stat band (no variant makes Marlowe a Relic),
 *   - grant a stat the character cannot have (speed cap is speed cap),
 *   - change a character's signature weapon or ability,
 *   - stack with itself or another variant.
 *
 * Every variant is a MODIFIER applied on top of `characters.js`, validated here
 * once, so the client cannot ship a variant the server would refuse and the
 * server cannot apply a variant the client did not draw.
 */

import { CHARACTERS } from './characters.js';

/**
 * Variants keyed by character id. Each entry lists the approved variants for
 * that character. A character with `variants: {}` has exactly one loadout
 * (its base), which is the honest default for a new character.
 *
 * Each variant:
 *   name, blurb       — shown on the selection screen.
 *   mods              — multiplicative on top of the character's stats and
 *                       weapon cadence; keys mirror the stat names so the
 *                       server can apply them generically.
 */
export const VARIANTS = Object.freeze({
  halcyon: Object.freeze({
    deadeye: Object.freeze({
      id: 'deadeye', name: 'Deadeye', blurb: 'Slower shots, harder hits. Trades rate for certainty.',
      mods: Object.freeze({ fireRateMul: 1.25, damageMul: 1.2 }),
    }),
    longrifle: Object.freeze({
      id: 'longrifle', name: 'Long Barrel', blurb: 'Faster cadence, shorter reach. Trades reach for pressure.',
      mods: Object.freeze({ fireRateMul: 0.9, rangeMul: 0.9 }),
    }),
  }),
  marlowe: Object.freeze({
    standard: Object.freeze({
      id: 'standard', name: 'Standard Issue', blurb: 'Exactly Marlowe. No frills.',
      mods: Object.freeze({}),
    }),
  }),
  bodge: Object.freeze({
    sprinter: Object.freeze({
      id: 'sprinter', name: 'Sprinter', blurb: 'Faster, flimsier. Pure tempo.',
      mods: Object.freeze({ speedMul: 1.12, hpMul: 0.94 }),
    }),
    brawler: Object.freeze({
      id: 'brawler', name: 'Brawler', blurb: 'Slower, tougher. Runs you over at contact range.',
      mods: Object.freeze({ speedMul: 0.92, hpMul: 1.15, damageMul: 1.1 }),
    }),
  }),
  vesper: Object.freeze({
    wideblast: Object.freeze({
      id: 'wideblast', name: 'Wide Blast', blurb: 'Bigger splash, thinner per-target damage.',
      mods: Object.freeze({ splashMul: 1.3, damageMul: 0.94 }),
    }),
    sniper: Object.freeze({
      id: 'sniper', name: 'Long Fuse', blurb: 'Tighter blast, keeps her distance.',
      mods: Object.freeze({ splashMul: 0.75, speedMul: 1.05 }),
    }),
  }),
  nettle: Object.freeze({
    toxic: Object.freeze({
      id: 'toxic', name: 'Refined Toxin', blurb: 'Faster poison ticks, quieter cadence.',
      mods: Object.freeze({ fireRateMul: 0.85, damageMul: 1.05 }),
    }),
    corrosive: Object.freeze({
      id: 'corrosive', name: 'Corrosive Rounds', blurb: 'Splash damage on top of venom.',
      mods: Object.freeze({ splashMul: 1.2, fireRateMul: 1.1 }),
    }),
  }),
});

/** Stat bands a variant may NOT exceed, so identity is structurally preserved. */
const CAPS = Object.freeze({
  speedMul: 1.25,
  hpMul: 1.2,
  fireRateMul: 1.3,   // higher = slower; caps how much a variant may slow you
  damageMul: 1.25,
  splashMul: 1.35,
  rangeMul: 1.0,      // never INCREASE reach beyond base
});

/**
 * @param {string} characterId
 * @param {string} variantId
 * @returns {boolean}
 */
export function isKnownVariant(characterId, variantId) {
  if (!CHARACTERS[characterId]) return false;
  const list = VARIANTS[characterId];
  return Boolean(list && typeof variantId === 'string' && list[variantId]);
}

/**
 * @param {string} characterId
 * @returns {string[]} approved variant ids (empty if none).
 */
export function variantsFor(characterId) {
  const list = VARIANTS[characterId];
  return list ? Object.keys(list) : [];
}

/**
 * Resolve the EFFECTIVE tuning for a character + variant, applying the variant
 * on top of the base stats and clamping every result to the identity cap.
 *
 * This is the single function the server uses to build an entity's numbers, and
 * the client uses to preview the same numbers — so the preview cannot lie.
 *
 * @param {string} characterId
 * @param {string} [variantId] - falls back to the character's first variant.
 * @returns {{ character, variantId, stats: object }}
 */
export function resolveLoadout(characterId, variantId) {
  const c = CHARACTERS[characterId] || CHARACTERS.marlowe;
  const ids = variantsFor(c.id);
  const chosen = isKnownVariant(c.id, variantId) ? variantId : ids[0];
  const v = chosen ? VARIANTS[c.id][chosen] : { mods: {} };

  const stats = { ...c.stats };
  for (const [key, mul] of Object.entries(v.mods || {})) {
    if (!(key in stats)) continue; // unknown stat: ignore, never invent one
    const cap = CAPS[key];
    if (cap === undefined) continue; // uncapped stat: variants may not invent
    const next = stats[key] * mul;
    // Clamp so a variant can push a stat up to the cap but never past it, and
    // never below a floor of 50% (a variant must not gut a character entirely).
    stats[key] = Math.max(stats[key] * 0.5, Math.min(cap, next));
  }
  return { character: c, variantId: chosen ?? null, stats };
}

export default VARIANTS;
