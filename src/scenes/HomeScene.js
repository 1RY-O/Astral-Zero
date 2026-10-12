import Phaser from 'phaser';

import { GAME_CONFIG, SCENES } from '../config/gameConfig.js';
import { THEME, FONTS, CTA_STATES } from '../config/uiTheme.js';
import { PALETTE, SURFACES, BORDERS, PANEL_ACCENTS } from '../config/uiTheme.js';
import { MATCH_MODES, MODE_ORDER } from '../config/lobbyConfig.js';
import { DESIGN, currentLayout } from '../config/viewportConfig.js';
import { reloadOnTierChange } from '../core/Responsive.js';
import { StatusPill } from '../ui/brand/StatusPill.js';
import { Logo } from '../ui/brand/Logo.js';
import { OrbitalBackdrop } from '../ui/brand/OrbitalBackdrop.js';
import { resolveCta } from '../ui/brand/ConnectionState.js';
import { net } from '../net/NetworkManager.js';
import { SettingsMenu } from '../ui/menus/SettingsMenu.js';
import { PracticeSetupMenu } from '../ui/menus/PracticeSetupMenu.js';
import { CharacterMenu } from '../ui/menus/CharacterMenu.js';
import { RankedBoardMenu } from '../ui/menus/RankedBoardMenu.js';
import { RATED_MODES, rateFor, LEAGUES } from '../shared/ranked.js';
import { CHARACTERS, STARTER_CHARACTER } from '../shared/characters.js';
import { NameGate, loadName } from '../ui/lobby/NameGate.js';
import { PartyPanel } from '../ui/lobby/PartyPanel.js';
import { FriendsPanel } from '../ui/lobby/FriendsPanel.js';
import { ProfileCard } from '../ui/lobby/ProfileCard.js';
import { InvitePrompt } from '../ui/lobby/InvitePrompt.js';
import { ToastLayer } from '../ui/widgets/ToastLayer.js';
import { Panel } from '../ui/widgets/Panel.js';
import { Button } from '../ui/widgets/Button.js';
import { navigate } from '../core/Router.js';

/**
 * Astral Zero — HOME scene (reference homepage).
 * =========================================================
 * Brand home page implementing the supplied `New Home.png` reference: top
 * brand bar with balances + connection, chunky left navigation, three
 * balanced panels (PARTY / FRIENDS / GAME MODE with a yellow FIND MATCH),
 * and lower season + squad strips.
 *
 * Adapted to REAL functionality — nothing on screen is decorative-only:
 *  - Home/Play/Friends/Settings navigate to implemented destinations.
 *    Missions does not exist backend-side, so its button is visibly marked
 *    SOON and explains itself instead of leading nowhere.
 *  - PartyPanel / FriendsPanel are the SAME widgets the lobby uses (same net
 *    state underneath), restyled with the reference header accents.
 *  - Mode cards + CTA share the lobby's `resolveCta` state machine, so the
 *    button can never contradict the connection/queue/room state.
 *  - Balances show the game's ACTUAL holdings: there is no currency system
 *    backend-side, so the pills honestly read 0 + SOON and are not spendable.
 *  - Exactly ONE status line renders the real matchmaking state (never the
 *    reference's three simultaneous sample rows).
 *
 * Entry point after the 4 s loading dwell (see `src/main.js`). Bot Practice
 * flow: mode card (or setup) then the CTA awaits the real `net.queueJoin()`;
 * arena entry happens ONLY on server-confirmed `match-ready`.
 */

// Reference header accents (packed ints): blue party, violet friends, red mode.
/**
 * Panel identity accents, from the theme's sanctioned set.
 * Each lobby panel owns ONE accent so "party" and "friends" are distinguishable
 * without reading the title — drawn from PANEL_ACCENTS rather than invented
 * here, so a fourth panel does not add a fourth hue to the identity.
 */
const ACCENT_PARTY = PANEL_ACCENTS.party;
const ACCENT_FRIENDS = PANEL_ACCENTS.friends;
const ACCENT_MODE = PANEL_ACCENTS.mode;
const HOME_GOLD = THEME.amberSoft;

// There is no currency/progression economy backend-side (see ProfileCard's
// "NO INVENTED CURRENCIES"), so the honest balance for every pill is 0 and
// every pill is marked SOON + non-spendable. When a real economy lands, wire
// it here and flip `available`.
const CURRENCIES = Object.freeze([
  { id: 'stars', glyph: '★', name: 'Stars' },
  { id: 'coins', glyph: '◉', name: 'Coins' },
  { id: 'gems', glyph: '◆', name: 'Gems' },
]);

/** @returns {Array<{id:string, glyph:string, name:string, balance:number, available:boolean}>} */
export function getHomeBalances() {
  return CURRENCIES.map((c) => ({ ...c, balance: 0, available: false }));
}

const NAV_ITEMS = Object.freeze([
  { id: 'home', glyph: '⌂', label: 'HOME' },
  { id: 'play', glyph: '▶', label: 'PLAY' },
  { id: 'friends', glyph: '☺', label: 'FRIENDS' },
  { id: 'missions', glyph: '▤', label: 'MISSIONS', soon: true },
  { id: 'settings', glyph: '⚙', label: 'SETTINGS' },
]);

export class HomeScene extends Phaser.Scene {
  constructor() {
    super('HomeScene');
  }

  /** Unsubscribe handles, released on shutdown. @type {Array<() => void>} */
  _offs = [];

  /** True once a server-confirmed transition to Arena has started. */
  _entering = false;

  /** @returns {void} */
  create() {
    this.net = net;
    this._offs = [];
    this._entering = false;
    // A tier-based layout cannot be patched in place, so the scene rebuilds
    // when the device crosses a breakpoint (window resize / phone rotation).
    this._offs.push(reloadOnTierChange(this));

    this.layout = currentLayout(this.scale);
    const L = this.layout;
    this.tier = L.tier;

    this.backdrop = new OrbitalBackdrop(this, {
      x: GAME_CONFIG.width / 2,
      y: GAME_CONFIG.height / 2,
      depth: 0,
    });

    this._createHeader();
    this._createNav();
    this._createBody();
    this._createBottomStrips();

    this.toasts = new ToastLayer(this, {
      x: DESIGN.width / 2,
      y: DESIGN.height - 24,
      depth: 400,
    });
    this.invitePrompt = new InvitePrompt(this, { net: this.net });

    this.settingsMenu = new SettingsMenu(this, {
      onClose: () => {},
      audio: null,
      depth: 400,
    });

    this.practiceMenu = new PracticeSetupMenu(this, {
      net: this.net,
      onClose: () => this._refreshMode(),
      depth: 420,
    });

    this._bindNetwork();
    this._refreshAll();

    // First-time name entry lives here (not a separate route): returning
    // players with a saved name proceed straight to Home content.
    this._maybeAskName();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this._teardown());
  }

  // =========================================================================
  // Header: brand + profile + balances + connection + settings
  // =========================================================================

  /** @returns {void} */
  _createHeader() {
    const H = 76;
    this.headerH = H;
    const g = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.headerBg = g;
    g.fillStyle(THEME.bgDeep, 0.92);
    g.fillRect(0, 0, DESIGN.width, H);
    g.lineStyle(2, THEME.accentDeep, 0.35);
    g.beginPath();
    g.moveTo(0, H);
    g.lineTo(DESIGN.width, H);
    g.strokePath();

    this.logo = new Logo(this, {
      x: 44, y: H / 2, size: 44, depth: 12, wordmarkSize: 0.85,
    });

    this.profile = new ProfileCard(this, {
      x: 252, y: (H - 52) / 2, width: 196, height: 52, net: this.net, depth: 12,
      onRename: () => this._askName(true),
    });

    // --- Balances (honest zeroes) + hamburger + connection ----------------
    this.currencyPills = CURRENCIES.map((c, i) => this._buildCurrencyPill(c, i));

    this.menuButton = new Button(this, {
      x: DESIGN.width - 32, y: H / 2 - 8, width: 44, height: 44,
      label: '☰', skin: 'ghost', fontSize: '18px', depth: 12,
      ariaLabel: 'Open settings',
      onClick: () => this.settingsMenu?.show(),
    });

    this.statusPill = new StatusPill(this, {
      x: DESIGN.width - 172, y: H - 12, net: this.net, depth: 12, showHint: false,
    });
  }

  /**
   * One honest balance pill: glyph + real (zero) balance + SOON tag.
   * @param {{id:string, glyph:string, name:string}} c
   * @param {number} i
   * @returns {Button}
   */
  _buildCurrencyPill(c, i) {
    const w = 108;
    const h = 40;
    // Right-aligned row ending before the hamburger (centre 1248, half 22).
    const right = DESIGN.width - 66;
    const gap = 10;
    const cx = right - (CURRENCIES.length - 1 - i) * (w + gap) - w / 2;
    const pill = new Button(this, {
      x: cx, y: 26, width: w, height: h,
      label: `${c.glyph}  0`,
      sublabel: `${c.name} · SOON`,
      skin: 'ghost', fontSize: '15px', depth: 12,
      ariaLabel: `${c.name} balance 0 — coming soon, not spendable`,
      onClick: () => this._soon(`${c.name} are coming soon — no balance is tracked yet, so nothing can be spent.`),
    });
    return pill;
  }

  // =========================================================================
  // Navigation: five chunky entries, one honest SOON
  // =========================================================================

  /** @returns {void} */
  _createNav() {
    this.navItems = [];
    this.navButtons = {};
    if (this.tier === 'wide') {
      const w = 104;
      const h = 88;
      const gap = 8;
      let y = this.headerH + 16 + h / 2;
      NAV_ITEMS.forEach((item) => {
        this._buildNavButton(item, 12 + w / 2, y, w, h);
        y += h + gap;
      });
    } else {
      // Narrow tiers: a horizontal strip under the header (same items).
      const n = NAV_ITEMS.length;
      const gap = 8;
      const w = Math.min(200, (DESIGN.width - 24 - gap * (n - 1)) / n);
      const h = this.tier === 'compact' ? 48 : 54;
      const y = this.headerH + 8 + h / 2;
      const totalW = n * w + (n - 1) * gap;
      let x = (DESIGN.width - totalW) / 2 + w / 2;
      NAV_ITEMS.forEach((item) => {
        this._buildNavButton(item, x, y, w, h);
        x += w + gap;
      });
      this.navStripBottom = y + h / 2;
    }
    this._paintNav('home');
  }

  /**
   * @param {{id:string, glyph:string, label:string, soon?:boolean}} item
   * @param {number} x @param {number} y @param {number} w @param {number} h
   * @returns {void}
   */
  _buildNavButton(item, x, y, w, h) {
    const btn = new Button(this, {
      x, y, width: w, height: h,
      label: item.glyph,
      sublabel: item.soon ? `${item.label} · SOON` : item.label,
      skin: 'nav', fontSize: this.tier === 'wide' ? '24px' : '18px',
      depth: 12, toggle: true,
      ariaLabel: item.soon ? `${item.label} — coming soon` : `${item.label}`,
      onClick: () => this._onNav(item.id),
    });
    this.navItems.push(btn);
    this.navButtons[item.id] = btn;
  }

  /**
   * Active entry gets the reference-yellow action skin; the SOON entry keeps
   * its ghosted look so "coming soon" reads at a glance (shape + text).
   * @param {string} active
   * @returns {void}
   */
  _paintNav(active) {
    for (const [id, btn] of Object.entries(this.navButtons)) {
      const isActive = id === active;
      btn.setSelected(isActive && id !== 'missions');
      btn.setSkin(isActive && id !== 'missions' ? 'gold' : 'nav');
    }
  }

  /** @param {string} id @returns {void} */
  _onNav(id) {
    if (id === 'missions') {
      this._paintNav('home');
      this._soon('Missions are coming soon — check back after the next update.');
      return;
    }
    if (id === 'settings') {
      this.settingsMenu?.show();
      return;
    }
    this._paintNav(id);
    if (id === 'home') navigate('home');
    else if (id === 'play') navigate('lobby');
    else if (id === 'friends') navigate('friends');
  }

  // =========================================================================
  // Body: party + friends + game-mode panels
  // =========================================================================

  /** @returns {void} */
  _createBody() {
    if (this.tier === 'wide') this._createBodyWide();
    else if (this.tier === 'medium') this._createBodyMedium();
    else this._createBodyCompact();
  }

  /** @returns {void} */
  _createBodyWide() {
    const top = this.headerH + 16;
    const h = 548;
    this.partyPanel = new PartyPanel(this, {
      x: 128, y: top, width: 336, height: h, net: this.net,
      accent: ACCENT_PARTY,
    });
    this.friendsPanel = new FriendsPanel(this, {
      x: 476, y: top, width: 336, height: h, net: this.net,
      accent: ACCENT_FRIENDS,
    });
    this._buildModePanel(824, top, 436, h);
  }

  /** @returns {void} */
  _createBodyMedium() {
    const top = (this.navStripBottom ?? this.headerH + 70) + 8;
    const colH = 330;
    this.partyPanel = new PartyPanel(this, {
      x: 20, y: top, width: 600, height: colH, net: this.net,
      accent: ACCENT_PARTY,
    });
    this._buildModePanel(632, top, 628, colH);
    // Friends gets the bottom strip (add-row + start of list always visible).
    this.friendsPanel = new FriendsPanel(this, {
      x: 20, y: top + colH + 12, width: 1240, height: 178, net: this.net,
      accent: ACCENT_FRIENDS,
    });
  }

  /** @returns {void} */
  _createBodyCompact() {
    const top = (this.navStripBottom ?? this.headerH + 64) + 8;
    // Compact keeps the primary action (mode + CTA) and party; the full
    // friends list lives one tap away via the FRIENDS nav entry (lobby).
    this._buildModePanel(20, top, 1240, 320);
    this.partyPanel = new PartyPanel(this, {
      x: 20, y: top + 328, width: 1240, height: 224, net: this.net,
      accent: ACCENT_PARTY,
    });
    this.friendsPanel = null;
  }

  /**
   * The GAME MODE panel: horizontal mode cards, setup summary, ONE honest
   * status line, and the yellow FIND MATCH CTA — all derived from net.state.
   * @param {number} x @param {number} y @param {number} w @param {number} h
   * @returns {void}
   */
  _buildModePanel(x, y, w, h) {
    this.modePanel = new Panel(this, {
      x, y, width: w, height: h,
      title: 'GAME MODE', subtitle: 'Choose your battle style!',
      accent: ACCENT_MODE, depth: 0,
    });
    const innerX = x + 20;
    const innerW = w - 40;
    this._modeInnerX = innerX;
    this._modeInnerW = innerW;

    // --- Horizontal mode cards (always one row; sized to the panel) ---------
    // Bottom block (setup + status + CTA) is anchored first; cards take the
    // middle. cardH shrinks on short tiers so cards, desc and setup never
    // overlap — nothing here draws outside the panel.
    this.modeCards = {};
    this.modeCrowns = {};
    const ctaH = h >= 400 ? 68 : 60;
    this._modeCtaH = ctaH;
    const cardGap = 10;
    const cardW = Math.min(220, Math.floor((innerW - cardGap * 3) / 4));
    const cardH = Math.max(72, Math.min(108, h - 300));
    const rowW = cardW * 4 + cardGap * 3;
    const rowX = innerX + (innerW - rowW) / 2;
    const cardY = y + 64 + 14 + cardH / 2; // +14 leaves room for the crown
    MODE_ORDER.forEach((modeId, i) => {
      this._buildModeCard(modeId, rowX + cardW / 2 + i * (cardW + cardGap), cardY, cardW, cardH);
    });
    this._modeCardsBottom = cardY + cardH / 2;

    // --- Selected-mode description -----------------------------------------
    // Short tiers get a single line (their inner width fits it); tall panels
    // wrap. Either way it sits between the cards and the bottom block.
    this.modeDesc = this.add
      .text(innerX + innerW / 2, this._modeCardsBottom + 6, '', {
        ...FONTS.dim, fontSize: '13px', align: 'center',
        ...(h >= 400 ? { wordWrap: { width: innerW } } : {}),
      })
      .setOrigin(0.5, 0)
      .setDepth(2)
      .setScrollFactor(0);

    // --- Practice setup summary (bot_practice only) -------------------------
    this.setupButton = new Button(this, {
      x: innerX + innerW / 2, y: y + h - ctaH - 50,
      width: Math.min(innerW, 360), height: 32,
      label: '', skin: 'ghost', fontSize: '12px', depth: 2,
      onClick: () => this.practiceMenu?.show(),
    });
    this.setupButton.setVisible(false);

    // --- S14.6: ranked is a queue VARIANT of a rated mode --------------------
    // Two chips + STANDINGS, in the same bottom stack as the setup summary.
    // Visible only for a RATED mode and only when queueing is possible, so an
    // unrated mode never offers a ladder it cannot deliver.
    const rankW = Math.min(innerW, 360);
    const chipW = Math.round((rankW - 8) * 0.28);
    const boardW = rankW - chipW * 2 - 16;
    const rankY = y + h - ctaH - 88;
    this.casualBtn = new Button(this, {
      x: innerX + innerW / 2 - rankW / 2 + chipW / 2, y: rankY,
      width: chipW, height: 30,
      label: 'CASUAL', skin: 'ghost', fontSize: '11px', depth: 2,
      toggle: true, minHeight: 30,
      ariaLabel: 'Queue a casual match — rating never moves',
      onClick: () => { this.net.setRanked(false); this._refreshMode(); },
    });
    this.casualBtn.setVisible(false);
    this.rankedBtn = new Button(this, {
      x: innerX + innerW / 2 - rankW / 2 + chipW + 8 + chipW / 2, y: rankY,
      width: chipW, height: 30,
      label: 'RANKED', skin: 'ghost', fontSize: '11px', depth: 2,
      toggle: true, minHeight: 30,
      ariaLabel: 'Queue a rated match — placement and Elo apply',
      onClick: () => { this.net.setRanked(true); this._refreshMode(); },
    });
    this.rankedBtn.setVisible(false);
    this.boardBtn = new Button(this, {
      x: innerX + innerW / 2 - rankW / 2 + chipW * 2 + 16 + boardW / 2, y: rankY,
      width: boardW, height: 30,
      label: 'STANDINGS', skin: 'ghost', fontSize: '10px', depth: 2,
      minHeight: 30,
      ariaLabel: 'Open the season leaderboard',
      onClick: () => this.boardMenu?.show(),
    });
    this.boardBtn.setVisible(false);
    // Standing line — reads the SERVER's numbers only. An unplaced player is
    // told they are unplaced; a rating is never invented on this screen.
    this.rankedLine = this.add
      .text(innerX + innerW / 2, rankY + 20, '', {
        ...FONTS.tiny, fontSize: '10px', align: 'center', wordWrap: { width: innerW },
      })
      .setOrigin(0.5, 0)
      .setDepth(2)
      .setScrollFactor(0)
      .setVisible(false);

    // --- S14.1: character + loadout selection -------------------------------
    // Always reachable when a match is not live. Opens the shared overlay
    // whose every entry is server-validated.
    this.charButton = new Button(this, {
      x: innerX + innerW / 2, y: y + h - ctaH - 124,
      width: Math.min(innerW, 360), height: 30,
      label: 'CHARACTER', skin: 'ghost', fontSize: '12px', depth: 2,
      minHeight: 30,
      ariaLabel: 'Choose your character and loadout',
      onClick: () => this.characterMenu?.show(),
    });
    this.charButton.setVisible(false);

    // The two S14 overlays. Same construction rules as PracticeSetupMenu:
    // hidden until asked for, and each owns its own net subscriptions which
    // destroy() releases.
    this.characterMenu = new CharacterMenu(this, {
      net: this.net,
      onClose: () => this._refreshMode(),
      depth: 420,
    });
    this.boardMenu = new RankedBoardMenu(this, {
      net: this.net,
      onClose: () => {},
      depth: 420,
    });

    // --- Single honest status line (never sample rows) ----------------------
    this.statusLine = this.add
      .text(innerX + innerW / 2, y + h - ctaH - 12, '', {
        ...FONTS.small, fontSize: '13px', align: 'center', wordWrap: { width: innerW },
      })
      .setOrigin(0.5, 1)
      .setDepth(2)
      .setScrollFactor(0);

    // --- Yellow FIND MATCH CTA ----------------------------------------------
    this.primary = new Button(this, {
      x: innerX + innerW / 2, y: y + h - ctaH / 2 - 10,
      width: innerW, height: ctaH,
      label: 'FIND MATCH', sublabel: 'drop into a debris field',
      skin: 'gold', fontSize: '22px', depth: 2,
      ariaLabel: 'Find match',
      onClick: () => this._onPrimary(),
    });
  }

  /**
   * @param {string} modeId @param {number} x @param {number} y
   * @param {number} w @param {number} h
   * @returns {void}
   */
  _buildModeCard(modeId, x, y, w, h) {
    const mode = MATCH_MODES[modeId];
    const card = new Button(this, {
      x, y, width: w, height: h,
      label: mode.short, sublabel: mode.name,
      skin: 'neutral', fontSize: '17px', depth: 2,
      toggle: true, selected: false,
      ariaLabel: `${mode.name} — ${mode.description}`,
      onClick: () => this.net.setMode(modeId),
    });
    // Crown marker for the selected card (reference detail; a shape cue, not
    // colour-only). Parked just above the card's top edge.
    const crown = this.add
      .text(x, y - h / 2 - 4, '♛', { ...FONTS.bodyStrong, fontSize: '20px', color: HOME_GOLD })
      .setOrigin(0.5, 1)
      .setDepth(3)
      .setScrollFactor(0)
      .setVisible(false);
    this.modeCards[modeId] = card;
    this.modeCrowns[modeId] = crown;

    // Selection paint must survive hover/press redraws (same guard as the
    // lobby's ModeSelector).
    const baseRedraw = card.redraw.bind(card);
    card.redraw = () => {
      baseRedraw();
      this._paintModeCard(modeId, Boolean(this.modeCards[modeId]?.selected));
    };
  }

  /**
   * @param {string} modeId @param {boolean} selected
   * @returns {void}
   */
  _paintModeCard(modeId, selected) {
    const card = this.modeCards[modeId];
    const g = card.bg;
    const left = card.cx - card.width / 2;
    const top = card.cy - card.height / 2;
    const w = card.width;
    const h = card.height;
    g.clear();
    if (selected) {
      // Reference-yellow selected card: amber tint, thick gold border.
      g.fillStyle(PALETTE.amberDeep3, 0.98);
      g.fillRoundedRect(left, top, w, h, 14);
      g.lineStyle(BORDERS.thick, PALETTE.amberSoft, 1);
      g.strokeRoundedRect(left, top, w, h, 14);
      card.label.setColor(HOME_GOLD);
      card.sublabel?.setColor(THEME.textPrimary).setAlpha(1);
    } else {
      g.fillStyle(SURFACES.panelCard, 1);
      g.fillRoundedRect(left, top, w, h, 14);
      g.lineStyle(BORDERS.thin, SURFACES.panelBorderSoft, card.zone.isOver ? 0.9 : 0.55);
      g.strokeRoundedRect(left, top, w, h, 14);
      card.label.setColor(card.enabled ? THEME.textDim : THEME.textFaint);
      card.sublabel?.setColor(THEME.textFaint).setAlpha(card.enabled ? 0.85 : 0.5);
    }
    this.modeCrowns[modeId]?.setVisible(selected);
  }

  // =========================================================================
  // Bottom strips: season (coming soon) + squad (info)
  // =========================================================================

  /** @returns {void} */
  _createBottomStrips() {
    if (this.tier !== 'wide') return; // narrow tiers spend the height on panels
    const y = 656;
    const h = 52;

    // --- New season: clearly coming-soon, never fake rewards ----------------
    this.seasonBg = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.seasonBg.fillStyle(THEME.panel, 0.93);
    this.seasonBg.fillRoundedRect(12, y, 240, h, 12);
    this.seasonBg.lineStyle(2, THEME.violet, 0.8);
    this.seasonBg.strokeRoundedRect(12, y, 240, h, 12);
    this.seasonIcon = this.add
      .text(34, y + h / 2, '▣', { ...FONTS.bodyStrong, fontSize: '24px', color: THEME.violet })
      .setOrigin(0.5).setDepth(11).setScrollFactor(0);
    this.seasonTitle = this.add
      .text(58, y + 10, 'NEW SEASON', { ...FONTS.bodyStrong, fontSize: '14px', color: THEME.textPrimary })
      .setOrigin(0, 0).setDepth(11).setScrollFactor(0);
    this.seasonSub = this.add
      .text(58, y + 30, 'Coming Soon!', { ...FONTS.small, fontSize: '12px', color: THEME.accent })
      .setOrigin(0, 0).setDepth(11).setScrollFactor(0);
    this.seasonZone = this.add
      .zone(12, y, 240, h).setOrigin(0, 0).setDepth(11).setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    this.seasonZone.on('pointerup', () => {
      this._soon('The new season is coming soon — no pass or rewards exist yet.');
    });

    // --- Cleaner squad: static info about the co-op crew --------------------
    this.squadBg = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.squadBg.fillStyle(THEME.panel, 0.93);
    this.squadBg.fillRoundedRect(1028, y, 240, h, 12);
    this.squadBg.lineStyle(2, THEME.panelBorder, 0.8);
    this.squadBg.strokeRoundedRect(1028, y, 240, h, 12);
    this.squadIcon = this.add
      .text(1050, y + h / 2, '◍', { ...FONTS.bodyStrong, fontSize: '24px', color: THEME.accent })
      .setOrigin(0.5).setDepth(11).setScrollFactor(0);
    this.squadTitle = this.add
      .text(1074, y + 10, 'CLEANER SQUAD', { ...FONTS.bodyStrong, fontSize: '14px', color: THEME.success })
      .setOrigin(0, 0).setDepth(11).setScrollFactor(0);
    this.squadSub = this.add
      .text(1074, y + 30, 'Orbit is your playground.', { ...FONTS.small, fontSize: '12px', color: THEME.textDim })
      .setOrigin(0, 0).setDepth(11).setScrollFactor(0);
  }

  // =========================================================================
  // Network wiring
  // =========================================================================

  /** Subscribe to every NetworkManager event this scene renders from. */
  _bindNetwork() {
    this._offs.push(this.net.on('connection', () => {
      this.statusPill?.refresh();
      this._refreshAll();
    }));
    this._offs.push(this.net.on('player', () => {
      this.profile?.refresh();
      this._refreshMode();
    }));
    this._offs.push(this.net.on('party', () => {
      this.partyPanel?.refresh();
      this.friendsPanel?.refresh();
      this._refreshMode();
    }));
    this._offs.push(this.net.on('friends', () => this.friendsPanel?.refresh()));
    this._offs.push(this.net.on('queue', () => {
      this._refreshMode();
      this._refreshStatus();
    }));
    this._offs.push(this.net.on('busy', () => {
      this._refreshMode();
      this._refreshStatus();
    }));
    this._offs.push(this.net.on('room', () => {
      this._refreshMode();
      this._refreshStatus();
    }));
    this._offs.push(this.net.on('mode', () => this._refreshMode()));
    // S14: the server owns the character and the ladder. A confirmation echo or
    // a rating push repaints from server truth — the UI never assumes a write
    // landed, because a LOCKED selection is refused and must stay refused.
    this._offs.push(this.net.on('character', () => this._refreshMode()));
    this._offs.push(this.net.on('ranked', () => this._refreshMode()));
    this._offs.push(this.net.on('practice', () => this._refreshPracticeSummary()));
    this._offs.push(this.net.on('notice', () => this._refreshStatus()));
    this._offs.push(
      this.net.on('invite', ({ invite }) => {
        if (invite) this.invitePrompt.present(invite);
        else this.invitePrompt.setVisible(false);
      }),
    );
    // ★ Server-confirmed room membership is the ONLY Arena trigger.
    this._offs.push(this.net.on('match-ready', ({ room } = {}) => this._enterArena(room)));
  }

  // =========================================================================
  // Rendering from state
  // =========================================================================

  /** @returns {void} */
  _refreshAll() {
    this.statusPill?.refresh();
    this.profile?.refresh();
    this.partyPanel?.refresh();
    this.friendsPanel?.refresh();
    this._refreshMode();
    this._refreshStatus();
  }

  /**
   * Mode cards + CTA + setup visibility, entirely derived from net.state via
   * the shared `resolveCta` machine (same source the lobby uses).
   * @returns {void}
   */
  _refreshMode() {
    if (!this.primary) return;
    const state = this.net?.state ?? {};
    const selected = state.selectedMode;
    const queued = Boolean(state.queue);
    const busy = Boolean(state.busy);

    for (const modeId of MODE_ORDER) {
      const card = this.modeCards[modeId];
      if (!card) continue;
      card.setEnabled(!busy && !queued);
      card.setSelected(modeId === selected);
      this._paintModeCard(modeId, modeId === selected);
    }

    const mode = MATCH_MODES[selected];
    this.modeDesc?.setText(mode?.description ?? '');

    const cta = resolveCta(state, CTA_STATES);
    this.primary.setLabel(cta.label);
    this.primary.setSublabel(cta.sub);
    this.primary.setSkin(cta.enabled ? 'gold' : 'neutral');
    this.primary.setEnabled(cta.enabled);
    this.primary.ariaLabel = cta.label;

    const showSetup = selected === 'bot_practice' && !queued && !busy && !state.room;
    this.setupButton?.setVisible(showSetup);
    if (showSetup) this._refreshPracticeSummary();

    this._refreshRankedRow(selected, state);

    // Character selection is reachable whenever a match is not live. The label
    // is the character the SERVER says is active — never a local guess.
    const showChar = !queued && !busy && !state.room;
    this.charButton?.setVisible(showChar);
    if (showChar) {
      const id = state.character?.character || state.profile?.character || STARTER_CHARACTER;
      const name = CHARACTERS[id]?.name ?? CHARACTERS[STARTER_CHARACTER].name;
      this.charButton.setLabel(`CHARACTER: ${String(name).toUpperCase()}`);
    }

    this._refreshStatus();
  }

  /**
   * S14.6 — the ranked chips + standing line.
   *
   * Only a mode on the shared `RATED_MODES` allow-list offers a ladder, so an
   * unrated mode (bots, scrap, control point) can never advertise one. The
   * standing itself is read from the server (the profile row or the last
   * `ranked_update` push); an unplaced player is told so plainly.
   *
   * @param {string} selected currently selected mode id
   * @param {object} state net.state
   * @returns {void}
   */
  _refreshRankedRow(selected, state) {
    const show = RATED_MODES.includes(selected)
      && !state.queue && !state.busy && !state.room;
    this.casualBtn?.setVisible(show);
    this.rankedBtn?.setVisible(show);
    this.boardBtn?.setVisible(show);
    if (!show) {
      this.rankedLine?.setVisible(false);
      return;
    }
    const isRanked = state.rankedSelected === true;
    this.casualBtn.setSelected(!isRanked);
    this.rankedBtn.setSelected(isRanked);

    const you = state.ranked?.you ?? null;
    const pr = state.profile?.ranked ?? null;
    const placed = Boolean(you?.placed || pr?.placed);
    if (placed) {
      const rating = you?.rating ?? pr?.rating ?? 0;
      const label = you?.league
        ? LEAGUES.find((l) => l.id === you.league)?.label ?? rateFor(rating).label
        : rateFor(rating).label;
      this.rankedLine
        .setText(`YOUR STANDING · ${String(label).toUpperCase()} · ${rating}`)
        .setColor(THEME.accent);
    } else {
      this.rankedLine
        .setText('YOUR STANDING · UNPLACED — 5 PLACEMENT MATCHES')
        .setColor(THEME.textFaint);
    }
    this.rankedLine.setVisible(true);
  }

  /**
   * Practice setup summary on the setup button (shared config with Lobby).
   * @returns {void}
   */
  _refreshPracticeSummary() {
    if (!this.setupButton) return;
    const p = this.net?.state?.practice ?? {};
    const name = p.preset === 'custom'
      ? 'CUSTOM'
      : String(p.preset ?? 'beginner').toUpperCase();
    const bots = `${p.botCount ?? 1} BOT${(p.botCount ?? 1) === 1 ? '' : 'S'}`;
    const calm = p.passive ? 'PASSIVE' : `${Math.round((p.graceMs || 0) / 1000)}S CALM`;
    this.setupButton.setLabel(`SETUP: ${name} · ${bots} · ${calm}`);
  }

  /**
   * Connecting / queue / room / failure line beneath the CTA — exactly ONE
   * status, derived from the real state (never sample rows).
   * @returns {void}
   */
  _refreshStatus() {
    if (!this.statusLine) return;
    const state = this.net?.state ?? {};
    const notice = state.notice ?? null;
    let text = '';
    let color = THEME.textDim;
    if (state.busy) {
      text = state.busy === 'queueJoin' ? 'Creating your practice room…' : 'Working…';
      color = THEME.accent;
    } else if (state.queue) {
      text = 'Queued — waiting for match… tap FIND MATCH to cancel.';
      color = THEME.accent;
    } else if (state.room?.roomId) {
      text = 'Room confirmed — entering the arena…';
      color = THEME.success;
    } else if (notice && Date.now() - (notice.at ?? 0) < 15000) {
      text = notice.tone === 'error'
        ? `${notice.text} — tap the button to retry.`
        : String(notice.text);
      color = notice.tone === 'error' ? THEME.danger : THEME.textDim;
    } else if (state.connection !== 'online') {
      text = 'Waiting for the orbital relay…';
      color = THEME.warning;
    }
    this.statusLine.setText(text).setColor(color);
  }

  /**
   * Coming-soon affordance: honest toast, no navigation, no fake screen.
   * @param {string} text
   * @returns {void}
   */
  _soon(text) {
    try {
      this.toasts?.show('info', text);
    } catch {
      /* decorative only */
    }
  }

  // =========================================================================
  // Actions
  // =========================================================================

  /**
   * Route the CTA to the right backend command — the same guards the lobby's
   * ModeSelector uses, so Home and Lobby can never disagree.
   * @returns {Promise<void>}
   */
  async _onPrimary() {
    const state = this.net?.state ?? {};
    const cta = resolveCta(state, CTA_STATES);
    if (!cta.enabled || this._entering) return;

    if (state.queue) {
      await this.net.queueLeave();
      return;
    }
    if (state.party) {
      if (!state.party.isLeader) {
        this.net.setNotice('error', 'Only the party leader can start the match.');
        return;
      }
      await this.net.startPartyMatch();
      return;
    }
    if (state.busy || state.room) return;
    if (state.connection !== 'online') {
      this.net.setNotice?.('error', 'Not connected to the server yet.');
      this._refreshStatus();
      return;
    }
    const res = await this.net.queueJoin();
    this._refreshMode();
    if (res?.ok === false && res?.error === 'ALREADY_IN_MATCH' && this.net.state.room?.roomId) {
      this._enterArena(this.net.state.room);
    }
    // Success: `_enterArena` on `match-ready` owns the transition.
  }

  /**
   * Enter the Arena on server confirmation only.
   * @param {object} room - Normalised room from `match-ready`.
   * @returns {void}
   */
  _enterArena(room) {
    if (this._entering) return;
    if (!room?.roomId) return;
    this._entering = true;
    try {
      this.scene.start(SCENES.ARENA);
    } catch {
      this._entering = false;
    }
  }

  /**
   * Show the name gate. Used both for the first-boot prompt and for the
   * "edit name" affordance on the profile card.
   * @param {boolean} [force] - Show even if a name is already saved.
   * @returns {void}
   */
  _askName(force = false) {
    const skipFlag =
      typeof window !== 'undefined' && window.location.search.includes('skipName');
    if (!force && (skipFlag || loadName())) return;

    this.nameGate?.destroy();
    this.nameGate = new NameGate(this, {
      net: this.net,
      onDone: () => {
        this.net.requestFriends();
        this.nameGate = null;
        this.profile?.refresh();
        this._refreshMode();
        this._refreshStatus();
      },
    });
  }

  /** First-boot name gate. @returns {void} */
  _maybeAskName() {
    this._askName(false);
  }

  /**
   * Ambient update — pointer parallax for the backdrop.
   * @param {number} time
   * @param {number} delta
   * @returns {void}
   */
  update(time, delta) {
    try {
      const pointer = this.input?.activePointer;
      this.backdrop?.update?.(
        delta,
        pointer ? pointer.x : GAME_CONFIG.width / 2,
        pointer ? pointer.y : GAME_CONFIG.height / 2,
      );
    } catch {
      /* decorative only */
    }
  }

  /** Detach every listener and destroy every widget. @returns {void} */
  _teardown() {
    this._offs.forEach((off) => {
      try {
        if (typeof off === 'function') off();
      } catch {
        /* best-effort */
      }
    });
    this._offs = [];
    this.nameGate?.destroy();
    this.nameGate = null;
    try {
      this.backdrop?.destroy();
      this.logo?.destroy();
      this.profile?.destroy();
      this.statusPill?.destroy();
      this.menuButton?.destroy();
      this.currencyPills?.forEach((p) => p.destroy());
      this.navItems?.forEach((b) => b.destroy());
      this.partyPanel?.destroy();
      this.friendsPanel?.destroy?.();
      this.modePanel?.destroy();
      Object.values(this.modeCards ?? {}).forEach((c) => c.destroy());
      Object.values(this.modeCrowns ?? {}).forEach((m) => m.destroy?.());
      this.modeDesc?.destroy();
      this.setupButton?.destroy();
      this.casualBtn?.destroy();
      this.rankedBtn?.destroy();
      this.boardBtn?.destroy();
      this.rankedLine?.destroy();
      this.charButton?.destroy();
      this.statusLine?.destroy();
      this.primary?.destroy();
      this.seasonBg?.destroy();
      this.seasonIcon?.destroy();
      this.seasonTitle?.destroy();
      this.seasonSub?.destroy();
      this.seasonZone?.destroy();
      this.squadBg?.destroy();
      this.squadIcon?.destroy();
      this.squadTitle?.destroy();
      this.squadSub?.destroy();
      this.headerBg?.destroy();
      this.toasts?.clear();
      this.invitePrompt?.destroy?.();
      this.settingsMenu?.destroy();
      this.practiceMenu?.destroy();
      this.characterMenu?.destroy();
      this.boardMenu?.destroy();
    } catch {
      /* best-effort */
    }
  }
}
