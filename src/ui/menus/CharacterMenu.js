/**
 * Astral Zero — CharacterMenu (character + loadout selection overlay).
 * ============================================================
 * S14.1/.2/.7. The roster shown here is the SAME shared module the server
 * validates against (`src/shared/characters.js`), so the screen cannot offer
 * a character that does not exist, and a LOCKED character is drawn locked —
 * the unlock set comes from the server-pushed profile, never from local
 * guesses. Selecting sends `character_set` through `net.setCharacter()` and
 * the menu only commits on the server's confirmation echo; a rejection
 * (LOCKED / BAD_CHARACTER / offline) is shown as an error line and the
 * previous selection is kept.
 *
 * WHAT IS *NOT* SHOWN AS PLAYABLE
 * Nothing. Every entry on this screen is fully implemented server-side
 * (stats, weapon, skill and ability are applied by the simulation, not
 * painted by the client) — the roster file and the validator share one source.
 *
 * Hidden by default (same overlay rules as PracticeSetupMenu).
 */

import { THEME, FONTS, SURFACES } from '../../config/uiTheme.js';
import { Panel } from '../widgets/Panel.js';
import { Button } from '../widgets/Button.js';
import { WEAPONS } from '../../config/weapons.js';
import {
  CHARACTERS, CHARACTER_IDS, CHARACTER_TIERS, STARTER_CHARACTER,
} from '../../shared/characters.js';
import { variantsFor } from '../../shared/loadouts.js';

const PANEL = Object.freeze({ x: 150, y: 80, w: 980, h: 560 });

export class CharacterMenu {
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
    this._offs = [];
    /** Pending (unconfirmed) selection — committed only by the server echo. */
    this.pending = { character: null, variant: null };

    this.scrim = scene.add
      .rectangle(640, 360, 1280, 720, SURFACES.scrim, 0.72)
      .setDepth(depth - 1)
      .setScrollFactor(0)
      .setInteractive()
      .setVisible(false);

    this.panel = new Panel(scene, {
      x: PANEL.x, y: PANEL.y, width: PANEL.w, height: PANEL.h,
      title: 'SELECT YOUR JANITOR',
      accent: THEME.panelBorderBright,
      depth,
    });
    this.panel.setVisible(false);

    // --- Left column: the roster ------------------------------------------
    this.rosterButtons = {};
    const colCx = PANEL.x + 150;
    CHARACTER_IDS.forEach((id, i) => {
      const c = CHARACTERS[id];
      const tier = CHARACTER_TIERS[c.tier];
      const btn = new Button(scene, {
        x: colCx,
        y: PANEL.y + 78 + i * 82,
        width: 252,
        height: 72,
        label: c.name,
        sublabel: `${tier?.band ?? '?'} · ${c.role ?? ''}`,
        skin: 'neutral',
        fontSize: '17px',
        depth: depth + 1,
        toggle: true,
        ariaLabel: `${c.name}, tier ${tier?.band ?? '?'} — ${c.role ?? ''}`,
        onClick: () => this._pick(id),
      });
      btn.setVisible(false);
      this.rosterButtons[id] = btn;
    });

    // --- Right column: the honest stat sheet --------------------------------
    const dx = PANEL.x + 306;
    const dw = PANEL.w - 306 - 28;
    const mkText = (dy, style) => scene.add
      .text(dx, PANEL.y + dy, '', { ...style, wordWrap: { width: dw } })
      .setOrigin(0, 0)
      .setDepth(depth + 1)
      .setScrollFactor(0)
      .setVisible(false);

    this.nameLine = mkText(64, { ...FONTS.h3, fontSize: '21px' });
    this.statsLine = mkText(98, { ...FONTS.code, fontSize: '13px', color: THEME.accent });
    this.weaponLine = mkText(124, { ...FONTS.small, fontSize: '13px' });
    this.skillLine = mkText(154, { ...FONTS.small, fontSize: '13px', color: THEME.textDim });
    this.abilityLine = mkText(212, { ...FONTS.small, fontSize: '13px', color: THEME.textDim });
    this.loreLine = mkText(276, { ...FONTS.tiny, fontSize: '12px', color: THEME.textFaint });
    this.tradeLine = mkText(322, { ...FONTS.tiny, fontSize: '12px', color: THEME.textFaint });

    // --- Variant chips (per selected character) ------------------------------
    this.variantLabel = mkText(392, { ...FONTS.tiny, fontSize: '11px', color: THEME.textFaint });
    this.variantLabel.setText('LOADOUT VARIANT');
    this.variantButtons = []; // rebuilt per character in _refresh()

    // --- Status + actions ----------------------------------------------------
    this.statusText = scene.add
      .text(PANEL.x + 28, PANEL.y + PANEL.h - 30, '', { ...FONTS.small, fontSize: '12px' })
      .setOrigin(0, 0.5)
      .setDepth(depth + 1)
      .setScrollFactor(0)
      .setVisible(false);

    this.closeButton = new Button(scene, {
      x: PANEL.x + PANEL.w - 70,
      y: PANEL.y + PANEL.h - 32,
      width: 108,
      height: 42,
      label: 'Close',
      skin: 'ghost',
      fontSize: '14px',
      depth: depth + 1,
      onClick: () => this.hide(),
    });
    this.closeButton.setVisible(false);

    this.confirmButton = new Button(scene, {
      x: PANEL.x + PANEL.w - 190,
      y: PANEL.y + PANEL.h - 32,
      width: 160,
      height: 42,
      label: 'CONFIRM',
      skin: 'cta',
      fontSize: '15px',
      depth: depth + 1,
      ariaLabel: 'Confirm character and loadout selection',
      onClick: () => this._confirm(),
    });
    this.confirmButton.setVisible(false);

    this._widgets = [
      ...Object.values(this.rosterButtons),
      this.nameLine, this.statsLine, this.weaponLine, this.skillLine,
      this.abilityLine, this.loreLine, this.tradeLine,
      this.variantLabel, this.statusText, this.closeButton, this.confirmButton,
    ];

    // Server truth only: the profile tells us unlocks, the character echo
    // tells us what is actually active right now.
    this._offs.push(this.net?.on?.('profile', () => this.visible && this._refresh()) ?? (() => {}));
    this._offs.push(this.net?.on?.('character', () => this.visible && this._refresh()) ?? (() => {}));
    this._offs.push(this.net?.on?.('busy', () => this.visible && this._refresh()) ?? (() => {}));
    this._offNotice = this.net?.on?.('notice', (n) => {
      if (this.visible && n?.tone === 'error') this._setError(n.text);
    }) ?? null;
  }

  // =========================================================================
  // State helpers
  // =========================================================================

  /** Is `id` unlocked per the SERVER-pushed profile? Unknown profile → false. */
  _isUnlocked(id) {
    if (id === STARTER_CHARACTER) return true;
    const unlocks = this.net?.state?.profile?.unlockedCharacters;
    return Array.isArray(unlocks) && unlocks.includes(id);
  }

  /** @returns {string|null} the server-confirmed active character id. */
  _active() {
    return this.net?.state?.character?.character
      ?? this.net?.state?.profile?.character
      ?? null;
  }

  _setError(text) {
    this._error = text || null;
    this._paintStatus();
  }

  _pick(id) {
    if (!this._isUnlocked(id)) {
      this._setError('LOCKED — that janitor has not been unlocked yet.');
      return;
    }
    this._error = null;
    // A character switch resets the variant: an old character's variant must
    // never carry across (the server refuses exactly that).
    const stored = this.net?.state?.profile?.loadouts?.[id] || null;
    this.pending = { character: id, variant: stored || variantsFor(id)[0] || null };
    this._refresh();
  }

  async _confirm() {
    const { character, variant } = this.pending;
    if (!character) return;
    const res = await this.net?.setCharacter?.(character, variant);
    if (res?.ok) {
      this._error = null;
      this._confirmed = character;
    } else if (res && res.ok === false && res.error !== 'BUSY') {
      this._setError(`SELECTION REJECTED — ${res.error}`);
    }
    this._refresh();
  }


  // =========================================================================
  // Rendering
  // =========================================================================

  /** Rebuild the variant chips for the PENDING character. */
  _rebuildVariants() {
    for (const b of this.variantButtons) {
      b.destroy();
      this._widgets.splice(this._widgets.indexOf(b), 1);
    }
    this.variantButtons = [];
    this.variantIds = [];
    const id = this.pending.character;
    if (!id) return;
    variantsFor(id).forEach((vid, i) => {
      const btn = new Button(this.scene, {
        x: PANEL.x + 306 + 90 + i * 190,
        y: PANEL.y + 424,
        width: 176,
        height: 36,
        label: vid.toUpperCase(),
        skin: 'ghost',
        fontSize: '12px',
        depth: this.depth + 1,
        toggle: true,
        ariaLabel: `Loadout variant ${vid}`,
        onClick: () => {
          this.pending.variant = vid;
          this._refresh();
        },
      });
      btn.setVisible(this.visible);
      this.variantButtons.push(btn);
      this.variantIds.push(vid);
      this._widgets.push(btn);
    });
  }

  /** Status line — the ONE place the menu admits what it does not know. */
  _paintStatus() {
    if (this._error) {
      this.statusText.setText(this._error).setColor(THEME.danger);
      return;
    }
    if (!this.net?.state?.profile) {
      this.statusText.setText('SYNCING PROFILE — selections unlock once the server answers.').setColor(THEME.warning);
      return;
    }
    if (this.net.state.busy === 'setCharacter') {
      this.statusText.setText('SAVING…').setColor(THEME.accent);
      return;
    }
    const active = this._active();
    if (this.pending.character && this.pending.character === active) {
      this.statusText.setText(`CONFIRMED — ${CHARACTERS[active]?.name ?? active} deploys in your next match.`).setColor(THEME.success);
      return;
    }
    this.statusText.setText('Selection applies to your NEXT match — confirm to save.').setColor(THEME.textDim);
  }

  /** Re-render everything from server state + the pending selection. */
  _refresh() {
    const profile = this.net?.state?.profile ?? null;
    if (!this.pending.character) {
      this.pending.character = this._active() || STARTER_CHARACTER;
      this.pending.variant = profile?.loadouts?.[this.pending.character]
        || variantsFor(this.pending.character)[0] || null;
    }

    for (const [id, btn] of Object.entries(this.rosterButtons)) {
      const unlocked = this._isUnlocked(id);
      const tier = CHARACTER_TIERS[CHARACTERS[id].tier];
      btn.setEnabled(unlocked);
      btn.setSelected(this.pending.character === id);
      btn.setSublabel(unlocked ? `${tier?.band ?? '?'} · ${CHARACTERS[id].role ?? ''}` : 'LOCKED');
    }
    this._rebuildVariants();
    this.variantButtons.forEach((b, i) => b.setSelected(this.variantIds[i] === this.pending.variant));

    const c = CHARACTERS[this.pending.character] || CHARACTERS[STARTER_CHARACTER];
    const tier = CHARACTER_TIERS[c.tier];
    const weapon = WEAPONS[c.weapon];
    this.nameLine.setText(`${c.name.toUpperCase()}  ·  ${tier?.label?.toUpperCase() ?? ''} (${tier?.band ?? '?'})  ·  ${(c.role ?? '').toUpperCase()}`);
    const s = c.stats;
    this.statsLine.setText(`HP ${s.hp}   SPD ${s.speedMul}x   JMP ${s.jumpMul}x   FIRE ${s.fireRateMul}x   DMG ${s.damageMul}x`);
    this.weaponLine.setText(`WEAPON  ${weapon?.name ?? c.weapon}`);
    this.skillLine.setText(`SKILL  ${c.skill.name} — ${c.skill.desc}`);
    const cd = Math.round((c.ability.cooldownMs || 0) / 1000);
    this.abilityLine.setText(`ABILITY  ${c.ability.name} (${cd}s) — ${c.ability.desc}`);
    this.loreLine.setText(c.lore ?? '');
    this.tradeLine.setText(`STRENGTHS  ${c.strengths}\nWEAKNESSES  ${c.weaknesses}`);

    const canConfirm = Boolean(profile)
      && Boolean(this.pending.character)
      && this._isUnlocked(this.pending.character)
      && this.net?.state?.busy !== 'setCharacter';
    this.confirmButton.setEnabled(canConfirm);
    this._paintStatus();
  }

  /** @returns {void} */
  show() {
    this._error = null;
    this._confirmed = null;
    this.pending = { character: null, variant: null }; // re-seeded in _refresh
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
    for (const off of this._offs) {
      try { off?.(); } catch { /* best-effort */ }
    }
    this._offs = [];
    try { this._offNotice?.(); } catch { /* best-effort */ }
    this._offNotice = null;
    this.scrim.destroy();
    this.panel.destroy();
    Object.values(this.rosterButtons).forEach((b) => b.destroy());
    this.variantButtons.forEach((b) => b.destroy());
    [this.nameLine, this.statsLine, this.weaponLine, this.skillLine,
      this.abilityLine, this.loreLine, this.tradeLine, this.variantLabel,
      this.statusText].forEach((t) => t?.destroy());
    this.closeButton.destroy();
    this.confirmButton.destroy();
  }
}

export default CharacterMenu;

