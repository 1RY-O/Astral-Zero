/**
 * Astral Zero — NetworkManager (game-facing networking facade).
 * ============================================================
 * ONE module owns all lobby/match state for the whole client. Scenes never
 * touch SocketClient directly: they read `net.state` and call the intent
 * methods (`createParty`, `joinParty`, …). That gives us a single place to
 * normalise payloads, surface errors and drive UI refreshes.
 *
 * STATE SHAPE (`net.state`)
 *   connection   'offline' | 'connecting' | 'online'
 *   contractOk   boolean|null — backend implements the Phase 2 lobby events
 *   localId      string        — our socket id (= player.id server-side)
 *   player       { id, name }
 *   party        normalised party or null
 *   friends      normalised friend list
 *   queue        { mode, position, playersInQueue } | null
 *   room         normalised room (after `room_joined`)
 *   selectedMode 'ffa' | 'tdm' | 'bot_practice'
 *   busy         string|null  — label of an in-flight command
 *   notice       { tone, text } | null
 *
 * EVENTS (subscribe with `net.on(...)`; each returns an unsubscribe fn)
 *   'connection'  'player'   'party'    'friends'  'queue'  'mode'
 *   'busy'        'notice'   'invite'   'room'     'error'
 *   'match-ready' { room }   → LobbyScene switches to the Arena
 *   'match-state' { phase, payload } → Arena HUD
 *   'match-ended' { … }      → return to lobby
 *
 * Every method is safe to call before the socket connects: it resolves to a
 * graceful `{ ok:false, code:'OFFLINE' }` rather than throwing.
 */

import { Emitter } from '../core/Emitter.js';
import { SocketClient } from './SocketClient.js';
import { NET_EVENTS, LOBBY_CONTRACT_EVENTS, describeError } from './events.js';
import { DEFAULT_MODE } from '../config/lobbyConfig.js';
import {
  normaliseParty,
  normaliseFriends,
  normaliseRoom,
  normaliseMode,
  normalisePartyCode,
  validatePartyCode,
  describeProtection,
} from './MatchModel.js';
import { resolveApiUrl, resolveServerUrl } from './netConfig.js';

/** Friendly janitor names for players who skip the name gate. */
const DEFAULT_NAMES = [
  'MopLord42', 'Dust Bunny', 'Sir Mops-A-Lot', 'Scrapheap Steve',
  'Orbit Orphan', 'Void Gremlin', 'Captain Clutter', 'Bin Chicken',
];

export class NetworkManager extends Emitter {
  /**
   * @param {{socket?: SocketClient}} [options]
   */
  constructor({ socket = null } = {}) {
    super();

    this.socket = socket ?? new SocketClient({ url: resolveServerUrl() });

    /** @type {object} Single source of truth for lobby/match UI. */
    this.state = {
      connection: 'offline',
      contractOk: null, // null = not yet known
      localId: null,
      player: null,
      party: null,
      friends: [],
      queue: null,
      room: null,
      selectedMode: DEFAULT_MODE,
      busy: null,
      notice: null,
      // Phase 5: set when a full room offered us the spectator booth.
      spectateOffer: null,
      // Phase 4: true while we are trying to re-acquire a dropped match.
      reconnecting: false,
      // True once the server confirms we were re-seated into a live room.
      rejoined: false,
    };

    /** Party invite addressed to US (from `party_invited`). */
    this.pendingInvite = null;

    this._bindSocket();
  }

  // =========================================================================
  // Commands — every one returns a Promise that always resolves
  // =========================================================================
  /**
   * Wrap a command with busy-state tracking + unified error surfacing.
   *
   * @param {string} label - Busy label shown by the UI.
   * @param {() => Promise<object>} run
   * @param {{successMessage?: string}} [opts]
   * @returns {Promise<object>}
   */
  /**
   * Late-join a live match (Phase 5).
   *
   * Phase 5 changed one thing that matters to the lobby: when a room is FULL the
   * server no longer just answers `ROOM_FULL`, it adds `canSpectate: true` so the
   * UI can offer the spectator booth in one click (up to `maxSpectators`).
   *
   * That hint is preserved on the result and republished as a `spectate-offer`
   * event, so the lobby does not have to know that a failed join is actually an
   * opportunity. A spectator has no body: their input is dropped by the server
   * and they cannot be hit.
   *
   * @param {object} [query] - `{}` | `{ roomId }` | `{ mode }`.
   * @returns {Promise<object>} Always settles; includes `canSpectate`.
   */
  lateJoin(query = {}) {
    return this._command('lateJoin', async () => {
      const res = await this.socket.request(NET_EVENTS.ROOM_JOIN, query);
      if (res?.ok === false && res.canSpectate) {
        this.state.spectateOffer = {
          roomId: res.roomId ?? query.roomId ?? null,
          mode: res.mode ?? query.mode ?? null,
        };
        this.emit('spectate-offer', this.state.spectateOffer);
      }
      return res;
    });
  }

  async _command(label, run, { successMessage = null } = {}) {
    // One command at a time: prevents double-click party spam and keeps the
    // busy indicator meaningful.
    if (this.state.busy) return { ok: false, error: 'BUSY' };
    this.state.busy = label;
    this.emit('busy', { busy: label });

    try {
      const res = await run();
      if (res?.ok === false) this.setNotice('error', describeError(res));
      else if (successMessage) this.setNotice('success', successMessage);
      return res;
    } catch (err) {
      console.error(`[NetworkManager] ${label} failed:`, err);
      this.setNotice('error', 'Unexpected error — check the console.');
      return { ok: false, error: 'CLIENT_ERROR', message: String(err?.message || err) };
    } finally {
      this.state.busy = null;
      this.emit('busy', { busy: null });
    }
  }

  /**
   * Push a transient message into `state.notice` (rendered by ToastLayer).
   * @param {'info'|'success'|'error'} tone
   * @param {string} text
   * @returns {void}
   */
  setNotice(tone, text) {
    this.state.notice = { tone, text, at: Date.now() };
    this.emit('notice', this.state.notice);
  }

  /**
   * Choose the mode for the next match. Local-only until the match starts —
   * the server receives it on `queue_join` / `party_start_match`.
   * @param {string} mode
   * @returns {string} The normalised mode.
   */
  setMode(mode) {
    this.state.selectedMode = normaliseMode(mode);
    this.emit('mode', { mode: this.state.selectedMode });
    return this.state.selectedMode;
  }

  // --- Party ---------------------------------------------------------------

  /**
   * Create a party (caller becomes leader). The server replies with a
   * `party_update` push, so we deliberately do NOT synthesise local state.
   * @returns {Promise<{ok: boolean}>}
   */
  createParty() {
    return this._command('createParty', () => this.socket.request(NET_EVENTS.PARTY_CREATE, {}));
  }

  /**
   * Join a party by its 6-character code.
   * @param {string} code
   * @returns {Promise<{ok: boolean}>}
   */
  joinParty(code) {
    const clean = normalisePartyCode(code);
    const check = validatePartyCode(clean);
    if (!check.valid) {
      this.setNotice('error', check.reason);
      return Promise.resolve({ ok: false, error: 'INVALID_CODE' });
    }
    return this._command('joinParty', () => this.socket.request(NET_EVENTS.PARTY_JOIN, { code: clean }));
  }

  /**
   * Leave the current party.
   * @returns {Promise<{ok: boolean}>}
   */
  leaveParty() {
    return this._command('leaveParty', () => this.socket.request(NET_EVENTS.PARTY_LEAVE, {}));
  }

  /**
   * Leader-only: start a match for the whole party.
   * @returns {Promise<{ok: boolean}>}
   */
  startPartyMatch() {
    if (!this.state.party?.isLeader) {
      this.setNotice('error', 'Only the party leader can start the match.');
      return Promise.resolve({ ok: false, error: 'NOT_LEADER' });
    }
    return this._command(
      'startPartyMatch',
      async () => {
        const res = await this.socket.request(NET_EVENTS.PARTY_START_MATCH, {
          mode: this.state.selectedMode,
        });
        if (res.ok && res.firstMatchProtection) {
          const protection = describeProtection(res);
          if (protection.message) this.setNotice('info', protection.message);
        }
        return res;
      },
      { successMessage: 'Starting match…' },
    );
  }

  /**
   * Invite a friend into our party (requires being in one).
   * @param {{id: string, name: string}} friend
   * @returns {Promise<{ok: boolean}>}
   */
  inviteFriend(friend) {
    if (!this.state.party) {
      this.setNotice('error', 'Create or join a party before inviting friends.');
      return Promise.resolve({ ok: false, error: 'NOT_IN_PARTY' });
    }
    if (this.state.party.isFull) {
      this.setNotice('error', 'Your party is already full.');
      return Promise.resolve({ ok: false, error: 'PARTY_FULL' });
    }
    return this._command(
      'inviteFriend',
      () => this.socket.request(NET_EVENTS.PARTY_INVITE, { friendId: friend.id }),
      { successMessage: `Invited ${friend.name}.` },
    );
  }

  /**
   * Accept an incoming party invite by joining the code it carried.
   * @param {string} [code] - Defaults to the pending invite's code.
   * @returns {Promise<{ok: boolean}>}
   */
  acceptInvite(code = null) {
    const target = code ?? this.pendingInvite?.code;
    this.pendingInvite = null;
    this.emit('invite', { invite: null });
    return this.joinParty(target);
  }

  /** Dismiss an incoming invite without joining. @returns {void} */
  declineInvite() {
    this.pendingInvite = null;
    this.emit('invite', { invite: null });
  }


  // =========================================================================
  // Socket wiring
  // =========================================================================

  /**
   * Subscribe to every socket event this client cares about.
   * @returns {void}
   */
  _bindSocket() {
    const s = this.socket;

    s.onInternal('status', (status) => {
      const wasOffline = this.state.connection !== 'online';
      this.state.connection = status;
      // A fresh connection needs a fresh identity (socket.id may have changed).
      if (status === 'online') this._registerIdentity();
      this.emit('connection', { connection: status, contractOk: this.state.contractOk });

      // Phase 4: dropping mid-match is recoverable. The server stashes the
      // seat for 60 s, so we surface a "reconnecting" state that the HUD can
      // show, and remember we were in a match so we can tell the player what
      // the reconnect is trying to restore.
      if (status !== 'online' && this.state.room) {
        this.state.reconnecting = true;
        this.setNotice('warn', 'Connection lost — reconnecting to the match…');
      } else if (status === 'online' && wasOffline) {
        this.emit('reconnected', { rejoined: this.state.rejoined === true });
      }
    });

    s.onInternal('identity', (player) => this._setPlayer(player));

    // Phase 4: the `player_join` ack tells us we were re-seated into a live
    // room. The catch-up (room_joined + match_state + score_update) follows on
    // its own, so we only record the flag and let the scene react.
    s.onInternal('rejoined', ({ rejoined, roomId } = {}) => {
      this.state.rejoined = Boolean(rejoined);
      if (rejoined) {
        this.state.reconnecting = false;
        this.setNotice('info', `Reconnected to ${roomId ?? 'your match'}.`);
        this.emit('reconnected', { rejoined: true, roomId });
      }
    });

    s.on(NET_EVENTS.CONNECTED, (info = {}) => this._probeContract(info));

    // --- Party --------------------------------------------------------------
    s.on(NET_EVENTS.PARTY_UPDATE, ({ party } = {}) => {
      this.state.party = normaliseParty(party, this.state.localId);
      this.emit('party', { party: this.state.party });
      // Leaving a party must also drop any queue we were in.
      if (!this.state.party) this.state.queue = null;
    });

    s.on(NET_EVENTS.PARTY_INVITED, (invite = {}) => {
      this.pendingInvite = {
        code: normalisePartyCode(invite.partyCode),
        fromId: invite.fromId ?? null,
        fromName: invite.fromName ?? 'A janitor',
        memberCount: invite.memberCount ?? 1,
        receivedAt: Date.now(),
      };
      this.setNotice('info', `${this.pendingInvite.fromName} invited you to party ${this.pendingInvite.code}.`);
      this.emit('invite', { invite: this.pendingInvite });
    });

    // --- Friends ------------------------------------------------------------
    s.on(NET_EVENTS.FRIEND_UPDATE, ({ friends } = {}) => {
      this.state.friends = normaliseFriends(friends);
      this.emit('friends', { friends: this.state.friends });
    });

    // --- Matchmaking --------------------------------------------------------
    s.on(NET_EVENTS.QUEUE_UPDATE, (payload = {}) => {
      // A payload without a mode means we are no longer queued.
      this.state.queue = payload.mode
        ? {
            mode: normaliseMode(payload.mode),
            position: payload.position ?? null,
            playersInQueue: payload.playersInQueue ?? null,
          }
        : null;
      this.emit('queue', { queue: this.state.queue });
    });

    // `match_found` alone is NOT enough to spawn — it only carries ids. The
    // authoritative roster follows on `room_joined` a moment later.
    s.on(NET_EVENTS.MATCH_FOUND, (payload = {}) => {
      this.setNotice('info', `Match found — ${normaliseMode(payload.mode).toUpperCase()} loading…`);
      this.emit('match-found-hint', payload);
    });

    s.on(NET_EVENTS.ROOM_JOINED, ({ room } = {}) => this._onRoomManifest(room));
    s.on(NET_EVENTS.ROOM_UPDATE, ({ room } = {}) => {
      if (this.state.room) this._onRoomManifest(room, { silent: true });
    });

    s.on(NET_EVENTS.MATCH_STATE, (payload = {}) => {
      // The countdown payload also carries the roster; adopt it if we never
      // saw `room_joined` (defensive against event reordering).
      if (!this.state.room && payload.players?.length) {
        this._onRoomManifest(payload, { silent: true });
      }
      if (payload.phase) this.emit('match-state', { phase: payload.phase, payload });
    });

    s.on(NET_EVENTS.MATCH_END, (payload = {}) => {
      this.state.room = null;
      this.state.queue = null;
      this.emit('match-ended', payload);
    });

    // --- Errors -------------------------------------------------------------
    s.on(NET_EVENTS.ERROR, (payload = {}) => {
      this.setNotice('error', describeError(payload));
      this.emit('error', payload);
    });
  }

  // =========================================================================
  // Lifecycle (connect / disconnect / reset)
  // =========================================================================

  /**
   * Open the socket connection. Safe to call twice.
   * @returns {void}
   */
  connect() {
    this.state.connection = 'connecting';
    this.emit('connection', { connection: this.state.connection, contractOk: this.state.contractOk });
    this.socket.connect();
  }

  /**
   * Close the socket connection.
   * @returns {void}
   */
  disconnect() {
    this.socket.disconnect();
    this.state.connection = 'offline';
    this.emit('connection', { connection: this.state.connection, contractOk: this.state.contractOk });
  }

  /**
   * Identify the player to the backend (`player_join`).
   * The server keys party / friends / queue state by this name.
   * @param {string} name
   * @returns {void}
   */
  setPlayerName(name) {
    const clean = String(name || '').trim().slice(0, 24) || 'Janitor';
    this.socket.announcePlayer({ name: clean });
    // Optimistic local echo; the server ack (`identity`) confirms it.
    this._setPlayer({ id: this.socket.id, name: clean });
  }

  /**
   * Explicit friends refresh (`friend_list` → `friend_update` push).
   * @returns {Promise<{ok: boolean}>}
   */
  requestFriends() {
    return this._command('requestFriends', () =>
      this.socket.request(NET_EVENTS.FRIEND_LIST, {}),
    );
  }

  /**
   * Add a friend by display name or live socket id.
   * @param {string} query - Name or id typed by the player.
   * @returns {Promise<{ok: boolean}>}
   */
  addFriend(query) {
    const clean = String(query || '').trim();
    if (!clean) {
      this.setNotice('error', 'Enter a friend name or ID.');
      return Promise.resolve({ ok: false, error: 'MISSING_FRIEND' });
    }
    return this._command(
      'addFriend',
      () => this.socket.request(NET_EVENTS.FRIEND_ADD, { friendName: clean, friendId: clean }),
      { successMessage: `Added ${clean}.` },
    );
  }

  /**
   * Remove a friend (idempotent server-side).
   * @param {{id: string, name: string}} friend
   * @returns {Promise<{ok: boolean}>}
   */
  removeFriend(friend) {
    return this._command(
      'removeFriend',
      () => this.socket.request(NET_EVENTS.FRIEND_REMOVE, { friendId: friend?.id, friendName: friend?.name }),
    );
  }

  /**
   * Solo queue for a mode. Server may force Bot Practice on first match.
   * @returns {Promise<{ok: boolean}>}
   */
  queueJoin() {
    return this._command(
      'queueJoin',
      async () => {
        const res = await this.socket.request(NET_EVENTS.QUEUE_JOIN, {
          mode: this.state.selectedMode,
          mapId: 'junkyard',
        });
        if (res.ok && res.firstMatchProtection) {
          const protection = describeProtection(res);
          if (protection.message) this.setNotice('info', protection.message);
        }
        return res;
      },
      { successMessage: 'Queued — waiting for match…' },
    );
  }

  /**
   * Leave the solo queue.
   * @returns {Promise<{ok: boolean}>}
   */
  queueLeave() {
    return this._command('queueLeave', () => this.socket.request(NET_EVENTS.QUEUE_LEAVE, {}));
  }

  /**
   * Leave the current room (back to lobby).
   * @returns {Promise<{ok: boolean}>}
   */
  leaveRoom() {
    this.state.room = null;
    this.emit('room', { room: null });
    return this._command('leaveRoom', () => this.socket.request(NET_EVENTS.ROOM_LEAVE, {}));
  }

  /**
   * Ask the server to finish the match early (results come back on `match_end`).
   * @param {string} [reason]
   * @returns {Promise<{ok: boolean}>}
   */
  endMatch(reason = 'manual') {
    return this._command('endMatch', () => this.socket.request(NET_EVENTS.MATCH_END, { reason }));
  }

  /**
   * Drop all lobby state (used in tests / full resets).
   * @returns {void}
   */
  reset() {
    this.state.party = null;
    this.state.friends = [];
    this.state.queue = null;
    this.state.room = null;
    this.state.busy = null;
    this.state.notice = null;
    this.pendingInvite = null;
    this.removeAllListeners();
    this._bindSocket();
  }

  // =========================================================================
  // Handshake / capability probe
  // =========================================================================

  /**
   * Ask `/api/info` which socket events this backend supports.
   *
   * The lobby is unusable against a Phase 1 backend, so instead of letting
   * every button fail we probe once and surface a clear "backend too old"
   * notice.
   *
   * @param {object} [welcome] - The `connected` welcome packet.
   * @returns {Promise<void>}
   */
  async _probeContract(welcome = {}) {
    let supported = null;

    try {
      const res = await fetch(resolveApiUrl('/api/info'), { cache: 'no-store' });
      if (res.ok) {
        const info = await res.json();
        if (Array.isArray(info.supportedSocketEvents)) supported = info.supportedSocketEvents;
      }
    } catch {
      // Same-origin probe failed (backend unreachable) — fall through.
    }

    // Fall back to the welcome packet's version when /api/info is unavailable.
    const version = welcome.socketEventsVersion ?? this.socket.serverInfo?.socketEventsVersion;

    if (Array.isArray(supported)) {
      this.state.contractOk = LOBBY_CONTRACT_EVENTS.every((evt) => supported.includes(evt));
      if (!this.state.contractOk) {
        this.setNotice('error', 'Connected backend does not support the lobby (Phase 2 contract missing).');
      }
    } else if (typeof version === 'string') {
      // '1.1.0-phase2' → starts with '1.1'
      this.state.contractOk = version.startsWith('1.1');
      if (!this.state.contractOk) {
        this.setNotice('error', `Backend contract ${version} is older than this client expects.`);
      }
    }

    this.emit('connection', { connection: this.state.connection, contractOk: this.state.contractOk });

    // Only ask for data once we believe the backend understands the request.
    if (this.state.contractOk !== false) this.requestFriends();
  }

  /**
   * Send `player_join` so the server can key our party/friends/queue by name.
   * @returns {void}
   */
  _registerIdentity() {
    const name = this.state.player?.name ?? this._randomName();
    this.socket.announcePlayer({ name });
  }

  /** @returns {string} A random friendly default name. */
  _randomName() {
    return DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)];
  }

  /**
   * @param {object} player - Server `player` object.
   * @returns {void}
   */
  _setPlayer(player = {}) {
    this.state.player = {
      id: player.id ?? this.socket.id,
      name: player.name ?? 'Janitor',
    };
    // The server uses player.id === socket.id in every party/room reference.
    this.state.localId = this.state.player.id ?? this.socket.id;
    this.emit('player', { player: this.state.player });
  }

  /**
   * Adopt an authoritative roster and tell the LobbyScene to switch scenes.
   *
   * @param {object} room - Raw room from `room_joined`.
   * @param {{silent?: boolean}} [opts] - silent = roster refresh only.
   * @returns {void}
   */
  _onRoomManifest(room, { silent = false } = {}) {
    const normalised = normaliseRoom({ room }, { localPlayerId: this.state.localId });
    if (!normalised || (!normalised.players.length && !normalised.bots.length)) return;

    this.state.room = normalised;
    this.state.queue = null;
    this.emit('room', { room: normalised });

    // Only the first manifest triggers the LobbyScene → ArenaScene switch.
    if (!silent) this.emit('match-ready', { room: normalised });
  }
}

/**
 * Shared singleton used by every scene. Import it rather than constructing
 * your own NetworkManager so party/friends/match state stays in one place:
 *
 *   import { net } from '../net/NetworkManager.js';
 */
export const net = new NetworkManager();
