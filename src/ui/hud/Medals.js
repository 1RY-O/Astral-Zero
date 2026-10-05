/**
 * Astral Zero — Medals (FRONTEND, Phase 4).
 * ============================================================
 * Big centre-top banners for "First Blood", "Killing Spree", "Rampage" and
 * friends, driven entirely by the server's `streak_event`.
 *
 * WHY THIS IS PURELY PRESENTATIONAL
 * The server owns the streak maths and the tier crossing (it knows about
 * deaths, disconnects and who has 60 s of reconnect grace). This widget never
 * counts kills and never decides a tier — it only animates text it is given.
 * That matters: a client-side streak would disagree with the server after any
 * desync and announce medals that never happened.
 *
 * SELF vs OTHER
 * Your own medal is larger, brighter and holds longer. In a busy room the only
 * two banners anyone actually reads are the ones about them.
 */

import { THEME, FONTS } from '../../config/uiTheme.js';
import { MEDALS } from '../../config/netConfig.js';

export class Medals {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} [opts]
   * @param {number} [opts.depth]
   * @param {number} [opts.x] - Horizontal centre.
   * @param {number} [opts.y] - Top of the banner stack.
   */
  constructor(scene, { depth = 210, x = 640, y = 150 } = {}) {
    this.scene = scene;
    this.depth = depth;
    this.x = x;
    this.y = y;

    /** @type {Array<{text: object, tweens: object[]}>} Live banners. */
    this._live = [];
  }

  /**
   * Show a medal banner.
   *
   * @param {string} text - Composed by the server, e.g. "Killing Spree — Name (3)".
   * @param {string} [kind] - 'first_blood' | 'streak'.
   * @param {object} [opts]
   * @param {boolean} [opts.isSelf] - Enlarge and hold if this is about you.
   * @returns {void}
   */
  show(text, kind = 'streak', { isSelf = false } = {}) {
    if (!text) return;

    const firstBlood = kind === 'first_blood';
    const size = firstBlood ? MEDALS.firstBloodPx : isSelf ? MEDALS.selfPx : MEDALS.otherPx;
    const color = firstBlood ? MEDALS.firstBloodColor : isSelf ? THEME.warning : THEME.textDim;
    const hold = firstBlood ? MEDALS.firstBloodHoldMs : isSelf ? MEDALS.selfHoldMs : MEDALS.otherHoldMs;

    // Each banner gets its own slot so a rapid burst of medals stacks instead
    // of overlapping into an unreadable pile.
    const slot = this._live.length % MEDALS.maxVisible;
    const y = this.y + slot * MEDALS.slotHeight;

    const label = this.scene.add
      .text(this.x, y, text, {
        ...FONTS.h3,
        fontSize: `${size}px`,
        fontStyle: '700',
        color,
        stroke: '#0a1020',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(this.depth)
      .setScrollFactor(0)
      .setAlpha(0)
      .setScale(0.6);

    // Punch in, hold, then fade up and out. `Back.easeOut` overshoots slightly,
    // which is what makes it read as an event rather than a label.
    const enter = this.scene.tweens.add({
      targets: label,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: MEDALS.enterMs,
      ease: 'Back.easeOut',
    });

    const exit = this.scene.tweens.add({
      targets: label,
      alpha: 0,
      y: y - MEDALS.risePx,
      delay: hold,
      duration: MEDALS.exitMs,
      ease: 'Quad.easeIn',
      onComplete: () => label.destroy(),
    });

    this._live.push({ text: label, tweens: [enter, exit] });
  }

  /**
   * Clear every live banner. Used on match teardown so banners cannot survive
   * into the next match.
   * @returns {void}
   */
  clear() {
    this._live.forEach(({ text, tweens }) => {
      tweens.forEach((tw) => tw.stop());
      text.destroy();
    });
    this._live = [];
  }

  /** @returns {void} */
  destroy() {
    this.clear();
  }
}

export default Medals;
