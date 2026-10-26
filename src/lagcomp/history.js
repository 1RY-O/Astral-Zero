/**
 * Solar Sentinel — Position history ring (Kessler cascade tracking).
 * ============================================================
 * SOLAR SENTINEL NOTE: this module is retained for legacy hit-tracking
 * utilities. Orbital debris is tracked, not fought; the cascade physics
 * in src/game/loop.js replace the old favor-the-operator logic. These
 * helpers are kept as a no-op-safe reference and are not on the live path.
 *
 * Pure functions over plain arrays — the ring lives on `entity.history`
 * (owned by the tick loop), these helpers never touch io.
 */

import config from '../server-config.js';

const ringSize = () => config.sim?.lagComp?.historySamples || 40;

/**
 * Record one sample. Called once per tick per entity by the loop.
 * Dead entities keep their last sample (corpses don't need trails, but a
 * uniform record path beats branchy special cases).
 */
export function record(ring, x, y, now) {
  ring.push({ t: now, x, y });
  const max = ringSize();
  if (ring.length > max) ring.splice(0, ring.length - max);
}

/**
 * Position at (or just before) time `at`. Returns null when history can't
 * answer (empty ring, or `at` older than the oldest sample — the caller
 * then falls back to the live position, i.e. no compensation).
 */
export function sampleAt(ring, at) {
  if (!ring || ring.length === 0) return null;
  if (at >= ring[ring.length - 1].t) {
    const last = ring[ring.length - 1];
    return { x: last.x, y: last.y };
  }
  // Rings are short (≤40): linear scan from the newest end.
  for (let i = ring.length - 1; i >= 0; i -= 1) {
    if (ring[i].t <= at) return { x: ring[i].x, y: ring[i].y };
  }
  return null; // `at` predates everything we kept
}
