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
const nativeFloor = globalThis.Math.floor;

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
  /**
   * Deterministic seeded RNG, matching Phaser's RandomDataGenerator API for
   * the methods the game uses (between / realInRange / pick). Seeded so a test
   * asserting a fixed starfield layout is reproducible.
   */
  RandomDataGenerator: class RandomDataGenerator {
    constructor(seed = ['']) {
      this.s = String(seed[0] ?? '').split('').reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7) || 7;
    }
    /** xorshift32 — deterministic and adequate for scatter. */
    _next() {
      let x = this.s;
      x ^= x << 13; x >>>= 0;
      x ^= x >> 17;
      x ^= x << 5; x >>>= 0;
      this.s = x;
      return x / 0x100000000;
    }
    between(min, max) { return min + this._next() * (max - min); }
    realInRange(min, max) { return min + this._next() * (max - min); }
    pick(list) { return list[nativeFloor(this._next() * list.length)]; }
    integer() { return nativeFloor(this._next() * 0xffffffff); }
  },
};

export const Scale = { FIT: 1, CENTER_BOTH: 3, NO_CENTER: 0 };
export const AUTO = 0;
export const Events = { READY: 'ready' };



// --- Scene base class -------------------------------------------------------
// LobbyScene extends Phaser.Scene, so the stub must provide a real base class
// or `class X extends undefined` throws at module-evaluation time.
export class Scene {
  constructor(key) { this.__key = key; }
}

// Namespaces the UI modules reference as `Phaser.<X>`.
export const Display = { Color: { HexStringToColor: () => ({ color: 0xffffff }) } };
export const Input = { Keyboard: { KeyCodes: { LEFT: 0, RIGHT: 1, A: 2, D: 3, SPACE: 4, UP: 5, W: 6, TAB: 7, Q: 8, F: 9 } } };
export const Scenes = { Events: { SHUTDOWN: 'shutdown', START: 'start' } };
export const Core = { Events: { READY: 'ready' } };
export const GameObjects = { Container: class {} };
export const Physics = { Arcade: { Sprite: class {} } };
export const Cameras = { Scene2D: { Camera: class {} } };

const Phaser = {
  Math,
  Scale,
  AUTO,
  Events,
  Scene,
  Display,
  Input,
  Scenes,
  Core,
  GameObjects,
  Physics,
  Cameras,
};

export default Phaser;
