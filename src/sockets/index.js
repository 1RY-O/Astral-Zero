/**
 * Astral Zero — Socket.io wiring (PHASE 3).
 * ============================================================
 * What this file DOES:
 *  - Greets each connecting Phaser client (`connected` hello).
 *  - Phase 1/2 COMPAT: player_join/leave, party, friends, queue, room
 *    handlers keep their exact ack + broadcast behavior (old smoke tests
 *    target LOBBY sockets — no room — and those paths are byte-identical).
 *  - Phase 3 AUTHORITY (in-room senders only):
 *      player_input  → validated intent store (primary channel)
 *      player_move   → legacy bridge: position IGNORED, velocity hint → intent
 *      player_shoot  → validated trigger (server spawns the shell + tracer)
 *      player_melee  → validated swing (server arc-tests)
 *      player_health_update → server-ONLY now (client sends rejected)
 *    Out-of-room senders keep Phase 2 global-relay behavior so single-arena
 *    dev builds and old smoke tests keep passing untouched.
 *  - Identity + disconnect fan-out: unchanged from Phase 2, plus input
 *    cleanup (no phantom steering after a drop).
 *
 * What this file DOES NOT do (Phase 4+):
 *  - ❌ No lag compensation / client prediction reconciliation on server.
 *  - ❌ No raycast LOS (distance + height check only).
 *  - ❌ No persistence beyond in-memory Maps.
 *
 * Frontend engineer: implement against `websocket_events.md`
 * (§13–§15 are new in 1.2.0-phase3; §1–§12 unchanged).
 */

import config from '../server-config.js';
import { SOCKET_EVENTS, SOCKET_EVENTS_VERSION } from './events.js';
import {
  upsertOnJoin,
  removeBySocket,
  getBySocket,
  setPartyCode,
} from '../players/playerStore.js';
import { listFriends } from '../friends/friendManager.js';
import { handleDisconnect as partyDisconnect, toPublic as partyToPublic } from '../parties/partyManager.js';
import {
  initMatchmaking,
  handleDisconnect as queueDisconnect,
  leaveRoom,
} from '../matchmaking/matchmakingManager.js';
import { registerPartyHandlers } from './handlers/partyHandlers.js';
import { registerFriendHandlers } from './handlers/friendHandlers.js';
import { registerMatchmakingHandlers } from './handlers/matchmakingHandlers.js';
import { registerInputHandlers, bridgeShoot, bridgeMelee } from './handlers/inputHandlers.js';
import { getRoomForSocket, getSpectatorRoom, removeSpectatorEverywhere } from '../rooms/roomManager.js';
import { storeLegacyMove, clearInput } from '../game/inputs.js';
import { tryRejoin } from '../game/reconnect.js';

/**
 * Attach all Astral Zero socket handlers to an `io` server.
 * @param {import('socket.io').Server} io
 */
export function initSockets(io) {
  // Matchmaking owns batching timers → needs io long after sockets leave.
  initMatchmaking(io, SOCKET_EVENTS);

  io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
    console.log(`[Astral Zero] 🤖 client connected: ${socket.id}`);

    // -- Welcome packet ----------------------------------------------------
    // Gives Phaser everything it needs to confirm contract compatibility.
    socket.emit(SOCKET_EVENTS.CONNECTED, {
      socketId: socket.id,
      game: config.gameName,
      serverVersion: config.gameVersion,
      socketEventsVersion: SOCKET_EVENTS_VERSION,
      message: `Welcome to ${config.gameName}! See websocket_events.md for the contract.`,
    });

    // -- Phase 2 modular handlers (party / friends / queue / room) ---------
    // Registered FIRST so their event names never collide with the
    // Phase 1 core below (all names are disjoint by construction).
    registerPartyHandlers(io, socket);
    registerFriendHandlers(io, socket);
    registerMatchmakingHandlers(io, socket);
    // -- Phase 3: authoritative input channel --------------------------------
    registerInputHandlers(io, socket);

    // -- 1. player_join ------------------------------------------------------
    // Contract: C->S { name, mapId?, difficulty? } → S broadcasts presence.
    // Phase 2 addition: register identity (friends/protection) + push the
    // caller's persistent friends list. Broadcast shape UNCHANGED.
    socket.on(SOCKET_EVENTS.PLAYER_JOIN, (payload = {}, ack) => {
      console.log(`[Astral Zero] player_join from ${socket.id}:`, payload);

      // Phase 1: stamp identity server-side, trust the rest.
      const player = {
        id: socket.id,
        name: String(payload.name || 'Unnamed Janitor').slice(0, 24),
        mapId: payload.mapId || 'junkyard',
        difficulty: payload.difficulty || 'normal',
        joinedAt: Date.now(),
      };
      // Phase 2: stable profile (keyed on username) for friends/protection.
      upsertOnJoin(socket.id, player);

      // Tell everyone else a janitor arrived (skip sender).
      socket.broadcast.emit(SOCKET_EVENTS.PLAYER_JOIN, player);

      // Phase 4: reconnect grace — same name back within 60 s re-seats into
      // the live room (catch-up manifest pushed inside tryRejoin). The ack
      // carries rejoined:true so the client skips the lobby and loads in.
      const rejoin = tryRejoin(io, SOCKET_EVENTS, socket, player);
      if (rejoin.rejoined) {
        console.log(`[Astral Zero] player rejoined ${player.name} → ${rejoin.roomId}`);
      }

      // Acknowledge the sender (works with or without client callback).
      if (typeof ack === 'function') {
        ack(
          rejoin.rejoined
            ? { ok: true, player, rejoined: true, roomId: rejoin.roomId }
            : { ok: true, player },
        );
      } else {
        socket.emit(SOCKET_EVENTS.PLAYER_JOIN, player);
      }

      // Phase 2: hand the caller their persistent friends list right away
      // so lobby UI renders without an extra round-trip.
      socket.emit(SOCKET_EVENTS.FRIEND_UPDATE, {
        friends: listFriends(player.name),
        timestamp: Date.now(),
      });
    });

    // -- 2. player_move ------------------------------------------------------
    // LOBBY (no room): Phase 1/2 global relay, byte-identical — old smoke
    // tests and single-arena dev builds hit exactly this branch.
    // IN ROOM (Phase 3): the claimed POSITION is ignored (server owns it);
    // only a velocity hint becomes intent. Peers learn positions from
    // `entity_snapshot`, never from this echo (no conflicting truths).
    socket.on(SOCKET_EVENTS.PLAYER_MOVE, (payload = {}, ack) => {
      // Avoid spamming logs for 20–60 Hz input; uncomment to debug:
      // console.log(`[move] ${socket.id}`, payload);
      // Phase 5: spectators have no body — their move packets are dropped,
      // NEVER relayed (a ghost tracer broadcast would haunt every client).
      if (getSpectatorRoom(socket.id)) {
        if (typeof ack === 'function') ack({ ok: false, error: 'SPECTATING' });
        return;
      }
      const room = getRoomForSocket(socket.id);
      if (!room?.sim) {
        socket.broadcast.emit(SOCKET_EVENTS.PLAYER_MOVE, {
          id: socket.id,
          ...payload, // { x, y, vx, vy, facing, seq, timestamp }
        });
        if (typeof ack === 'function') ack({ ok: true, relayed: true });
        return;
      }
      const res = storeLegacyMove(socket.id, payload);
      if (typeof ack === 'function') {
        ack(res.ok ? { ok: true, bridged: true, seq: res.seq } : { ok: false, error: res.dropped || 'BAD_PAYLOAD' });
      }
    });

    // -- 3. player_shoot -----------------------------------------------------
    // LOBBY: legacy rebroadcast + ack (unchanged). IN ROOM: validated trigger
    // — cooldown-gated, re-anchored at the server body, tracer re-emitted
    // with server values (see combat/triggers.js).
    socket.on(SOCKET_EVENTS.PLAYER_SHOOT, (payload = {}, ack) => {
      // Phase 5: spectators can't shoot (no body, no muzzle, no debate).
      if (getSpectatorRoom(socket.id)) {
        socket.emit(SOCKET_EVENTS.ERROR, { code: 'SPECTATING', message: 'Spectators cannot shoot.' });
        if (typeof ack === 'function') ack({ ok: false, error: 'SPECTATING' });
        return;
      }
      const room = getRoomForSocket(socket.id);
      if (!room?.sim) {
        console.log(`[Astral Zero] player_shoot from ${socket.id}:`, payload);
        socket.broadcast.emit(SOCKET_EVENTS.PLAYER_SHOOT, {
          id: socket.id,
          ...payload, // { x, y, angle, weaponId, seq, timestamp }
        });
        if (typeof ack === 'function') ack({ ok: true });
        return;
      }
      const res = bridgeShoot(io, SOCKET_EVENTS, socket, payload);
      if (!res.ok) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: res.error,
          message: `player_shoot rejected: ${res.error}`,
        });
      }
      if (typeof ack === 'function') ack(res);
    });

    // -- 4. player_melee -----------------------------------------------------
    // The sacred Mop Swing. Same split as shooting: lobby relays, rooms
    // server-arc-test (combat/damage.js → meleeSwing).
    socket.on(SOCKET_EVENTS.PLAYER_MELEE, (payload = {}, ack) => {
      // Phase 5: spectators can't swing either (same no-body rule).
      if (getSpectatorRoom(socket.id)) {
        socket.emit(SOCKET_EVENTS.ERROR, { code: 'SPECTATING', message: 'Spectators cannot attack.' });
        if (typeof ack === 'function') ack({ ok: false, error: 'SPECTATING' });
        return;
      }
      const room = getRoomForSocket(socket.id);
      if (!room?.sim) {
        console.log(`[Astral Zero] player_melee from ${socket.id}:`, payload);
        socket.broadcast.emit(SOCKET_EVENTS.PLAYER_MELEE, {
          id: socket.id,
          ...payload, // { x, y, direction, swingId, timestamp }
        });
        if (typeof ack === 'function') ack({ ok: true });
        return;
      }
      const res = bridgeMelee(io, SOCKET_EVENTS, socket, payload);
      if (!res.ok) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: res.error,
          message: `player_melee rejected: ${res.error}`,
        });
      }
      if (typeof ack === 'function') ack(res);
    });

    // -- 5. player_health_update ---------------------------------------------
    // Phase 3: SERVER-ONLY, enforced. Client sends are rejected with
    // NOT_AUTHORITATIVE (the locked flip previewed since the Phase 1 doc).
    // HP is written exclusively by combat/damage.js → broadcast room-scoped.
    socket.on(SOCKET_EVENTS.PLAYER_HEALTH_UPDATE, (payload = {}) => {
      console.warn(
        `[Astral Zero] ⚠ client ${socket.id} sent authoritative 'player_health_update'. Rejected:`,
        payload,
      );
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'NOT_AUTHORITATIVE',
        message: `'player_health_update' is server→client only. Clients must never set HP.`,
      });
    });

    // -- 6. Bot stubs ----------------------------------------------------------
    // Bots are server-driven, so clients should only LISTEN for these.
    // If a client emits them in Phase 1 we log + ignore (anti-cheat preview).
    // Phase 2 KEEPS this guard: rooms emit bot_* from the server only.
    for (const evt of [SOCKET_EVENTS.BOT_SPAWN, SOCKET_EVENTS.BOT_UPDATE, SOCKET_EVENTS.BOT_DEATH]) {
      socket.on(evt, (payload) => {
        console.warn(
          `[Astral Zero] ⚠ client ${socket.id} emitted server-only event '${evt}'. Ignored:`,
          payload,
        );
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'SERVER_ONLY_EVENT',
          message: `'${evt}' is server→client only in ${config.gameName}.`,
        });
      });
    }

    // -- 7. Reserved future events (puzzle / jumpscare / rocket-jump / ...) ----
    // Shapes are frozen in websocket_events.md; handlers are stubs.
    // They log + rebroadcast so Phaser can prototype UI/FX early.

    socket.on(SOCKET_EVENTS.PUZZLE_SOLVED, (payload = {}, ack) => {
      console.log(`[Astral Zero] puzzle_solved from ${socket.id}:`, payload);
      socket.broadcast.emit(SOCKET_EVENTS.PUZZLE_SOLVED, { id: socket.id, ...payload });
      if (typeof ack === 'function') ack({ ok: true, received: true });
    });

    socket.on(SOCKET_EVENTS.ROCKET_JUMP, (payload = {}, ack) => {
      console.log(`[Astral Zero] rocket_jump from ${socket.id}:`, payload);
      socket.broadcast.emit(SOCKET_EVENTS.ROCKET_JUMP, { id: socket.id, ...payload });
      if (typeof ack === 'function') ack({ ok: true });
    });

    socket.on(SOCKET_EVENTS.PICKUP_COLLECTED, (payload = {}, ack) => {
      console.log(`[Astral Zero] pickup_collected from ${socket.id}:`, payload);
      socket.broadcast.emit(SOCKET_EVENTS.PICKUP_COLLECTED, { id: socket.id, ...payload });
      if (typeof ack === 'function') ack({ ok: true });
    });

    // JUMPSCARE_TRIGGER is server→client only (same guard as bots).
    // NOTE: MATCH_STATE is EMITTED by the server in Phase 2 (rooms), but
    // clients must still never SEND it — the guard stays so a malicious
    // client can't fake lobby/countdown/playing/gameover for everyone.
    // Phase 3 adds the sim/combat pushes to the same server-only list.
    for (const evt of [
      SOCKET_EVENTS.JUMPSCARE_TRIGGER,
      SOCKET_EVENTS.MATCH_STATE,
      SOCKET_EVENTS.ENTITY_SNAPSHOT,
      SOCKET_EVENTS.ENTITY_DEATH,
      SOCKET_EVENTS.ENTITY_RESPAWN,
      SOCKET_EVENTS.SCORE_UPDATE,
    ]) {
      socket.on(evt, (payload) => {
        console.warn(`[Astral Zero] ⚠ client emitted server-only '${evt}'. Ignored:`, payload);
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'SERVER_ONLY_EVENT',
          message: `'${evt}' is server→client only.`,
        });
      });
    }

    // -- Disconnect ------------------------------------------------------------
    // Phase 1 behavior KEPT (player_leave broadcast), then Phase 2 cleanup:
    // party promotion/disband, queue drop, room exit — all best-effort.
    socket.on(SOCKET_EVENTS.DISCONNECT, (reason) => {
      console.log(`[Astral Zero] 👋 client disconnected: ${socket.id} (${reason})`);
      // Let remaining players remove this janitor from their scene.
      socket.broadcast.emit(SOCKET_EVENTS.PLAYER_LEAVE, {
        id: socket.id,
        reason: String(reason),
        timestamp: Date.now(),
      });

      // Phase 2: party fix-up (promote survivor or disband) + notify.
      try {
        const partyRes = partyDisconnect(socket.id);
        if (partyRes && partyRes.remaining) {
          const snap = partyToPublic(partyRes.remaining);
          for (const m of partyRes.remaining.members) {
            io.to(m.socketId).emit(SOCKET_EVENTS.PARTY_UPDATE, {
              party: snap,
              timestamp: Date.now(),
            });
          }
        }
      } catch (err) {
        console.warn(`[Astral Zero] party disconnect cleanup failed: ${err.message}`);
      }
      setPartyCode(socket.id, null);

      // Phase 2: matchmaking + room cleanup (queue drop, room_update).
      // Phase 4: stash=true snapshots the leaver for reconnect grace
      // (voluntary room_leave never stashes — only real disconnects re-seat).
      try {
        queueDisconnect(socket.id);
        leaveRoom(socket.id, { stash: true });
      } catch (err) {
        console.warn(`[Astral Zero] match cleanup failed: ${err.message}`);
      }

      // Phase 2: identity session drop (profile + friends + history KEPT).
      removeBySocket(socket.id);
      void getBySocket;
      // Phase 3: forget intent (a stale entry would steer a corpse for 1.5 s;
      // in-room entity removal already happened in leaveRoom/removeHuman).
      clearInput(socket.id);
      // Phase 5: free spectator booths (spectators never stash — no re-seat).
      removeSpectatorEverywhere(socket.id);
    });
  });

  console.log('[Astral Zero] Socket.io Phase 3 handlers registered (authoritative sim + combat + Phase 1/2 compat).');
}
