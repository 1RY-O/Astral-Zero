/**
 * Astral Zero — Slider widget (FRONTEND).
 * ============================================================
 * A draggable horizontal slider for 0..1 values, used by the settings menu for
 * audio volumes.
 *
 * Implemented with plain GameObjects + pointer events rather than Phaser's
 * `Slider` so the styling matches the rest of the UI (Panel/Button) and so the
 * widget can be unit-tested without a scene.
 *
 * Drag capture is explicit: a drag that leaves the slider's bounds must keep
 * tracking, otherwise the value snaps the moment your finger outruns the handle.
 */

import { THEME, FONTS } from '../../config/uiTheme.js';

export class Slider {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {number} opts.x - Left edge.
   * @param {number} opts.y - Centre Y.
   * @param {number} [opts.width]
   * @param {string} [opts.label]
   * @param {number} [opts.value] - 0..1.
   * @param {(v:number)=>void} [opts.onChange]
   * @param {number} [opts.depth]
   */
  constructor(scene, { x, y, width = 220, label = '', value = 1, onChange = () => {}, depth = 10 }) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.width = width;
    this.onChange = onChange;
    this.depth = depth;
    this.value = value;

    this.labelText = scene.add
      .text(x, y - 20, label, { ...FONTS.small })
      .setDepth(depth)
      .setScrollFactor(0);

    this.valueText = scene.add
      .text(x + width, y - 20, this._pct(value), { ...FONTS.tiny })
      .setOrigin(1, 0)
      .setDepth(depth)
      .setScrollFactor(0);

    this.track = scene.add
      .rectangle(x + width / 2, y, width, 6, 0x0a1020, 0.9)
      .setDepth(depth)
      .setScrollFactor(0);

    this.fill = scene.add
      .rectangle(x, y, 0, 6, THEME.accent)
      .setOrigin(0, 0.5)
      .setDepth(depth + 1)
      .setScrollFactor(0);

    this.handle = scene.add
      .rectangle(x, y, 12, 18, THEME.accent)
      .setOrigin(0.5)
      .setDepth(depth + 2)
      .setScrollFactor(0);

    // Generous invisible hit area: a 6px track is very hard to grab.
    this.hit = scene.add
      .rectangle(x + width / 2, y, width, 30, 0xffffff, 0)
      .setOrigin(0.5)
      .setDepth(depth + 3)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    this._dragging = false;
    this._render();

    this.hit.on('pointerdown', (pointer) => {
      this._dragging = true;
      this._setFromPointer(pointer);
    });
    // Listening on the scene, not the hit area, so the drag survives the pointer
    // leaving the slider bounds.
    scene.input.on('pointermove', (pointer) => {
      if (this._dragging) this._setFromPointer(pointer);
    });
    scene.input.on('pointerup', () => { this._dragging = false; });
  }

  /** @param {number} v @returns {string} */
  _pct(v) {
    return `${Math.round(v * 100)}%`;
  }

  /**
   * Convert a pointer position into a clamped 0..1 value.
   * @param {Phaser.Input.Pointer} pointer
   * @returns {void}
   */
  _setFromPointer(pointer) {
    const raw = (pointer.x - this.x) / this.width;
    const clamped = Math.max(0, Math.min(1, raw));
    if (clamped === this.value) return;
    this.setValue(clamped);
    this.onChange(this.value);
  }

  /**
   * Set the value without firing `onChange` (used for programmatic sync).
   * @param {number} v
   * @returns {void}
   */
  setValue(v) {
    this.value = Math.max(0, Math.min(1, Number(v) || 0));
    this._render();
  }

  /** @returns {void} */
  _render() {
    const w = this.width * this.value;
    this.fill.setSize(w, 6);
    this.handle.setX(this.x + w);
    this.valueText.setText(this._pct(this.value));
  }

  /** @returns {void} */
  destroy() {
    this.labelText.destroy();
    this.valueText.destroy();
    this.track.destroy();
    this.fill.destroy();
    this.handle.destroy();
    this.hit.destroy();
  }
}

export default Slider;
