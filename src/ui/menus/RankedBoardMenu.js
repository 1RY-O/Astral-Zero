/**
 * Astral Zero — RankedBoardMenu (season standings overlay).
 * ============================================================
 * S14.6/.7. Shows ONLY server-provided numbers: the player's own standing and
 * the season leaderboard from `ranked_update` (a durable-store read on the
 * server). Nothing here is estimated, seeded or fabricated — an empty season
 * says so, a fetch failure says so, and an offline client says so. Placement
 * is honoured honestly: an unplaced player is told to finish their series
 * rather than shown a pretend rating on a board they are not on.
 *
 * Hidden by default (same overlay rules as PracticeSetupMenu).
 */

import { THEME, FONTS, SURFACES } from '../../config/uiTheme.js';
import { Panel } from '../widgets/Panel.js';
import { Button } from '../widgets/Button.js';
import { LEAGUES, rateFor } from '../../shared/ranked.js';

const PANEL = Object.freeze({ x: 300, y: 70, w: 680, h: 580 });
const MAX_ROWS = 11;

export class RankedBoardMenu {
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
    this._error = null;

    this.scrim = scene.add
      .rectangle(640, 360, 1280, 720, SURFACES.scrim, 0.72)
      .setDepth(depth - 1)
      .setScrollFactor(0)
      .setInteractive()
      .setVisible(false);

    this.panel = new Panel(scene, {
      x: PANEL.x, y: PANEL.y, width: PANEL.w, height: PANEL.h,
      title: 'SEASON STANDINGS',
      accent: THEME.panelBorderBright,
      depth,
    });
    this.panel.setVisible(false);

    const mkText = (x, y, w, style) => scene.add
      .text(x, y, '', { ...style, wordWrap: { width: w } })
      .setOrigin(0, 0)
      .setDepth(depth + 1)
      .setScrollFactor(0)
      .setVisible(false);

    // --- Header: YOUR standing (server truth; unplaced is stated plainly) ---
    this.seasonLine = mkText(PANEL.x + 24, PANEL.y + 52, PANEL.w - 48, {
      ...FONTS.tiny, fontSize: '11px', color: THEME.textFaint,
    });
    this.youLine = mkText(PANEL.x + 24, PANEL.y + 72, PANEL.w - 48, {
      ...FONTS.h3, fontSize: '17px',
    });
    this.youDetail = mkText(PANEL.x + 24, PANEL.y + 100, PANEL.w - 48, {
      ...FONTS.small, fontSize: '12px', color: THEME.textDim,
    });

    // --- Board rows ----------------------------------------------------------
    this.rowTexts = [];
    for (let i = 0; i < MAX_ROWS; i += 1) {
      this.rowTexts.push(mkText(PANEL.x + 24, PANEL.y + 140 + i * 30, PANEL.w - 48, {
        ...FONTS.code, fontSize: '13px',
      }));
    }
    this.statusLine = mkText(PANEL.x + 24, PANEL.y + PANEL.h - 74, PANEL.w - 48, {
      ...FONTS.small, fontSize: '12px', color: THEME.textDim,
    });

    // --- Actions -------------------------------------------------------------
    this.refreshButton = new Button(scene, {
      x: PANEL.x + PANEL.w - 190,
      y: PANEL.y + PANEL.h - 32,
      width: 150,
      height: 42,
      label: 'REFRESH',
      skin: 'ghost',
      fontSize: '14px',
      depth: depth + 1,
      onClick: () => this._fetch(),
    });
    this.refreshButton.setVisible(false);

    this.closeButton = new Button(scene, {
      x: PANEL.x + PANEL.w - 330,
      y: PANEL.y + PANEL.h - 32,
      width: 120,
      height: 42,
      label: 'Close',
      skin: 'ghost',
      fontSize: '14px',
      depth: depth + 1,
      onClick: () => this.hide(),
    });
    this.closeButton.setVisible(false);

    this._widgets = [...this.rowTexts, this.seasonLine, this.youLine, this.youDetail,
      this.statusLine, this.refreshButton, this.closeButton];

    this._offs.push(this.net?.on?.('ranked', () => this.visible && this._refresh()) ?? (() => {}));
    this._offs.push(this.net?.on?.('busy', () => this.visible && this._refresh()) ?? (() => {}));
  }

  // =========================================================================
  // Data
  // =========================================================================

  async _fetch() {
    this._error = null;
    const res = await this.net?.requestRankedBoard?.();
    if (res && res.ok === false && res.error !== 'BUSY') {
      this._error = `STANDINGS UNAVAILABLE — ${res.error}`;
    }
    this._refresh();
  }

  /** Re-render strictly from `net.state` — the only source this menu has. */
  _refresh() {
    const ranked = this.net?.state?.ranked ?? null;
    const profile = this.net?.state?.profile ?? null;
    const busy = this.net?.state?.busy === 'rankedBoard';
    const online = this.net?.state?.connection === 'online';

    // Season label comes from the last server frame; never invented locally.
    this.seasonLine.setText(ranked?.seasonId ? `SEASON ${ranked.seasonId}` : 'SEASON —');

    // --- Your standing -------------------------------------------------------
    // Preference order: latest ranked_update > profile's ranked row > honest
    // "no data yet". A missing rating is NEVER rendered as 0 on this screen.
    const you = ranked?.you ?? null;
    const pr = profile?.ranked ?? null;
    if (you?.placed || pr?.placed) {
      const rating = you?.rating ?? pr?.rating ?? 0;
      const league = you?.league ? LEAGUES.find((l) => l.id === you.league) : rateFor(rating);
      this.youLine.setText(`YOU  ·  ${String(league?.label ?? '—').toUpperCase()}  ·  ${rating}`)
        .setColor(league?.color ?? THEME.accent);
      const w = you?.wins ?? pr?.wins ?? 0;
      const l = you?.losses ?? pr?.losses ?? 0;
      const delta = Number.isFinite(you?.delta) ? `   LAST ${you.delta >= 0 ? '+' : ''}${you.delta}` : '';
      this.youDetail.setText(`PLACED   ${w}W / ${l}L${delta}`);
    } else {
      this.youLine.setText('YOU  ·  UNPLACED').setColor(THEME.warning);
      this.youDetail.setText('Finish 5 placement matches to earn a rating and appear on the board.');
    }

    // --- Board ----------------------------------------------------------------
    const rows = Array.isArray(ranked?.leaderboard) ? ranked.leaderboard : null;
    this.rowTexts.forEach((t, i) => {
      const row = rows?.[i];
      if (row) {
        const league = row.league
          ? LEAGUES.find((x) => x.id === row.league)
          : rateFor(row.rating);
        t.setText(
          `${String(i + 1).padStart(2, ' ')}  ${String(row.name ?? '—').slice(0, 18).padEnd(18, ' ')}` +
          `  ${String(league?.label ?? '—').toUpperCase().padEnd(11, ' ')}  ${String(row.rating ?? '—').padStart(4, ' ')}   ${row.wins ?? 0}W/${row.losses ?? 0}L`,
        ).setColor(league?.color ?? THEME.textPrimary);
      } else {
        t.setText('');
      }
    });

    // --- Honest states --------------------------------------------------------
    if (this._error) {
      this.statusLine.setText(this._error).setColor(THEME.danger);
    } else if (!online) {
      this.statusLine.setText('OFFLINE — standings need a connection. Retry when you are back.').setColor(THEME.warning);
    } else if (busy) {
      this.statusLine.setText('FETCHING STANDINGS…').setColor(THEME.accent);
    } else if (rows && rows.length === 0) {
      this.statusLine.setText('NO PLACED PLAYERS THIS SEASON YET — the board fills as placement series finish.').setColor(THEME.textDim);
    } else if (rows) {
      this.statusLine.setText('Top of the season ladder. Only placed players appear.').setColor(THEME.textDim);
    } else {
      this.statusLine.setText('No standings loaded yet — press REFRESH.').setColor(THEME.textDim);
    }
  }

  /** @returns {void} */
  show() {
    this._error = null;
    this._refresh();
    this.scrim.setVisible(true);
    this.panel.setVisible(true);
    this._widgets.forEach((w) => w.setVisible?.(true));
    this.visible = true;
    // Fetch on open so the board is never a stale screenshot — but an EMPTY
    // state renders instantly; loading only replaces it when the server says
    // something.
    this._fetch();
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
    this.scrim.destroy();
    this.panel.destroy();
    this.rowTexts.forEach((t) => t.destroy());
    [this.seasonLine, this.youLine, this.youDetail, this.statusLine].forEach((t) => t?.destroy());
    this.refreshButton.destroy();
    this.closeButton.destroy();
  }
}

export default RankedBoardMenu;

