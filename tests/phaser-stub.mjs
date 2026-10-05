/**
 * Minimal Phaser stand-in for headless tests.
 * ===========================================================
 * ThirdPersonCamera and gameConfig import Phaser purely for constants and the
 * Math helpers (Clamp / Linear). Booting the real engine in Node needs a DOM
 * plus WebGL, which is exactly what these tests avoid — so the loader hook in
 * phaser-loader.mjs resolves the bare "phaser" specifier to this file.
 *
 * The maths below matches Phaser's semantics exactly (see Phaser Math source),
 * so a passing test means the browser will behave the same way.
 */

// NOTE: exported as `Math` shadows the global inside this module, so the
// native functions are captured FIRST and referenced explicitly below.
const nativeMin = globalThis.Math.min;
const nativeMax = globalThis.Math.max;

export const Math = {
  Clamp(value, min, max) {
    return nativeMax(min, nativeMin(max, value));
  },
  Linear(start, end, t) {
    return start + (end - start) * t;
  },
  Between(min, max, t) {
    return min + (max - min) * t;
  },
};

export const Scale = { FIT: 1, CENTER_BOTH: 3, NO_CENTER: 0 };
export const AUTO = 0;
export const Events = { READY: 'ready' };

export default { Math, Scale, AUTO, Events };
