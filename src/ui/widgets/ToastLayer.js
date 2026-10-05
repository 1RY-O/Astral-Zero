/**
 * Astral Zero — ToastLayer (transient messages).
 * ===========================================================
 * A single stack of messages at the bottom of the screen, fed by
 * `net.on('notice', …)`. Used for EVERYTHING the backend says back:
 *
 *   "Party code: A7K9P2"        (success)
 *   "No party found with that…" (error)
 *   "First-match protection…"   (info)
 *
 * Keeping them in one place means error wording lives in the network layer
 * (src/net/events.js → describeError) instead of being retyped in every panel.
 *
 * Behaviour
 *  - Messages stack upward, oldest on top, max `maxVisible` kept.
 *  - Each fades in, dwells, then fades out and is destroyed.
 *  - `?fastToasts` shortens the dwell time when iterating on the UI.
 */

import { THEME, FONTS } from '../../config/uiTheme.js';

/** Colour per tone. Kept next to the tone names so they never drift. */
const TONE_STYLES = {
  info: { fill: 0x0f2540, border: 0x38e1ff, text: '#d8f4ff' },
  success: { fill: 0x0f2c1e, border: 0x4ade80, text: '#dcffe8' },
  error: { fill: 0x331522, border: 0xff6b8b, text: '#ffe0e6' },
  warning: { fill: 0x33250f, border: 0xff9f43, text: '#ffeed6' },
};

export class ToastLayer {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} [opts]
   * @param {number} [opts.x] - Centre X of the stack.
   * @param {number} [opts.y] - Bottom-anchored Y (stack grows upward).
   * @param {number} [opts.maxWidth]
   * @param {number} [opts.maxVisible]
   * @param {number} [opts.durationMs]
   * @param {number} [opts.depth]
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.cx = opts.x ?? 640;
    this.bottomY = opts.y ?? 690;
    this.maxWidth = opts.maxWidth ?? 620;
    this.maxVisible = opts.maxVisible ?? 4;
    this.durationMs = opts.durationMs ?? 3200;
    this.depth = opts.depth ?? 400;

    /** @type {Phaser.GameObjects.Container[]} Live toasts, newest last. */
    this.active = [];

    // `?fastToasts` keeps the UI iteration loop snappy.
    if (typeof window !== 'undefined' && window.location.search.includes('fastToasts')) {
      this.durationMs = 900;
    }
  }

  /**
   * Show a message.
   * @param {'info'|'success'|'error'|'warning'} tone
   * @param {string} text
   * @param {{durationMs?: number}} [opts]
   * @returns {Phaser.GameObjects.Container} The toast container.
   */
  show(tone, text, opts = {}) {
    if (!text) return null;
    const style = TONE_STYLES[tone] ?? TONE_STYLES.info;
    const scene = this.scene;

    const w = Math.min(this.maxWidth, text.length * 8 + 40);
    const h = 42;

    const g = scene.add.graphics();
    g.fillStyle(style.fill, 0.95);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    g.lineStyle(2, style.border, 0.9);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    // Colour chip on the left so tones are distinguishable without text.
    g.fillStyle(style.border, 1);
    g.fillRoundedRect(-w / 2 + 6, -h / 2 + 8, 4, h - 16, 2);

    const label = scene.add
      .text(0, 0, text, { ...FONTS.body, color: style.text, fontSize: '14px' })
      .setOrigin(0.5);

    const container = scene.add
      .container(0, 0, [g, label])
      .setScrollFactor(0)
      .setDepth(this.depth)
      .setAlpha(0);

    this.active.push(container);
    this._layout();
    this._trim();

    // Fade in → hold → fade out, then clean up.
    scene.tweens.add({
      targets: container,
      alpha: 1,
      duration: 140,
      onComplete: () => {
        scene.tweens.add({
          targets: container,
          alpha: 0,
          delay: opts.durationMs ?? this.durationMs,
          onComplete: () => this._destroy(container),
        });
      },
    });

    return container;
  }

  /**
   * Re-stack the live toasts so the newest is closest to the bottom.
   * @returns {void}
   */
  _layout() {
    let y = this.bottomY;
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const toast = this.active[i];
      const height = toast.height || 42;
      y -= height + 8;
      this.scene.tweens.add({
        targets: toast,
        x: this.cx,
        y,
        duration: 160,
        ease: 'Quad.easeOut',
      });
    }
  }

  /**
   * Drop the oldest toasts once `maxVisible` is exceeded, so a burst of errors
   * never fills the screen.
   * @returns {void}
   */
  _trim() {
    while (this.active.length > this.maxVisible) {
      this._destroy(this.active[0]);
    }
  }

  /**
   * @param {Phaser.GameObjects.Container} toast
   * @returns {void}
   */
  _destroy(toast) {
    const i = this.active.indexOf(toast);
    if (i !== -1) this.active.splice(i, 1);
    toast.destroy();
  }

  /** Remove every toast immediately (used on scene shutdown). @returns {void} */
  clear() {
    [...this.active].forEach((toast) => this._destroy(toast));
  }
}

export default ToastLayer;