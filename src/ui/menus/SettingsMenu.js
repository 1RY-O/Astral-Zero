/**
 * Astral Zero — SettingsMenu (FRONTEND, Phase 5).
 * ============================================================
 * A pause-menu settings panel: audio volumes, feedback toggles and a reset.
 *
 * EVERY CONTROL WRITES THROUGH `settings`
 * The Settings singleton persists to localStorage, so closing the menu — or the
 * browser — loses nothing. The audio sliders additionally push into the live
 * AudioManager via `applySettings()`: a slider that persisted but did not
 * change the mix would look broken until the next page load, which is exactly
 * what players report as "the settings don't work".
 *
 * SCREEN SHAKE IS A REAL ACCESSIBILITY TOGGLE
 * Camera shake is a comfort option, not a cosmetic extra, so it is first-class
 * and takes effect immediately (ArenaScene checks it at the point it shakes).
 */

import { THEME, FONTS } from '../../config/uiTheme.js';
import { Slider } from '../widgets/Slider.js';
import { Button } from '../widgets/Button.js';
import { settings } from '../../core/Settings.js';

export class SettingsMenu {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {() => void} [opts.onClose]
   * @param {import('../../audio/AudioManager.js').AudioManager} [opts.audio]
   * @param {number} [opts.depth]
   */
  constructor(scene, { onClose = () => {}, audio = null, depth = 320 } = {}) {
    this.scene = scene;
    this.onClose = onClose;
    this.audio = audio;
    this.depth = depth;
    this.visible = false;

    this.root = scene.add.container(0, 0).setDepth(depth).setScrollFactor(0).setVisible(false);

    const { width, height } = scene.scale;
    this.root.add(
      scene.add.rectangle(width / 2, height / 2, width, height, 0x03060d, 0.9).setScrollFactor(0),
    );
    this.root.add(
      scene.add
        .text(width / 2, 64, 'SETTINGS', { ...FONTS.title, fontSize: '32px' })
        .setOrigin(0.5)
        .setScrollFactor(0),
    );

    const left = width / 2 - 210;
    const right = width / 2 + 40;

    // --- Audio -------------------------------------------------------------
    this.root.add(
      scene.add.text(left, 132, 'AUDIO', { ...FONTS.tiny, color: THEME.accent }).setScrollFactor(0),
    );

    this.masterSlider = new Slider(scene, {
      x: left, y: 182, label: 'Master volume',
      value: settings.get('masterVolume'),
      onChange: (v) => { settings.set('masterVolume', v); this.audio?.applySettings(); },
      depth: depth + 1,
    });
    this.sfxSlider = new Slider(scene, {
      x: left, y: 234, label: 'Effects volume',
      value: settings.get('sfxVolume'),
      onChange: (v) => { settings.set('sfxVolume', v); this.audio?.applySettings(); },
      depth: depth + 1,
    });
    this.uiSlider = new Slider(scene, {
      x: left, y: 286, label: 'Interface volume',
      value: settings.get('uiVolume'),
      onChange: (v) => { settings.set('uiVolume', v); this.audio?.applySettings(); },
      depth: depth + 1,
    });

    // --- Feedback ----------------------------------------------------------
    this.root.add(
      scene.add.text(right, 132, 'FEEDBACK', { ...FONTS.tiny, color: THEME.accent }).setScrollFactor(0),
    );

    this.toggles = [
      this._toggle(scene, right, 182, 'Screen shake', 'screenShake'),
      this._toggle(scene, right, 234, 'Damage numbers', 'damageNumbers'),
      this._toggle(scene, right, 286, 'Hit markers', 'hitMarkers'),
      this._toggle(scene, right, 338, 'Show FPS', 'showFps'),
    ];

    // --- Footer ------------------------------------------------------------
    this.resetButton = new Button(scene, {
      x: width / 2 - 130, y: height - 74, width: 200, height: 42,
      label: 'Reset to defaults', skin: 'ghost', fontSize: '13px', depth: depth + 1,
      onClick: () => this._reset(),
    });
    this.closeButton = new Button(scene, {
      x: width / 2 + 130, y: height - 74, width: 200, height: 42,
      label: 'Back', depth: depth + 1,
      onClick: () => { this.hide(); this.onClose(); },
    });

    this._widgets = [
      this.masterSlider, this.sfxSlider, this.uiSlider,
      ...this.toggles, this.resetButton, this.closeButton,
    ];
  }

  /**
   * Build a two-state toggle button backed by a settings key.
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {string} label
   * @param {string} key
   * @returns {Button}
   */
  _toggle(scene, x, y, label, key) {
    const btn = new Button(scene, {
      x: x + 100, y, width: 200, height: 34,
      label: `${label}: ${settings.get(key) ? 'ON' : 'OFF'}`,
      skin: 'ghost', fontSize: '12px', depth: this.depth + 1,
      onClick: () => {
        const next = !settings.get(key);
        settings.set(key, next);
        btn.setLabel(`${label}: ${next ? 'ON' : 'OFF'}`);
        this.audio?.play('uiClick', { bus: 'ui' });
      },
    });
    return btn;
  }

  /** Restore defaults and re-sync every control. @returns {void} */
  _reset() {
    settings.reset();
    this.audio?.applySettings();
    this._syncFromSettings();
    this._syncToggleLabels();
    this.audio?.play('uiClick', { bus: 'ui' });
  }

  /** Push current settings into the visible sliders. @returns {void} */
  _syncFromSettings() {
    this.masterSlider.setValue(settings.get('masterVolume'));
    this.sfxSlider.setValue(settings.get('sfxVolume'));
    this.uiSlider.setValue(settings.get('uiVolume'));
  }

  /** Re-label the toggles after a reset. @returns {void} */
  _syncToggleLabels() {
    const labels = ['Screen shake', 'Damage numbers', 'Hit markers', 'Show FPS'];
    const keys = ['screenShake', 'damageNumbers', 'hitMarkers', 'showFps'];
    this.toggles.forEach((btn, i) => {
      btn.setLabel(`${labels[i]}: ${settings.get(keys[i]) ? 'ON' : 'OFF'}`);
    });
  }

  /** Open the menu. @returns {void} */
  show() {
    this._syncFromSettings();
    this._syncToggleLabels();
    this.root.setVisible(true);
    this._widgets.forEach((w) => w.setVisible?.(true));
    this.visible = true;
  }

  /** @returns {void} */
  hide() {
    this.root.setVisible(false);
    this._widgets.forEach((w) => w.setVisible?.(false));
    this.visible = false;
  }

  /** @returns {void} */
  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  /** @returns {void} */
  destroy() {
    this._widgets.forEach((w) => w.destroy?.());
    this.root.destroy();
  }
}

export default SettingsMenu;
