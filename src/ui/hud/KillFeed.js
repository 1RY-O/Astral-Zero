/**
 * Astral Zero — KillFeed (FRONTEND).
 * ============================================================
 * The scrolling "X killed Y" list in the top-right of the HUD.
 *
 * Rows are FIXED-SLOT rather than freely positioned: the feed is a queue, so
 * keeping a stable slot per entry means the whole column never reflows, and an
 * expiring row never makes the rows below it jump.
 *
 * Rows mentioning YOU are tinted and bolded, because in a busy fight the only
 * two lines that matter are the ones where you were involved.
 */

import { THEME, FONTS } from '../../config/uiTheme.js';
import { MATCH_UI } from '../../config/netConfig.js';

export class KillFeed {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} [opts]
   * @param {number} [opts.depth]
   * @param {number} [opts.x] - Left edge of the column.
   * @param {number} [opts.y] - Top edge of the column.
   * @param {number} [opts.width]
   * @param {number} [opts.rowHeight]
   */
  constructor(scene, { depth = 190, x = 940, y = 96, width = 320, rowHeight = 26 } = {}) {
    this.scene = scene;
    this.depth = depth;
    this.x = x;
    this.y = y;
    this.width = width;
    this.rowHeight = rowHeight;

    /** @type {Array<{text: Phaser.GameObjects.Text, expiresAt: number}>} */
    this._rows = [];
  }

  /**
   * Push a new entry onto the feed.
   *
   * @param {object} entry
   * @param {string} entry.killerName
   * @param {string} entry.victimName
   * @param {string} [entry.weaponId]
   * @param {boolean} [entry.headshot]
   * @param {boolean} [entry.isSelfKill]
   * @param {boolean} [entry.isSelfDeath]
   * @returns {void}
   */
  push({ killerName, victimName, weaponId = 'mop', headshot = false, isSelfKill = false, isSelfDeath = false }) {
    const involvesSelf = isSelfKill || isSelfDeath;

    const text = this.scene.add
      .text(this.x, this.y, `${killerName}  ›  ${victimName}`, {
        ...FONTS.small,
        fontSize: involvesSelf ? '14px' : '12px',
        fontStyle: involvesSelf ? '700' : '400',
        color: isSelfDeath ? THEME.danger : isSelfKill ? THEME.warning : THEME.textDim,
      })
      .setOrigin(0, 0)
      .setDepth(this.depth)
      .setScrollFactor(0)
      .setAlpha(0);

    // A translucent plate behind self-involved rows keeps them legible over a
    // bright platform without boxing in every row.
    if (involvesSelf) {
      this.scene.add
        .rectangle(this.x - 6, text.y + 2, this.width, this.rowHeight - 4, THEME.panel, 0.55)
        .setOrigin(0, 0)
        .setDepth(this.depth - 1)
        .setScrollFactor(0);
    }

    this.scene.tweens.add({ targets: text, alpha: 1, duration: 140 });

    this._rows.push({ text, expiresAt: this.scene.time.now + MATCH_UI.killFeedRowMs });

    // Trim to the cap so a burst of kills cannot flood the screen.
    while (this._rows.length > MATCH_UI.killFeedRows) this._removeAt(0);
    this._relayout();
  }

  /**
   * Re-stack rows after an add or a removal.
   * @returns {void}
   */
  _relayout() {
    this._rows.forEach((row, i) => {
      this.scene.tweens.add({
        targets: row.text,
        y: this.y + i * this.rowHeight,
        duration: 140,
        ease: 'Quad.easeOut',
      });
    });
  }

  /**
   * Fade and destroy one row (and its plate, if any).
   * @param {number} index
   * @returns {void}
   */
  _removeAt(index) {
    const row = this._rows[index];
    if (!row) return;
    this._rows.splice(index, 1);
    this.scene.tweens.add({
      targets: row.text,
      alpha: 0,
      duration: 160,
      onComplete: () => row.text.destroy(),
    });
  }

  /**
   * Expire old rows. Call once per frame.
   * @returns {void}
   */
  update() {
    const now = this.scene.time.now;
    let changed = false;
    while (this._rows.length && now >= this._rows[0].expiresAt) {
      this._removeAt(0);
      changed = true;
    }
    if (changed) this._relayout();
  }

  /** @returns {void} */
  clear() {
    this._rows.forEach((row) => row.text.destroy());
    this._rows = [];
  }

  /** @returns {void} */
  destroy() {
    this.clear();
  }
}

export default KillFeed;