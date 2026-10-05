/**
 * Astral Zero — Prediction & reconciliation (FRONTEND).
 * ============================================================
 * PURE module (no Phaser, no sockets): it owns client-side prediction for the
 * LOCAL player and decides how to bend that prediction toward the server's
 * authoritative position.
 *
 * THE MODEL
 * The local player is simulated locally the instant you press a key, so input
 * feels instant (zero network round-trip). The server simultaneously simulates
 * the same player from the inputs we send it. When its snapshot lands, our
 * prediction is almost never pixel-perfect — it differs by however much we
 * disagreed about physics, or how long the round trip took. Reconciliation is
 * the art of closing that gap WITHOUT the player noticing.
 *
 * THREE TIERS OF CORRECTION (this is the whole trick)
 *
 *   1. WITHIN TOLERANCE — ignore.
 *      Sub-pixel float drift and one-pixel physics disagreement are corrected
 *      far more slowly than they accumulate, so "correcting" them would cause
 *      a permanent low-level jitter. We do nothing at all.
 *
 *   2. SOFT (tolerance < error < snapThreshold) — decay.
 *      We do NOT teleport. We record a correction offset and bleed it off over
 *      ~100 ms, capped to a maximum speed. Motion stays continuous, so from
 *      the player's point of view they simply drift onto the correct path.
 *      This is the entire difference between "smooth correction" and
 *      "rubber-banding".
 *
 *   3. BEYOND SNAP THRESHOLD — snap.
 *      A 140 px disagreement is not drift; it is a teleport, respawn, or a
 *      severe lag spike. Easing toward it would slingshot the player across the
 *      map and whip the camera with them, so we accept the visual pop instead.
 *
 * NOTE ON WHY WE DO NOT REPLAY INPUTS
 * A textbook client predicts by re-simulating every unacknowledged input from
 * a known state. That requires a deterministic, side-effect-free simulation —
 * which Phaser's Arcade physics body is not (it collides with the world, the
 * world may have moved, and `Math.random` leaks in). Re-simulating here would
 * desync worse than the drift we are trying to fix. The decay-based approach
 * gets ~95% of the visual benefit with none of that fragility, and degrades
 * gracefully if our physics and the server's differ.
 */

import { RECONCILIATION } from '../config/netConfig.js';

export class Prediction {
  /**
   * @param {object} [opts]
   * @param {number} [opts.tolerance] - Ignore errors below this (px).
   * @param {number} [opts.snapThreshold] - Snap instantly beyond this (px).
   * @param {number} [opts.decay] - Fraction of error resolved per second.
   * @param {number} [opts.maxSpeed] - Cap on correction speed (px/s).
   */
  constructor({
    tolerance = RECONCILIATION.positionTolerance,
    snapThreshold = RECONCILIATION.snapThreshold,
    decay = RECONCILIATION.correctionDecay,
    maxSpeed = RECONCILIATION.maxCorrectionSpeed,
  } = {}) {
    this.tolerance = tolerance;
    this.snapThreshold = snapThreshold;
    this.decay = decay;
    this.maxSpeed = maxSpeed;

    /** Pending correction offset, in px. Decayed toward zero every frame. */
    this.offsetX = 0;
    this.offsetY = 0;

    /** Telemetry, surfaced in the debug overlay. */
    this.stats = { corrections: 0, snaps: 0, ignored: 0, maxError: 0 };
  }

  /**
   * Feed in the server's authoritative state for the local player and get back
   * what the scene should do about it.
   *
   * @param {object} auth
   * @param {number} auth.x - Server x.
   * @param {number} auth.y - Server y.
   * @param {number} auth.clientX - Our predicted x, measured when we sent.
   * @param {number} auth.clientY - Our predicted y, measured when we sent.
   * @returns {{action: 'none'|'decay'|'snap', dx: number, dy: number, error: number}}
   */
  reconcile({ x, y, clientX, clientY }) {
    // Compare the server's position against where we PREDICTED we would be at
    // that same input. Comparing against our current, already-moved position
    // would fold round-trip latency into the error and make every correction
    // far too large.
    const dx = Number.isFinite(x) && Number.isFinite(clientX) ? x - clientX : 0;
    const dy = Number.isFinite(y) && Number.isFinite(clientY) ? y - clientY : 0;
    const error = Math.hypot(dx, dy);

    if (!Number.isFinite(error) || error <= this.tolerance) {
      this.stats.ignored += 1;
      return { action: 'none', dx: 0, dy: 0, error: 0 };
    }

    if (error >= this.snapThreshold) {
      this.stats.snaps += 1;
      this.stats.maxError = Math.max(this.stats.maxError, error);
      // Clear any pending soft correction — it refers to a position we have
      // just abandoned, and would drag us off the new one.
      this.offsetX = 0;
      this.offsetY = 0;
      return { action: 'snap', dx, dy, error };
    }

    this.stats.corrections += 1;
    this.stats.maxError = Math.max(this.stats.maxError, error);
    // Accumulate (rather than overwrite) so two snapshots arriving in quick
    // succession contribute to one coherent correction.
    this.offsetX += dx;
    this.offsetY += dy;
    return { action: 'decay', dx, dy, error };
  }

/**
   * Advance the pending correction by one frame and return how far to nudge the
   * player this frame. Call once per frame, then apply the result.
   *
   * @param {number} deltaMs - Frame delta.
   * @returns {{x: number, y: number}} The per-frame nudge, in px.
   */
  step(deltaMs) {
    if (this.offsetX === 0 && this.offsetY === 0) return { x: 0, y: 0 };

    // Frame-rate independent decay: the same fraction of the remaining error
    // resolves per second whether we run at 30 or 144 fps.
    const seconds = Math.min(Math.max(deltaMs, 1), 100) / 1000;
    const fraction = 1 - Math.exp(-this.decay * seconds);

    let stepX = this.offsetX * fraction;
    let stepY = this.offsetY * fraction;

    // Speed cap: a large-but-not-huge error must not teleport us. Clamping the
    // per-frame step guarantees we never exceed maxSpeed.
    const stepLength = Math.hypot(stepX, stepY);
    const maxStep = this.maxSpeed * seconds;
    if (stepLength > maxStep && stepLength > 0) {
      stepX = (stepX / stepLength) * maxStep;
      stepY = (stepY / stepLength) * maxStep;
    }

    this.offsetX -= stepX;
    this.offsetY -= stepY;

    // Snap the remainder to zero once sub-pixel, so it never lingers as an
    // invisible trickle of motion fighting the player's own input.
    if (Math.abs(this.offsetX) < 0.05) this.offsetX = 0;
    if (Math.abs(this.offsetY) < 0.05) this.offsetY = 0;

    return { x: stepX, y: stepY };
  }

  /** True while a soft correction is still being applied. @returns {boolean} */
  get isCorrecting() {
    return this.offsetX !== 0 || this.offsetY !== 0;
  }

  /**
   * Discard any pending correction (respawn / scene restart).
   *
   * NOTE: this clears ONLY the offset, deliberately NOT `stats`. The scene
   * calls this immediately after every hard snap, so wiping the counters here
   * would make the debug overlay permanently report `snaps: 0` — hiding exactly
   * the number an engineer needs when chasing reconciliation bugs. Telemetry is
   * cumulative for the session; use `clearStats()` to zero it explicitly.
   * @returns {void}
   */
  reset() {
    this.offsetX = 0;
    this.offsetY = 0;
  }

  /**
   * Zero the cumulative telemetry. Never called automatically — the counters
   * are only meaningful as a running total.
   * @returns {void}
   */
  clearStats() {
    this.stats = { corrections: 0, snaps: 0, ignored: 0, maxError: 0 };
  }
}

export default Prediction;