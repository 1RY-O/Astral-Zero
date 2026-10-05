/**
 * Astral Zero — Matchmaking manager (Phase 2).
 * ============================================================
 * LOCKED RULES:
 *  - Solo queue: pick mode → join queue → server creates room when ready.
 *  - Party: leader picks mode → Start → WHOLE party moved together.
 *  - Bot practice: always bots only (strangers never grouped; instant start).
 *  - First-match protection: never-finished-a-real-match players are FORCED
 *    into bot_practice even if they chose ffa/tdm (ack flags it).
 *
 * READINESS (tuning in src/server-config.js → gameModes):
 *  - bot_practice: instant room per player (no grouping, no waiting).
 *  - ffa: instant when ≥2 waiting, else 5 s fallback (solo gets bot-filled room).
 *  - tdm: instant when ≥4 waiting, else 10 s fallback, bots fill to 8 (4v4).
 *
 * This module OWNS the `io` reference (via initMatchmaking) because batching
 * timers must emit without a triggering socket. Room boot fan-out
 * (`launchRoom`) lives here too so party + solo share ONE code path:
 *  create → sockets join io room → match_found + room_joined + match_state
 *  (countdown) → playing → auto match_end safety timer.
 *
 * All queues + timers are in-memory. One queue per socket at a time.
 */

import config from '../server-config.js';
import { GAME_MODES } from '../sockets/events.js';
import { hasFinishedRealMatch, setQueueMode, setRoomId } from '../players/playerStore.js';
import {
  createRoom,
  toPublic as roomToPublic,
  getRoom,
  getRoomForSocket,
  removeHuman,
  endMatch,
  schedulePlaying,
  scheduleAutoEnd,
} from '../rooms/roomManager.js';
import { setPartyRoom, _getRawParty } from '../parties/partyManager.js';
import { ensureLoop, initSim } from '../game/loop.js';
import { stashPlayer, purgeRoomLimbo } from '../game/reconnect.js';

let ioRef = null;
let EV = null; // SOCKET_EVENTS registry (injected to avoid import cycle)

export function initMatchmaking(io, events) {
  ioRef = io;
  EV = events;
  // Phase 3: boot the fixed-step sim loop once. Win callbacks route back
  // here (no import cycle: loop receives us as a callback, not an import).
  ensureLoop(io, events, { onMatchEnd: (roomId, reason) => performMatchEnd(roomId, reason) });
}

// queues: mode → [{ socketId, name, mapId, enqueuedAt }]
// Phase 5: scrap_collector queues like ffa (instant ≥2, 5 s fallback).
const queues = { ffa: [], tdm: [], bot_practice: [], scrap_collector: [] };
const queueTimers = new Map(); // mode → timeout

const VALID_MODES = () => Object.values(GAME_MODES);

function tuningFor(mode) {
  return config.gameModes?.[mode] || { maxPlayers: 10, minToStartNow: 2, soloWaitMs: 5000 };
}

/**
 * First-match protection gate. Returns the EFFECTIVE mode + flag.
 * @param {string[]} names display names of everyone entering (1 for solo)
 * @param {string} requested 'ffa' | 'tdm' | 'bot_practice'
 */
export function applyFirstMatchProtection(names, requested) {
  if (requested === GAME_MODES.BOT_PRACTICE) {
    return { mode: requested, firstMatchProtection: false };
  }
  const needsProtection = names.some((n) => !hasFinishedRealMatch(n));
  if (needsProtection) {
    return { mode: GAME_MODES.BOT_PRACTICE, firstMatchProtection: true, requestedMode: requested };
  }
  return { mode: requested, firstMatchProtection: false };
}

/** Remove a socket from EVERY queue (one-queue rule + disconnect path). */
export function removeFromAllQueues(socketId) {
  let removed = null;
  for (const mode of Object.keys(queues)) {
    const i = queues[mode].findIndex((q) => q.socketId === socketId);
    if (i !== -1) {
      removed = queues[mode].splice(i, 1)[0];
      broadcastQueuePositions(mode);
    }
  }
  setQueueMode(socketId, null);
  // Stop fallback timers for now-empty queues.
  for (const mode of Object.keys(queues)) {
    if (queues[mode].length === 0 && queueTimers.has(mode)) {
      clearTimeout(queueTimers.get(mode));
      queueTimers.delete(mode);
    }
  }
  return removed;
}

/** Push fresh positions to everyone waiting in a mode. */
function broadcastQueuePositions(mode) {
  if (!ioRef || !EV) return;
  queues[mode].forEach((entry, i) => {
    ioRef.to(entry.socketId).emit(EV.QUEUE_UPDATE, {
      mode,
      position: i + 1,
      playersInQueue: queues[mode].length,
      timestamp: Date.now(),
    });
  });
}

/**
 * Solo queue entry. May synchronously launch a room (bot_practice or
 * threshold met) or park the player until the batching timer fires.
 *
 * @param {object} player { id, socketId, name }
 * @param {string} requestedMode
 * @param {string} mapId
 */
export function joinQueue(player, requestedMode = 'ffa', mapId = 'junkyard') {
  if (!player?.socketId) return { ok: false, error: 'NOT_JOINED' };
  const requested = VALID_MODES().includes(requestedMode) ? requestedMode : null;
  if (!requested) return { ok: false, error: 'BAD_MODE' };

  const { mode: effective, firstMatchProtection } = applyFirstMatchProtection(
    [player.name],
    requested,
  );

  removeFromAllQueues(player.socketId);

  // Bot practice NEVER waits and NEVER groups strangers: instant solo room.
  if (effective === GAME_MODES.BOT_PRACTICE) {
    const room = launchRoom({
      mode: effective,
      mapId,
      humans: [{ id: player.id, socketId: player.socketId, name: player.name }],
      partyCode: null,
    });
    return {
      ok: true,
      mode: effective,
      requestedMode: requested,
      firstMatchProtection,
      position: 0,
      roomId: room?.id || null,
      instant: true,
    };
  }

  queues[effective].push({ socketId: player.socketId, name: player.name, mapId, enqueuedAt: Date.now() });
  setQueueMode(player.socketId, effective);
  broadcastQueuePositions(effective);

  // Ready now? Drain up to maxPlayers instantly (chunked if overfull).
  const tuning = tuningFor(effective);
  if (queues[effective].length >= (tuning.minToStartNow || 2)) {
    const room = drainQueueToRoom(effective);
    return {
      ok: true,
      mode: effective,
      requestedMode: requested,
      firstMatchProtection,
      position: 0,
      roomId: room?.id || null,
      instant: true,
    };
  }

  // Otherwise arm the solo-fallback timer (bot-filled room even if alone).
  ensureFallbackTimer(effective);
  const pos = queues[effective].findIndex((q) => q.socketId === player.socketId) + 1;
  return {
    ok: true,
    mode: effective,
    requestedMode: requested,
    firstMatchProtection,
    position: pos,
    playersInQueue: queues[effective].length,
    instant: false,
  };
}

/** Arm (once) the per-mode fallback timer that force-starts small queues. */
function ensureFallbackTimer(mode) {
  if (!ioRef || queueTimers.has(mode) || queues[mode].length === 0) return;
  const wait = tuningFor(mode).soloWaitMs ?? 5000;
  if (wait <= 0) return;
  const timer = setTimeout(() => {
    queueTimers.delete(mode);
    if (queues[mode].length > 0) drainQueueToRoom(mode);
  }, wait);
  timer?.unref?.(); // never hold the process open for matchmaking
  queueTimers.set(mode, timer);
}

/**
 * Pop up to maxPlayers off a mode queue into ONE room (bots fill the rest).
 * Leftover players (queue > max) stay queued and re-trigger matching.
 */
export function drainQueueToRoom(mode) {
  const tuning = tuningFor(mode);
  const max = tuning.maxPlayers || 10;
  const batch = queues[mode].splice(0, max);
  if (batch.length === 0) return null;
  broadcastQueuePositions(mode);
  if (queues[mode].length === 0 && queueTimers.has(mode)) {
    clearTimeout(queueTimers.get(mode));
    queueTimers.delete(mode);
  } else if (queues[mode].length > 0) {
    ensureFallbackTimer(mode);
  }
  const mapId = batch[0]?.mapId || 'junkyard';
  return launchRoom({
    mode,
    mapId,
    humans: batch.map((b) => ({ id: b.socketId, socketId: b.socketId, name: b.name })),
    partyCode: null,
  });
}

/**
 * Party start (leader only — leadership checked by the socket handler).
 * The WHOLE party moves together into one room; protection applies if ANY
 * member is new (whole party drops to bot_practice to stay together).
 *
 * @param {object} party raw party (from _getRawParty)
 * @param {string} requestedMode
 * @param {string} mapId
 */
export function startPartyMatch(party, requestedMode = 'ffa', mapId = 'junkyard') {
  const requested = VALID_MODES().includes(requestedMode) ? requestedMode : 'ffa';
  if (!party || party.members.length === 0) return { ok: false, error: 'PARTY_NOT_FOUND' };
  const names = party.members.map((m) => m.name);
  const { mode: effective, firstMatchProtection } = applyFirstMatchProtection(names, requested);

  // Parties skip queues entirely — pull members out if they were waiting.
  for (const m of party.members) removeFromAllQueues(m.socketId);

  const room = launchRoom({
    mode: effective,
    mapId,
    humans: party.members.map((m) => ({ id: m.id, socketId: m.socketId, name: m.name })),
    partyCode: party.code,
  });
  if (!room) return { ok: false, error: 'NO_MEMBERS_ONLINE' };
  setPartyRoom(party.code, room.id);
  return {
    ok: true,
    mode: effective,
    requestedMode: requested,
    firstMatchProtection,
    roomId: room.id,
  };
}

// ---------------------------------------------------------------------------
// Room boot fan-out (shared by solo + party)
// ---------------------------------------------------------------------------

/**
 * Create + boot a room: sockets join the io room, everyone gets
 * `match_found` (lobby hook) + `room_joined` (full roster) + `match_state`
 * (countdown), plus legacy `player_join`/`bot_spawn` assists so Phase 1
 * Phaser spawn code keeps working. Only ONLINE sockets are seated; offline
 * party members are skipped (room fails if NONE are online).
 *
 * @param {object} opts { mode, mapId, humans, partyCode }
 * @returns {object|null} room (internal ref)
 */
export function launchRoom(opts) {
  if (!ioRef || !EV) {
    // Managers used without init (unit context) — still create state.
    return createRoom(opts);
  }
  const online = (opts.humans || []).filter((h) => ioRef.sockets.sockets.has(h.socketId));
  if (online.length === 0) return null;
  const room = createRoom({ ...opts, humans: online });
  // Phase 3: build live sim entities from the spawn roster NOW, so the
  // countdown roster and the first playing tick share one truth.
  initSim(room);
  const pub = roomToPublic(room);

  for (const h of online) {
    const sock = ioRef.sockets.sockets.get(h.socketId);
    if (!sock) continue;
    sock.join(room.id);
    setRoomId(h.socketId, room.id);
    // Lobby UI hook: "match ready, loading arena…"
    sock.emit(EV.MATCH_FOUND, {
      roomId: room.id,
      mode: room.mode,
      mapId: room.mapId,
      partyCode: opts.partyCode || null,
      timestamp: Date.now(),
    });
    // Authoritative roster — Phaser spawns EVERYTHING from `entities`.
    sock.emit(EV.ROOM_JOINED, { room: pub, timestamp: Date.now() });
  }

  // Room-scoped countdown (extended Phase 1 shape — old fields kept).
  // Phase 5: the manifest map rides along (clients render zones + docks
  // before the first snapshot lands).
  ioRef.to(room.id).emit(EV.MATCH_STATE, {
    roomId: room.id,
    phase: 'countdown',
    mode: room.mode,
    mapId: room.mapId,
    map: pub.map,
    difficulty: 'normal',
    players: pub.players,
    bots: pub.bots,
    entities: pub.entities,
    countdownMs: room.countdownMs,
    timestamp: Date.now(),
  });

  // Legacy spawn assists (spec: "match_state / player_join so Phaser can spawn").
  for (const p of pub.players) {
    ioRef.to(room.id).emit(EV.PLAYER_JOIN, {
      id: p.id,
      name: p.name,
      team: p.team,
      mapId: room.mapId,
      roomId: room.id,
      x: p.x,
      y: p.y,
    });
  }
  for (const b of pub.bots) {
    ioRef.to(room.id).emit(EV.BOT_SPAWN, { ...b, roomId: room.id, timestamp: Date.now() });
  }

  schedulePlaying(ioRef, room, EV.MATCH_STATE);
  scheduleAutoEnd(ioRef, room, null, (io, r, reason) => performMatchEnd(r.id, reason));
  return room;
}

/**
 * End a match and return everyone to lobby/party:
 *  - `match_end` (results) + `match_state{ phase:'lobby' }` to the room
 *  - sockets leave the io room, playerStore.roomId cleared
 *  - party link cleared + fresh `party_update` so lobby UI restores
 *
 * @param {string} roomId
 * @param {string} reason
 */
export function performMatchEnd(roomId, reason = 'finished') {
  const room = getRoom(roomId);
  // endMatch() destroys state — snapshot humans/party first via its return.
  const ended = endMatch(roomId, reason);
  // Phase 5 hygiene: stashed rejoin seats die with the room (no limbo
  // pointing at a destroyed match; orphaned rings/maps GC with the sim).
  purgeRoomLimbo(roomId);
  if (!ended.ok || !ioRef || !EV) return ended;

  const humans = ended.humans || [];
  const payload = ended.result;

  ioRef.to(roomId).emit(EV.MATCH_END, payload);
  ioRef.to(roomId).emit(EV.MATCH_STATE, {
    roomId,
    phase: 'lobby',
    mode: ended.mode,
    mapId: room?.mapId || 'junkyard',
    timestamp: Date.now(),
  });

  // Socket.io room cleanup + lobby restore per human.
  for (const sock of ioRef.sockets.sockets.values()) {
    if (humans.includes(sock.id) || sock.rooms.has(roomId)) {
      // NOTE: sock.rooms contains socket.id + joined rooms; leave ours.
      try {
        sock.leave(roomId);
      } catch {
        /* ignore — socket may be mid-disconnect */
      }
    }
  }
  // Clear authoritative room pointers + restore party link.
  for (const [socketId] of ioRef.sockets.sockets) {
    setRoomId(socketId, null);
  }
  if (ended.partyCode) {
    setPartyRoom(ended.partyCode, null);
    const raw = _getRawParty(ended.partyCode);
    if (raw) {
      const pub = {
        code: raw.code,
        leaderId: raw.leaderId,
        leaderName: raw.leaderName,
        members: raw.members.map((m) => ({ ...m })),
        memberCount: raw.members.length,
        maxSize: config.party?.maxSize || 4,
        mode: raw.mode,
        roomId: null,
        createdAt: raw.createdAt,
      };
      for (const m of raw.members) {
        ioRef.to(m.socketId).emit(EV.PARTY_UPDATE, { party: pub, timestamp: Date.now() });
      }
    }
  }
  return ended;
}

/**
 * Voluntary room exit (room_leave) or disconnect-in-match cleanup.
 * Emits `room_update` to survivors; destroys the room when empty.
 *
 * Phase 4: `opts.stash` (disconnect path only) snapshots the leaver into
 * the reconnect limbo BEFORE removal, so the same name can re-seat within
 * grace. Voluntary leaves never stash (lobby exit frees the seat for real).
 * @param {string} socketId
 * @param {{ stash?: boolean }} [opts]
 */
export function leaveRoom(socketId, opts = {}) {
  const room = getRoomForSocket(socketId);
  if (!room) return { ok: true, left: false };
  if (opts.stash) stashPlayer(room, socketId);
  const { removed, empty } = removeHuman(room.id, socketId);
  // Phase 5 hygiene: last-human-out destroys the room — purge its limbo too.
  if (empty) purgeRoomLimbo(room.id);
  setRoomId(socketId, null);
  try {
    ioRef?.sockets?.sockets?.get(socketId)?.leave(room.id);
  } catch {
    /* ignore — socket may be mid-disconnect */
  }
  if (!empty && ioRef && EV) {
    const { toPublic } = { toPublic: roomToPublic };
    ioRef.to(room.id).emit(EV.ROOM_UPDATE, {
      room: toPublic(room),
      leftId: socketId,
      timestamp: Date.now(),
    });
    ioRef.to(room.id).emit(EV.PLAYER_LEAVE, {
      id: socketId,
      reason: 'left room',
      timestamp: Date.now(),
    });
  }
  return { ok: true, left: removed, roomId: room.id, empty };
}

/** Disconnect path: drop from queues (rooms handled by caller with io). */
export function handleDisconnect(socketId) {
  removeFromAllQueues(socketId);
}

/** Debug helper. */
export function stats() {
  return {
    ffa: queues.ffa.length,
    tdm: queues.tdm.length,
    bot_practice: queues.bot_practice.length,
    scrap_collector: queues.scrap_collector.length,
  };
}

// Re-export for handlers that only need membership removal math.
export { removeHuman, getRoom, getRoomForSocket };
