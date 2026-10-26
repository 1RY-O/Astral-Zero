/**
 * Solar Sentinel — Offline Demo Feed
 * =========================================================
 * The live backend streams `orbital_snapshot` at 2 Hz. When the relay is
 * unreachable (or the NASA TLE fetch is still warming up) this module
 * synthesizes a structurally identical snapshot so the command center
 * stays demonstrable — clearly badged as SIM FEED in the top bar.
 *
 * Object shapes mirror src/game/loop.js:
 *   { id, name, x, y, riskLevel (1-10), altitude, velocity }
 */

const DEMO_INTERVAL_MS = 500;
const OBJECT_COUNT = 16;

const NAMES = [
  'ISS (ZARYA)', 'HST', 'TERRA', 'AQUA', 'LANDSAT 8', 'SENTINEL-2A',
  'NOAA 19', 'METOP-B', 'STARLINK-3012', 'STARLINK-4471', 'IRIDIUM 33 DEB',
  'COSMOS 2251 DEB', 'FENGYUN 1C DEB', 'ARIANE 5 R/B', 'CZ-6A DEB', 'ENVISAT',
];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic orbital parameters per object (ellipses around map center). */
function makeObject(name, i) {
  const seed = hash(name);
  const rnd = (n) => ((seed * (n + 1)) % 1000) / 1000;
  return {
    id: `SIM-${String(i + 1).padStart(3, '0')}`,
    name,
    rx: 150 + rnd(1) * 230,
    ry: 110 + rnd(2) * 170,
    phase: rnd(3) * Math.PI * 2,
    speed: (0.12 + rnd(4) * 0.35) * (rnd(5) > 0.5 ? 1 : -1),
    riskLevel: 1 + Math.floor(rnd(6) * 10),
    altitude: 280 + Math.floor(rnd(7) * 1500),
    velocity: 5.5 + rnd(8) * 4.5,
  };
}

/**
 * Start emitting synthetic snapshots at the real cadence (2 Hz).
 * @param {(snapshot: object) => void} emit - same sink as the socket handler
 * @returns {() => void} stop function
 */
export function startDemoFeed(emit) {
  const t0 = performance.now();
  const objects = NAMES.map(makeObject);

  const tick = () => {
    const t = (performance.now() - t0) / 1000;
    const payload = objects.map((o) => {
      const a = o.phase + o.speed * t;
      return {
        id: o.id,
        name: o.name,
        x: 400 + Math.cos(a) * o.rx,
        y: 300 + Math.sin(a) * o.ry,
        riskLevel: o.riskLevel,
        altitude: o.altitude,
        velocity: o.velocity,
      };
    });
    emit({
      timestamp: Date.now(),
      tick: Math.floor(t * 2),
      objects: payload,
      sim: true,
    });
  };

  tick();
  const timer = setInterval(tick, DEMO_INTERVAL_MS);
  return () => clearInterval(timer);
}
