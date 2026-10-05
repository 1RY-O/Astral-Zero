/**
 * Astral Zero — HealthBar (FRONTEND, world-space).
 * ============================================================
 * The small bar that floats above every entity's head.
 *
 * WHY DRAW IT MANUALLY INSTEAD OF USING A Phaser BAR
 * A `Phaser.GameObjects.Bar` cannot be filled with plain colour without an
 * extra texture or a geometry mask. Two rectangles per bar is cheaper, has no
 * assets, and — importantly — lets us tint the FILL by health ratio so a glance
 * at the colour tells you how hurt someone is before you even read the width.
 *
 * The bar hides entirely at full health in Bot Practice (nothing is at stake, so
 * a permanent bar over every bot is just noise), and always shows in TDM/FFA
 * where the information is load-bearing.
 */

import { HEALTH } from '../../config/netConfig.js';

/** Fill colour by health ratio: green → amber → red. */
function fillColour(ratio) {
  if (ratio > 0.6) return 0x4ade80;
  if (ratio > 0.3) return 0xffd166;
  return 0xff6b8b;
}

export class HealthBar {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} [opts]
   * @param {number} [opts.depth]
   * @param {boolean} [opts.alwaysShow]
   */
  constructor(scene, { depth = 20, alwaysShow = true } = {}) {
    this.scene = scene;
    this.depth = depth;
    this.alwaysShow = alwaysShow;
    this.ratio = 1;

    // Track sits behind the fill. Both are anchored at the bar's top-left so
    // the fill shrinks from the RIGHT edge, which is how HP is read everywhere.
    this.track = scene.add
      .rectangle(0, 0, HEALTH.barWidth, HEALTH.barHeight, 0x0a1020, 0.8)
      .setOrigin(0, 0)
      .setDepth(depth);

    this.fill = scene.add
      .rectangle(0, 0, HEALTH.barWidth, HEALTH.barHeight, fillColour(1))
      .setOrigin(0, 0)
      .setDepth(depth + 1);

    this.border = scene.add
      .rectangle(0, 0, HEALTH.barWidth, HEALTH.barHeight)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xffffff, 0.28)
      .setDepth(depth + 2);

    this._visible = true;
  }

  /**
   * Point the bar at a world position (the entity's head).
   * @param {number} x
   * @param {number} y
   * @returns {void}
   */
  follow(x, y) {
    const left = Math.round(x - HEALTH.barWidth / 2);
    const top = Math.round(y + HEALTH.barOffsetY);
    this.track.setPosition(left, top);
    this.fill.setPosition(left, top);
    this.border.setPosition(left, top);
  }

  /**
   * Update the ratio and reveal/hide as appropriate.
   * @param {number} hp
   * @param {number} maxHp
   * @param {boolean} [dead]
   * @returns {void}
   */
  setHp(hp, maxHp, dead = false) {
    const ratio = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
    this.ratio = ratio;

    this.fill.setSize(Math.max(0, HEALTH.barWidth * ratio), HEALTH.barHeight);
    this.fill.setFillStyle(fillColour(ratio));

    const shouldShow = !dead && (this.alwaysShow || ratio < 1);
    if (shouldShow !== this._visible) {
      this._visible = shouldShow;
      this.setVisible(shouldShow);
    }
  }

  /**
   * Show/hide the whole bar.
   * @param {boolean} value
   * @returns {void}
   */
  setVisible(value) {
    this._visible = value;
    this.track.setVisible(value);
    this.fill.setVisible(value);
    this.border.setVisible(value);
  }

  /** @returns {void} */
  destroy() {
    this.track.destroy();
    this.fill.destroy();
    this.border.destroy();
  }
}

export default HealthBar;