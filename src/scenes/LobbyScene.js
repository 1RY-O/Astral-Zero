/**
 * Astral Zero — LobbyScene (Phase 2 entry point).
 * ===========================================================
 * The screen every player lands on before a match. It owns NO game logic — it
 * is a pure VIEW over `NetworkManager.state`, which is what keeps it correct:
 * every panel re-renders from state, and state only changes because the
 * backend said so.
 *
 * LAYOUT (1280x720 design space, Scale.FIT handles the rest)
 *
 *   ┌──────────── header: title · connection status pill ─────────────┐
 *   │  [party 380]  [friends 380]   [mode selector (rest)]            │
 *   └──────── overlays: toasts · invite prompt · name gate ───────────┘
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
 */

import Phaser from 'phaser';
import { SCENES, GAME_CONFIG } from '../config/gameConfig.js';
import { LOBBY } from '../config/lobbyConfig.js';
import { THEME, FONTS } from '../config/uiTheme.js';
import { net } from '../net/NetworkManager.js';
import { isLobbySkipped } from '../net/netConfig.js';
import { PartyPanel } from '../ui/lobby/PartyPanel.js';
import { FriendsPanel } from '../ui/lobby/FriendsPanel.js';
import { ModeSelector } from '../ui/lobby/ModeSelector.js';
import { InvitePrompt } from '../ui/lobby/InvitePrompt.js';
import { NameGate, loadName } from '../ui/lobby/NameGate.js';
import { ToastLayer } from '../ui/widgets/ToastLayer.js';

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

    this._createBackdrop();
    this._createHeader();

    // --- Panel geometry ---------------------------------------------------
    const top = LOBBY.headerHeight + LOBBY.gutter;
    const bottom = GAME_CONFIG.height - LOBBY.margin;
    const colH = bottom - top;
    const colW = 380;
    const margin = LOBBY.margin;

    this.partyPanel = new PartyPanel(this, {
      x: margin,
      y: top,
      width: colW,
      height: colH,
      net: this.net,
    });

    this.friendsPanel = new FriendsPanel(this, {
      x: margin + colW + LOBBY.gutter,
      y: top,
      width: colW,
      height: colH,
      net: this.net,
    });

    const modeX = margin * 2 + colW * 2 + LOBBY.gutter * 2;
    this.modeSelector = new ModeSelector(this, {
      x: modeX,
      y: top,
      width: GAME_CONFIG.width - modeX - margin,
      height: colH,
      net: this.net,
      // Phase 5: the server offers the spectator booth when a room is full.
      onSpectate: () => this._joinAsSpectator(),
    });

    // --- Overlays ----------------------------------------------------------
    this.toasts = new ToastLayer(this, { x: GAME_CONFIG.width / 2, y: GAME_CONFIG.height - 24 });
    this.invitePrompt = new InvitePrompt(this, { net: this.net });

    this._bindNetwork();
    this._refreshAll();

    // Optional first-boot name gate (skipped when a name is already saved).
    this._maybeAskName();

    // Stop feeding a dead scene.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this._teardown());

    // `?skipLobby` drops straight into the arena for gameplay iteration.
    if (isLobbySkipped()) this.scene.start(SCENES.ARENA);
  }

  // =========================================================================
  // Static chrome
  // =========================================================================

  /**
   * Starfield behind the UI. Same deterministic scatter approach as the arena
   * so both scenes feel like the same game.
   * @returns {void}
   */
  _createBackdrop() {
    this.add
      .rectangle(
        GAME_CONFIG.width / 2,
        GAME_CONFIG.height / 2,
        GAME_CONFIG.width,
        GAME_CONFIG.height,
        THEME.bg,
      )
      .setScrollFactor(0)
      .setDepth(-20);

    const rand = new Phaser.Math.RandomDataGenerator(['astral-zero-lobby']);
    for (let i = 0; i < 120; i += 1) {
      const size = rand.between(1, 3);
      this.add
        .rectangle(
          rand.between(0, GAME_CONFIG.width),
          rand.between(0, GAME_CONFIG.height),
          size,
          size,
          0xffffff,
          rand.realInRange(0.08, 0.35),
        )
        .setScrollFactor(0)
        .setDepth(-19);
    }
  }

  /**
   * Title bar + connection status pill (repainted by `_paintStatus`).
   * @returns {void}
   */
  _createHeader() {
    this.add
      .text(LOBBY.margin, 22, 'ASTRAL ZERO', { ...FONTS.title, fontSize: '26px' })
      .setScrollFactor(0)
      .setDepth(20);

    this.add
      .text(LOBBY.margin, 52, 'LOBBY  ·  phase 2', { ...FONTS.tiny })
      .setScrollFactor(0)
      .setDepth(20);

    this.statusBg = this.add.graphics().setScrollFactor(0).setDepth(20);
    this.statusText = this.add
      .text(GAME_CONFIG.width - LOBBY.margin - 12, 34, 'CONNECTING', { ...FONTS.small, fontSize: '13px' })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(21);

    this._paintStatus();
  }

  /**
   * Repaint the status pill from `net.state`. Three states matter to a player:
   * offline (can't do anything), connecting, and online-but-old-backend (the
   * buttons would silently fail because the Phase 2 events do not exist).
   * @returns {void}
   */
  _paintStatus() {
    const state = this.net.state;

    const label =
      state.connection === 'online'
        ? state.contractOk === false
          ? 'ONLINE · OLD BACKEND'
          : 'ONLINE'
        : state.connection === 'connecting'
          ? 'CONNECTING…'
          : 'OFFLINE';

    const colour =
      state.connection !== 'online'
        ? THEME.danger
        : state.contractOk === false
          ? THEME.warning
          : THEME.success;

    const width = Math.max(150, this.statusText.width + 34);
    const x = GAME_CONFIG.width - LOBBY.margin - 12 - width;

    this.statusBg.clear();
    this.statusBg.fillStyle(0x0b1424, 0.9);
    this.statusBg.fillRoundedRect(x, 22, width, 24, 12);
    this.statusBg.lineStyle(1, Phaser.Display.Color.HexStringToColor(colour).color, 0.9);
    this.statusBg.strokeRoundedRect(x, 22, width, 24, 12);

    this.statusText.setText(label).setColor(colour).setPosition(x + width - 12, 34);
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
    this._offs.push(this.net.on('queue', () => this.modeSelector.refreshQueue()));

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
        // A short beat so the toast is actually readable before the cut.
        this.time.delayedCall(220, () => this.scene.start(SCENES.ARENA));
      }),
    );
  }

  /**
   * Re-render every panel from current state.
   * @returns {void}
   */
  _refreshAll() {
    this._paintStatus();
    this.partyPanel?.refresh();
    this.friendsPanel?.refresh();
    this.modeSelector?.refresh();
    this.modeSelector?.refreshQueue();
  }

  /**
   * Join the offered room as a SPECTATOR (Phase 5).
   *
   * The server already told us the booth may have space (`canSpectate`), so this
   * just retries `room_join` for that room. A spectator has no body: the server
   * drops their input packets and nothing can damage them, which makes watching
   * a full match a safe option.
   *
   * The offer is cleared either way — a stale hint pointing at a finished room
   * would let the player click into a room that no longer exists.
   *
   * @returns {Promise<void>}
   */
  async _joinAsSpectator() {
    const offer = this.net.state.spectateOffer;
    this.net.state.spectateOffer = null;
    if (!offer) return;

    this.toasts?.show('info', 'Joining as a spectator\u2026');
    const res = await this.net.lateJoin({ roomId: offer.roomId ?? undefined });
    if (res?.ok === false) {
      this.toasts?.show(
        'error',
        res?.error === 'ROOM_FULL'
          ? 'The spectator booth is full too.'
          : 'Could not join that match as a spectator.',
      );
    }
  }

  /**
   * Show the name gate the first time (no saved name, no `?skipName`).
   * @returns {void}
   */
  _maybeAskName() {
    const skipFlag =
      typeof window !== 'undefined' && window.location.search.includes('skipName');
    if (skipFlag || loadName()) return;

    this.nameGate = new NameGate(this, {
      net: this.net,
      onDone: () => {
        this.net.requestFriends();
        this._refreshAll();
      },
    });
  }

  // =========================================================================
  // Teardown
  // =========================================================================

  /**
   * Detach every listener. Critical: without this each lobby visit adds another
   * handler set and the UI refreshes N times per event on the second visit.
   * @returns {void}
   */
  _teardown() {
    this._offs.forEach((off) => off());
    this._offs = [];
    this.nameGate?.destroy();
    this.toasts?.clear();
  }
}

export default LobbyScene;
