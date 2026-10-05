/**
 * Astral Zero — reusable gameplay feedback (FRONTEND).
 * =========================================================
 * One component for the transient, celebratory readouts the brief asks for:
 * scale pulses, number popups, UI pulses and short banners.
 *
 * ONLY REAL EVENTS GET FEEDBACK (explicit requirement)
 * `Feedback.CUES` is the complete list, and every one of them corresponds to
 * something the backend actually reports. There is no "MISSION COMPLETE"
 * cue wired to a timer, no "ABILITY READY" when the game has no abilities.
 * The list is:
 *
 *   debrisCleared  → a server-confirmed kill (entity_death, not a local guess)
 *   damageTaken    → a server health delta > 0
 *   scoreGain      → a server score update
 *   combo          → a server streak
 *   objectiveDone  → the mode's real bank target is reached
 *   matchDone      → match_end
 *
 * If a future phase adds abilities, its cue is added HERE with a real trigger
 * — the component has no mechanism for showing something that did not happen.
 *
 * REDUCED MOTION
 * Every animation routes through `core/Motion`, so a player who asked for
 * reduced motion gets the same INFORMATION with no movement: the banner still
 * appears and still expires, it simply does not slide or pulse.
 *
 * PERFORMANCE
 * Popups are POOLED (see FxPool) and banners are reused, so a 10-player
 * scrap battle cannot allocate a Text object per event.
 */

import { THEME, FONTS } from '../../config/uiTheme.js';
import * as Motion from '../../core/Motion.js';

/** The complete, honest set of cues. */
export const CUES = Object.freeze({
  debrisCleared: { text: 'DEBRIS CLEARED', color: THEME.success, tone: 'success' },
  damageTaken: { text: 'DAMAGE TAKEN', color: THEME.danger, tone: 'error' },
  scoreGain: { text: 'SCORE', color: THEME.accent, tone: 'info' },
  combo: { text: 'COMBO', color: THEME.amber, tone: 'info' },
  objectiveDone: { text: 'OBJECTIVE COMPLETE', color: THEME.amber, tone: 'success' },
  matchDone: { text: 'MISSION COMPLETE', color: THEME.violet, tone: 'success' },
});

export class Feedback {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} [opts]
   * @param {number} [opts.x] - Banner centre X.
   * @param {number} [opts.y] - Banner centre Y.
   * @param {number} [opts.depth]
   * @param {number} [opts.holdMs] - How long a banner stays fully visible.
   */
  constructor(scene, { x = 640, y = 190, depth = 205, holdMs = 1100 } = {}) {
    this.scene = scene;
    this.cx = x;
    this.cy = y;
    this.depth = depth;
    this.holdMs = holdMs;

    // One banner, reused. A new Text per event would churn the display list
    // during a busy firefight.
    this.banner = scene.add
      .text(x, y, '', { ...FONTS.h3, fontSize: '22px', fontStyle: '900', align: 'center' })
      .setOrigin(0.5)
      .setDepth(depth)
      .setScrollFactor(0)
      .setAlpha(0);

    this._hideTimer = null;
  }

  /**
   * Fire a cue. Unknown cues are ignored rather than rendered as a blank, so a
   * typo fails visibly in the console instead of silently confusing players.
   *
   * @param {keyof typeof CUES} cue
   * @param {{text?: string, sub?: string, color?: string}} [opts]
   * @returns {boolean} Whether the cue was recognised.
   */
  show(cue, opts = {}) {
    const spec = CUES[cue];
    if (!spec) {
      console.warn(`[Feedback] unknown cue "${cue}" — no effect invented.`);
      return false;
    }

    const label = opts.text ?? spec.text;
    this.banner.setText(opts.sub ? `${label}\n${opts.sub}` : label);
    this.banner.setColor(opts.color ?? spec.color);
    this.banner.setAlpha(0);

    // Under reduced motion the banner simply appears and holds.
    if (Motion.isReduced()) {
      this.banner.setAlpha(1);
    } else {
      Motion.tween(this.scene, {
        targets: this.banner,
        alpha: 1,
        scaleX: { from: 0.85, to: 1 },
        scaleY: { from: 0.85, to: 1 },
        duration: 180,
        ease: 'Back.easeOut',
      });
    }

    this._hideTimer?.remove(false);
    this._hideTimer = this.scene.time.delayedCall(this.holdMs, () => this._fade());
    return true;
  }

  /** @returns {void} */
  _fade() {
    Motion.tween(this.scene, {
      targets: this.banner,
      alpha: 0,
      duration: 260,
    });
  }

  /**
   * Pulse an arbitrary object (a health bar, a score, a panel) — the brief's
   * "UI pulses". Respects reduced motion by simply setting the final state.
   *
   * @param {Phaser.GameObjects.GameObject} target
   * @param {number} [amount] - Scale peak.
   * @returns {void}
   */
  pulse(target, amount = 1.12) {
    if (!target) return;
    if (Motion.isReduced()) return;
    target.setScale(amount);
    Motion.tween(this.scene, {
      targets: target,
      scaleX: 1,
      scaleY: 1,
      duration: 220,
      ease: 'Back.easeOut',
    });
  }

  /**
   * Hide immediately (e.g. on scene shutdown).
   * @returns {void}
   */
  clear() {
    this._hideTimer?.remove(false);
    this._hideTimer = null;
    this.banner.setAlpha(0);
  }

  /** @returns {void} */
  destroy() {
    this._hideTimer?.remove(false);
    this.banner.destroy();
  }
}

export default Feedback;
