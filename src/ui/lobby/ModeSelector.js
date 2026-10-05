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
import { MATCH_MODES, MODE_ORDER } from '../../config/lobbyConfig.js';
import { Panel } from '../widgets/Panel.js';
import { Button } from '../widgets/Button.js';
import { resolveCta } from '../brand/ConnectionState.js';
import * as Motion from '../../core/Motion.js';

/** `#38e1ff` → 0x38e1ff, kept local so this file needs no Phaser import. */
function hexToInt(hex) {
  return Number.parseInt(String(hex).replace('#', ''), 16) || 0xffffff;
}

/** Pack a css colour to an int. */
function cssInt(hex) {
  return hexToInt(hex);
}

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
    const accent = cssInt(mode.accent);

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
      g.fillStyle(0x0f1830, 1);
      g.fillRoundedRect(left, top, w, h, r);
      g.lineStyle(2, 0x2b3d5e, card.zone.isOver ? 0.9 : 0.55);
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

    this.statusText.setText(busy ? 'working…' : '');
    if (!queued) this.statusText.setColor(THEME.textFaint);
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
    const position = queue.position ? `position ${queue.position}` : 'searching…';
    const others = queue.playersInQueue ? ` · ${queue.playersInQueue} in queue` : '';
    this.statusText.setText(`${mode} — ${position}${others}`).setColor(THEME.accent);
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
    this.panel.destroy();
    Object.values(this.cards).forEach((c) => c.destroy());
    Object.values(this.cardMeta).forEach((m) => m.marker?.destroy());
    this.primary.destroy();
    this.spectate.destroy();
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
