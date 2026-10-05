/**
 * Astral Zero — SnapshotBuffer (FRONTEND).
 * ============================================================
 * A small, PURE (no Phaser, no network) per-entity snapshot history that
 * answers one question:
 *
 *     "Where was entity X at time T?"
 *
 * THE PROBLEM IT SOLVES
 * The server simulates at ~15 Hz. A 60 FPS client therefore receives three to
 * four identical frames between updates. Drawing the newest snapshot the
 * instant it arrives produces visible 15 Hz stutter ("micro-stutter"); drawing
 * it immediately also means every other player is a network-latency behind.
 *
 * THE SOLUTION
 * Keep a short history per entity and render at `renderTime = now - delay`
 * rather than `now`. Because `delay` (100 ms) exceeds the snapshot interval
 * (66 ms), the buffer almost always contains samples BOTH BEFORE AND AFTER
 * the requested time, so we can *interpolate* — producing perfectly smooth
 * 60 FPS motion out of a 15 Hz stream. When we run past the newest sample
 * (a dropped packet) we *extrapolate* using the last known velocity for a
 * bounded time, then freeze.
 *
 * TIME BASE
 * All times are in the CLIENT's monotonic clock (performance.now()), not the
 * server's. Converting server time to local time requires clock-offset
 * estimation, deliberately out of scope here; we instead record each sample's
 * arrival time locally. That keeps rendering smooth and self-consistent even
 * if the two clocks disagree — reconciliation (see Prediction.js) absorbs the
 * absolute offset because it only ever compares deltas.
 */

import { NET_TICK } from '../config/netConfig.js';

/** Fill in snapshot defaults so a partial payload never produces NaN. */
function makeSample({
  id, time, x = 0, y = 0, vx = 0, vy = 0,
  hp = 100, maxHp = 100, facing = 1, alive = true, seq = 0,
}) {
  return { id, time, x, y, vx, vy, hp, maxHp, facing, alive, seq };
}

export class SnapshotBuffer {
  /**
   * @param {object} [opts]
   * @param {number} [opts.historySize] - Samples kept per entity.
   * @param {number} [opts.maxExtrapolationMs] - Cap on velocity extrapolation.
   */
  constructor({
    historySize = NET_TICK.historySize,
    maxExtrapolationMs = NET_TICK.maxExtrapolationMs,
  } = {}) {
    this.historySize = historySize;
    this.maxExtrapolationMs = maxExtrapolationMs;

    /** @type {Map<string, object[]>} entityId → samples, oldest first. */
    this._tracks = new Map();
  }

  /**
   * Record a snapshot for one entity. Out-of-order samples are still inserted,
   * because a slow packet overtaking a fast one must not corrupt sampling.
   * @param {object} snapshot - Must carry `id` and a finite `time`.
   * @returns {void}
   */
  push(snapshot) {
    if (!snapshot?.id || !Number.isFinite(snapshot.time)) return;

    const sample = makeSample(snapshot);
    let track = this._tracks.get(sample.id);

    if (!track) {
      track = [];
      this._tracks.set(sample.id, track);
    }

    // Ignore an exact duplicate — servers often re-broadcast the last state
    // (roster updates), and re-inserting it would pin the interpolation.
    //
    // NOTE: the comparison MUST include hp/alive, not just position. Two
    // events can legitimately share a timestamp and a position while carrying
    // different health (e.g. a `player_health_update` landing in the same
    // millisecond as the position snapshot). Judging on position alone would
    // silently DROP that health change, leaving a stale HP bar forever.
    const last = track[track.length - 1];
    if (
      last &&
      last.time === sample.time &&
      last.x === sample.x &&
      last.y === sample.y &&
      last.hp === sample.hp &&
      last.alive === sample.alive
    ) {
      return;
    }

    track.push(sample);

    // Bounded memory: drop the oldest samples once we exceed the ring size.
    if (track.length > this.historySize) track.splice(0, track.length - this.historySize);
  }

  /**
   * Seed an entity with a single authoritative sample, so an actor has
   * something to render before its first real snapshot arrives.
   * @param {object} snapshot
   * @returns {void}
   */
  seed(snapshot) {
    this.push(snapshot);
  }
/**
   * Sample an entity's interpolated state at an arbitrary time.
   *
   * Resolution order:
   *   - no history           → null (caller keeps its current position)
   *   - before oldest sample → oldest sample (clamped; no reliable direction)
   *   - after newest sample  → extrapolate by velocity, bounded
   *   - between two samples  → linear interpolation (the common case)
   *
   * @param {string} id
   * @param {number} time - Render time in local ms.
   * @returns {object|null} Interpolated state, or null when unknown.
   */
  sample(id, time) {
    const track = this._tracks.get(id);
    if (!track || track.length === 0) return null;
    if (track.length === 1) return { ...track[0], extrapolated: false };

    if (time <= track[0].time) return { ...track[0], extrapolated: false };

    const newest = track[track.length - 1];

    // Past the newest sample: bounded extrapolation. Beyond the cap we FREEZE
    // (extrapolated:false) rather than keep advancing, so a peer that stops
    // sending data comes to rest instead of drifting across the map forever.
    if (time >= newest.time) {
      const overrun = time - newest.time;
      if (overrun > this.maxExtrapolationMs) {
        return { ...newest, extrapolated: false, frozen: true };
      }
      return {
        ...newest,
        x: newest.x + (newest.vx * overrun) / 1000,
        y: newest.y + (newest.vy * overrun) / 1000,
        extrapolated: true,
      };
    }

    // Between samples: find the bracketing pair and interpolate. The track is
    // short (≤24), so a linear scan beats maintaining interpolation indices.
    for (let i = track.length - 1; i > 0; i -= 1) {
      const b = track[i];
      const a = track[i - 1];
      if (time >= a.time && time <= b.time) {
        const span = b.time - a.time;
        const t = span > 0 ? (time - a.time) / span : 0;
        return {
          id,
          time,
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          // Velocity is NOT interpolated: the newest sample's value is what
          // extrapolation and facing decisions should use.
          vx: b.vx,
          vy: b.vy,
          hp: t < 0.5 ? a.hp : b.hp,
          maxHp: b.maxHp,
          facing: b.facing,
          alive: b.alive,
          seq: b.seq,
          extrapolated: false,
        };
      }
    }

    return { ...newest, extrapolated: false };
  }

  /**
   * Newest known sample — the authoritative "truth" as of now. Reconciliation
   * compares against THIS (not an interpolated sample), because bending the
   * player toward a 100 ms-old interpolation would be chasing a phantom.
   * @param {string} id
   * @returns {object|null}
   */
  latest(id) {
    const track = this._tracks.get(id);
    return track && track.length ? track[track.length - 1] : null;
  }

  /**
   * Age of an entity's newest sample.
   * @param {string} id
   * @param {number} now - Current local time (ms).
   * @returns {number} ms since the last snapshot (Infinity if unknown).
   */
  ageOf(id, now) {
    const newest = this.latest(id);
    return newest ? now - newest.time : Infinity;
  }

  /** @param {string} id @returns {boolean} */
  has(id) {
    return this._tracks.has(id);
  }

  /** @param {string} id @returns {number} */
  count(id) {
    return this._tracks.get(id)?.length ?? 0;
  }

  /** @returns {string[]} */
  ids() {
    return [...this._tracks.keys()];
  }

  /**
   * Forget an entity (it left the room, or was destroyed).
   * @param {string} id
   * @returns {void}
   */
  remove(id) {
    this._tracks.delete(id);
  }

  /** Drop every track. Called on match teardown. @returns {void} */
  clear() {
    this._tracks.clear();
  }
}

export default SnapshotBuffer;