/**
 * Astral Zero — SocketClient (low-level Socket.io wrapper).
 * ============================================================
 * The ONLY file that talks to `socket.io-client`. Everything above it
 * (NetworkManager, scenes, UI) uses this small, well-documented surface:
 *
 *   - `connect()` / `disconnect()`
 *   - `emit(event, payload)`            fire-and-forget
 *   - `request(event, payload)`         Promise + ack timeout
 *   - `on(event, handler)`              returns an unsubscribe function
 *   - `status`                          'idle' | 'connecting' | 'online' | 'offline'
 *
 * DESIGN RULES
 *  1. No game/physics knowledge — this layer only knows event names and JSON.
 *  2. Every request resolves. A silent server must never leave the lobby UI
 *     spinning forever, hence ACK_TIMEOUT_MS + a synthetic `offline` ack.
 *  3. No Phaser import, so it stays unit-testable in plain Node.
 *
 * Socket.io notes
 *  - Acks are the last callback argument; the server may call it with
 *    `{ ok: true, ... }` or never (older/hand-rolled servers).
 *  - `socket.connected` is the authoritative flag; `connect_error` fires on
 *    handshake/CORS failure and is the single most common dev mistake.
 */

import { io } from 'socket.io-client';
import { Emitter } from '../core/Emitter.js';
import { NET_EVENTS, SERVER_ONLY_EVENTS } from './events.js';
import { ACK_TIMEOUT_MS, RECONNECT_OPTIONS, resolveServerUrl } from './netConfig.js';

export class SocketClient extends Emitter {
  /**
   * @param {object} [options]
   * @param {string|null} [options.url] - Backend origin, or null for same-origin.
   * @param {number} [options.ackTimeoutMs] - Per-request timeout.
   * @param {boolean} [options.autoConnect] - Connect immediately (default true).
   */
  constructor({ url = resolveServerUrl(), ackTimeoutMs = ACK_TIMEOUT_MS, autoConnect = true } = {}) {
    super();

    /** @type {import('socket.io-client').Socket|null} */
    this.socket = null;
    this.url = url;
    this.ackTimeoutMs = ackTimeoutMs;

    /** @type {'idle'|'connecting'|'online'|'offline'} */
    this.status = 'idle';

    /** Latest welcome packet from the server (`connected` event). */
    this.serverInfo = null;

    /** Replayed after every (re)connect so the server roster stays correct. */
    this._pendingJoinPayload = null;

    /**
     * Listeners registered via `on()` before the socket existed.
     * @type {Array<{event: string, handler: Function}>}
     */
    this._pendingOn = [];

    if (autoConnect) this.connect();
  }

  /** True when the transport is up. @returns {boolean} */
  get isConnected() {
    return Boolean(this.socket?.connected);
  }

  /** The local socket id, or null before the handshake completes. @returns {string|null} */
  get id() {
    return this.socket?.id ?? null;
  }

  /**
   * Open the connection. Safe to call twice — a second call is a no-op.
   * @returns {void}
   */
  connect() {
    if (this.socket) return;

    this._setStatus('connecting');

    try {
      // Passing `undefined` (not null) makes socket.io use the page origin,
      // which is exactly what the Express production server needs.
      //
      // `_testTransport` is a test seam: tests inject a fake socket.io object so
      // the real connect() wiring (handler attachment + pending-listener flush)
      // is exercised rather than bypassed.
      this.socket = this._testTransport
        ?? (this.url ? io(this.url, RECONNECT_OPTIONS) : io(RECONNECT_OPTIONS));
    } catch (err) {
      console.error('[SocketClient] failed to create socket:', err);
      this._setStatus('offline');
      return;
    }

    // Re-attach anything subscribed before the transport existed.
    this._flushPendingOn();

    // --- Transport lifecycle -------------------------------------------------
    this.socket.on('connect', () => {
      this._setStatus('online');
      this._emitInternal('status', this.status);
      // Re-announce ourselves so a reconnect restores server-side presence.
      if (this._pendingJoinPayload) this.announcePlayer(this._pendingJoinPayload);
    });

    this.socket.on('disconnect', (reason) => {
      this._setStatus('offline');
      this._emitInternal('status', this.status);
      this._emitInternal('disconnected', reason);
    });

    this.socket.on('connect_error', (err) => {
      this._setStatus('offline');
      this._emitInternal('status', this.status);
      console.warn('[SocketClient] connect error:', err?.message || err);
      this._emitInternal('connect_error', err);
    });

    // --- Server welcome + uniform error envelope -----------------------------
    this.socket.on(NET_EVENTS.CONNECTED, (payload = {}) => {
      this.serverInfo = payload;
      this._emitInternal(NET_EVENTS.CONNECTED, payload);
    });

    this.socket.on(NET_EVENTS.ERROR, (payload = {}) => {
      this._emitInternal(NET_EVENTS.ERROR, {
        code: payload.code || 'UNKNOWN',
        message: payload.message || 'The server reported an error.',
      });
    });
  }

  /**
   * Register identity with the server (`player_join`).
   *
   * Stored so it can be replayed automatically after a reconnect, which keeps
   * the server's player roster correct when a laptop sleeps mid-match.
   * @param {{name: string, mapId?: string, difficulty?: string}} payload
   * @returns {void}
   */
  announcePlayer(payload) {
    this._pendingJoinPayload = { name: 'Janitor', ...payload };
    if (!this.isConnected) return; // replayed by the 'connect' handler

    this.socket.emit(NET_EVENTS.PLAYER_JOIN, this._pendingJoinPayload, (ack) => {
      if (ack?.player?.id) this._emitInternal('identity', ack.player);

      // Phase 4: a mid-match disconnect leaves a 60 s seat stash, and the next
      // `player_join` with that name is re-seated into the LIVE room. The ack
      // tells us so. We must not treat that as a fresh lobby join — the player
      // is already in a match, and the catch-up (room_joined + score_update)
      // follows on its own.
      this._emitInternal('rejoined', {
        rejoined: Boolean(ack?.rejoined),
        roomId: ack?.roomId ?? null,
      });
    });
  }

  /**
   * Late-join a live match (Phase 4).
   *
   * @param {object} [query] - `{}` for any live room, `{ roomId }` or `{ mode }`.
   * @returns {Promise<{ok: boolean, roomId?: string, mode?: string, error?: string}>}
   *   Always settles; on timeout resolves `{ ok:false, error:'TIMEOUT' }`.
   */
  lateJoin(query = {}) {
    return this.emitWithAck(NET_EVENTS.ROOM_JOIN, query);
  }

  /**
   * Fire-and-forget emit. Refuses server-only events (the backend would answer
   * with `SERVER_ONLY_EVENT` anyway) and no-ops while offline.
   * @param {string} event
   * @param {object} [payload]
   * @returns {boolean} Whether the message was actually sent.
   */
  emit(event, payload = {}) {
    if (SERVER_ONLY_EVENTS.includes(event)) {
      console.warn(`[SocketClient] refused to emit server-only event "${event}".`);
      return false;
    }
    if (!this.socket || !this.isConnected) return false;
    this.socket.emit(event, payload);
    return true;
  }

  /**
   * Emit with an acknowledgement callback, wrapped in a Promise that ALWAYS
   * settles. Resolves with `{ ok, ...serverData }`; on timeout it resolves
   * with `{ ok: false, code: 'TIMEOUT' }` so callers can branch on `ok`
   * without try/catch gymnastics.
   *
   * @param {string} event
   * @param {object} [payload]
   * @param {number} [timeoutMs]
   * @returns {Promise<{ok: boolean, code?: string, message?: string, [k: string]: any}>}
   */
  request(event, payload = {}, timeoutMs = this.ackTimeoutMs) {
    if (!this.socket || !this.isConnected) {
      return Promise.resolve({
        ok: false,
        code: 'OFFLINE',
        message: 'Not connected to the server.',
      });
    }

    return new Promise((resolve) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({
          ok: false,
          code: 'TIMEOUT',
          message: `The server did not answer "${event}" in time.`,
        });
      }, timeoutMs);

      const done = (ack) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(
          ack && typeof ack === 'object'
            ? ack
            : { ok: true, ...(ack ?? {}) }, // tolerate bare-ack servers
        );
      };

      this.socket.emit(event, payload, done);
    });
  }

  /**
   * Subscribe to a SERVER event.
   *
   * ★ This intentionally does NOT shadow `Emitter.on`. `SocketClient` extends
   * `Emitter` for its own internal events (`status`, `identity`, `rejoined`, …),
   * and while `on()` was overridden here those internal `emit('status', …)` calls
   * had no listener path at all — a client could never observe its own connection
   * state, and NetworkManager never learned it had come online. The internal bus
   * is reached via `onInternal()` instead, keeping the two channels explicit.
   */
  on(event, handler) {
    // Register before the socket exists? Buffer it.
    //
    // ★ This used to `return () => {}` when `this.socket` was null, which
    // SILENTLY DROPPED the listener for good. Anything that subscribed during
    // construction — which is every scene, because MatchStream.start() runs
    // before connect() — therefore never received a single `entity_snapshot`,
    // and the whole authoritative-sync layer was dead against a real server.
    if (!this.socket) {
      const entry = { event, handler };
      this._pendingOn.push(entry);
      return () => {
        // Drop it from the buffer if it never attached, AND detach it from a
        // live socket if the flush already happened. A scene that tears down
        // before or after connect() must end up with the listener gone either
        // way — otherwise scene restarts stack duplicate listeners.
        const i = this._pendingOn.indexOf(entry);
        if (i !== -1) this._pendingOn.splice(i, 1);
        this.socket?.off(event, handler);
      };
    }
    this.socket.on(event, handler);
    return () => this.socket?.off(event, handler);
  }

  /**
   * Re-attach listeners buffered by `on()` before the socket existed.
   * Called once the transport is created.
   * @returns {void}
   */
  _flushPendingOn() {
    if (!this._pendingOn.length) return;
    const pending = this._pendingOn;
    this._pendingOn = [];
    for (const { event, handler } of pending) this.socket?.on(event, handler);
  }

  /**
   * Subscribe to an INTERNAL client event (the Emitter bus).
   *
   * Use this for `status` / `identity` / `rejoined` / `disconnected`.
   * @param {string} event
   * @param {(payload: any) => void} handler
   * @returns {() => void} Unsubscribe function.
   */
  onInternal(event, handler) {
    return super.on(event, handler);
  }

  /**
   * Close the connection and release listeners.
   * @returns {void}
   */
  disconnect() {
    if (!this.socket) return;
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
    this._setStatus('idle');
  }

  /**
   * Publish an event on the INTERNAL client bus.
   *
   * ★ `emit()` is reserved for sending to the SERVER (it is a network call), so
   * internal notifications must go through here. Calling `this.emit('status',…)`
   * previously attempted to send `"status"` over the wire to the backend —
   * where no such event exists — and notified nobody locally.
   *
   * @param {string} event
   * @param {any} [payload]
   * @returns {void}
   */
  _emitInternal(event, payload) {
    super.emit(event, payload);
  }

  /**
   * @param {'idle'|'connecting'|'online'|'offline'} next
   * @returns {void}
   */
  _setStatus(next) {
    this.status = next;
  }
}

export default SocketClient;
