/**
 * Astral Zero — PracticeSetupMenu (Bot Practice configuration overlay).
 * ============================================================
 * Shared by Home and Lobby: preset choice (Controls / Beginner / Normal /
 * Advanced), bot count stepper and calm-start (grace) cycler. Reads and
 * writes `net.state.practice` through `net.setPracticeOptions()` — the SAME
 * object both scenes' CTAs send — so Home and Lobby can never disagree.
 *
 * Everything here is a REQUEST: the server re-validates bot count,
 * difficulty, grace and passive before the room exists. Out-of-range values
 * clamp server-side; unknown tiers fall back to the mode mix.
 *
 * Hidden by default (see SettingsMenu for why: overlay widgets are plain
 * scene objects and would otherwise leak over the scene beneath).
 */

import { THEME, FONTS, SURFACES } from '../../config/uiTheme.js';
import { Panel } from '../widgets/Panel.js';
import { Button } from '../widgets/Button.js';
import {
  PRACTICE_PRESETS,
  PRACTICE_PRESET_ORDER,
  PRACTICE_GRACE_CHOICES,
  PRACTICE_BOT_MAX,
  PRACTICE_BOT_CHOICES,
} from '../../net/NetworkManager.js';

const PRESET_SHORT = Object.freeze({
  controls: 'CONTROL',
  beginner: 'BEGINNER',
  normal: 'NORMAL',
  advanced: 'ADVANCED',
});

export class PracticeSetupMenu {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {import('../../net/NetworkManager.js').NetworkManager} opts.net
   * @param {() => void} [opts.onClose]
   * @param {number} [opts.depth]
   */
  constructor(scene, { net, onClose = () => {}, depth = 420 } = {}) {
    this.scene = scene;
    this.net = net;
    this.onClose = onClose;
    this.depth = depth;
    this.visible = false;
    this._off = null;

    const w = 480;
    const h = 470;
    const x = 640 - w / 2;
    const y = 110;

    this.scrim = scene.add
      .rectangle(640, 360, 1280, 720, SURFACES.scrim, 0.72)
      .setDepth(depth - 1)
      .setScrollFactor(0)
      .setInteractive()
      .setVisible(false);

    this.panel = new Panel(scene, {
      x, y, width: w, height: h,
      title: 'PRACTICE SETUP',
      accent: THEME.panelBorderBright,
      depth,
    });
    this.panel.setVisible(false);

    const cx = 640;
    let rowY = y + 56;

    // --- Presets (2x2 toggle grid) --------------------------------------
    this.presetButtons = {};
    PRACTICE_PRESET_ORDER.forEach((id, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const btn = new Button(scene, {
        x: cx - 118 + col * 236,
        y: rowY + 26 + row * 56,
        width: 224,
        height: 48,
        label: PRESET_SHORT[id] ?? id.toUpperCase(),
        sublabel: PRACTICE_PRESETS[id].label,
        skin: 'neutral',
        fontSize: '15px',
        depth: depth + 1,
        toggle: true,
        ariaLabel: `${PRACTICE_PRESETS[id].label} — ${PRACTICE_PRESETS[id].blurb}`,
        onClick: () => this._pickPreset(id),
      });
      btn.setVisible(false);
      this.presetButtons[id] = btn;
    });
    rowY += 56 * 2 + 18;

    // --- Blurb ------------------------------------------------------------
    this.blurb = scene.add
      .text(cx, rowY, '', {
        ...FONTS.small,
        align: 'center',
        wordWrap: { width: w - 60 },
      })
      .setOrigin(0.5, 0)
      .setDepth(depth + 1)
      .setScrollFactor(0)
      .setVisible(false);
    rowY += 44;

    // --- Bot count stepper --------------------------------------------------
    this.countLabel = scene.add
      .text(cx - 150, rowY + 17, 'Bots', { ...FONTS.bodyStrong, fontSize: '15px' })
      .setOrigin(0, 0.5)
      .setDepth(depth + 1)
      .setScrollFactor(0)
      .setVisible(false);

    this.countDown = new Button(scene, {
      x: cx - 30, y: rowY + 17, width: 52, height: 40,
      label: '−', fontSize: '20px', skin: 'ghost', depth: depth + 1,
      ariaLabel: 'Fewer bots',
      onClick: () => this._stepCount(-1),
    });
    this.countValue = scene.add
      .text(cx + 32, rowY + 17, '', { ...FONTS.metricSm, fontSize: '20px' })
      .setOrigin(0.5)
      .setDepth(depth + 1)
      .setScrollFactor(0)
      .setVisible(false);
    this.countUp = new Button(scene, {
      x: cx + 94, y: rowY + 17, width: 52, height: 40,
      label: '+', fontSize: '20px', skin: 'ghost', depth: depth + 1,
      ariaLabel: 'More bots',
      onClick: () => this._stepCount(1),
    });
    this.countDown.setVisible(false);
    this.countUp.setVisible(false);
    rowY += 52;

    // --- Supported bot-count quick picks (1 / 3 / 5) ---------------------------
    // The stepper allows any custom count in range; these chips jump straight
    // to the supported choices (beginner default 1, normal 3, advanced 5).
    this.botChips = PRACTICE_BOT_CHOICES.map((n, i) => {
      const btn = new Button(scene, {
        x: cx - 76 + i * 76, y: rowY + 15, width: 68, height: 32,
        label: `${n} BOT${n === 1 ? '' : 'S'}`, fontSize: '12px', skin: 'ghost',
        depth: depth + 1, toggle: true,
        ariaLabel: `Practice against ${n} bot${n === 1 ? '' : 's'}`,
        onClick: () => this._pickCount(n),
      });
      btn.setVisible(false);
      return btn;
    });
    rowY += 42;

    // --- Calm-start (grace) cycler -------------------------------------------
    this.graceLabel = scene.add
      .text(cx - 150, rowY + 17, 'Calm start', { ...FONTS.bodyStrong, fontSize: '15px' })
      .setOrigin(0, 0.5)
      .setDepth(depth + 1)
      .setScrollFactor(0)
      .setVisible(false);
    this.graceButton = new Button(scene, {
      x: cx + 40, y: rowY + 17, width: 212, height: 40,
      label: '', fontSize: '14px', skin: 'ghost', depth: depth + 1,
      ariaLabel: 'Cycle calm-start duration',
      onClick: () => this._cycleGrace(),
    });
    this.graceButton.setVisible(false);
    rowY += 56;

    // --- Done ------------------------------------------------------------------
    this.doneButton = new Button(scene, {
      x: cx, y: y + h - 34, width: 220, height: 46,
      label: 'Done', skin: 'cta', fontSize: '16px', depth: depth + 1,
      onClick: () => this.hide(),
    });
    this.doneButton.setVisible(false);

    this._widgets = [
      ...Object.values(this.presetButtons),
      this.blurb, this.countLabel, this.countDown, this.countValue, this.countUp,
      ...this.botChips,
      this.graceLabel, this.graceButton, this.doneButton,
    ];

    this._off = this.net?.on?.('practice', () => {
      if (this.visible) this._refresh();
    });
  }

  /** @param {string} id */
  _pickPreset(id) {
    this.net?.setPracticeOptions?.({ preset: id });
    this._refresh();
  }

  /** @param {number} n */
  _pickCount(n) {
    this.net?.setPracticeOptions?.({ botCount: n });
    this._refresh();
  }

  /** @param {number} dir */
  _stepCount(dir) {
    const cur = this.net?.state?.practice?.botCount ?? 1;
    this.net?.setPracticeOptions?.({ botCount: cur + dir });
    this._refresh();
  }

  /** @returns {void} */
  _cycleGrace() {
    const cur = this.net?.state?.practice?.graceMs ?? 0;
    const i = PRACTICE_GRACE_CHOICES.indexOf(cur);
    const next = PRACTICE_GRACE_CHOICES[(i + 1) % PRACTICE_GRACE_CHOICES.length] ?? 0;
    this.net?.setPracticeOptions?.({ graceMs: next });
    this._refresh();
  }

  /** Re-render from `net.state.practice`. @returns {void} */
  _refresh() {
    const p = this.net?.state?.practice ?? { preset: 'beginner', botCount: 1, graceMs: 10000, passive: false };
    for (const [id, btn] of Object.entries(this.presetButtons)) {
      btn.setSelected(p.preset === id);
    }
    const preset = PRACTICE_PRESETS[p.preset];
    this.blurb.setText(
      preset ? preset.blurb : `Custom: ${p.botCount} bot(s), calm ${Math.round((p.graceMs || 0) / 1000)} s${p.passive ? ', passive targets' : ''}.`,
    );
    this.countValue.setText(String(p.botCount));
    this.countDown.setEnabled(p.botCount > 0);
    this.countUp.setEnabled(p.botCount < PRACTICE_BOT_MAX);
    this.botChips.forEach((btn, i) => btn.setSelected(p.botCount === PRACTICE_BOT_CHOICES[i]));
    const secs = Math.round((p.graceMs || 0) / 1000);
    this.graceButton.setLabel(p.passive ? 'Passive — bots never shoot' : secs === 0 ? 'Off — bots live at once' : `${secs} s of peace`);
  }

  /** @returns {void} */
  show() {
    this._refresh();
    this.scrim.setVisible(true);
    this.panel.setVisible(true);
    this._widgets.forEach((w) => w.setVisible?.(true));
    this.visible = true;
  }

  /** @returns {void} */
  hide() {
    this.scrim.setVisible(false);
    this.panel.setVisible(false);
    this._widgets.forEach((w) => w.setVisible?.(false));
    this.visible = false;
    this.onClose();
  }

  /** @returns {void} */
  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  /** @returns {void} */
  destroy() {
    try {
      this._off?.();
    } catch {
      /* best-effort */
    }
    this._off = null;
    this._widgets.forEach((w) => w.destroy?.());
    this.panel?.destroy?.();
    this.scrim?.destroy?.();
  }
}

export default PracticeSetupMenu;
