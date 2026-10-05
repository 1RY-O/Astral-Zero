import Phaser from 'phaser';

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

/** Phaser key codes grouped by semantic action. */
export const KEY_BINDINGS = {
  left: [Phaser.Input.Keyboard.KeyCodes.LEFT, Phaser.Input.Keyboard.KeyCodes.A],
  right: [Phaser.Input.Keyboard.KeyCodes.RIGHT, Phaser.Input.Keyboard.KeyCodes.D],
  jump: [
    Phaser.Input.Keyboard.KeyCodes.SPACE,
    Phaser.Input.Keyboard.KeyCodes.UP,
    Phaser.Input.Keyboard.KeyCodes.W,
  ],
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
      aimX: 0,
      aimY: 0,
    };

    /** @type {Record<string, Phaser.Input.Keyboard.Key[]>} */
    this.keyGroups = {};

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
   * True when ANY key bound to an action went down on this exact frame.
   * @param {string} action
   * @returns {boolean}
   */
  _isActionJustPressed(action) {
    const keys = this.keyGroups[action];
    return keys ? keys.some((key) => Phaser.Input.Keyboard.JustDown(key)) : false;
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
      return intent;
    }

    // --- Horizontal intent: last-pressed direction wins on conflict ---------
    const left = this._isActionDown('left');
    const right = this._isActionDown('right');
    intent.moveX = (right ? 1 : 0) - (left ? 1 : 0);

    // --- Jump intent (held state + this-frame edge) ------------------------
    intent.jumpHeld = this._isActionDown('jump');
    intent.jumpPressed = this._isActionJustPressed('jump');

    // --- Aim: pointer position in WORLD space -------------------------------
    // World space (not screen space) so aiming stays correct once we add
    // camera shake, follow, or zoom.
    //
    // NOTE: Phaser exposes the active pointer as `input.activePointer`; there
    // is no `input.pointer` alias, so read it from the correct property.
    const pointer = this.scene.input?.activePointer;
    if (pointer) {
      intent.aimX = pointer.worldX;
      intent.aimY = pointer.worldY;
    }

    return intent;
  }

  /**
   * Release all intent. Call on scene shutdown so a paused/stopped scene does
   * not keep steering the player with stale input.
   */
  reset() {
    this.intent.moveX = 0;
    this.intent.jumpHeld = false;
    this.intent.jumpPressed = false;
  }
}