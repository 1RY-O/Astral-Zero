/**
 * Astral Zero — ModeSelector (lobby GAME MODE panel + Find Match CTA).
 * ==========================================================
 * Two jobs in one panel, because they are one decision:
 *   1. WHICH mode  — arcade cards built from MATCH_MODES, so a new mode is a
 *      config entry rather than a code change.
 *   2. GO         — the big Find Match button, whose label/colour/enabled
 *      state come from `resolveCta(net.state)`.
 *
 * THE CTA NEVER FAKES ITS STATE
 * The button renders exactly one of these, derived from real signals:
 *   READY · SEARCHING · LOADING · START MATCH · WAITING · OFFLINE
 * It is disabled whenever acting would be pointless or would be rejected by
 * the server (offline, waiting on a leader, a command already in flight).
 * A "searching" button CANCELS the search — the label changes to match the
 * action, so the button never lies about what pressing it will do.
 *
 * SELECTED STATE IS NOT COLOUR-ONLY
 * The selected card gets, in addition to its accent fill: a thicker border,
 * a `▸` marker in the corner, and a brighter label. All three are shape/weight
 * changes, so the selection survives greyscale and colourblind vision.
 *
 * The cards are data-driven from MATCH_MODES, including the server-supported
 * `scrap_collector`. A mode the backend rejects is simply not in MODE_ORDER,
 * so the UI cannot offer a mode that does not exist.
 */

import { THEME, FONTS, RADII, MOTION, CTA_STATES } from '../../config/uiTheme.js';
import { SURFACES, BORDERS, PALETTE } from '../../config/uiTheme.js';
import { MATCH_MODES, MODE_ORDER } from '../../config/lobbyConfig.js';
import { Panel } from '../widgets/Panel.js';
import { Button } from '../widgets/Button.js';
import { resolveCta } from '../brand/ConnectionState.js';
import { PracticeSetupMenu } from '../menus/PracticeSetupMenu.js';
import { CharacterMenu } from '../menus/CharacterMenu.js';
import { RankedBoardMenu } from '../menus/RankedBoardMenu.js';
import { RATED_MODES, rateFor, LEAGUES } from '../../shared/ranked.js';
import { CHARACTERS, STARTER_CHARACTER } from '../../shared/characters.js';
import * as Motion from '../../core/Motion.js';


export class ModeSelector {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {number} opts.x
   * @param {number} opts.y
   * @param {number} opts.width
   * @param {number} opts.height
   * @param {import('../../net/NetworkManager.js').NetworkManager} opts.net
   * @param {number} [opts.depth]
   * @param {number} [opts.minTouch]
   * @param {() => void} [opts.onSpectate]
   */
  constructor(scene, opts) {
    this.scene = scene;
    this.net = opts.net;
    this.depth = opts.depth ?? 0;
    this.onSpectate = opts.onSpectate;
    this.minTouch = opts.minTouch ?? 40;

    const { x, y, width: w, height: h } = opts;
    this.panel = new Panel(scene, {
      x,
      y,
      width: w,
      height: h,
      title: 'GAME MODE',
      depth: this.depth,
    });

    const innerX = x + 20;
    const innerW = w - 40;
    this._innerX = innerX;
    this._innerW = innerW;

    // --- Mode cards (stacked rows, arcade style) ---------------------------
    // A vertical stack reads better than a 3-across row on every tier, and it
    // gives each mode room for its own accent bar + description line.
    this.cards = {};
    /** @type {Record<string, object>} */
    this.cardMeta = {};
    const cardH = 62;
    const cardGap = 10;
    const cardY = y + 48;
    MODE_ORDER.forEach((modeId, i) => this._buildCard(modeId, innerX, cardY + i * (cardH + cardGap), innerW, cardH));

    // --- Selected-mode description ----------------------------------------
    this.descText = scene.add
      .text(innerX + innerW / 2, cardY + MODE_ORDER.length * (cardH + cardGap) + 4, '', {
        ...FONTS.dim,
        align: 'center',
        wordWrap: { width: innerW },
      })
      .setOrigin(0.5, 0)
      .setDepth(this.depth + 1)
      .setScrollFactor(0);

    // --- S14.6: ranked is a queue VARIANT of ffa/tdm ------------------------
    // Shown only for a RATED mode and only when queueing is possible. The two
    // chips are the whole decision; STANDINGS opens the real server board.
    // The league line reads the server's standing (profile / ranked_update) —
    // an unplaced player is told so, never shown an invented rating.
    const rankedY = cardY + MODE_ORDER.length * (cardH + cardGap) + 44;
    const w1 = Math.round(innerW * 0.26);
    const w2 = w1;
    const w3 = innerW - w1 - w2 - 16;
    this.casualBtn = new Button(scene, {
      x: innerX + w1 / 2,
      y: rankedY,
      width: w1,
      height: 34,
      label: 'CASUAL',
      skin: 'ghost',
      fontSize: '12px',
      depth: this.depth + 2,
      toggle: true,
      ariaLabel: 'Queue a casual match — rating never moves',
      onClick: () => { this.net.setRanked(false); this.refresh(); },
    });
    this.casualBtn.setVisible(false);
    this.rankedBtn = new Button(scene, {
      x: innerX + w1 + 8 + w2 / 2,
      y: rankedY,
      width: w2,
      height: 34,
      label: 'RANKED',
      skin: 'ghost',
      fontSize: '12px',
      depth: this.depth + 2,
      toggle: true,
      ariaLabel: 'Queue a rated match — placement and Elo apply',
      onClick: () => { this.net.setRanked(true); this.refresh(); },
    });
    this.rankedBtn.setVisible(false);
    this.boardBtn = new Button(scene, {
      x: innerX + w1 + 8 + w2 + 8 + w3 / 2,
      y: rankedY,
      width: w3,
      height: 34,
      label: 'STANDINGS',
      skin: 'ghost',
      fontSize: '11px',
      depth: this.depth + 2,
      ariaLabel: 'Open the season leaderboard',
      onClick: () => this.boardMenu?.show(),
    });
    this.boardBtn.setVisible(false);
    this.leagueText = scene.add
      .text(innerX + innerW / 2, rankedY + 24, '', { ...FONTS.tiny })
      .setOrigin(0.5, 0)
      .setDepth(this.depth + 1)
      .setScrollFactor(0)
      .setVisible(false);

    // --- Find Match CTA ---------------------------------------------------
    // Anchored to the bottom of the panel; large, high-contrast, easy to hit.
    const ctaH = Math.max(64, this.minTouch);
    this.primary = new Button(scene, {
      x: innerX + innerW / 2,
      y: y + h - ctaH / 2 - 14,
      width: innerW,
      height: ctaH,
      label: 'FIND MATCH',
      sublabel: 'drop into a debris field',
      skin: 'cta',
      fontSize: '22px',
      minHeight: ctaH,
      depth: this.depth + 2,
      onClick: () => this._onPrimary(),
    });

    // --- Spectate (server offer only) ------------------------------------
    this.spectate = new Button(scene, {
      x: innerX + innerW / 2,
      y: y + h - ctaH - 44,
      width: Math.min(innerW, 300),
      height: 36,
      label: 'Watch as Spectator',
      sublabel: 'no body · cannot be hit',
      skin: 'ghost',
      fontSize: '12px',
      minHeight: 36,
      depth: this.depth + 2,
      onClick: () => this.onSpectate?.(),
    });
    this.spectate.setVisible(false);

    // --- Practice setup (bot_practice only) --------------------------------
    // One ghost button whose label is the live summary; opens the shared
    // setup overlay (same object Home uses, same net state underneath).
    this.setupButton = new Button(scene, {
      x: innerX + innerW / 2,
      y: y + h - ctaH - 84,
      width: Math.min(innerW, 340),
      height: 34,
      label: '',
      skin: 'ghost',
      fontSize: '12px',
      minHeight: 34,
      depth: this.depth + 2,
      onClick: () => this.practiceMenu?.show(),
    });
    this.setupButton.setVisible(false);
    this._setupBaseY = y + h - ctaH - 84;

    this.practiceMenu = new PracticeSetupMenu(scene, {
      net: this.net,
      onClose: () => this.refresh(),
      depth: 420,
    });
    this._practiceOff = this.net?.on?.('practice', () => this.refreshPracticeSummary) ?? null;

    // --- S14.1: character + loadout selection -------------------------------
    // Sits in the same CTA stack as the practice setup, so both visible at
    // once on the practice card. Opens the shared selection overlay whose
    // every entry is server-validated.
    this.charButton = new Button(scene, {
      x: innerX + innerW / 2,
      y: y + h - ctaH - 124,
      width: Math.min(innerW, 340),
      height: 34,
      label: 'CHARACTER',
      skin: 'ghost',
      fontSize: '12px',
      minHeight: 34,
      depth: this.depth + 2,
      ariaLabel: 'Choose your character and loadout',
      onClick: () => this.characterMenu?.show(),
    });
    this.charButton.setVisible(false);
    this._charBaseY = y + h - ctaH - 124;

    this.characterMenu = new CharacterMenu(scene, {
      net: this.net,
      onClose: () => this.refresh(),
      depth: 420,
    });
    this.boardMenu = new RankedBoardMenu(scene, {
      net: this.net,
      depth: 421,
    });
    // Re-render whenever server truth we display changes (never per-frame).
    this._s14Offs = [
      this.net?.on?.('ranked-select', () => this.refresh()),
      this.net?.on?.('ranked', () => this.refresh()),
      this.net?.on?.('character', () => this.refresh()),
      this.net?.on?.('profile', () => this.refresh()),
    ].filter(Boolean);

    // --- Queue status line ------------------------------------------------
    this.statusText = scene.add
      .text(innerX + innerW / 2, y + h - ctaH - 8, '', FONTS.tiny)
      .setOrigin(0.5, 1)
      .setDepth(this.depth + 1)
      .setScrollFactor(0);

    this.refresh();
  }

  /**
   * Build one arcade mode card: accent stripe, short code, name, and a
   * selection marker that is a SHAPE (▸) rather than a colour.
   * @param {string} modeId
   * @param {number} x - Left edge.
   * @param {number} y - Top edge.
   * @param {number} w
   * @param {number} h
   * @returns {void}
   */
  _buildCard(modeId, x, y, w, h) {
    const mode = MATCH_MODES[modeId];
    const accent = mode.accentInt;

    const card = new Button(this.scene, {
      x: x + w / 2,
      y: y + h / 2,
      width: w,
      height: h,
      label: mode.short,
      sublabel: mode.name,
      skin: 'neutral',
      fontSize: '17px',
      minHeight: this.minTouch,
      depth: this.depth + 2,
      toggle: true,
      selected: false,
      ariaLabel: `${mode.name} — ${mode.description}`,
      onClick: () => this._onSelect(modeId),
    });

    // Selection marker — a triangle in the left gutter, hidden unless this
    // card is selected. A shape difference, so selection is colour-independent.
    const marker = this.scene.add
      .text(x + 14, y + h / 2, '▸', { ...FONTS.bodyStrong, fontSize: '18px', color: mode.accent })
      .setOrigin(0.5)
      .setDepth(this.depth + 3)
      .setScrollFactor(0)
      .setVisible(false);

    this.cards[modeId] = card;
    this.cardMeta[modeId] = { marker, accent, x, y, w, h };

    // BUG-GUARD: Button.redraw() runs on every hover/press transition and would
    // wipe the selected styling painted here, making a selected card flash back
    // to "unselected" the moment the pointer crossed it. Re-apply our paint
    // after the base redraw so selection is stable under hover.
    const baseRedraw = card.redraw.bind(card);
    card.redraw = () => {
      baseRedraw();
      this._paintCard(modeId, Boolean(this.cards[modeId]?.selected));
    };
  }

  /**
   * Repaint one card for its selected/unselected state.
   * @param {string} modeId
   * @param {boolean} selected
   * @returns {void}
   */
  _paintCard(modeId, selected) {
    const card = this.cards[modeId];
    const mode = MATCH_MODES[modeId];
    const meta = this.cardMeta[modeId];
    const accent = meta.accent;
    const left = meta.x;
    const top = meta.y;
    const w = meta.w;
    const h = meta.h;
    const r = RADII.card;

    // Paint directly onto the card's Graphics (which Button owns) so the
    // press/hover transforms still apply to the same object.
    const g = card.bg;
    g.clear();

    if (selected) {
      // Tinted with the mode accent, a THICK border, and a bright label.
      g.fillStyle(darken(accent, 0.78), 0.98);
      g.fillRoundedRect(left, top, w, h, r);
      g.lineStyle(4, accent, 1); // thicker = shape cue for selection
      g.strokeRoundedRect(left, top, w, h, r);
      g.fillStyle(accent, 1);
      g.fillRoundedRect(left, top + 6, 5, h - 12, 3); // accent stripe
      card.label.setColor(mode.accent);
      card.sublabel?.setColor(THEME.textPrimary).setAlpha(1);
    } else {
      g.fillStyle(SURFACES.panelCard, 1);
      g.fillRoundedRect(left, top, w, h, r);
      g.lineStyle(BORDERS.thin, SURFACES.panelBorderSoft, card.zone.isOver ? 0.9 : 0.55);
      g.strokeRoundedRect(left, top, w, h, r);
      card.label.setColor(card.enabled ? THEME.textDim : THEME.textFaint);
      card.sublabel?.setColor(THEME.textFaint).setAlpha(card.enabled ? 0.85 : 0.5);
    }

    meta.marker.setVisible(selected);
  }

  /**
   * Re-render from `net.state` (mode + party + queue + busy + connection).
   * @returns {void}
   */
  refresh() {
    const state = this.net.state;
    const selected = state.selectedMode;
    const party = state.party;
    const queued = Boolean(state.queue);
    const busy = Boolean(state.busy);

    // Mode is locked while queued or while a command is in flight, so a click
    // cannot change the selection out from under an in-flight start_match.
    for (const modeId of MODE_ORDER) {
      const card = this.cards[modeId];
      card.setEnabled(!busy && !queued);
      card.setSelected(modeId === selected);
      this._paintCard(modeId, modeId === selected);
    }

    const mode = MATCH_MODES[selected];
    this.descText.setText(mode?.description ?? '');

    // --- CTA is entirely state-derived ------------------------------------
    const cta = resolveCta(state, CTA_STATES);
    this.primary.setLabel(cta.label);
    this.primary.setSublabel(cta.sub);
    this.primary.setSkin(cta.tone === 'error' ? 'danger' : cta.tone === 'warning' ? 'warning' : cta.tone === 'neutral' ? 'neutral' : 'cta');
    this.primary.setEnabled(cta.enabled);
    // A searchable CTA is a "cancel" affordance, so the skin is warning-tinted
    // to distinguish it from the "go" state at a glance.
    if (cta.key === 'queued') this.primary.setSkin('warning');

    // Spectate offer only when the server actually offered it and we are not
    // already searching.
    this.spectate.setVisible(Boolean(state.spectateOffer) && !queued && !busy && !state.room);

    // Practice setup only for Bot Practice (same config Home edits).
    const showSetup = selected === 'bot_practice' && !queued && !busy && !state.room;
    this.setupButton.setVisible(showSetup);
    if (showSetup) {
      const dodgeSpectate = Boolean(state.spectateOffer);
      this.setupButton.setPosition(this._innerX + this._innerW / 2, this._setupBaseY - (dodgeSpectate ? 40 : 0));
      this.refreshPracticeSummary();
    }

    // --- S14.6: ranked row (rated modes only, only when queueing is possible)
    const rated = RATED_MODES.includes(selected);
    const showRankedRow = rated && !queued && !busy && !state.room;
    this.casualBtn.setVisible(showRankedRow);
    this.rankedBtn.setVisible(showRankedRow);
    this.boardBtn.setVisible(showRankedRow);
    this.leagueText.setVisible(showRankedRow);
    if (showRankedRow) {
      const isRanked = state.rankedSelected === true;
      this.casualBtn.setSelected(!isRanked);
      this.rankedBtn.setSelected(isRanked);
      // Standing comes from the SERVER (profile row or the last ranked_update).
      // Unplaced is stated as unplaced; a rating is never invented here.
      const you = state.ranked?.you ?? null;
      const pr = state.profile?.ranked ?? null;
      if (you?.placed || pr?.placed) {
        const rating = you?.rating ?? pr?.rating ?? 0;
        const label = you?.league
          ? LEAGUES.find((l) => l.id === you.league)?.label ?? rateFor(rating).label
          : rateFor(rating).label;
        this.leagueText
          .setText(`YOUR STANDING  ·  ${String(label).toUpperCase()}  ·  ${rating}`)
          .setColor(THEME.accent);
      } else {
        this.leagueText.setText('YOUR STANDING  ·  UNPLACED — 5 PLACEMENT MATCHES').setColor(THEME.textFaint);
      }
    }

    // --- S14.1: character button — available whenever a match is not live.
    const showChar = !queued && !busy && !state.room;
    this.charButton.setVisible(showChar);
    if (showChar) {
      const dodgeSpectate = Boolean(state.spectateOffer) ? 40 : 0;
      const aboveSetup = showSetup ? 44 : 0;
      this.charButton.setPosition(
        this._innerX + this._innerW / 2,
        this._charBaseY - dodgeSpectate - aboveSetup,
      );
      const id = state.character?.character || state.profile?.character || STARTER_CHARACTER;
      const name = CHARACTERS[id]?.name ?? CHARACTERS[STARTER_CHARACTER].name;
      this.charButton.setLabel(`CHARACTER: ${name.toUpperCase()}`);
    }

    this.statusText.setText(busy ? 'working…' : '');
    if (!queued) this.statusText.setColor(THEME.textFaint);
  }

  /**
   * Practice setup summary on the setup button (shared config with Home).
   * @returns {void}
   */
  refreshPracticeSummary() {
    if (!this.setupButton) return;
    const p = this.net?.state?.practice ?? {};
    const name = p.preset === 'custom'
      ? 'CUSTOM'
      : String(p.preset ?? 'beginner').toUpperCase();
    this.setupButton.setLabel(
      `Setup: ${name} · ${p.botCount ?? 1} bot${(p.botCount ?? 1) === 1 ? '' : 's'}`,
    );
  }

  /**
   * Refresh the "searching…" line from `queue_update` pushes.
   * @returns {void}
   */
  refreshQueue() {
    const queue = this.net.state.queue;
    if (!queue) {
      this.statusText.setText('');
      return;
    }
    const mode = MATCH_MODES[queue.mode]?.name ?? queue.mode;
    // S14.6: name the ACTUAL queue — a ranked search must never read casual.
    const kind = queue.ranked ? ' · RANKED' : '';
    const position = queue.position ? `position ${queue.position}` : 'searching…';
    const others = queue.playersInQueue ? ` · ${queue.playersInQueue} in queue` : '';
    this.statusText.setText(`${mode}${kind} — ${position}${others}`).setColor(THEME.accent);
  }

  // =========================================================================
  // Actions
  // =========================================================================

  /**
   * @param {string} modeId
   * @returns {void}
   */
  _onSelect(modeId) {
    this.net.setMode(modeId);
  }

  /**
   * Route the primary button to the right backend command, guarded by the
   * exact same conditions the button's enabled state used, so a programmatic
   * call can never send a request the server would reject.
   * @returns {void}
   */
  _onPrimary() {
    const state = this.net.state;
    const cta = resolveCta(state, CTA_STATES);
    if (!cta.enabled) return;

    if (state.queue) {
      this.net.queueLeave();
      return;
    }
    if (state.party) {
      if (!state.party.isLeader) {
        this.net.setNotice('error', 'Only the party leader can start the match.');
        return;
      }
      this.net.startPartyMatch();
      return;
    }
    this.net.queueJoin();
  }

  /** @returns {void} */
  destroy() {
    try {
      this._practiceOff?.();
    } catch {
      /* best-effort */
    }
    this._practiceOff = null;
    this.panel.destroy();
    Object.values(this.cards).forEach((c) => c.destroy());
    Object.values(this.cardMeta).forEach((m) => m.marker?.destroy());
    this.primary.destroy();
    this.spectate.destroy();
    this.setupButton?.destroy();
    this.practiceMenu?.destroy();
    // S14.1/.6: ranked row, character entry + the two overlays + their
    // subscriptions. Every net.on() returns an unsubscribe — collected and
    // released here so scene restarts never stack duplicate refreshers.
    this.casualBtn?.destroy();
    this.rankedBtn?.destroy();
    this.boardBtn?.destroy();
    this.leagueText?.destroy();
    this.charButton?.destroy();
    this.characterMenu?.destroy();
    this.boardMenu?.destroy();
    for (const off of this._s14Offs ?? []) {
      try { off?.(); } catch { /* best-effort */ }
    }
    this._s14Offs = [];
    this.descText.destroy();
    this.statusText.destroy();
  }
}

/**
 * Darken a packed colour toward black.
 * @param {number} color
 * @param {number} amount 0..1 (0 = unchanged, 1 = black)
 * @returns {number}
 */
function darken(color, amount) {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const mix = (c) => Math.round(c * (1 - amount));
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

export default ModeSelector;
