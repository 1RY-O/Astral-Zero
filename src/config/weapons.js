/**
 * Astral Zero — client weapon table (FRONTEND, Phase 4).
 * ============================================================
 * A MIRROR of the server's `src/combat/weapons.js`. The client needs these rows
 * for presentation only — magazine size, tracer tint, recoil strength, name.
 *
 * WHY A MIRROR AND NOT AN IMPORT
 * `src/combat/weapons.js` is server code and is not bundled. It has no browser
 * dependencies today, but importing from `src/sockets`-adjacent server modules
 * couples the two halves of the repo and breaks the "frontend never imports
 * backend" rule that keeps the Vite build clean. A small, explicitly-labelled
 * mirror is cheaper than that coupling.
 *
 * ★ THE VALUES THAT MATTER MOST ARE `id` AND `cooldownMs`, because they are
 * part of the CONTRACT, not decoration:
 *   - `id` must match the server's key exactly. The server validates weapon
 *     switching against its own id list and SILENTLY ignores unknown ids, so a
 *     typo does not error — it just never switches (this is how the client
 *     ended up sending "mop", which does not exist server-side).
 *   - `cooldownMs` is used to gate the client's local fire rate so we do not
 *     predict shots the server will rate-limit into a `COOLDOWN` rejection.
 *
 * `WEAPONS_VERSION` is a checksum of sorts: if the server table changes, bump it
 * and the mismatch shows up in the `?debug` overlay instead of silently
 * desyncing. See src/net/NetworkManager for the server probe.
 *
 * SERVER IS STILL AUTHORITATIVE. Nothing here decides damage; these numbers only
 * predict and present. The server may apply a different `cooldownScale` per
 * entity (practice bots shoot slower), and its verdict always wins.
 */

/** Client's copy of the server weapon table. Ids MUST match the server keys. */
export const WEAPONS = Object.freeze({
  'scrap-rifle': Object.freeze({
    id: 'scrap-rifle',
    name: 'Scrap Rifle',
    damage: 16,
    cooldownMs: 320,
    speed: 760,
    range: 560,
    magazine: 30,
    reloadMs: 1400,
    splash: 0,
    tracerColor: 0xffd166,
    recoilPx: 7,
    flashScale: 1,
  }),
  'mop-cannon': Object.freeze({
    id: 'mop-cannon',
    name: 'Mop Cannon',
    damage: 26,
    cooldownMs: 700,
    speed: 560,
    range: 480,
    magazine: 6,
    reloadMs: 2200,
    splash: 0,
    tracerColor: 0x7fe7ff,
    recoilPx: 16,
    flashScale: 1.7,
  }),
  'debris-launcher': Object.freeze({
    id: 'debris-launcher',
    name: 'Debris Launcher',
    damage: 34,
    cooldownMs: 1100,
    speed: 430,
    range: 420,
    magazine: 4,
    reloadMs: 2600,
    splash: 90,
    tracerColor: 0xff9f43,
    recoilPx: 24,
    flashScale: 2.1,
  }),
});

/** The weapon a fresh player holds; mirrors the server's DEFAULT_WEAPON. */
export const DEFAULT_WEAPON = 'scrap-rifle';

/** Ordered list for the weapon wheel / settings screen. */
export const WEAPON_LIST = Object.freeze(Object.keys(WEAPONS));

/**
 * Bump when the server table changes shape or values. Surfaced in `?debug` so a
 * client/server table drift is visible instead of mysterious mispredictions.
 */
export const WEAPONS_VERSION = 'phase4-1';

/**
 * Resolve a weapon id to a row, falling back to the default.
 *
 * Mirrors the server's `weaponFor()`: an unknown id must never throw and never
 * produce `undefined` fields, because a malformed value here would blank the
 * ammo readout or break the fire gate.
 *
 * @param {string} id
 * @returns {object} A frozen weapon row.
 */
export function weaponFor(id) {
  return WEAPONS[id] ?? WEAPONS[DEFAULT_WEAPON];
}

/**
 * True when the id is one the SERVER actually knows. Used to filter the weapon
 * wheel so we never offer a switch the server would silently reject.
 * @param {string} id
 * @returns {boolean}
 */
export function isKnownWeapon(id) {
  return Object.hasOwn(WEAPONS, id);
}

export default WEAPONS;