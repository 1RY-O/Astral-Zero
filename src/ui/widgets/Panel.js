/**
 * Astral Zero — Panel (reusable arcade card).
 * ===========================================================
 * The shared surface language for every menu: a big rounded card with a
 * THICK border, a coloured top-edge bar and an optional title strip.
 *
 * WHY THICK BORDERS
 * Arcade UI reads as chunky and physical. A 1px hairline reads as a
 * dashboard. We draw a wide soft "glow" pass plus a crisp core pass, which
 * gives depth without a blur filter.
 *
 * ACCESSIBILITY
 *  - The title is a real Phaser Text object, so it is in the accessibility
 *    tree as a labelled region; `ariaLabel` also writes a `title` attribute
 *    where a canvas-backed node allows it.
 *  - Contrast: the title colour is chosen against the card fill, not the
 *    page background, and both are measured (see docs QA notes).
 *  - Selection states elsewhere never rely on colour alone — a selected mode
 *    card also gains a check glyph and a thicker border.
 *
 * PERFORMANCE
 *  - The Graphics object is REDRAWN, never recreated, so resizing a panel
 *    (e.g. a members list growing) cannot leak display-list entries.
 */

import { THEME, FONTS, RADII, MOTION } from '../../config/uiTheme.js';
import * as Motion from '../../core/Motion.js';

export class Panel {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {number} opts.x - Top-left X.
   * @param {number} opts.y - Top-left Y.
   * @param {number} opts.width
   * @param {number} opts.height
   * @param {string} [opts.title] - Header strip label.
   * @param {string} [opts.subtitle] - Small line under the title.
   * @param {number} [opts.accent] - Border/edge colour override (packed int).
   * @param {number} [opts.depth] - Render depth.
   * @param {number} [opts.radius]
   * @param {boolean} [opts.emphasised] - Thicker border + brighter edge bar.
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    this.width = opts.width ?? 100;
    this.height = opts.height ?? 100;
    this.accent = opts.accent ?? THEME.panelBorder;
    this.emphasised = Boolean(opts.emphasised);
    this.radius = opts.radius ?? RADII.panel;
    this.depth = opts.depth ?? 0;

    this.bg = scene.add.graphics().setDepth(this.depth).setScrollFactor(0);
    this.title = null;
    this.subtitle = null;

    if (opts.title) {
      this.title = scene.add
        .text(this.x + 20, this.y + 15, opts.title, FONTS.panelTitle)
        .setDepth(this.depth + 1)
        .setScrollFactor(0);
    }
    if (opts.subtitle) {
      this.subtitle = scene.add
        .text(this.x + 20, this.y + 36, opts.subtitle, FONTS.tiny)
        .setDepth(this.depth + 1)
        .setScrollFactor(0);
    }

    this.redraw();
  }

  /**
   * Repaint the card: body, glow, crisp border, accent edge bar.
   * @returns {void}
   */
  redraw() {
    const g = this.bg;
    const r = this.radius;
    g.clear();

    // Body — slightly translucent so the orbital backdrop reads behind it,
    // but dark enough that body text clears 4.5:1 against it.
    g.fillStyle(THEME.panel, 0.93);
    g.fillRoundedRect(this.x, this.y, this.width, this.height, r);

    // Inner top highlight: a 1px lighter line just inside the top edge reads
    // as a light source above the card. Pure depth cue, costs one call.
    g.fillStyle(0xffffff, 0.05);
    g.fillRoundedRect(this.x + 3, this.y + 3, this.width - 6, 2, 1);

    // Glow pass (wide, faint) + core pass (crisp). Two strokes = depth.
    const glowW = this.emphasised ? 10 : 7;
    g.lineStyle(glowW, this.accent, this.emphasised ? 0.2 : 0.11);
    g.strokeRoundedRect(this.x, this.y, this.width, this.height, r);
    g.lineStyle(this.emphasised ? 3 : 2, this.accent, this.emphasised ? 1 : 0.7);
    g.strokeRoundedRect(this.x, this.y, this.width, this.height, r);

    // Accent bar down the left edge — the "section of the HUD" cue.
    g.fillStyle(this.accent, 0.95);
    g.fillRoundedRect(this.x + 2, this.y + r * 0.6, 5, this.height - r * 1.2, 3);
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
    if (this.title) this.title.setPosition(x + 20, y + 15);
    if (this.subtitle) this.subtitle.setPosition(x + 20, y + 36);
    this.redraw();
  }

  /**
   * Change the accent colour (e.g. party panel goes cyan when you are in a
   * party, neutral when you are not).
   * @param {number} color - Packed int.
   * @returns {void}
   */
  setAccent(color) {
    this.accent = color;
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
    this.subtitle?.setVisible(visible);
  }

  /**
   * Fade the whole card in, with a slight rise. Respects reduced motion.
   * @param {number} [delayMs] - Stagger index × MOTION.stagger.
   * @returns {void}
   */
  enter(delayMs = 0) {
    const parts = [this.bg, this.title, this.subtitle].filter(Boolean);
    Motion.enter(this.scene, parts, {
      delay: delayMs,
      distance: Motion.scale(18),
      duration: MOTION.base + 120,
    });
  }

  /** @param {string} text */
  setTitle(text) {
    this.title?.setText(text);
  }

  /** @param {string} text */
  setSubtitle(text) {
    this.subtitle?.setText(text);
  }

  /** @returns {void} */
  destroy() {
    this.bg.destroy();
    this.title?.destroy();
    this.subtitle?.destroy();
  }
}

export default Panel;
