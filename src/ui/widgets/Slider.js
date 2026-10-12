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

import { THEME, FONTS, SURFACES, PALETTE } from '../../config/uiTheme.js';

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
      .rectangle(x + width / 2, y, width, 6, SURFACES.trackBg, 0.9)
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
      .rectangle(x + width / 2, y, width, 30, PALETTE.white, 0)
      .setOrigin(0.5)
      .setDepth(depth + 3)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    this._dragging = false;
    this.visible = true;
    this._render();

    // Named handlers so destroy() can detach them. The scene-level listeners
    // are what let a drag survive the pointer leaving the slider bounds — but
    // they MUST be removed on teardown, or every settings open/close (and every
    // lobby revisit) leaks two input listeners per slider.
    this._onPointerDown = (pointer) => {
      this._dragging = true;
      this._setFromPointer(pointer);
    };
    this._onPointerMove = (pointer) => {
      if (this._dragging) this._setFromPointer(pointer);
    };
    this._onPointerUp = () => { this._dragging = false; };

    this.hit.on('pointerdown', this._onPointerDown);
    scene.input.on('pointermove', this._onPointerMove);
    scene.input.on('pointerup', this._onPointerUp);
  }

  /**
   * Show/hide the whole slider. A hidden slider also drops its hit-testing, so
   * it can neither intercept a click meant for a panel behind it nor be dragged
   * while "closed" — a settings panel that is closed must be genuinely inert.
   * @param {boolean} visible
   * @returns {Slider} this
   */
  setVisible(visible) {
    const v = Boolean(visible);
    this.labelText?.setVisible?.(v);
    this.valueText?.setVisible?.(v);
    this.track?.setVisible?.(v);
    this.fill?.setVisible?.(v);
    this.handle?.setVisible?.(v);
    this.hit?.setVisible?.(v);
    if (v) this.hit?.setInteractive?.({ useHandCursor: true });
    else {
      this._dragging = false;
      this.hit?.disableInteractive?.();
    }
    this.visible = v;
    return this;
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
    // Detach the scene-level drag listeners first — they outlive the widget's
    // own objects and would otherwise keep firing on a destroyed slider.
    this.scene.input?.off('pointermove', this._onPointerMove);
    this.scene.input?.off('pointerup', this._onPointerUp);
    this.labelText.destroy();
    this.valueText.destroy();
    this.track.destroy();
    this.fill.destroy();
    this.handle.destroy();
    this.hit.destroy();
  }
}

export default Slider;
