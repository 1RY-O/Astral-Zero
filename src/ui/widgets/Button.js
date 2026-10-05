/**
 * Astral Zero — Button (reusable lobby/HUD control).
 * ===========================================================
 * A rounded rectangle with a label that handles hover / press / disabled
 * states itself, so lobby panels only care about WHAT a button does.
 *
 * Interaction notes
 *  - Hit area is the full rect (`setInteractive`), so there is no fiddling
 *    with the text object's own bounds.
 *  - `setEnabled(false)` keeps the button visible but inert and greys it out.
 *    Used constantly: "Start Match" only works for the leader, "Join" only
 *    with 6 valid characters, "Invite" only when the party has room.
 *  - Callbacks fire on pointer-up, never on pointer-down, so a drag that
 *    starts on a button does not accidentally trigger it.
 */

import { THEME, FONTS } from '../../config/uiTheme.js';

/** Visual states, each mapping to (fill, border, text colour). */
const SKINS = {
  primary: { fill: 0x0e7490, border: 0x38e1ff, text: '#ffffff' },
  accent: { fill: 0x14304a, border: 0x7fe7ff, text: '#e8f4ff' },
  neutral: { fill: 0x111b30, border: 0x2b3d5e, text: '#cfe2f5' },
  danger: { fill: 0x3a1626, border: 0xff6b8b, text: '#ffe1e8' },
  ghost: { fill: 0x000000, border: 0x1e2b45, text: '#8fa3bf' },
};

export class Button {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {number} opts.x - Centre X.
   * @param {number} opts.y - Centre Y.
   * @param {number} opts.width
   * @param {number} opts.height
   * @param {string} opts.label
   * @param {keyof SKINS} [opts.skin]
   * @param {string} [opts.sublabel] - Optional second line (mode cards use it).
   * @param {number} [opts.fontSize]
   * @param {() => void} [opts.onClick]
   * @param {number} [opts.depth]
   * @param {boolean} [opts.enabled]
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.cx = opts.x ?? 0;
    this.cy = opts.y ?? 0;
    this.width = opts.width ?? 180;
    this.height = opts.height ?? 48;
    this.skinName = opts.skin ?? 'neutral';
    this.depth = opts.depth ?? 10;
    this.enabled = opts.enabled !== false;
    this.onClick = opts.onClick ?? (() => {});

    /** True while the pointer is held down on the button (pressed look). */
    this._pressed = false;

    this.bg = scene.add.graphics().setDepth(this.depth).setScrollFactor(0);
    this.label = scene.add
      .text(this.cx, opts.sublabel ? this.cy - 9 : this.cy, opts.label ?? '', {
        ...FONTS.h3,
        fontSize: opts.fontSize ?? '15px',
        fontStyle: '600',
      })
      .setOrigin(0.5)
      .setDepth(this.depth + 1)
      .setScrollFactor(0);

    this.sublabel = null;
    if (opts.sublabel) {
      this.sublabel = scene.add
        .text(this.cx, this.cy + 13, opts.sublabel, { ...FONTS.tiny, fontSize: '11px' })
        .setOrigin(0.5)
        .setDepth(this.depth + 1)
        .setScrollFactor(0);
    }

    // --- Hit area + pointer state machine ----------------------------------
    this.zone = scene.add
      .zone(this.cx - this.width / 2, this.cy - this.height / 2, this.width, this.height)
      .setOrigin(0, 0)
      .setDepth(this.depth)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    this.zone.on('pointerover', () => this.redraw());
    this.zone.on('pointerout', () => {
      this._pressed = false;
      this.redraw();
    });
    this.zone.on('pointerdown', () => {
      this._pressed = true;
      this.redraw();
    });
    this.zone.on('pointerup', () => {
      this._pressed = false;
      this.redraw();
      if (this.enabled) this.onClick();
    });

    this.redraw();
  }

  /**
   * Current skin, accounting for enabled/hover/pressed state.
   * @returns {{fill:number, border:number, text:string, alpha:number}}
   */
  _resolveSkin() {
    const base = SKINS[this.skinName] ?? SKINS.neutral;
    if (!this.enabled) return { ...base, alpha: 0.32, text: THEME.textFaint };

    const hovered = Boolean(this.zone.input?.enabled) && this.zone.isOver;
    if (this._pressed) return { ...base, fill: lighten(base.fill, 0.18) };
    if (hovered) return { ...base, fill: lighten(base.fill, 0.1) };
    return base;
  }
/**
   * Repaint from the current state. Cheap enough to call on every pointer
   * event (the lobby has fewer than 20 buttons).
   * @returns {void}
   */
  redraw() {
    const skin = this._resolveSkin();
    const left = this.cx - this.width / 2;
    const top = this.cy - this.height / 2;

    const g = this.bg;
    g.clear();
    g.fillStyle(skin.fill, skin.alpha);
    g.fillRoundedRect(left, top, this.width, this.height, 10);
    g.lineStyle(2, skin.border, this.enabled ? 0.9 : 0.25);
    g.strokeRoundedRect(left, top, this.width, this.height, 10);

    // Focus ring while pressing — reads as "this is what you just clicked".
    if (this._pressed && this.enabled) {
      g.lineStyle(6, skin.border, 0.25);
      g.strokeRoundedRect(left, top, this.width, this.height, 10);
    }

    this.label.setColor(skin.text).setAlpha(skin.alpha);
    this.sublabel?.setAlpha(skin.alpha * 0.9);
  }

  /**
   * @param {string} text
   * @returns {void}
   */
  setLabel(text) {
    this.label.setText(text);
  }

  /**
   * Swap the visual skin (used by the mode selector: selected vs unselected).
   * @param {keyof SKINS} name
   * @returns {void}
   */
  setSkin(name) {
    this.skinName = name;
    this.redraw();
  }

  /**
   * Enable/disable. Disabled buttons do not fire `onClick`.
   * @param {boolean} enabled
   * @returns {void}
   */
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.redraw();
  }

  /**
   * Move + resize in one call.
   * @param {number} x - Centre X.
   * @param {number} y - Centre Y.
   * @param {number} [width]
   * @param {number} [height]
   * @returns {void}
   */
  setPosition(x, y, width = this.width, height = this.height) {
    this.cx = x;
    this.cy = y;
    this.width = width;
    this.height = height;
    this.label.setPosition(x, this.sublabel ? y - 9 : y);
    this.sublabel?.setPosition(x, y + 13);
    this.zone.setPosition(x - width / 2, y - height / 2);
    this.zone.setSize(width, height);
    this.redraw();
  }

  /**
   * @param {boolean} visible
   * @returns {void}
   */
  setVisible(visible) {
    this.bg.setVisible(visible);
    this.label.setVisible(visible);
    this.sublabel?.setVisible(visible);
    this.zone.setVisible(visible);
    if (!visible) this.zone.disableInteractive();
    else this.zone.setInteractive({ useHandCursor: true });
  }

  /** @returns {void} */
  destroy() {
    this.bg.destroy();
    this.label.destroy();
    this.sublabel?.destroy();
    this.zone.destroy();
  }
}

/**
 * Blend a 0xRRGGBB colour toward white. Phaser exposes no colour maths for
 * packed ints, so the arithmetic is done explicitly here.
 * @param {number} color
 * @param {number} amount 0..1
 * @returns {number} packed colour
 */
export function lighten(color, amount) {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

export { SKINS as BUTTON_SKINS };
export default Button;