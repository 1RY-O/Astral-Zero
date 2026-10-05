/**
 * Astral Zero — LobbyScene (the arcade lobby).
 * =========================================================
 * The screen every player lands on before a match. It owns NO game logic — it
 * is a pure VIEW over `NetworkManager.state`, which is what keeps it correct:
 * every panel re-renders from state, and state only changes because the
 * backend said so.
 *
 * LAYOUT (design surface 1280x720; `Scale.FIT` maps it to the window)
 *
 *   WIDE (>=1024 css px)
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │ LOGO              profile              [status]  [⚙ settings] │  header
 *   ├───┬──────────────────────────────┬────────────────────────────┤
 *   │ N │        PARTY (focus)          │        GAME MODE           │
 *   │ A │                              │   FFA / TDM / BOTS / SCRAP │
 *   │ V │   CREATE PARTY                │                            │
 *   │   │   JOIN WITH CODE              │      [ FIND MATCH ]        │
 *   │   ├──────────────────────────────┤                            │
 *   │   │        FRIENDS                │                            │
 *   └───┴──────────────────────────────┴────────────────────────────┘
 *     overlays: toasts · invite prompt · name gate
 *
 *   MEDIUM (<1024)  → 2 columns, nav collapses to an icon strip.
 *   COMPACT (<640)  → single scrolling column, nav becomes a bottom bar.
 *
 * WIRING
 *  - Subscribes to every `net.on(...)` in `create()` and stores the
 *    unsubscribe handles so `shutdown` detaches ALL of them. Without that the
 *    scene would leak a listener per visit and the second visit would refresh
 *    twice per event.
 *  - `net.on('match-ready')` is the Lobby → Arena transition: by then the
 *    server has sent `room_joined`, so the authoritative roster is already in
 *    `net.state.room` and ArenaScene spawns straight from it.
 *
 * URL FLAGS (dev convenience)
 *  ?skipLobby   boot straight into the arena
 *  ?skipName    bypass the name gate even with no saved name
 *  ?server=URL  point the socket at a different backend origin
 *  ?noLobbyFx   freeze the orbital backdrop (low-end devices / perf checks)
 *  ?debug       physics bodies + net stats
 */

import Phaser from 'phaser';
import { SCENES, GAME_CONFIG } from '../config/gameConfig.js';
import { LOBBY } from '../config/lobbyConfig.js';
import { THEME, FONTS, RADII, MOTION } from '../config/uiTheme.js';
import { DESIGN, LAYOUTS, currentLayout, isTouchPrimary } from '../config/viewportConfig.js';
import { net } from '../net/NetworkManager.js';
import { isLobbySkipped } from '../net/netConfig.js';
import { PartyPanel } from '../ui/lobby/PartyPanel.js';
import { FriendsPanel } from '../ui/lobby/FriendsPanel.js';
import { ModeSelector } from '../ui/lobby/ModeSelector.js';
import { NavRail } from '../ui/lobby/NavRail.js';
import { ProfileCard } from '../ui/lobby/ProfileCard.js';
import { InvitePrompt } from '../ui/lobby/InvitePrompt.js';
import { NameGate, loadName } from '../ui/lobby/NameGate.js';
import { ToastLayer } from '../ui/widgets/ToastLayer.js';
import { Button } from '../ui/widgets/Button.js';
import { Logo } from '../ui/brand/Logo.js';
import { OrbitalBackdrop } from '../ui/brand/OrbitalBackdrop.js';
import { StatusPill } from '../ui/brand/StatusPill.js';
import { SettingsMenu } from '../ui/menus/SettingsMenu.js';
import * as Motion from '../core/Motion.js';

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super(SCENES.LOBBY);
  }

  /**
   * Unsubscribe handles, collected here and released on shutdown.
   * @type {Array<() => void>}
   */
  _offs = [];

  /** @returns {void} */
  create() {
    this.net = net;
    this._offs = [];

    // Follow the OS reduced-motion preference for the whole scene.
    Motion.init();

    // Layout tier is read ONCE here from the live canvas. It determines the
    // structural arrangement (1 vs 2 vs 3 columns), not just cosmetics.
    this.layout = currentLayout(this.scale);
    this.touch = isTouchPrimary(this.scale);

    this.backdrop = new OrbitalBackdrop(this, {
      width: DESIGN.width,
      height: DESIGN.height,
    });
    if (typeof window !== 'undefined' && window.location.search.includes('noLobbyFx')) {
      this.backdrop.setActive(false);
    }

    this._createHeader();
    this._createBody();

    // --- Overlays ----------------------------------------------------------
    this.toasts = new ToastLayer(this, {
      x: DESIGN.width / 2,
      y: DESIGN.height - 24,
      depth: 400,
    });
    this.invitePrompt = new InvitePrompt(this, { net: this.net });

    // The settings menu is a real, working menu (audio, feedback toggles,
    // keybinds) — so the ⚙ nav entry points at something that exists.
    this.settings = new SettingsMenu(this, { depth: 500 });

    this._bindNetwork();
    this._refreshAll();

    // Optional first-boot name gate (skipped when a name is already saved).
    this._maybeAskName();

    // Entrance: stagger the cards so the lobby assembles rather than snapping.
    this._animateEntrance();

    // Stop feeding a dead scene.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this._teardown());

    // `?skipLobby` drops straight into the arena for gameplay iteration.
    if (isLobbySkipped()) this.scene.start(SCENES.ARENA);
  }

  // =========================================================================
  // Static chrome
  // =========================================================================

  /**
   * Header: brand mark on the left, profile in the middle-left, the honest
   * connection pill and a settings button on the right.
   * @returns {void}
   */
  _createHeader() {
    const L = this.layout;
    const m = L.margin;

    // Header plate: a darker band so the top chrome separates from the panels
    // without needing a hard border.
    this.headerBg = this.add.graphics().setScrollFactor(0).setDepth(10);
    const g = this.headerBg;
    g.fillStyle(THEME.bgDeep, 0.92);
    g.fillRect(0, 0, DESIGN.width, L.headerHeight);
    g.lineStyle(2, THEME.accentDeep, 0.35);
    g.beginPath();
    g.moveTo(0, L.headerHeight);
    g.lineTo(DESIGN.width, L.headerHeight);
    g.strokePath();

    this.logo = new Logo(this, {
      x: m + 26,
      y: L.headerHeight / 2,
      size: L.tier === 'compact' ? 40 : 48,
      depth: 12,
      wordmarkSize: L.tier === 'compact' ? 0.7 : 1,
    });

    // Profile sits to the right of the wordmark.
    const profileX = m + (L.tier === 'compact' ? 96 : 178);
    this.profile = new ProfileCard(this, {
      x: profileX,
      y: (L.headerHeight - 52) / 2,
      width: L.tier === 'compact' ? 118 : 168,
      net: this.net,
      depth: 12,
      onRename: () => this._askName(true),
    });

    // The status pill is the single source of truth for "am I actually online".
    this.statusPill = new StatusPill(this, {
      x: DESIGN.width - m - 122,
      y: L.headerHeight / 2,
      net: this.net,
      depth: 12,
      showHint: L.tier === 'wide',
    });

    // A real settings button in the header, so the menu is reachable without
    // knowing the nav rail's keyboard order.
    this.settingsButton = new Button(this, {
      x: DESIGN.width - m - 26,
      y: L.headerHeight / 2,
      width: 40,
      height: 40,
      label: '\u2699',
      skin: 'ghost',
      fontSize: '18px',
      minHeight: L.minTouch,
      depth: 12,
      ariaLabel: 'Open settings',
      onClick: () => this.settings?.show(),
    });
  }

  /**
   * Body: nav rail + the three content panels, arranged by layout tier.
   * @returns {void}
   */
  _createBody() {
    const L = this.layout;
    const m = L.margin;
    const g = L.gutter;
    const top = L.headerHeight + g;
    const bottom = DESIGN.height - m;
    const railW = L.showNavRail ? L.navRailWidth : 0;
    const railGap = L.showNavRail ? g : 0;
    const contentX = m + railW + railGap;
    const contentW = DESIGN.width - contentX - m;
    const contentH = bottom - top;

    // --- Nav rail ----------------------------------------------------------
    this.nav = new NavRail(this, {
      x: m,
      y: top,
      extent: contentH,
      itemSize: railW,
      orientation: L.tier === 'compact' ? 'horizontal' : 'vertical',
      minTouch: L.minTouch,
      depth: 12,
      active: 'play',
      handlers: {
        home: () => this._focus('home'),
        play: () => this._focus('play'),
        friends: () => this._focus('friends'),
        settings: () => this.settings?.show(),
      },
    });

    // --- Columns -----------------------------------------------------------
    if (L.columns === 3) {
      // [party+friends] | [mode]
      const leftW = Math.round(contentW * 0.5);
      const rightW = contentW - leftW - g;
      const partyH = Math.round(contentH * 0.58);

      this.partyPanel = new PartyPanel(this, {
        x: contentX,
        y: top,
        width: leftW,
        height: partyH,
        net: this.net,
      });

      this.friendsPanel = new FriendsPanel(this, {
        x: contentX,
        y: top + partyH + g,
        width: leftW,
        height: contentH - partyH - g,
        net: this.net,
      });

      this.modeSelector = new ModeSelector(this, {
        x: contentX + leftW + g,
        y: top,
        width: rightW,
        height: contentH,
        net: this.net,
        minTouch: L.minTouch,
        onSpectate: () => this._joinAsSpectator(),
      });
    } else {
      // 1 or 2 columns: mode selector on top, party + friends below.
      const modeH = Math.round(contentH * 0.52);
      this.modeSelector = new ModeSelector(this, {
        x: contentX,
        y: top,
        width: contentW,
        height: modeH,
        net: this.net,
        minTouch: L.minTouch,
        onSpectate: () => this._joinAsSpectator(),
      });

      const lowerTop = top + modeH + g;
      const lowerH = bottom - lowerTop;
      if (L.columns === 2) {
        const half = Math.round(contentW / 2);
        this.partyPanel = new PartyPanel(this, {
          x: contentX,
          y: lowerTop,
          width: half - Math.round(g / 2),
          height: lowerH,
          net: this.net,
        });
        this.friendsPanel = new FriendsPanel(this, {
          x: contentX + half + Math.round(g / 2),
          y: lowerTop,
          width: half - Math.round(g / 2),
          height: lowerH,
          net: this.net,
        });
      } else {
        // Compact: stack party over friends, each half the remaining height.
        const half = Math.round(lowerH / 2);
        this.partyPanel = new PartyPanel(this, {
          x: contentX,
          y: lowerTop,
          width: contentW,
          height: half - Math.round(g / 2),
          net: this.net,
        });
        this.friendsPanel = new FriendsPanel(this, {
          x: contentX,
          y: lowerTop + half + Math.round(g / 2),
          width: contentW,
          height: half - Math.round(g / 2),
          net: this.net,
        });
      }
    }
  }

  /**
   * Stagger the panels in. Under reduced motion this is a no-op that simply
   * leaves everything visible (Motion.enter lands on the final state).
   * @returns {void}
   */
  _animateEntrance() {
    const cards = [this.partyPanel, this.friendsPanel, this.modeSelector];
    cards.forEach((panel, i) => {
      if (!panel) return;
      const target = panel.panel ?? panel;
      target?.enter?.(i * MOTION.stagger);
    });
  }

  // =========================================================================
  // Nav behaviour
  // =========================================================================

  /**
   * Route selections focus a panel. There is no page router, because there
   * are no pages — the nav expresses the lobby's own structure, and picking
   * PLAY/FRIENDS draws the eye (and keyboard focus) to that panel.
   *
   * @param {'home'|'play'|'friends'} id
   * @returns {void}
   */
  _focus(id) {
    if (id === 'play') this.modeSelector?.primary?.setFocused(true);
    // FRIENDS has no focusable control to jump to (the add-friend field is
    // the only input, and it is already visible), so the nav entry simply
    // marks itself active without stealing focus.
    else {
      // HOME returns focus to the brand/primary entry point.
      this.nav?.setActive('play');
    }
  }

  // =========================================================================
  // Network wiring
  // =========================================================================

  /**
   * Subscribe to every NetworkManager event this scene renders from.
   * @returns {void}
   */
  _bindNetwork() {
    const refresh = () => this._refreshAll();

    this._offs.push(this.net.on('connection', refresh));
    this._offs.push(this.net.on('player', refresh));
    this._offs.push(this.net.on('party', refresh));
    this._offs.push(this.net.on('friends', refresh));
    this._offs.push(this.net.on('mode', refresh));
    this._offs.push(this.net.on('busy', refresh));
    this._offs.push(this.net.on('queue', () => this.modeSelector?.refreshQueue()));

    // Notices become toasts. This is the ONLY place error wording is shown,
    // so the phrasing stays in src/net/events.js → describeError.
    this._offs.push(
      this.net.on('notice', (notice) => {
        if (notice) this.toasts.show(notice.tone, notice.text);
      }),
    );

    // Incoming party invite → modal prompt.
    this._offs.push(
      this.net.on('invite', ({ invite }) => {
        if (invite) this.invitePrompt.present(invite);
        else this.invitePrompt.setVisible(false);
      }),
    );

    // ★ The Lobby → Arena transition. The authoritative roster is already in
    // `net.state.room` when this fires, so ArenaScene just reads it.
    this._offs.push(
      this.net.on('match-ready', () => {
        this.toasts.show('info', 'Match found — loading arena…', { durationMs: 1500 });
        this.time.delayedCall(220, () => this.scene.start(SCENES.ARENA));
      }),
    );
  }

  /**
   * Re-render every panel from current state.
   * @returns {void}
   */
  _refreshAll() {
    this.statusPill?.refresh();
    this.profile?.refresh();
    this.partyPanel?.refresh();
    this.friendsPanel?.refresh();
    this.modeSelector?.refresh();
    this.modeSelector?.refreshQueue();
  }

  /**
   * Join the offered room as a SPECTATOR (Phase 5).
   * @returns {Promise<void>}
   */
  async _joinAsSpectator() {
    const offer = this.net.state.spectateOffer;
    this.net.state.spectateOffer = null;
    if (!offer) return;

    this.toasts?.show('info', 'Joining as a spectator…');
    const res = await this.net.lateJoin({ roomId: offer.roomId ?? undefined });
    if (res?.ok === false) {
      this.toasts?.show(
        'error',
        res?.error === 'ROOM_FULL'
          ? 'The spectator booth is full too.'
          : 'Could not join that match as a spectator.',
      );
    }
    this.modeSelector?.refresh();
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
        this._refreshAll();
      },
    });
  }

  /**
   * First-boot name gate (only when nothing is saved and `?skipName` is absent).
   * @returns {void}
   */
  _maybeAskName() {
    this._askName(false);
  }

  // =========================================================================
  // Per-frame
  // =========================================================================

  /**
   * Ambient update. The pointer drives backdrop parallax, which is what makes
   * the orbital background feel like it has depth rather than being a flat
   * wallpaper.
   * @param {number} time
   * @param {number} delta
   * @returns {void}
   */
  update(time, delta) {
    const pointer = this.input?.activePointer;
    this.backdrop?.update(
      delta,
      pointer ? pointer.x : DESIGN.width / 2,
      pointer ? pointer.y : DESIGN.height / 2,
    );
  }

  // =========================================================================
  // Teardown
  // =========================================================================

  /**
   * Detach every listener and destroy every widget. Without this each lobby
   * visit adds another handler set and the UI refreshes N times per event on
   * the second visit.
   * @returns {void}
   */
  _teardown() {
    this._offs.forEach((off) => off());
    this._offs = [];
    this.nameGate?.destroy();
    this.nameGate = null;
    this.toasts?.clear();
    this.settings?.destroy();
    this.backdrop?.destroy();
    this.logo?.destroy();
    this.statusPill?.destroy();
    this.profile?.destroy();
    this.nav?.destroy();
    this.partyPanel?.destroy();
    this.friendsPanel?.destroy();
    this.modeSelector?.destroy();
    this.invitePrompt?.destroy?.();
    this.settingsButton?.destroy();
  }
}

export default LobbyScene;
