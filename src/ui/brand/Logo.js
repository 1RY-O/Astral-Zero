/**
 * Astral Zero — original brand mark (FRONTEND).
 * ===========================================================
 * A procedurally drawn logo. No image asset, no third-party mark, no skull
 * or character art — just Astral Zero's own language, built from three ideas
 * the game actually cares about:
 *
 *   1. AN ORBITAL RING   — the sweep orbit the janitor works in.
 *   2. A CLEANUP SWOOSH  — the trail behind a cleared piece of debris.
 *   3. A STAR            — the thing being cleaned up, caught mid-sweep.
 *
 * The ring is an ellipse seen at a tilt (drawn as an arc sweep), which is
 * what makes it read as "orbit" rather than "circle logo". The swoosh is a
 * second, thicker arc offset behind it. The star is a 4-point sparkle.
 *
 * It is drawn into the EXISTING scene rather than a texture so it can be
 * recoloured per state (e.g. dimmed when the connection is offline) with a
 * single alpha change, and so it stays crisp at any zoom.
 */

import { THEME, FONTS, RADII } from '../../config/uiTheme.js';

export class Logo {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {number} opts.x - Centre X.
   * @param {number} opts.y - Centre Y.
   * @param {number} [opts.size] - Overall mark size in px.
   * @param {number} [opts.depth]
   * @param {boolean} [opts.showWordmark] - Draw "ASTRAL ZERO" + subtitle.
   * @param {number} [opts.wordmarkSize]
   */
  constructor(scene, { x, y, size = 56, depth = 20, showWordmark = true, wordmarkSize = 1 } = {}) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.size = size;
    this.depth = depth;

    this.gfx = scene.add.graphics().setDepth(depth).setScrollFactor(0);
    this._drawMark();

    this.parts = [this.gfx];
    if (showWordmark) this._drawWordmark(wordmarkSize);
  }

  /**
   * The icon itself: tilted orbit ring + cleanup swoosh + star.
   * @returns {void}
   */
  _drawMark() {
    const g = this.gfx;
    const { x, y, size } = this;
    const r = size / 2;
    g.clear();

    // --- Outer orbit ring: a tilted ellipse. Drawn as a thick arc with an
    // open gap at the top-right so it reads as motion, not as a static badge.
    g.lineStyle(size * 0.13, THEME.accentDeep, 1);
    // Slightly flattened to suggest a viewing angle.
    g.beginPath();
    g.arc(x, y, r * 0.92, Math.PI * 0.18, Math.PI * 1.82, false);
    g.strokePath();

    // --- Cleanup swoosh: a brighter inner arc, thicker, with a gradient feel
    // built from two stacked strokes of decreasing width.
    g.lineStyle(size * 0.16, 0x1e88b0, 1);
    g.beginPath();
    g.arc(x, y, r * 0.62, Math.PI * 0.9, Math.PI * 1.85, false);
    g.strokePath();

    g.lineStyle(size * 0.07, THEME.accent, 1);
    g.beginPath();
    g.arc(x, y, r * 0.62, Math.PI * 0.9, Math.PI * 1.85, false);
    g.strokePath();

    // --- Sweep head: a bright cap where the swoosh terminates, so the eye
    // has somewhere to land.
    const headAngle = Math.PI * 1.85;
    const hx = x + Math.cos(headAngle) * r * 0.62;
    const hy = y + Math.sin(headAngle) * r * 0.62;
    g.fillStyle(THEME.amber, 1);
    g.fillCircle(hx, hy, size * 0.085);

    // --- The star (the debris being swept).
    this._star(x, y, r * 0.3, size * 0.16, THEME.textPrimary);
  }

  /**
   * A 4-point sparkle. Drawn as two crossing tapered quads so it has the
   * concave "twinkle" silhouette rather than looking like a plus sign.
   *
   * @param {number} cx
   * @param {number} cy
   * @param {number} outer - Half-height of the vertical points.
   * @param {number} waist - Half-width of the horizontal points.
   * @param {number} color
   */
  _star(cx, cy, outer, waist, color) {
    const g = this.gfx;
    const k = 0.34; // the concave pinch
    g.fillStyle(color, 1);

    // Vertical diamond (tall).
    g.beginPath();
    g.moveTo(cx, cy - outer);
    g.lineTo(cx + waist * k, cy - waist * k);
    g.lineTo(cx + waist, cy);
    g.lineTo(cx + waist * k, cy + waist * k);
    g.lineTo(cx, cy + outer);
    g.lineTo(cx - waist * k, cy + waist * k);
    g.lineTo(cx - waist, cy);
    g.lineTo(cx - waist * k, cy - waist * k);
    g.closePath();
    g.fillPath();
  }

  /**
   * Wordmark: "ASTRAL ZERO" over "ORBITAL CLEANUP", left-aligned after the
   * mark. Letter-spaced caps read as a game logo rather than a document title.
   * @param {number} scaleFactor
   * @returns {void}
   */
  _drawWordmark(scaleFactor) {
    const gap = this.size * 0.78;
    const left = this.x + gap;

    this.title = this.scene.add
      .text(left, this.y - 14 * scaleFactor, 'ASTRAL ZERO', {
        ...FONTS.logo,
        fontSize: `${Math.round(FONTS.logo.fontSize * 14 * scaleFactor * 0.14)}px`,
      })
      .setOrigin(0, 0.5)
      .setDepth(this.depth + 1)
      .setScrollFactor(0);

    this.subtitle = this.scene.add
      .text(left + 2, this.y + 15 * scaleFactor, 'ORBITAL CLEANUP', {
        ...FONTS.logoSub,
        fontSize: `${Math.round(11 * scaleFactor)}px`,
      })
      .setOrigin(0, 0.5)
      .setDepth(this.depth + 1)
      .setScrollFactor(0);

    this.parts.push(this.title, this.subtitle);
  }

  /**
   * Dim the whole mark (used when the connection is not online, so the
   * branding itself communicates the state without extra text).
   * @param {number} alpha
   * @returns {void}
   */
  setAlpha(alpha) {
    this.parts.forEach((p) => p.setAlpha(alpha));
  }

  /**
   * Reposition as a unit.
   * @param {number} x
   * @param {number} y
   * @returns {void}
   */
  setPosition(x, y) {
    const dx = x - this.x;
    const dy = y - this.y;
    this.x = x;
    this.y = y;
    this.gfx.setPosition(dx, dy);
    this.title?.setPosition(this.title.x + dx, this.title.y + dy);
    this.subtitle?.setPosition(this.subtitle.x + dx, this.subtitle.y + dy);
  }

  /** @returns {void} */
  destroy() {
    this.parts.forEach((p) => p.destroy());
  }
}

export default Logo;
