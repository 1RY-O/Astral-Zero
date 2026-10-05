/**
 * Astral Zero — Panel (reusable lobby/HUD container).
 * ===========================================================
 * A rounded, slightly translucent card with a 1px border and an optional
 * header label. Used by every lobby section so the whole UI shares one
 * visual language without any image assets.
 *
 * Design notes
 *  - The graphics object is REDRAWN (not re-created) on resize so panels can
 *    animate their size without leaking display-list entries.
 *  - Children are created by the caller; the panel only owns its own chrome
 *    and a depth so it can be pushed behind its content.
 */

import { THEME, FONTS } from '../../config/uiTheme.js';

export class Panel {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {number} opts.x - Top-left X (centre-origin off).
   * @param {number} opts.y - Top-left Y.
   * @param {number} opts.width
   * @param {number} opts.height
   * @param {string} [opts.title] - Small uppercase header label.
   * @param {string} [opts.accent] - Border colour override.
   * @param {number} [opts.depth] - Render depth.
   * @param {number} [opts.radius] - Corner radius.
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    this.width = opts.width ?? 100;
    this.height = opts.height ?? 100;
    this.accent = opts.accent ?? THEME.panelBorder;
    this.radius = opts.radius ?? 14;

    /** Own graphics layer, drawn UNDER everything the caller adds. */
    this.bg = scene.add.graphics().setDepth(opts.depth ?? 0);
    // The whole lobby is drawn in screen space (no camera scroll), so every
    // child must ignore the camera transform too.
    this.bg.setScrollFactor(0);

    this.title = null;
    if (opts.title) {
      this.title = scene.add
        .text(this.x + 18, this.y + 14, opts.title, FONTS.h3)
        .setDepth((opts.depth ?? 0) + 1)
        .setScrollFactor(0)
        .setAlpha(0.95);
    }

    this.redraw();
  }

  /**
   * Repaint the card background + border.
   * @returns {void}
   */
  redraw() {
    const g = this.bg;
    g.clear();

    // Card body: dark navy, 88% opaque so the starfield hints through.
    g.fillStyle(THEME.panel, 0.88);
    g.fillRoundedRect(this.x, this.y, this.width, this.height, this.radius);

    // Border. Two passes (wide + thin) give the "soft glow" without a blur.
    g.lineStyle(4, this.accent, 0.12);
    g.strokeRoundedRect(this.x, this.y, this.width, this.height, this.radius);
    g.lineStyle(1, this.accent, 0.75);
    g.strokeRoundedRect(this.x, this.y, this.width, this.height, this.radius);

    // Accent strip down the left edge — reads as "section of the HUD".
    g.fillStyle(this.accent, 0.9);
    g.fillRoundedRect(this.x + 1, this.y + 16, 3, this.height - 32, 2);
  }

  /**
   * Resize + repaint (e.g. when the members list grows).
   * @param {number} width
   * @param {number} height
   * @returns {void}
   */
  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.redraw();
  }

  /**
   * Move the card (and its header).
   * @param {number} x
   * @param {number} y
   * @returns {void}
   */
  setPosition(x, y) {
    this.x = x;
    this.y = y;
    if (this.title) this.title.setPosition(x + 18, y + 14);
    this.redraw();
  }

  /**
   * Show/hide the whole panel (and its header).
   * @param {boolean} visible
   * @returns {void}
   */
  setVisible(visible) {
    this.bg.setVisible(visible);
    this.title?.setVisible(visible);
  }

  /**
   * @param {string} text
   * @returns {void}
   */
  setTitle(text) {
    this.title?.setText(text);
  }

  /** @returns {void} */
  destroy() {
    this.bg.destroy();
    this.title?.destroy();
  }
}

export default Panel;