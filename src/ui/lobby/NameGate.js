/**
 * Astral Zero — NameGate (first-boot identity prompt).
 * ===========================================================
 * Phase 2 needs a stable player NAME because the backend keys friends,
 * parties and first-match protection on it (normalised lowercase). Phase 1
 * never asked for one, so the lobby asks once and remembers it in
 * `localStorage`.
 *
 * Design choice: the gate is SKIPPABLE. `?skipName` (or a name already saved)
 * lets the player straight into the lobby, because during gameplay iteration
 * retyping a name every refresh is pure friction.
 */

import { THEME, FONTS } from '../../config/uiTheme.js';
import { Panel } from '../widgets/Panel.js';
import { Button } from '../widgets/Button.js';
import { TextField } from '../widgets/TextField.js';

/** localStorage key. Namespaced so it never collides with anything else. */
export const NAME_STORAGE_KEY = 'astral-zero:player-name';

/**
 * Read the saved name, or `null`.
 * @returns {string|null}
 */
export function loadName() {
  try {
    const value = window.localStorage.getItem(NAME_STORAGE_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null; // private mode / blocked storage — fall back to asking
  }
}

/**
 * Persist the chosen name.
 * @param {string} name
 * @returns {void}
 */
export function saveName(name) {
  try {
    window.localStorage.setItem(NAME_STORAGE_KEY, name);
  } catch {
    /* non-fatal: the name still applies for this session */
  }
}

export class NameGate {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {import('../../net/NetworkManager.js').NetworkManager} opts.net
   * @param {() => void} opts.onDone - Called once the player confirms.
   * @param {number} [opts.depth]
   */
  constructor(scene, opts) {
    this.scene = scene;
    this.net = opts.net;
    this.onDone = opts.onDone ?? (() => {});
    this.depth = opts.depth ?? 300;

    const w = 480;
    const h = 230;
    const x = 640 - w / 2;
    const y = 260;

    // Dim the lobby behind the gate so focus is obvious.
    this.scrim = scene.add
      .rectangle(640, 360, 1280, 720, 0x03050b, 0.72)
      .setDepth(this.depth - 1)
      .setScrollFactor(0)
      .setInteractive(); // swallow clicks so nothing behind is clickable

    this.panel = new Panel(scene, {
      x,
      y,
      width: w,
      height: h,
      title: 'WHO ARE YOU?',
      accent: THEME.panelBorderBright,
      depth: this.depth,
    });

    this.body = scene.add
      .text(640, y + 62, 'Friends, parties and match history are keyed on this name.', FONTS.dim)
      .setOrigin(0.5, 0)
      .setDepth(this.depth + 1)
      .setScrollFactor(0);

    this.field = new TextField(scene, {
      x: 640 - 190,
      y: y + 100,
      width: 380,
      height: 48,
      placeholder: 'e.g. MopLord42',
      value: loadName() ?? '',
      maxLength: 24,
      depth: this.depth + 2,
      onChange: () => this._refreshGo(),
      onSubmit: () => this._onGo(),
    });

    this.goButton = new Button(scene, {
      x: 640,
      y: y + h - 28,
      width: 220,
      height: 46,
      label: 'Enter Lobby',
      skin: 'primary',
      depth: this.depth + 2,
      onClick: () => this._onGo(),
    });

    this._refreshGo();
  }

  /** Enable "Enter Lobby" only when the name is non-empty. */
  _refreshGo() {
    this.goButton.setEnabled(this.field.getValue().trim().length > 0);
  }

  /** @returns {void} */
  _onGo() {
    const name = this.field.getValue().trim();
    if (!name) return;

    saveName(name);
    this.net.setPlayerName(name);
    this.destroy();
    this.onDone();
  }

  /** @returns {void} */
  destroy() {
    this.field.destroy();
    this.panel.destroy();
    this.body.destroy();
    this.goButton.destroy();
    this.scrim.destroy();
  }
}

export default NameGate;