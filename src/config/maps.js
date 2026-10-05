/**
 * Astral Zero — map helpers (FRONTEND).
 * ============================================================
 * ★ PHASE 5 REWRITE: THE SERVER NOW OWNS MAP GEOMETRY.
 *
 * In Phase 5 the backend began shipping the FULL authoritative map in
 * `room_joined.map` (and `match_state.map`) via its `mapToWire()`:
 *
 *   { id, name, bounds:{minX,maxX,groundY,ceilingY}, platforms:[{x,y,w,h}],
 *     zones:{ lowgrav:[{id,x,y,w,h,factor}], hazard:[{id,x,y,w,h,dps}] },
 *     stations:[{id,x,y,r}], spawns:[{x,y}] }
 *
 * So the client no longer keeps its own platform geometry — that was a guess,
 * and a guess about COLLISION is exactly the kind of thing that desyncs a
 * client from the server (you fall through a platform the server thinks is
 * solid). This file is now a thin, defensive adapter over the server payload.
 *
 * The only thing still defined here is the local AMBIENCE recipe (dust counts,
 * tint, vent count) — purely cosmetic, never collision, so it is safe to keep
 * on the client where a designer can tune it without a backend change.
 *
 * The legacy `junkyard` id is preserved because every pre-5 client sends it and
 * the server aliases it to `orbital_junkyard`.
 */

/**
 * Resolve the authoritative map the SERVER sent.
 *
 * Never invents geometry. If the payload is missing or malformed we fall back
 * to a clearly-labelled EMPTY map rather than a plausible-looking guess: a
 * wrong guess produces a level that looks fine and is subtly wrong (players
 * fall through platforms), which is far harder to diagnose than an obviously
 * bare arena. The server's `map` arrives in `room_joined`, so in practice this
 * fallback is only seen before the first manifest lands.
 *
 * @param {object|null} wireMap - `room_joined.map` / `match_state.map`.
 * @param {string} [fallbackId] - Map id, used only for naming + ambience.
 * @returns {object} Normalised map: geometry from the server, ambience local.
 */
export function mapFromWire(wireMap, fallbackId = 'orbital_junkyard') {
  const src = wireMap && typeof wireMap === 'object' ? wireMap : null;
  const id = src?.id ?? fallbackId;

  return {
    id,
    name: src?.name ?? id,
    // Geometry: pass through untouched when present. These are the SERVER's
    // collision volumes and must match the sim exactly.
    bounds: src?.bounds ?? null,
    platforms: Array.isArray(src?.platforms) ? src.platforms : [],
    zones: {
      lowgrav: Array.isArray(src?.zones?.lowgrav) ? src.zones.lowgrav : [],
      hazard: Array.isArray(src?.zones?.hazard) ? src.zones.hazard : [],
    },
    stations: Array.isArray(src?.stations) ? src.stations : [],
    spawns: Array.isArray(src?.spawns) ? src.spawns : [],
    // Purely cosmetic, keyed by id so a map always looks the same.
    ambience: ambienceFor(id),
  };
}

/**
 * Cosmetic per-map ambience. The ONLY thing still owned by the client.
 *
 * Unknown ids get a neutral recipe rather than throwing: this runs during scene
 * construction, and a crash here would take the whole arena down.
 *
 * @param {string} id
 * @returns {object}
 */
export function ambienceFor(id) {
  switch (id) {
    case 'reactor_core':
      return Object.freeze({ dust: 30, vents: 4, debris: 6, tint: 0x12060a, starAlpha: 0.45, glow: 0xff9f43 });
    case 'biodome':
      return Object.freeze({ dust: 40, vents: 1, debris: 10, tint: 0x07140c, starAlpha: 0.35, glow: 0x4ade80 });
    case 'orbital_junkyard':
    case 'junkyard':
    default:
      return Object.freeze({ dust: 26, vents: 2, debris: 5, tint: 0x05070f, starAlpha: 0.5, glow: 0x7fe7ff });
  }
}

/**
 * The server's own map ids (mirrors src/game/maps.js MAPS + its legacy alias).
 * Used for validation and the `?debug` readout — NOT for building geometry.
 */
export const KNOWN_MAP_IDS = Object.freeze([
  'orbital_junkyard',
  'reactor_core',
  'biodome',
  // Legacy alias: every pre-5 client sends 'junkyard'.
  'junkyard',
]);

/**
 * Back-compat alias for the old API.
 *
 * Phase 5 removed the client-side layouts, so this now returns the AMBIENCE-only
 * description of a map id. Anything that needed real geometry must call
 * `mapFromWire` with the server payload instead — `mapFor(...).platforms` is
 * intentionally empty, which makes any leftover call site fail visibly rather
 * than quietly building the wrong level.
 *
 * @param {string} mapId
 * @returns {object}
 */
export function mapFor(mapId) {
  const id = mapId || 'orbital_junkyard';
  if (!KNOWN_MAP_IDS.includes(id)) {
    console.warn(`[maps] unknown mapId "${id}" — cosmetic ambience will use defaults.`);
  }
  return { id, name: id, ambience: ambienceFor(id), platforms: [], bounds: null };
}

/** @deprecated Prefer `mapFromWire`. Kept so existing imports keep working. */
export const MAPS = Object.freeze(
  Object.fromEntries(KNOWN_MAP_IDS.map((id) => [id, mapFor(id)])),
);

export const DEFAULT_MAP_ID = 'orbital_junkyard';
export const MAP_IDS = KNOWN_MAP_IDS;

export default MAPS;
