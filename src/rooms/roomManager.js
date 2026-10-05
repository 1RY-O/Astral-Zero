/**
 * Astral Zero — Room manager (Phase 2).
 * ============================================================
 * LIFECYCLE (locked requirement):
 *  1. Create room (solo queue fill OR whole party moved together).
 *  2. Load all players (+ bots) into the room — every human socket
 *     `join(roomId)`s the Socket.io room for scoped broadcasts.
 *  3. Send `room_joined` (full roster) + `match_state` (countdown →
 *     playing) so the Phaser client can spawn everyone.
 *  4. Authoritative roster entries: { id, name, team, x, y, hp, maxHp, isBot }.
 *  5. On match end → `match_end` + `match_state{ phase:'lobby' }`,
 *     sockets leave the io room, party links restored.
 *
 * PHASES: 'lobby' | 'countdown' | 'playing' | 'gameover'
 *  - We reuse the Phase 1 `match_state` name (extended shape) so old
 *    Phaser listeners keep working; `room_joined` carries the roster.
 *
 * All in-memory. Match history is reported to playerStore so
 * first-match protection can graduate veterans.
 */

import config from '../server-config.js';
import { makeBots } from '../bots/botFactory.js';
import { recordMatchFinish } from '../players/playerStore.js';
import { liveRosterRow } from '../game/entities.js';
import { clearInput } from '../game/inputs.js';
import { buildMatchResult } from '../game/scoring.js';
import { resolveMap, mapToWire } from '../game/maps.js';

const rooms = new Map(); // roomId → room
let roomSeq = 0;

/**
 * Spawn from the MAP's spawn table (floor spread + platform tops) with a
 * small jitter so parties don't stack. Phase 5 replaces the old mid-air
 * scatter — everyone materialises ON a surface, ready to move instantly.
 */
function spawnForIndex(map, index) {
  const pts = map.spawns && map.spawns.length ? map.spawns : [{ x: 640, y: 650 }];
  const p = pts[index % pts.length];
  return {
    x: Math.round(p.x + (Math.random() - 0.5) * 40),
    y: p.y,
  };
}

/**
 * Create a room from human participants. Bots are auto-filled.
 * Does NOT emit — the caller (matchmaking) fans out `room_joined`,
 * `match_found`, `match_state` via `io` (needs sockets, not just state).
 *
 * @param {object} opts { mode, mapId?, humans: [{ id, socketId, name }], partyCode? }
 * @returns {object} room (internal ref)
 */
export function createRoom(opts = {}) {
  const { mode = 'ffa', mapId = 'junkyard', humans = [], partyCode = null } = opts;
  roomSeq += 1;
  const id = `room_${Date.now().toString(36)}_${roomSeq}`;
  // Phase 5: mapId stays EXACTLY as the client sent it ('junkyard' et al —
  // old clients compare this string); physics + manifest use the resolved
  // canonical def (room.map), so legacy ids simulate identically.
  const map = resolveMap(mapId);

  const players = humans.map((h, i) => {
    const { x, y } = spawnForIndex(map, i);
    return {
      id: h.socketId || h.id, // authoritative id = live socket id
      socketId: h.socketId || h.id,
      name: h.name,
      // tdm: alternate red/blue in join order (party of friends may split —
      // Phase 3 will add team-aware party placement; documented in .md).
      team: mode === 'tdm' ? (i % 2 === 0 ? 'red' : 'blue') : null,
      x,
      y,
      hp: 100,
      maxHp: 100,
      isBot: false,
    };
  });

  const bots = makeBots(
    // botsNeeded lives in botFactory; inline equivalent to avoid import cycle:
    botCountFor(mode, humans.length),
    mode,
    mapId,
  );

  const room = {
    id,
    mode,
    mapId, // as-sent (compat) — canonical def lives on room.map
    map, // resolved map def (physics, spawns, zones, stations)
    phase: 'countdown',
    players, // humans only (authoritative)
    bots, // bots only
    spectators: [], // Phase 5: [{ socketId, name }] observers (no hitbox)
    partyCode, // which party filled this room (if any)
    humanIds: humans.map((h) => h.socketId || h.id),
    createdAt: Date.now(),
    countdownMs: config.rooms?.countdownMs || 3000,
    endsAt: Date.now() + (config.rooms?.autoEndMs || 5 * 60 * 1000),
    autoEndTimer: null,
    playTimer: null,
  };
  rooms.set(id, room);
  return room;
}

/** Local copy of bot-fill counts (mirrors botFactory.botsNeeded). */
function botCountFor(mode, humanCount) {
  const tuning = config.gameModes?.[mode] || {};
  if (mode === 'bot_practice') return Math.max(0, (tuning.targetTotal || 6) - humanCount);
  if (mode === 'tdm') return Math.max(0, 8 - humanCount);
  return Math.max(0, Math.min(tuning.targetTotal || 6, tuning.maxPlayers || 10) - humanCount);
}

/**
 * Public snapshot sent to clients. `entities` unifies humans + bots so
 * Phaser can spawn everything in ONE loop; `players`/`bots` stay for
 * readers that prefer them split.
 *
 * Phase 3: when the sim is live (room.sim exists), roster rows carry LIVE
 * HP/positions (so `room_update` after a kill shows the corpse, not stale
 * spawn values). Pre-play the spawn manifest is served unchanged.
 *
 * Phase 5: adds `map` (full definition: bounds, platforms, zones, stations —
 * clients render hazards/docks from this, no second fetch), `tokens`
 * (live scrap tokens, scrap mode), and `spectators` (observer seats).
 */
export function toPublic(room) {
  if (!room) return null;
  const now = Date.now();
  const players = room.players.map((p) => liveRosterRow(p, room.sim?.entities, now));
  const bots = room.bots.map((b) => liveRosterRow(b, room.sim?.entities, now));
  return {
    roomId: room.id,
    mode: room.mode,
    mapId: room.mapId,
    map: mapToWire(room.map || resolveMap(room.mapId)),
    phase: room.phase,
    players,
    bots,
    entities: [...players, ...bots],
    tokens: (room.sim?.tokens || []).map((t) => ({ ...t })),
    spectators: (room.spectators || []).map((s) => ({ ...s })),
    spectatorCount: (room.spectators || []).length,
    playerCount: players.length,
    botCount: bots.length,
    countdownMs: room.countdownMs,
    createdAt: room.createdAt,
  };
}

/** @param {string} roomId */
export function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

/** All live rooms (the sim loop iterates this; read-only use). */
export function listRooms() {
  return [...rooms.values()];
}

/** @param {string} socketId → room containing this human (if any) */
export function getRoomForSocket(socketId) {
  for (const room of rooms.values()) {
    if (room.humanIds.includes(socketId)) return room;
  }
  return null;
}

/**
 * Phase 5 spectator helpers. Spectators sit in the io room (full feed) with
 * NO sim entity (no hitbox, no input consumed). Seats are capped
 * (rooms.maxSpectators) and freed on leave/disconnect/match end.
 */

/** @param {string} socketId → room where this socket spectates (if any) */
export function getSpectatorRoom(socketId) {
  for (const room of rooms.values()) {
    if ((room.spectators || []).some((s) => s.socketId === socketId)) return room;
  }
  return null;
}

/** Humans first, then spectators (match_end requests, queue guards). */
export function getAnyRoom(socketId) {
  return getRoomForSocket(socketId) || getSpectatorRoom(socketId);
}

/** Remove one spectator seat. @returns {boolean} removed */
export function removeSpectator(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return false;
  const before = (room.spectators || []).length;
  room.spectators = (room.spectators || []).filter((s) => s.socketId !== socketId);
  return room.spectators.length !== before;
}

/** Sweep every room (disconnect path — spectators never stash). */
export function removeSpectatorEverywhere(socketId) {
  let removed = false;
  for (const room of rooms.values()) {
    if (removeSpectator(room.id, socketId)) removed = true;
  }
  return removed;
}

/**
 * Move a room countdown → playing after `countdownMs`.
 * Emits `match_state{ phase:'playing' }` to the io room.
 * @param {object} io Socket.io server
 * @param {object} room internal ref
 * @param {string} eventsMatchState event name ('match_state')
 */
export function schedulePlaying(io, room, eventsMatchState) {
  clearTimeout(room.playTimer);
  room.playTimer = setTimeout(() => {
    if (room.phase !== 'countdown') return;
    room.phase = 'playing';
    io.to(room.id).emit(eventsMatchState, {
      roomId: room.id,
      phase: 'playing',
      mode: room.mode,
      mapId: room.mapId,
      playerCount: room.players.length,
      timestamp: Date.now(),
    });
  }, room.countdownMs);
  // Unref so CLI smoke tests can exit even with pending timers.
  room.playTimer?.unref?.();
}

/**
 * Safety auto-end (5 min default). Real matches end early via endMatch().
 * @param {object} io
 * @param {object} room
 * @param {object} events { matchState, matchEnd }
 * @param {Function} onEnd callback(io, room, reason) — actual fan-out lives in handlers
 */
export function scheduleAutoEnd(io, room, events, onEnd) {
  clearTimeout(room.autoEndTimer);
  const delay = Math.max(1000, room.endsAt - Date.now());
  room.autoEndTimer = setTimeout(() => onEnd(io, room, 'timeout'), delay);
  room.autoEndTimer?.unref?.();
}

/**
 * Remove one human from a room (voluntary leave or disconnect).
 * Phase 3: also drops the sim entity (corpses of leavers don't linger)
 * and forgets their input (no phantom steering).
 * @returns {{ room: object|null, removed: boolean, empty: boolean }}
 */
export function removeHuman(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return { room: null, removed: false, empty: true };
  const before = room.players.length;
  room.players = room.players.filter((p) => p.socketId !== socketId && p.id !== socketId);
  room.humanIds = room.humanIds.filter((id) => id !== socketId);
  room.sim?.entities?.delete(socketId);
  clearInput(socketId);
  const removed = room.players.length !== before;
  // Empty rooms (no humans left) are destroyed — bots don't hold rooms open.
  const empty = room.humanIds.length === 0;
  if (empty) destroyRoom(roomId);
  return { room: empty ? null : room, removed, empty };
}

/**
 * End a match: record history (graduates veterans), flip phase, destroy.
 * The HANDLER fans out `match_end` + lobby `match_state` + socket.leave —
 * this function only mutates state and builds the result payload.
 *
 * Phase 3: the result carries REAL scores + winner via scoring.js
 * (built BEFORE destroy — the sim dies with the room).
 *
 * @param {string} roomId
 * @param {string} reason 'score_limit' | 'time_limit' | 'draw' | 'practice_complete' | 'finished' | 'timeout' | 'manual' ...
 * @returns {{ ok: boolean, result?: object, error?: string }}
 */
export function endMatch(roomId, reason = 'finished') {
  const room = rooms.get(roomId);
  if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
  clearTimeout(room.playTimer);
  clearTimeout(room.autoEndTimer);
  room.phase = 'gameover';

  const humans = room.players.map((p) => p.name);

  // Phase 5: build the result FIRST (XP table needs the live sim), THEN
  // bank XP into profiles. Order matters — destroy() ends the sim.
  // Win info may already exist (loop decided via checkWin); manual/auto ends
  // recompute from the live table so the scoreboard is never stale.
  const winInfo = room.sim?.winInfo || null;
  const result = buildMatchResult(room, reason, winInfo, humans);
  recordMatchFinish(humans, room.mode, result.xpByName || {});
  destroyRoom(roomId);
  return { ok: true, result, humans, partyCode: room.partyCode, mode: room.mode };
}

/** Destroy without results (internal cleanup). */
export function destroyRoom(roomId) {
  const room = rooms.get(roomId);
  if (room) {
    clearTimeout(room.playTimer);
    clearTimeout(room.autoEndTimer);
  }
  return rooms.delete(roomId);
}

/** Debug helper. */
export function stats() {
  return { roomCount: rooms.size };
}
