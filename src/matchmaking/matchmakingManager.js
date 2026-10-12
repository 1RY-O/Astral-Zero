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
import { seasonId as currentSeason } from '../shared/ranked.js';
import { persistence } from '../players/persistence.js';
import { clearInput } from '../game/inputs.js';
import { normaliseDifficulty } from '../ai/personalities.js';
import {
  createRoom,
  toPublic as roomToPublic,
  getRoom,
  getRoomForSocket,
  getAnyRoom,
  removeHuman,
  endMatch,
  schedulePlaying,
  scheduleAutoEnd,
  isRatedMode,
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

// queues: queueKey → [{ socketId, name, mapId, enqueuedAt }]
// Phase 5: scrap_collector queues like ffa (instant ≥2, 5 s fallback).
// S14.6: a queueKey is a plain mode ('ffa') or its RATED variant ('ffa#ranked').
// Ranked and casual waiters live in DIFFERENT buffers — the key itself is the
// separation, so a rated room can only ever form from ranked players and a
// casual room from casual players. Unknown keys are created on first use, so
// a new rated mode never needs a literal here.
const queues = { ffa: [], tdm: [], control_point: [], bot_practice: [], scrap_collector: [] };
const queueTimers = new Map(); // queueKey → timeout

const RANKED_MARK = '#ranked';
/** Queue key for a mode + ranked flag. */
const queueKey = (mode, ranked) => (ranked ? `${mode}${RANKED_MARK}` : mode);
/** Base mode of a queue key ('ffa#ranked' → 'ffa'). */
const keyMode = (key) => (key.endsWith(RANKED_MARK) ? key.slice(0, -RANKED_MARK.length) : key);
/** Was this queue key created as a RATED queue? */
const keyRanked = (key) => key.endsWith(RANKED_MARK);
/** Get (or lazily create) the buffer for a queue key. */
function ensureQueue(key) {
  if (!Array.isArray(queues[key])) queues[key] = [];
  return queues[key];
}

const VALID_MODES = () => Object.values(GAME_MODES);

function tuningFor(mode) {
  return config.gameModes?.[mode] || { maxPlayers: 10, minToStartNow: 2, soloWaitMs: 5000 };
}

/**
 * Validate the optional Bot Practice tuning a client may request. Every value
 * is clamped/normalised HERE (server-authoritative) so a tampered or
 * out-of-range payload can never spawn an undefined bot count, difficulty,
 * grace window or passive flag.
 *
 *  - botCount: integer in [0, maxPlayers]. Anything non-numeric, negative,
 *    fractional or over the cap is clamped (not rejected) so a slightly-off
 *    client still gets a sane room rather than an error.
 *  - difficulty: one of the four tiers, else null (room falls back to its
 *    per-mode mix — which for practice is gentle by construction).
 *  - graceMs: pacified window after room boot in which bots move and aim but
 *    never fire or melee (beginner breathing room). Clamped to [0, 30000].
 *  - passive: when true the bots NEVER attack (Controls Practice targets).
 *    Strict boolean coercion — any truthy non-boolean still becomes true, so
 *    there is no stringly-typed bypass.
 *
 * @param {string} mode
 * @param {object} raw { botCount?, difficulty?, graceMs?, passive? }
 * @returns {{ botCount: number|null, difficulty: string|null, graceMs: number, passive: boolean }}
 */
export function validateBotPracticeTuning(mode, raw = {}) {
  // Only Bot Practice exposes configurable bots; other modes keep their fill.
  if (mode !== GAME_MODES.BOT_PRACTICE) {
    return { botCount: null, difficulty: null, graceMs: 0, passive: false };
  }

  const cap = Math.max(0, tuningFor(mode).maxPlayers || 4);
  let botCount = null;
  const requested = Number(raw.botCount);
  if (Number.isFinite(requested)) {
    botCount = Math.min(cap, Math.max(0, Math.floor(requested)));
  }

  const difficulty = normaliseDifficulty(raw.difficulty);

  // Grace window: finite ms clamped to [0, 30 s]; garbage → 0 (no grace).
  let graceMs = 0;
  const requestedGrace = Number(raw.graceMs);
  if (Number.isFinite(requestedGrace)) {
    graceMs = Math.min(30000, Math.max(0, Math.round(requestedGrace)));
  }

  return { botCount, difficulty, graceMs, passive: raw.passive === true };
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

/** Push fresh positions to everyone waiting in one queue (key, not mode). */
function broadcastQueuePositions(key) {
  if (!ioRef || !EV) return;
  const mode = keyMode(key);
  const ranked = keyRanked(key);
  ensureQueue(key).forEach((entry, i) => {
    ioRef.to(entry.socketId).emit(EV.QUEUE_UPDATE, {
      mode,
      // S14.6 additive: WHICH queue the position came from. The client shows
      // it so a ranked search can never read as a casual one.
      ranked,
      position: i + 1,
      playersInQueue: queues[key].length,
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
 * @param {object} [botTuning] - Optional Bot Practice tuning
 *   { botCount?, difficulty?, graceMs?, passive? }.
 *   Validated + clamped server-side; ignored for every non-practice mode.
 * @param {boolean} [rankedRequested] - S14.6: request the RATED queue.
 *   Strictly `=== true` — a truthy string can never make a queue rated. The
 *   server still decides: unrated modes reject the request outright, and the
 *   room only exists as rated when this survives down to createRoom.
 */
export function joinQueue(player, requestedMode = 'ffa', mapId = 'junkyard', botTuning = {}, rankedRequested = false) {
  if (!player?.socketId) return { ok: false, error: 'NOT_JOINED' };
  // Defense-in-depth: never seat a player who is already in a match/spectator
  // room. The socket handler already rejects this with ALREADY_IN_MATCH, but
  // joinQueue is also the authoritative path for Bot Practice's instant room —
  // guarding here too means a duplicate/replayed request can never strand the
  // player in a second, orphaned room. (getAnyRoom covers players + spectators.)
  if (getAnyRoom(player.socketId)) {
    return { ok: false, error: 'ALREADY_IN_MATCH' };
  }
  const requested = VALID_MODES().includes(requestedMode) ? requestedMode : null;
  if (!requested) return { ok: false, error: 'BAD_MODE' };

  // S14.6: asking to go RATED on a mode that carries no rating is an honest
  // NO, not a silent casual queue — the lobby must be able to show the
  // rejection instead of pretending a ladder game happened. (First-match
  // protection may still move a VALID ranked request down to practice.)
  if (rankedRequested === true && !isRatedMode(requested)) {
    return { ok: false, error: 'NOT_RATED_MODE' };
  }

  const { mode: effective, firstMatchProtection } = applyFirstMatchProtection(
    [player.name],
    requested,
  );

  removeFromAllQueues(player.socketId);

  // Server-authoritative validation of the practice tuning (count,
  // difficulty, grace window, passive flag). Runs BEFORE the room exists, so
  // the room only ever sees clamped values.
  const { botCount, difficulty, graceMs, passive } = validateBotPracticeTuning(effective, botTuning);

  // Bot practice NEVER waits and NEVER groups strangers: instant solo room.
  if (effective === GAME_MODES.BOT_PRACTICE) {
    const room = launchRoom({
      mode: effective,
      mapId,
      humans: [{ id: player.id, socketId: player.socketId, name: player.name }],
      partyCode: null,
      botCount,
      difficulty,
      graceMs,
      passive,
    });
    return {
      ok: true,
      mode: effective,
      requestedMode: requested,
      firstMatchProtection,
      // Never rated: practice is not on the rated allow-list, so even a
      // ranked request that was moved here lands in an unrated room.
      ranked: false,
      position: 0,
      roomId: room?.id || null,
      instant: true,
    };
  }

  // Ranked survives first-match protection as a REQUEST (a veteran may be
  // moved down to practice — in which case wantsRanked is false and the room
  // is simply not rated). The queue key carries the separation: a ranked
  // waiter can only ever drain with other ranked waiters.
  const wantsRanked = rankedRequested === true && isRatedMode(effective);
  const key = queueKey(effective, wantsRanked);
  ensureQueue(key);
  queues[key].push({ socketId: player.socketId, name: player.name, mapId, enqueuedAt: Date.now() });
  setQueueMode(player.socketId, effective);
  broadcastQueuePositions(key);

  // Ready now? Drain up to maxPlayers instantly (chunked if overfull).
  const tuning = tuningFor(effective);
  if (queues[key].length >= (tuning.minToStartNow || 2)) {
    const room = drainQueueToRoom(key);
    return {
      ok: true,
      mode: effective,
      requestedMode: requested,
      firstMatchProtection,
      ranked: wantsRanked,
      position: 0,
      roomId: room?.id || null,
      instant: true,
    };
  }

  // Otherwise arm the solo-fallback timer (bot-filled room even if alone).
  ensureFallbackTimer(key);
  const pos = queues[key].findIndex((q) => q.socketId === player.socketId) + 1;
  return {
    ok: true,
    mode: effective,
    requestedMode: requested,
    firstMatchProtection,
    ranked: wantsRanked,
    position: pos,
    playersInQueue: queues[key].length,
    instant: false,
  };
}

/** Arm (once) the per-queue fallback timer that force-starts small queues. */
function ensureFallbackTimer(key) {
  const queue = ensureQueue(key);
  if (!ioRef || queueTimers.has(key) || queue.length === 0) return;
  const wait = tuningFor(keyMode(key)).soloWaitMs ?? 5000;
  if (wait <= 0) return;
  const timer = setTimeout(() => {
    queueTimers.delete(key);
    if (queue.length > 0) drainQueueToRoom(key);
  }, wait);
  timer?.unref?.(); // never hold the process open for matchmaking
  queueTimers.set(key, timer);
}

/**
 * Pop up to maxPlayers off ONE queue key into ONE room (bots fill the rest).
 * Leftover players (queue > max) stay queued and re-trigger matching.
 *
 * S14.6: `key` may be a rated variant ('ffa#ranked'); the ranked flag is
 * derived from the KEY, never from a client payload at this depth, and is
 * handed to createRoom which validates it against the rated-mode allow-list.
 *
 * @param {string} queueKey 'ffa' | 'ffa#ranked' | ...
 * @returns {object|null} room
 */
export function drainQueueToRoom(queueKeyArg) {
  const key = queueKeyArg;
  const mode = keyMode(key);
  const tuning = tuningFor(mode);
  const max = tuning.maxPlayers || 10;
  const batch = ensureQueue(key).splice(0, max);
  if (batch.length === 0) return null;
  broadcastQueuePositions(key);
  if (queues[key].length === 0 && queueTimers.has(key)) {
    clearTimeout(queueTimers.get(key));
    queueTimers.delete(key);
  } else if (queues[key].length > 0) {
    ensureFallbackTimer(key);
  }
  const mapId = batch[0]?.mapId || 'junkyard';
  return launchRoom({
    mode,
    mapId,
    humans: batch.map((b) => ({ id: b.socketId, socketId: b.socketId, name: b.name })),
    partyCode: null,
    ranked: keyRanked(key),
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
 * @param {object} [tuning] - Optional Bot Practice tuning
 *   { botCount?, difficulty?, graceMs?, passive? }.
 */
export function startPartyMatch(party, requestedMode = 'ffa', mapId = 'junkyard', tuning = {}) {
  const requested = VALID_MODES().includes(requestedMode) ? requestedMode : 'ffa';
  if (!party || party.members.length === 0) return { ok: false, error: 'PARTY_NOT_FOUND' };
  const names = party.members.map((m) => m.name);
  const { mode: effective, firstMatchProtection } = applyFirstMatchProtection(names, requested);

  // Parties skip queues entirely — pull members out if they were waiting.
  for (const m of party.members) removeFromAllQueues(m.socketId);

  // Validate bot tuning against the EFFECTIVE mode (a party of new players may
  // be forced into bot_practice, in which case their tuning still applies).
  const { botCount, difficulty, graceMs, passive } = validateBotPracticeTuning(effective, tuning);

  const room = launchRoom({
    mode: effective,
    mapId,
    humans: party.members.map((m) => ({ id: m.id, socketId: m.socketId, name: m.name })),
    partyCode: party.code,
    botCount,
    difficulty,
    graceMs,
    passive,
    // S14.6: parties are NEVER rated. Ranked is a solo-queue variant — no
    // `ranked` flag reaches createRoom from this path, so a private party
    // match cannot move anyone's ladder (placement included).
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
  // botCount / difficulty / graceMs / passive ride through untouched — they
  // were validated in joinQueue/startPartyMatch before this point, so a room
  // never sees an unclamped value.
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

  // S14.6: each ranked player gets THEIR OWN rating update, addressed by
  // socket and never broadcast — "you gained 14" is a private fact, and a
  // leaked update would tell a competitor what to queue next.
  if (ended.ranked && ended.rankedByName) {
    // The room roster is the socket → display-name map. It is read from the
    // `room` handle captured above, which endMatch() has already detached from
    // the store but not destroyed.
    const season = currentSeason();
    const board = (persistence()?.leaderboard({ seasonId: season, limit: 10 }) || [])
      .map((r) => ({ name: r.displayName, rating: r.rating, wins: r.wins, losses: r.losses }));
    for (const p of room?.players || []) {
      const info = ended.rankedByName[p.name];
      if (!info) continue;
      ioRef.to(p.socketId || p.id).emit(EV.RANKED_UPDATE, {
        seasonId: season,
        you: { name: p.name, ...info },
        leaderboard: board,
        timestamp: Date.now(),
      });
    }
  }

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
  // SCOPED TO THIS ROOM'S HUMANS. This loop used to walk every connected
  // socket in the server and null their `roomId`, which is O(all clients) per
  // match end and silently wipes the room pointer of players who are currently
  // in a completely different live match.
  for (const socketId of humans) {
    setRoomId(socketId, null);
    // Release the intent store here. The leave/disconnect paths already do,
    // but a match can end without either (time limit, kill limit, overtime),
    // which used to leave a stale intent entry per player alive until they
    // joined their next room — unbounded growth across a busy server's life.
    clearInput(socketId);
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
