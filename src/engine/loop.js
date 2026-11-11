/**
 * ASTRAL ZERO — Deterministic Fixed-Timestep Game Loop.
 * Built for the NASA International Space Apps Challenge 2026.
 *
 * Runs physics at 60 Hz fixed timestep with accumulator sub-stepping,
 * guaranteeing identical simulation behavior regardless of display refresh rate.
 */

import { CONSTANTS } from './physics.js';

export class FixedLoop {
  constructor(updateFn = () => {}, renderFn = () => {}) {
    this.update = updateFn;
    this.render = renderFn;
    this.running = false;
    this.rafId = null;
    this.intervalId = null;
    this.accumulator = 0;
    this.lastTime = 0;
    this.fixedDt = CONSTANTS.FIXED_DT;
    this.maxSubsteps = CONSTANTS.MAX_SUBSTEPS;
    this.tickCount = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;

    const tick = (now) => {
      if (!this.running) return;

      const frameSeconds = Math.min((now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;
      this.accumulator += frameSeconds;

      let substeps = 0;
      while (this.accumulator >= this.fixedDt && substeps < this.maxSubsteps) {
        this.update(this.fixedDt, this.tickCount);
        this.accumulator -= this.fixedDt;
        this.tickCount++;
        substeps++;
      }

      // Prevent spiral of death if dropped behind
      if (substeps >= this.maxSubsteps) {
        this.accumulator = 0;
      }

      const alpha = this.accumulator / this.fixedDt;
      this.render(alpha);

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);

    // Heartbeat fallback for headless environments or background tabs
    this.intervalId = setInterval(() => {
      if (!this.running) return;
      const now = performance.now();
      if (now - this.lastTime >= 35) {
        tick(now);
      }
    }, 16);
  }

  stop() {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
