/**
 * Solar Sentinel — the LAUNCH ROSTER (shared client + server).
 * ============================================================
 * Five original janitors, one per tier band. This module is the single source
 * of truth for who exists, what they do, and — critically — the server reads it
 * to VALIDATE a selection, so a client cannot equip a character that does not
 * exist or claim stat bonuses it did not earn. The client reads the same file
 * to render the selection screen, so the two can never disagree about the roster.
 *
 * DESIGN CONTRACT (why these five)
 * Tiers describe a personality, not a power ranking. A Relic is precise and
 * fragile; a Trash is scrappy and cheap; a Biohazard is a specialist with a
 * real weakness. EVERY character is viable and every one has a counterplay, so
 * "pick the S tier" is a mistake rather than the optimum.
 *
 *  Relic (S)      — highest precision, lowest forgiveness. Halcyon.
 *  Vintage (A)    — the all-rounder; the reference point for balance. Marlowe.
 *  Trash (B)      — cheapest to field, awkward up close. Bodge.
 *  Biohazard (C)  — area specialist; pays for it with fragility. Vesper.
 *  Toxic (D)      — sustain/attrition, weakest burst. Nettle.
 *
 * BALANCE PHILOSOPHY
 * No stat here is a flat multiplier on everything. Each character's numbers
 * trade one axis for another (speed for health, range for fire rate), and the
 * `weapon` + `skill` + `ability` give each a distinct playstyle, so the choice
 * is "which do I want to do", not "which number is biggest". These are applied
 * server-side; the client's copies are for display only.
 */

export const CHARACTER_TIERS = Object.freeze({
  relic: { id: 'relic', label: 'Relic', band: 'S', blurb: 'Precision above all. Hits what she aims at — if she aims right.' },
  vintage: { id: 'vintage', label: 'Vintage', band: 'A', blurb: 'The reliable one. Nothing extreme, nothing missing.' },
  trash: { id: 'trash', label: 'Trash', band: 'B', blurb: 'Assembled from three bins and pure spite. Fast and fragile.' },
  biohazard: { id: 'biohazard', label: 'Biohazard', band: 'C', blurb: 'Built to irradiate. Handles crowds, dies to one good shot.' },
  toxic: { id: 'toxic', label: 'Toxic', band: 'D', blurb: 'Sips the slow burn. Wins by attrition, never by burst.' },
});

/**
 * Movement / survivability / handling stats.
 *  hp        — starting + respawn health (server-authoritative).
 *  speedMul  — horizontal speed multiplier vs the shared MOVEMENT.speed.
 *  jumpMul   — jump impulse multiplier vs the shared MOVEMENT.jumpVelocity.
 *  fireRateMul— multiplier on the weapon's cooldownMs (LOWER is faster).
 *  damageMul — multiplier on the weapon's damage.
 *  reloadMul — cosmetic/reload pacing multiplier (kept at 1 unless designed).
 */
export const CHARACTERS = Object.freeze({
  halcyon: Object.freeze({
    id: 'halcyon',
    name: 'Halcyon',
    tier: 'relic',
    role: 'Precision duellist',
    silhouette: 'slim',
    // Lore 
    lore: 'Last of the Deep-Range Salvagers. Keeps the scope from a ship that no longer flies.',
    personality: 'Calm, clipped, faintly contemptuous of anyone who rushes.',
    // Operational identity 
    weapon: 'scrap-rifle',      // the scope: precise, single-target, long reads
    stats: Object.freeze({ hp: 88, speedMul: 1.05, jumpMul: 1.05, fireRateMul: 1.25, damageMul: 1.35, reloadMul: 1.0 }),
    // Movement skill 
    skill: Object.freeze({
      id: 'braced-fire', name: 'Braced Fire',
      desc: 'Holding still tightens her aim: +accuracy, +damage while grounded and not moving.',
    }),
    // Utility ability 
    ability: Object.freeze({
      id: 'mark', name: 'Target Mark', cooldownMs: 18000,
      desc: 'Pings a target: hits against it deal bonus damage for a few seconds.',
    }),
    strengths: 'Highest single-shot damage in the roster, and mobile enough to keep her distance.',
    weaknesses: 'Lowest health bar and the slowest fire rate; a duel won on the first shot is a duel lost.',
  }),
  marlowe: Object.freeze({
    id: 'marlowe',
    name: 'Marlowe',
    tier: 'vintage',
    role: 'Line infantry',
    silhouette: 'standard',
    lore: 'Twelve years on the belt. Has outlived four ships and three owners.',
    personality: 'Dry, practical, tells you to do the job.',
    weapon: 'scrap-rifle',
    stats: Object.freeze({ hp: 100, speedMul: 1.0, jumpMul: 1.0, fireRateMul: 1.0, damageMul: 1.0, reloadMul: 1.0 }),
    skill: Object.freeze({
      id: 'steady-aim', name: 'Steady Aim',
      desc: 'Baseline handling — no bonus, no penalty. The yardstick for the others.',
    }),
    ability: Object.freeze({
      id: 'rally', name: 'Rally', cooldownMs: 22000,
      desc: 'Briefly raises the armour of nearby teammates (and herself) against chip damage.',
    }),
    strengths: 'No weaknesses; the safe pick and the reference for every balance number.',
    weaknesses: 'Never the best option for any single situation.',
  }),
  bodge: Object.freeze({
    id: 'bodge',
    name: 'Bodge',
    tier: 'trash',
    role: 'Scrapper',
    silhouette: 'squat',
    lore: 'Four bots welded onto a scrap hauler. They argue. He steers.',
    personality: 'Manic, proud, absolutely sure he is the fastest thing in orbit.',
    weapon: 'mop-cannon',
    stats: Object.freeze({ hp: 80, speedMul: 1.2, jumpMul: 1.15, fireRateMul: 0.85, damageMul: 0.9, reloadMul: 1.0 }),
    skill: Object.freeze({
      id: 'sprint', name: 'Burst Sprint', desc: 'A short, fast dash that closes distance and repositions.',
    }),
    ability: Object.freeze({
      id: 'scrap-storm', name: 'Scrap Storm', cooldownMs: 20000,
      desc: 'Sheds a burst of shrapnel around him, shoving and chipping nearby foes.',
    }),
    strengths: 'Fastest character; escapes and flanks better than anyone.',
    weaknesses: 'Lowest health; wins by never being where the shot goes.',
  }),
  vesper: Object.freeze({
    id: 'vesper',
    name: 'Vesper',
    tier: 'biohazard',
    role: 'Area denial',
    silhouette: 'tall',
    lore: 'Containment specialist. Her suit is rated for exactly one mistake.',
    personality: 'Cold, procedural, all business.',
    weapon: 'debris-launcher',
    stats: Object.freeze({
      hp: 110, speedMul: 0.88, jumpMul: 0.9, fireRateMul: 1.05,
      damageMul: 0.85, splashMul: 1.9, reloadMul: 1.0,
    }),
    skill: Object.freeze({
      id: 'irradiate', name: 'Irradiate', desc: 'Her shots leave a short-lived corrosive field on impact.',
    }),
    ability: Object.freeze({
      id: 'containment', name: 'Containment Field', cooldownMs: 26000,
      desc: 'Erects a field that slows and chips anything standing in it.',
    }),
    strengths: 'Toughest health bar in the roster and by far the biggest splash — she clears rooms rather than duels.',
    weaknesses: 'Slowest and weakest per-shot; a one-on-one with a precise operator is a loss.',
  }),
  nettle: Object.freeze({
    id: 'nettle',
    name: 'Nettle',
    tier: 'toxic',
    role: 'Attrition',
    silhouette: 'standard',
    lore: 'Grew her own countermeasures from the recycler feedstock. Regrets nothing.',
    personality: 'Quiet, patient, entirely too pleased with herself.',
    weapon: 'scrap-rifle',
    stats: Object.freeze({ hp: 95, speedMul: 1.05, jumpMul: 1.05, fireRateMul: 0.7, damageMul: 0.75, reloadMul: 1.0 }),
    skill: Object.freeze({
      id: 'venom', name: 'Venom Rounds', desc: 'Her shots apply stacking poison that ignores armour.',
    }),
    ability: Object.freeze({
      id: 'corrosive-cloud', name: 'Corrosive Cloud', cooldownMs: 21000,
      desc: 'A lingering cloud that damages and slows over time.',
    }),
    strengths: 'Sustained, armour-ignoring damage; wins long fights.',
    weaknesses: 'Weakest per-shot damage; loses short, burst fights.',
  }),
});

export const CHARACTER_IDS = Object.freeze(Object.keys(CHARACTERS));

/** The roster member everyone starts with — never locked behind progression. */
export const STARTER_CHARACTER = 'marlowe';

/**
 * @param {unknown} id
 * @returns {boolean} true when `id` names a real character
 */
export function isKnownCharacter(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(CHARACTERS, id);
}

/**
 * @param {string} id
 * @returns {object} the character, or the starter (never throws).
 */
export function characterFor(id) {
  return CHARACTERS[id] || CHARACTERS[STARTER_CHARACTER];
}

export default CHARACTERS;
