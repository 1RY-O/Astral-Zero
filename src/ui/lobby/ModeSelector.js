/**
 * Astral Zero — ModeSelector (lobby section).
 * ===========================================================
 * Three cards — Free-for-All, Team Deathmatch and Bot Practice — plus the
 * primary action button that acts on the selection.
 *
 * The cards are data-driven from `MATCH_MODES` in src/config/lobbyConfig.js,
 * so adding a fourth mode later is a config change, not a code change.
 *
 * The primary button is CONTEXT AWARE, which is the whole point of this
 * widget: what it says and what it does depends on whether you are solo or
 * in a party, and whether you are the leader:
 *
 *   solo, not queued        → "Find Match"          (queue_join)
 *   solo, queued            → "Cancel Search"       (queue_leave)
 *   party member            → "Waiting for Leader"  (disabled)
 *   party leader            → "Start Match"         (party_start_match)
 */

import { THEME, FONTS } from '../../config/uiTheme.js';
import { MATCH_MODES, MODE_ORDER } from '../../config/lobbyConfig.js';
import { Panel } from '../widgets/Panel.js';
import { Button, lighten } from '../widgets/Button.js';

/**
 * `#38e1ff` → 0x38e1ff. Written out rather than pulling in Phaser's colour
 * helper so this file stays a plain module.
 * @param {string} hex
 * @returns {number}
 */
function hexToInt(hex) {
  return Number.parseInt(String(hex).replace('#', ''), 16) || 0xffffff;
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
   */
  constructor(scene, opts) {
    this.scene = scene;
    this.net = opts.net;
    this.depth = opts.depth ?? 0;

    const { x, y, width: w, height: h } = opts;
    this.panel = new Panel(scene, { x, y, width: w, height: h, title: 'GAME MODE', depth: this.depth });

    const innerX = x + 20;
    const innerW = w - 40;

    // --- Mode description (updates with the selection) ---------------------
    this.descText = scene.add
      .text(innerX + innerW / 2, y + 50, '', FONTS.dim)
      .setOrigin(0.5, 0)
      .setDepth(this.depth + 1)
      .setScrollFactor(0)
      .setWordWrapWidth(innerW)
      .setAlign('center');

    // --- Mode cards --------------------------------------------------------
    const cardW = (innerW - 2 * 14) / 3;
    const cardH = 84;
    const cardY = y + 88;

    /** @type {Record<string, Button>} */
    this.cards = {};
    MODE_ORDER.forEach((modeId, i) => {
      const mode = MATCH_MODES[modeId];
      this.cards[modeId] = new Button(scene, {
        x: innerX + cardW / 2 + i * (cardW + 14),
        y: cardY + cardH / 2,
        width: cardW,
        height: cardH,
        label: mode.short,
        sublabel: mode.name,
        skin: 'neutral',
        depth: this.depth + 2,
        onClick: () => this._onSelect(modeId),
      });
    });

    // --- Queue status line (between the cards and the button) -------------
    this.statusText = scene.add
      .text(innerX + innerW / 2, cardY + cardH + 10, '', FONTS.tiny)
      .setOrigin(0.5, 0)
      .setDepth(this.depth + 1)
      .setScrollFactor(0);

    // --- Primary action ----------------------------------------------------
    // Phase 5: the server offers the spectator booth when a room is full
    // (`room_join` ack `canSpectate: true`). Hidden until that hint arrives, so
    // it never implies spectating is generally available.
    this.spectate = new Button(scene, {
      x: 640,
      y: 596,
      width: 260,
      height: 38,
      label: 'Watch as Spectator',
      sublabel: 'no body \u00b7 cannot be hit',
      skin: 'ghost',
      fontSize: '13px',
      onClick: () => this.onSpectate?.(),
    });
    this.spectate.setVisible(false);

    this.primary = new Button(scene, {
      x: innerX + innerW / 2,
      y: y + h - 38,
      width: innerW,
      height: 56,
      label: 'Find Match',
      sublabel: 'queue for the selected mode',
      skin: 'primary',
      depth: this.depth + 2,
      onClick: () => this._onPrimary(),
    });

    this.refresh();
  }

  // =========================================================================
  // Rendering
  // =========================================================================

  /**
   * Repaint one card in its selected or unselected state. The selected card
   * is tinted with the MODE's own accent colour (FFA is pink, TDM is green,
   * Bot Practice is amber), so the colour itself tells you what you picked.
   * @param {string} modeId
   * @param {boolean} selected
   * @returns {void}
   */
  _paintCard(modeId, selected) {
    const card = this.cards[modeId];
    const mode = MATCH_MODES[modeId];
    const accent = hexToInt(mode.accent);
    const left = card.cx - card.width / 2;
    const top = card.cy - card.height / 2;

    const g = card.bg;
    g.clear();

    if (selected) {
      g.fillStyle(lighten(accent, -0.74), 0.95);
      g.fillRoundedRect(left, top, card.width, card.height, 10);
      g.lineStyle(2, accent, 0.95);
      g.strokeRoundedRect(left, top, card.width, card.height, 10);
      card.label.setColor(mode.accent);
      card.sublabel?.setAlpha(0.95);
      return;
    }

    // Unselected: the button's own neutral skin + faint accent text.
    g.fillStyle(0x111b30, 1);
    g.fillRoundedRect(left, top, card.width, card.height, 10);
    g.lineStyle(1, 0x2b3d5e, card.zone.isOver ? 0.9 : 0.6);
    g.strokeRoundedRect(left, top, card.width, card.height, 10);
    card.label.setColor(card.enabled ? THEME.textDim : THEME.textFaint);
    card.sublabel?.setAlpha(card.enabled ? 0.8 : 0.45);
  }

  /**
   * Re-render from `net.state` (mode + party + queue + busy).
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
      this._paintCard(modeId, modeId === selected);
    }

    this.descText.setText(MATCH_MODES[selected]?.description ?? '');

    // --- Primary button is context aware -----------------------------------
    // A non-leader's button is inert: it still explains the situation, but it
    // must not fire `party_start_match`, which the server would reject.
    const follower = Boolean(party) && !party.isLeader;
    this.primary.setEnabled(!busy && !follower);

    if (queued) {
      this.primary.setLabel('Cancel Search');
      this.primary.setSkin('danger');
      this.primary.sublabel?.setText(`queued for ${MATCH_MODES[state.queue.mode]?.name ?? 'a match'}`);
    } else if (party?.isLeader) {
      this.primary.setLabel('Start Match');
      this.primary.setSkin('primary');
      this.primary.sublabel?.setText(
        `start ${MATCH_MODES[selected].name} for ${party.memberCount} janitor(s)`,
      );
    } else if (party) {
      this.primary.setLabel('Waiting for Leader');
      this.primary.setSkin('neutral');
      this.primary.sublabel?.setText(`${party.leaderName ?? 'The leader'} picks the mode and starts`);
    } else {
      this.primary.setLabel('Find Match');
      this.primary.setSkin('primary');
      this.primary.sublabel?.setText(`queue for ${MATCH_MODES[selected].name}`);
    }

    // Spectate offer is only meaningful when we are NOT already queued and the
    // server actually offered it.
    const offer = state.spectateOffer ?? null;
    this.spectate.setVisible(Boolean(offer) && !queued && !busy);

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
   * Route the primary button to the right backend command.
   * @returns {void}
   */
  _onPrimary() {
    const state = this.net.state;

    if (state.queue) {
      this.net.queueLeave();
      return;
    }
    if (state.party) {
      // The button is disabled for followers, but re-check here too so a
      // programmatic call can never send a request the server will reject.
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
    this.primary.destroy();
    this.descText.destroy();
    this.statusText.destroy();
  }
}

export default ModeSelector;
