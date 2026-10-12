/**
 * Astral Zero — Matchmaking + room socket handlers (Phase 2 + 4).
 * ============================================================
 * Events:
 *  - queue_join / queue_leave (C→S, acked) + queue_update (S→C positions)
 *  - match_found (S→C lobby hook, emitted from launchRoom)
 *  - room_leave (C→S voluntary exit) + room_update (S→C survivor sync)
 *  - room_join (Phase 4, C→S late join into a live room with space)
 *  - match_end (BOTH ways: client may REQUEST an early finish; server
 *    broadcasts results + lobby return. Phase 3 made scoring real.)
 *
 * First-match protection surfaces in the queue_join / party_start_match
 * acks as `{ firstMatchProtection: true, requestedMode, mode }` so the
 * lobby can explain "we moved you to Bot Practice for your first match".
 * It ALSO gates `room_join` into real modes (practice doors stay open).
 */

import { SOCKET_EVENTS } from '../events.js';
import { allow as allowEvent } from '../limits.js';
import { getBySocket, setQueueMode, setRoomId, hasFinishedRealMatch } from '../../players/playerStore.js';
import { getRoom, getRoomForSocket, getAnyRoom, removeSpectator } from '../../rooms/roomManager.js';
import {
  joinQueue,
  removeFromAllQueues,
  performMatchEnd,
  leaveRoom,
} from '../../matchmaking/matchmakingManager.js';
import { lateJoin, findJoinableRoom, seatSpectator } from '../../game/reconnect.js';

export function registerMatchmakingHandlers(io, socket) {
  // NOTE: io is used by room_join (late seating pushes catch-up emits).

  // -- queue_join ---------------------------------------------------------------
  socket.on(SOCKET_EVENTS.QUEUE_JOIN, (payload = {}, ack) => {
    // Matchmaking allocates a room per accepted join, and a leave immediately
    // follows in a spam loop — so this is the one door that must be ceilinged.
    if (!allowEvent('queue_join', socket.id)) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'RATE_LIMITED',
        message: 'Too many queue requests. Wait a moment and try again.',
      });
      if (typeof ack === 'function') ack({ ok: false, error: 'RATE_LIMITED' });
      return;
    }
    const player = getBySocket(socket.id);
    if (!player) {
      if (typeof ack === 'function') ack({ ok: false, error: 'NOT_JOINED' });
      return;
    }
    // One match at a time — leave (or finish) before queuing again.
    // Phase 5: spectating counts as in-match (leave the booth first).
    if (getAnyRoom(socket.id)) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'ALREADY_IN_MATCH',
        message: 'Leave your current room before queuing again.',
      });
      if (typeof ack === 'function') ack({ ok: false, error: 'ALREADY_IN_MATCH' });
      return;
    }
    const res = joinQueue(
      { id: player.id, socketId: socket.id, name: player.name },
      payload.mode || 'ffa',
      payload.mapId || 'junkyard',
      // Bot Practice tuning is OPTIONAL and validated server-side; other modes
      // ignore it. Sending it is safe for older servers (extra keys are inert).
      { botCount: payload.botCount, difficulty: payload.difficulty, graceMs: payload.graceMs, passive: payload.passive },
      // S14.6: ranked is a QUEUE VARIANT, not a mode. Strict `=== true` — a
      // truthy string can never make a casual queue rated. The server decides
      // whether the request survives (rated-mode allow-list, protection).
      payload.ranked === true,
    );
    if (!res.ok) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: res.error,
        message: `queue_join failed: ${res.error}`,
      });
      if (typeof ack === 'function') ack({ ok: false, error: res.error });
      return;
    }
    setQueueMode(socket.id, res.instant ? null : res.mode);
    console.log(
      `[Astral Zero] queue_join ${player.name} → ${res.mode}` +
        (res.ranked ? ' (ranked)' : '') +
        (res.firstMatchProtection ? ' (first-match protection)' : '') +
        (res.roomId ? ` room=${res.roomId}` : ` pos=${res.position}`),
    );
    if (typeof ack === 'function') ack(res);
  });

  // -- queue_leave -----------------------------------------------------------------
  socket.on(SOCKET_EVENTS.QUEUE_LEAVE, (_payload = {}, ack) => {
    removeFromAllQueues(socket.id);
    setQueueMode(socket.id, null);
    if (typeof ack === 'function') ack({ ok: true });
  });

  // -- room_leave (voluntary exit; survivors get room_update) -------------------------
  // NOTE: voluntary leaves never stash reconnect state (lobby exit frees the
  // seat for real — only disconnects re-seat; see sockets/index.js).
  // Phase 5: spectators leave through the same door (seat freed, no roster
  // change, no stash).
  socket.on(SOCKET_EVENTS.ROOM_LEAVE, (_payload = {}, ack) => {
    if (!allowEvent('room_leave', socket.id)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'RATE_LIMITED' });
      return;
    }
    const specRoom = getAnyRoom(socket.id);
    if (specRoom && !getRoomForSocket(socket.id)) {
      removeSpectator(specRoom.id, socket.id);
      try {
        socket.leave(specRoom.id);
      } catch { /* already gone */ }
      setRoomId(socket.id, null);
      if (typeof ack === 'function') ack({ ok: true, left: true, spectator: true, roomId: specRoom.id });
      return;
    }
    const res = leaveRoom(socket.id);
    if (typeof ack === 'function') ack({ ok: true, ...res });
  });

  // -- room_join (Phase 4 late join: lobby → live room with space) ------------------
  // Body: {} (any joinable room) or { roomId } (that specific room).
  // Practice doors are always open; real modes need veteran status
  // (first-match protection extends to doors, not just queues).
  // Catch-up (room_joined + match_state + score_update) is pushed on success.
  //
  // Phase 5: { asSpectator: true } takes an observer seat instead (full feed,
  // no hitbox) — works even when the room is full, up to the spectator cap.
  // A full room WITHOUT the flag still answers ROOM_FULL, but now with a
  // `canSpectate: true` hint so lobby UI can offer the booth in one click.
  socket.on(SOCKET_EVENTS.ROOM_JOIN, (payload = {}, ack) => {
    if (!allowEvent('room_join', socket.id)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'RATE_LIMITED' });
      return;
    }
    const done = (res) => {
      if (typeof ack === 'function') ack(res);
    };
    const player = getBySocket(socket.id);
    if (!player) return done({ ok: false, error: 'NOT_JOINED' });
    if (getRoomForSocket(socket.id)) {
      return done({ ok: false, error: 'ALREADY_IN_MATCH' });
    }
    const room = payload.roomId ? getRoom(payload.roomId) : findJoinableRoom(payload.mode || null);
    if (!room) return done({ ok: false, error: 'NO_ROOM_TO_JOIN' });
    // Spectator booth: no protection check (watching is always safe), seats
    // even past the human cap. Already-seated spectators re-ack idempotently.
    if (payload.asSpectator) {
      const res = seatSpectator(io, SOCKET_EVENTS, room, socket, player.name);
      if (res.ok) console.log(`[Astral Zero] room_join spectator ${player.name} → ${res.roomId}`);
      return done(res);
    }
    if (room.mode !== 'bot_practice' && !hasFinishedRealMatch(player.name)) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'FIRST_MATCH_PROTECTED',
        message: 'Finish a Bot Practice match before joining real matches.',
      });
      return done({ ok: false, error: 'FIRST_MATCH_PROTECTED', mode: room.mode });
    }
    removeFromAllQueues(socket.id);
    setQueueMode(socket.id, null);
    const res = lateJoin(io, SOCKET_EVENTS, room, socket, player.name);
    if (!res.ok && res.error === 'ROOM_FULL') {
      // Additive hint (no behavior change): the booth may still have space.
      return done({ ...res, canSpectate: true });
    }
    if (!res.ok) return done(res);
    console.log(`[Astral Zero] room_join ${player.name} → ${res.roomId} (late)`);
    return done(res);
  });

  // -- match_end (client REQUESTS an early finish; server broadcasts results) -----------
  // Body optional: { reason? }. Server re-stamps results + lobby return.
  // Phase 6: authorized, not merely "in the room".
  //
  // This used to accept any socket the room map knew about — including every
  // SPECTATOR, who has no body in the match at all. A spectator could therefore
  // end a live match for everyone in it. Ending a match is a mutation of shared
  // authoritative state on other players' behalf, so it now requires being a
  // seated PARTICIPANT (a human in the roster), never a booth observer.
  socket.on(SOCKET_EVENTS.MATCH_END, (payload = {}, ack) => {
    const room = getAnyRoom(socket.id);
    if (!room) {
      if (typeof ack === 'function') ack({ ok: false, error: 'NOT_IN_ROOM' });
      return;
    }
    // Spectators are seated in the room but are not participants.
    if (getSpectatorRoom(socket.id) === room) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'SPECTATING',
        message: 'Spectators may not end a match.',
      });
      if (typeof ack === 'function') ack({ ok: false, error: 'SPECTATING' });
      return;
    }
    // Must actually be in the roster (not merely remembered by the room index).
    const isParticipant = (room.humans ?? room.players ?? []).some(
      (p) => p.socketId === socket.id || p.id === socket.id,
    );
    if (!isParticipant) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'NOT_PARTICIPANT',
        message: 'Only a match participant may end the match.',
      });
      if (typeof ack === 'function') ack({ ok: false, error: 'NOT_PARTICIPANT' });
      return;
    }
    const ended = performMatchEnd(room.id, payload.reason || 'manual');
    if (typeof ack === 'function') {
      ack(ended.ok ? { ok: true, result: ended.result } : { ok: false, error: ended.error });
    }
  });
}
