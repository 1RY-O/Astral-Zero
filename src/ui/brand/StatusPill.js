/**
 * Astral Zero — connection status pill (FRONTEND).
 * ===========================================================
 * The honest connection indicator. Everything it shows comes from
 * `resolveConnection(net.state)`, which reads the real socket status — so it
 * can say ONLINE only when the transport is genuinely up.
 *
 * NON-COLOUR-ONLY STATUS (accessibility requirement)
 * The state is conveyed FOUR ways, so it survives greyscale and colourblind
 * vision:
 *   1. the word itself  (ONLINE / OFFLINE / CONNECTING / RECONNECTING)
 *   2. a distinct GLYPH per state (● ▲ ✕ ↻) — shape, not just hue
 *   3. border weight     (offline = thick red ring, online = thin green)
 *   4. a live hint line  ("ready for launch" / "no link to the relay")
 *
 * It also PULSES while connecting or reconnecting, which is motion the user
 * can perceive without colour at all.
 */

import { THEME, FONTS, RADII } from '../../config/uiTheme.js';
import * as Motion from '../../core/Motion.js';
import { resolveConnection } from './ConnectionState.js';
import { CONNECTION_STATES } from '../../config/uiTheme.js';

/** A shape per state, so status is never colour-only. */
const GLYPHS = Object.freeze({
  ONLINE: '●',
  CONNECTING: '▲',
  RECONNECTING: '↻',
  OFFLINE: '✕',
  'OUTDATED SERVER': '!',
});

export class StatusPill {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {number} opts.x - Centre X.
   * @param {number} opts.y - Centre Y.
   * @param {import('../../net/NetworkManager.js').NetworkManager} opts.net
   * @param {number} [opts.depth]
   * @param {boolean} [opts.showHint] - Render the secondary hint line.
   */
  constructor(scene, { x, y, net, depth = 20, showHint = true }) {
    this.scene = scene;
    this.net = net;
    this.cx = x;
    this.cy = y;
    this.depth = depth;
    this.showHint = showHint;
    this._pulse = null;

    this.bg = scene.add.graphics().setDepth(depth).setScrollFactor(0);

    this.glyph = scene.add
      .text(x - 78, y, '', { ...FONTS.bodyStrong, fontSize: '14px' })
      .setOrigin(0.5)
      .setDepth(depth + 1)
      .setScrollFactor(0);

    this.label = scene.add
      .text(x + 4, y, '', { ...FONTS.bodyStrong, fontSize: '14px' })
      .setOrigin(0.5)
      .setDepth(depth + 1)
      .setScrollFactor(0);

    this.hint = scene.add
      .text(x, y + 22, '', { ...FONTS.tiny, fontSize: '11px' })
      .setOrigin(0.5, 0)
      .setDepth(depth + 1)
      .setScrollFactor(0)
      .setVisible(showHint);

    this.refresh();
  }

  /**
   * Repaint from the live network state.
   * @returns {void}
   */
  refresh() {
    const info = resolveConnection(this.net.state, CONNECTION_STATES);
    const w = 168;
    const h = 30;
    const left = this.cx - w / 2;
    const top = this.cy - h / 2;

    const g = this.bg;
    g.clear();

    // Body. Darker + a thick ring when offline, so the failure is loud.
    g.fillStyle(THEME.panelSunken, 0.94);
    g.fillRoundedRect(left, top, w, h, h / 2);
    g.lineStyle(info.online ? 2 : 3, info.color, 0.95);
    g.strokeRoundedRect(left, top, w, h, h / 2);

    // Soft halo so the pill glows like a light source on the dark header.
    g.fillStyle(info.color, 0.12);
    g.fillRoundedRect(left - 2, top - 2, w + 4, h + 4, (h + 4) / 2);

    this.glyph.setText(GLYPHS[info.label] ?? '●').setColor(info.text);
    this.label.setText(info.label).setColor(info.text);
    this.hint.setText(this.showHint ? info.hint : '').setColor(THEME.textFaint);

    this._setPulsing(!info.online && info.label !== 'OFFLINE');
  }

  /**
   * Pulse while a connection is being (re)established. The pulse is a gentle
   * alpha oscillation on the whole pill; it stops on OFFLINE, because
   * "pulsing" implies something is in progress and nothing is.
   * @param {boolean} on
   * @returns {void}
   */
  _setPulsing(on) {
    if (on && !this._pulse && !Motion.isReduced()) {
      this._pulse = Motion.tween(this.scene, {
        targets: [this.bg, this.glyph, this.label],
        alpha: { from: 1, to: 0.55 },
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else if (!on && this._pulse) {
      this._pulse.stop();
      this._pulse = null;
      [this.bg, this.glyph, this.label].forEach((o) => o.setAlpha(1));
    }
  }

  /**
   * Move the pill (used by the responsive layout).
   * @param {number} x
   * @param {number} y
   * @returns {void}
   */
  setPosition(x, y) {
    const dx = x - this.cx;
    const dy = y - this.cy;
    this.cx = x;
    this.cy = y;
    [this.bg, this.glyph, this.label, this.hint].forEach((o) =>
      o.setPosition(o.x + dx, o.y + dy),
    );
    this.refresh();
  }

  /** @param {boolean} visible */
  setVisible(visible) {
    [this.bg, this.glyph, this.label, this.hint].forEach((o) => o.setVisible(visible));
  }

  /** @returns {void} */
  destroy() {
    this._pulse?.stop();
    this.bg.destroy();
    this.glyph.destroy();
    this.label.destroy();
    this.hint.destroy();
  }
}

export default StatusPill;
