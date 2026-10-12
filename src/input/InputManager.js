import Phaser from 'phaser';
import { canonicalAimPoint } from './aimPoint.js';

/**
 * Astral Zero - input abstraction.
 *
 * DESIGN GOAL (networking): gameplay code never touches Phaser's keyboard
 * plugin directly. Instead this class converts raw device input into a small,
 * plain, serialisable snapshot of *intent*:
 *
 *     { moveX, jumpHeld, jumpPressed, aimX, aimY }
 *
 * That snapshot is exactly the payload we will later send over Socket.io to
 * the server, and exactly what we will apply to remote players. Driving the
 * local player from a network buffer or from a bot therefore requires no
 * changes to Player.js - just a different source feeding the same fields.
 *
 * Note: this layer reports only the raw "jump went down this frame" EDGE.
 * Timing forgiveness (coyote time / jump buffering) lives in Player.js
 * because only the player knows whether a jump is currently possible.
 */

/** Phaser key codes grouped by semantic action.
 *
 * NOTE ON W: W (with SPACE and UP) is INTENTIONALLY a jump alias — this is a
 * side-view platformer with no vertical swim axis, so W has no "move up" to
 * conflict with, and the multi-key jump binding (plus the tutorial + HUD hint)
 * is the documented control scheme. Holding a jump key must still produce
 * exactly ONE jump (see update(): the edge is repeat-proof).
 */
export const KEY_BINDINGS = {
  left: [Phaser.Input.Keyboard.KeyCodes.LEFT, Phaser.Input.Keyboard.KeyCodes.A],
  right: [Phaser.Input.Keyboard.KeyCodes.RIGHT, Phaser.Input.Keyboard.KeyCodes.D],
  jump: [
    Phaser.Input.Keyboard.KeyCodes.SPACE,
    Phaser.Input.Keyboard.KeyCodes.UP,
    Phaser.Input.Keyboard.KeyCodes.W,
  ],
  // Melee: the mop swing. Keyboard-bound (F is also available on the right
  // mouse button, see ArenaScene._bindFireInput) and edge-detected here for the
  // same repeat-proof reason as jump — holding the key must swing once.
  melee: [Phaser.Input.Keyboard.KeyCodes.F],
};

/**
 * An immutable-by-convention intent snapshot. Kept as a plain object so it
 * survives `JSON.stringify` for the future network layer.
 *
 * @typedef {object} InputIntent
 * @property {number}  moveX       -1 = left, 0 = idle, +1 = right.
 * @property {boolean} jumpHeld    Jump key is currently down.
 * @property {boolean} jumpPressed Jump key went down THIS frame (edge).
 * @property {number}  aimX        Pointer position in world space.
 * @property {number}  aimY        Pointer position in world space.
 */

/**
 * Polls device input each frame and exposes the current intent.
 */
export class InputManager {
  /**
   * @param {Phaser.Scene} scene - Scene whose input plugins we poll.
   * @param {Phaser.Input.Keyboard.Keyboard|null} [keyboardPlugin] - When
   *   null the manager reports a neutral intent, which is exactly what we want
   *   for replay-driven or purely remote input.
   */
  constructor(scene, keyboardPlugin = null) {
    this.scene = scene;
    this.enabled = true;

    /** @type {InputIntent} Neutral intent, also the shape used on the wire. */
    this.intent = {
      moveX: 0,
      jumpHeld: false,
      jumpPressed: false,
      meleeHeld: false,
      meleePressed: false,
      aimX: 0,
      aimY: 0,
    };

    /** @type {Record<string, Phaser.Input.Keyboard.Key[]>} */
    this.keyGroups = {};

    /**
     * Previous frame's held state per action, for repeat-proof edge detection.
     * The OS auto-repeat re-fires DOM keydown while a key is HELD, and Phaser
     * restamps the Key's down-time on every repeat — so `JustDown` pulses true
     * again mid-hold and a held jump key re-jumps on every landing (the bunny
     * hop). Comparing held-against-held instead makes the edge fire exactly
     * once per physical press, no matter how long the key repeats.
     * @type {Record<string, boolean>}
     */
    this._prevHeld = {};

    if (keyboardPlugin) {
      this._attachKeyboard(keyboardPlugin);
    }
  }

  /**
   * Creates the Phaser Key objects for each action and stops the browser from
   * scrolling with Space / arrow keys.
   * @param {Phaser.Input.Keyboard.Keyboard} keyboardPlugin
   */
  _attachKeyboard(keyboardPlugin) {
    for (const [action, keyCodes] of Object.entries(KEY_BINDINGS)) {
      const keys = keyCodes.map((code) => keyboardPlugin.addKey(code, false, false));

      // Suppress default browser behaviour (page scroll) for gameplay keys.
      keys.forEach((key) => keyboardPlugin.addCapture(key));

      this.keyGroups[action] = keys;
    }
  }

  /**
   * True when ANY key bound to an action is currently held.
   * @param {string} action - One of 'left' | 'right' | 'jump'.
   * @returns {boolean}
   */
  _isActionDown(action) {
    const keys = this.keyGroups[action];
    return keys ? keys.some((key) => key.isDown) : false;
  }

  /**
   * True when ANY key bound to an action went down since the last frame.
   *
   * Repeat-proof: derived from the HELD state transition (down now, up before),
   * NOT from the key's down timestamp, so OS auto-repeat while held never
   * re-fires the edge. Exactly one `true` per physical press.
   * @param {string} action - One of 'left' | 'right' | 'jump'.
   * @returns {boolean}
   */
  _isActionJustPressed(action) {
    return this._isActionDown(action) && !this._prevHeld[action];
  }

  /**
   * Poll the device and refresh the intent snapshot. Call once per frame,
   * before any gameplay code reads `this.intent`.
   *
   * @param {number} [_deltaMs] - Unused today; kept so the signature is stable
   *   when input buffering/latency compensation arrives with the netcode.
   * @returns {InputIntent} The live intent object (not a copy).
   */
  update(_deltaMs = 16) {
    const intent = this.intent;

    if (!this.enabled) {
      intent.moveX = 0;
      intent.jumpHeld = false;
      intent.jumpPressed = false;
      intent.meleeHeld = false;
      intent.meleePressed = false;
      return intent;
    }

    // --- Horizontal intent: last-pressed direction wins on conflict ---------
    const left = this._isActionDown('left');
    const right = this._isActionDown('right');
    intent.moveX = (right ? 1 : 0) - (left ? 1 : 0);

    // --- Jump intent (held state + repeat-proof this-press edge) ------------
    // The edge MUST be sampled BEFORE `_prevHeld` is stored for this frame, or
    // the press that just happened would compare against itself and vanish.
    const jumpHeld = this._isActionDown('jump');
    intent.jumpHeld = jumpHeld;
    intent.jumpPressed = jumpHeld && !this._prevHeld.jump;

    // --- Melee edge, same repeat-proof rule as jump -------------------------
    // Bound to F (and the right mouse button, wired in ArenaScene). Held must
    // swing once, so the edge is a held-state transition, never a key timestamp.
    const meleeHeld = this._isActionDown('melee');
    intent.meleeHeld = meleeHeld;
    intent.meleePressed = meleeHeld && !this._prevHeld.melee;

    this._prevHeld = { left, right, jump: jumpHeld, melee: meleeHeld };

    // --- Aim: the CANONICAL world-space target ------------------------------
    // Projected live through the active camera (scroll + zoom + rotation +
    // viewport) so cursor, laser, weapon rotation and shot direction share one
    // target at every resolution and zoom level. See src/input/aimPoint.js.
    const aim = canonicalAimPoint(this.scene);
    if (aim) {
      intent.aimX = aim.x;
      intent.aimY = aim.y;
    }

    return intent;
  }

  /**
   * Release all intent. Call on scene shutdown, respawn, room leave and match
   * restart so a paused/stopped scene does not keep steering the player — or
   * auto-jumping on spawn — with stale input.
   */
  reset() {
    this.intent.moveX = 0;
    this.intent.jumpHeld = false;
    this.intent.jumpPressed = false;
    this._prevHeld = {};
  }
}