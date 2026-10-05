/**
 * Astral Zero — Authoritative map definitions (Phase 5).
 * ============================================================
 * THREE maps, one shared physics model. Each map defines:
 *  - bounds (walls/floor/ceiling feet-space) + static platforms,
 *  - zones: low-gravity volumes (gravity × factor inside) + hazardous
 *    volumes (damage per second while inside),
 *  - stations: scrap-deposit docks (scrap_collector mode banks here),
 *  - spawns: precomputed feet positions (floor spread + platform tops).
 *
 * IDs: 'orbital_junkyard' | 'reactor_core' | 'biodome'. The legacy
 * mapId 'junkyard' (sent by every 1.x client) ALIASES to orbital_junkyard,
 * whose geometry is byte-identical to the old hardcoded arena — old rooms
 * simulate exactly as before. Unknown ids fall back the same way (never
 * error, never crash; the client asked for a map, it gets a map).
 *
 * The full definition ships inside `room_joined.map` (+ countdown
 * `match_state.map`) so clients render zones/stations without a second
 * fetch. All helpers are pure (no io) → unit-testable.
 */

function genSpawns(bounds, platforms) {
  const pts = [];
  const n = 8;
  for (let i = 0; i < n; i += 1) {
    pts.push({
      x: Math.round(bounds.minX + 60 + ((bounds.maxX - bounds.minX - 120) * i) / Math.max(1, n - 1)),
      y: bounds.groundY,
    });
  }
  for (const p of platforms) {
    pts.push({ x: Math.round(p.x + p.w / 2), y: p.y });
  }
  return pts;
}

function define(def) {
  return Object.freeze({
    ...def,
    bounds: Object.freeze({ ...def.bounds }),
    platforms: Object.freeze(def.platforms.map((p) => Object.freeze({ ...p }))),
    zones: Object.freeze({
      lowgrav: Object.freeze((def.zones?.lowgrav || []).map((z) => Object.freeze({ ...z }))),
      hazard: Object.freeze((def.zones?.hazard || []).map((z) => Object.freeze({ ...z }))),
    }),
    stations: Object.freeze((def.stations || []).map((s) => Object.freeze({ ...s }))),
    spawns: Object.freeze(genSpawns(def.bounds, def.platforms)),
  });
}

const ORBITAL_JUNKYARD = define({
  id: 'orbital_junkyard',
  name: 'Orbital Junkyard',
  desc: 'The classic debris field. Cryo vent overhead, reactor leak low-left.',
  bounds: { minX: 40, maxX: 1240, groundY: 650, ceilingY: 40 },
  platforms: [
    { x: 290, y: 500, w: 220, h: 18 },
    { x: 770, y: 500, w: 220, h: 18 },
    { x: 530, y: 350, w: 220, h: 18 },
  ],
  zones: {
    lowgrav: [{ id: 'cryo-vent', x: 530, y: 180, w: 220, h: 150, factor: 0.45 }],
    hazard: [{ id: 'reactor-leak', x: 60, y: 600, w: 150, h: 50, dps: 12 }],
  },
  stations: [
    { id: 'dock-a', x: 200, y: 650, r: 70 },
    { id: 'dock-b', x: 1080, y: 650, r: 70 },
  ],
});

const REACTOR_CORE = define({
  id: 'reactor_core',
  name: 'Reactor Core',
  desc: 'Tight halls around a humming core. Mind the coolant strips.',
  bounds: { minX: 120, maxX: 1160, groundY: 620, ceilingY: 80 },
  platforms: [
    { x: 400, y: 470, w: 180, h: 18 },
    { x: 700, y: 470, w: 180, h: 18 },
    { x: 540, y: 320, w: 200, h: 18 },
  ],
  zones: {
    lowgrav: [{ id: 'core-shaft', x: 560, y: 120, w: 160, h: 220, factor: 0.5 }],
    hazard: [
      { id: 'coolant-west', x: 120, y: 570, w: 200, h: 50, dps: 15 },
      { id: 'coolant-east', x: 960, y: 570, w: 200, h: 50, dps: 15 },
    ],
  },
  stations: [
    { id: 'dock-a', x: 320, y: 620, r: 70 },
    { id: 'dock-b', x: 960, y: 620, r: 70 },
  ],
});

const BIODOME = define({
  id: 'biodome',
  name: 'Biodome',
  desc: 'Wide-open greenhouse. Spore clouds lighten gravity; the pond burns.',
  bounds: { minX: 60, maxX: 1220, groundY: 660, ceilingY: 60 },
  platforms: [
    { x: 200, y: 520, w: 200, h: 18 },
    { x: 880, y: 520, w: 200, h: 18 },
    { x: 540, y: 380, w: 200, h: 18 },
  ],
  zones: {
    lowgrav: [{ id: 'spore-cloud', x: 200, y: 200, w: 300, h: 180, factor: 0.6 }],
    hazard: [{ id: 'acid-pond', x: 560, y: 610, w: 160, h: 50, dps: 20 }],
  },
  stations: [
    { id: 'dock-a', x: 180, y: 660, r: 70 },
    { id: 'dock-b', x: 1100, y: 660, r: 70 },
  ],
});

export const MAPS = Object.freeze({
  orbital_junkyard: ORBITAL_JUNKYARD,
  reactor_core: REACTOR_CORE,
  biodome: BIODOME,
});

export const MAP_IDS = Object.freeze(Object.keys(MAPS));

/** Legacy alias: every 1.x client sends mapId 'junkyard'. */
const ALIASES = { junkyard: 'orbital_junkyard' };

/**
 * Resolve any client mapId to a real definition (never throws, never null).
 * Unknown/empty → orbital_junkyard (the old arena, by construction).
 */
export function resolveMap(mapId) {
  const key = ALIASES[String(mapId || '').trim().toLowerCase()] || String(mapId || '').trim().toLowerCase();
  return MAPS[key] || MAPS.orbital_junkyard;
}

/** Point-in-rect (zones + stations share this). */
function inside(rx, ry, r) {
  return rx >= r.x && rx <= r.x + r.w && ry >= r.y && ry <= r.y + (r.h ?? 0);
}

/** Accept a def, an id, or nothing (same rule as arena.useMap). */
function useDef(map) {
  if (typeof map === 'string') return resolveMap(map);
  return map || MAPS.orbital_junkyard;
}

/**
 * Gravity multiplier at a point (overlapping low-grav volumes → lightest wins).
 * @returns {number} 1 outside volumes
 */
export function gravityAt(map, x, y) {
  let f = 1;
  for (const z of useDef(map)?.zones?.lowgrav || []) {
    if (inside(x, y, z)) f = Math.min(f, z.factor || 1);
  }
  return f;
}

/**
 * Hazard damage-per-second at a point (overlapping hazards → hottest wins).
 * @returns {number} 0 when safe
 */
export function hazardAt(map, x, y) {
  let dps = 0;
  for (const z of useDef(map)?.zones?.hazard || []) {
    if (inside(x, y - 14, z)) dps = Math.max(dps, z.dps || 0);
  }
  return dps;
}

/**
 * Nearest deposit station within its radius of a point (scrap banking).
 * @returns {object|null} station def
 */
export function stationAt(map, x, y) {
  for (const s of useDef(map)?.stations || []) {
    if (Math.hypot(s.x - x, s.y - y) <= (s.r || 70)) return s;
  }
  return null;
}

/**
 * Wire shape for `room_joined.map` (clients render zones + stations).
 * Spawns included (cheap, lets HUDs draw spawn markers if they want).
 */
export function mapToWire(map) {
  const m = map || MAPS.orbital_junkyard;
  return {
    id: m.id,
    name: m.name,
    bounds: { ...m.bounds },
    platforms: m.platforms.map((p) => ({ ...p })),
    zones: {
      lowgrav: m.zones.lowgrav.map((z) => ({ ...z })),
      hazard: m.zones.hazard.map((z) => ({ ...z })),
    },
    stations: m.stations.map((s) => ({ ...s })),
    spawns: m.spawns.map((s) => ({ ...s })),
  };
}
