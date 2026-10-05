/**
 * Astral Zero — Reconnect grace + late join (Phase 4).
 * ============================================================
 * TWO flows, one seating path:
 *
 *  A. RECONNECT (disconnect → same name returns within grace):
 *     On a mid-match disconnect we STASH { team, kills, deaths, score } keyed
 *     by normalized username (limbo Map, 60 s TTL). The next `player_join`
 *     with that name re-seats the player: roster row + sim entity restored
 *     (KDA kept, streak reset — death breaks runs, and a disconnect is a
 *     death-shaped hole), socket joins the io room, catch-up manifest sent.
 *     Stash happens ONLY on disconnect, never on voluntary `room_leave`
 *     (leaving for the lobby is a choice; the seat is freed immediately).
 *
 *  B. LATE JOIN (`room_join` into a live room with space):
 *     A lobby player may enter a `playing`/`countdown` room mid-match when
 *     humans < mode maxPlayers. Practice rooms always qualify (max 4 humans);
 *     real modes require finished-match veteran status (first-match
 *     protection extends to doors, not just queues). Bots are NOT rebalanced
 *     (documented) — the joiner is a bonus body, teams picked for balance.
 *
 * CATCH-UP (both flows): the joiner gets `room_joined` (full manifest) +
 * current `match_state` (phase) + `score_update` (table); survivors get
 * `room_update`. The joiner spawns at a SAFE spawn with fresh protection —
 * running straight into a firefight with none would be a spawn-kill.
 *
 * All state in-memory; limbo entries expire lazily on lookup.
 */

import config from '../server-config.js';
import { normalizeKey, setRoomId } from '../players/playerStore.js';
import { getRoom, toPublic, listRooms } from '../rooms/roomManager.js';
import { createEntity } from './entities.js';
import { safeSpawn } from './arena.js';
import { scoreboard } from './scoring.js';

/** nameKey → { roomId, team, kills, deaths, score, name, leftAt } */
const limbo = new Map();

const graceMs = () => (config.sim?.reconnectGraceSec || 60) * 1000;
const spectatorCap = () => config.rooms?.maxSpectators || 8;

function maxHumansFor(mode) {
  return config.gameModes?.[mode]?.maxPlayers || 10;
}

/**
 * Drop all limbo entries pointing at a destroyed room (memory hygiene —
 * called whenever a room is destroyed with humans still stashed).
 * @returns {number} purged count
 */
export function purgeRoomLimbo(roomId) {
  let n = 0;
  for (const [key, rec] of limbo) {
    if (rec.roomId === roomId) {
      limbo.delete(key);
      n += 1;
    }
  }
  return n;
}

/**
 * Stash a mid-match disconnect for later re-seating. Call BEFORE roster/sim
 * removal (reads both). Safe to call when absent (returns false).
 */
export function stashPlayer(room, socketId) {
  if (!room) return false;
  const row = (room.players || []).find((p) => p.socketId === socketId || p.id === socketId);
  const sim = room.sim?.entities?.get(socketId);
  if (!row && !sim) return false;
  const name = row?.name || sim?.name;
  if (!name) return false;
  limbo.set(normalizeKey(name), {
    roomId: room.id,
    team: row?.team ?? sim?.team ?? null,
    kills: sim?.kills || 0,
    deaths: sim?.deaths || 0,
    score: sim?.score || 0,
    name,
    leftAt: Date.now(),
  });
  return true;
}

/**
 * Attempt re-seat on `player_join`. Emits the full catch-up when it hits.
 * @returns {{ rejoined: boolean, roomId?: string }}
 */
export function tryRejoin(io, EV, socket, player) {
  const key = normalizeKey(player?.name);
  const rec = key ? limbo.get(key) : null;
  if (!rec) return { rejoined: false };
  // Expired or room gone/finished → free the slot, normal join continues.
  if (Date.now() - rec.leftAt > graceMs()) {
    limbo.delete(key);
    return { rejoined: false };
  }
  const room = getRoom(rec.roomId);
  if (!room || (room.phase !== 'playing' && room.phase !== 'countdown')) {
    limbo.delete(key);
    return { rejoined: false };
  }
  // Someone else already plays under this name (duplicate tab)? Don't steal.
  const nameTaken = (room.players || []).some(
    (p) => normalizeKey(p.name) === key && p.socketId !== socket.id,
  );
  if (nameTaken) {
    limbo.delete(key);
    return { rejoined: false };
  }
  limbo.delete(key);
  seat(io, EV, room, socket, rec.name, {
    team: rec.team,
    kills: rec.kills,
    deaths: rec.deaths,
    score: rec.score,
  });
  return { rejoined: true, roomId: room.id };
}

/**
 * Find a live room with human space. Mode filter optional (late-join UI).
 * @returns {object|null} internal room
 */
export function findJoinableRoom(mode = null) {
  for (const room of listRooms()) {
    if (room.phase !== 'playing' && room.phase !== 'countdown') continue;
    if (mode && room.mode !== mode) continue;
    if ((room.players || []).length >= maxHumansFor(room.mode)) continue;
    return room;
  }
  return null;
}

/**
 * Voluntary late join (`room_join` handler): seat a lobby player mid-match.
 * @returns {{ ok: boolean, roomId?: string, mode?: string, error?: string }}
 */
export function lateJoin(io, EV, room, socket, playerName) {
  if (!room || (room.phase !== 'playing' && room.phase !== 'countdown')) {
    return { ok: false, error: 'NO_ROOM_TO_JOIN' };
  }
  if ((room.players || []).length >= maxHumansFor(room.mode)) {
    return { ok: false, error: 'ROOM_FULL' };
  }
  const key = normalizeKey(playerName);
  if ((room.players || []).some((p) => normalizeKey(p.name) === key)) {
    return { ok: false, error: 'ALREADY_IN_MATCH' };
  }
  seat(io, EV, room, socket, playerName, { team: pickTeam(room) });
  return { ok: true, roomId: room.id, mode: room.mode };
}

/** tdm: smaller live team (ties → red); other modes: null. */
function pickTeam(room) {
  if (room.mode !== 'tdm') return null;
  let red = 0;
  let blue = 0;
  if (room.sim?.entities) {
    for (const e of room.sim.entities.values()) {
      if (!e.alive || e.disconnected) continue;
      if (e.team === 'red') red += 1;
      else if (e.team === 'blue') blue += 1;
    }
  }
  return red <= blue ? 'red' : 'blue';
}

/**
 * Phase 5 spectator seat: full feed, no hitbox. The socket joins the io
 * room (snapshots, scores, deaths, medals arrive automatically) but gets NO
 * roster row and NO sim entity — input is accepted and ignored, shots are
 * rejected trackside (see sockets/index.js). Catch-up manifest included so
 * observers render instantly.
 * @returns {{ ok: boolean, roomId?: string, spectator?: boolean, error?: string }}
 */
export function seatSpectator(io, EV, room, socket, playerName) {
  if (!room || (room.phase !== 'playing' && room.phase !== 'countdown')) {
    return { ok: false, error: 'NO_ROOM_TO_JOIN' };
  }
  room.spectators = room.spectators || [];
  if (room.spectators.some((s) => s.socketId === socket.id)) {
    return { ok: true, roomId: room.id, spectator: true };
  }
  if (room.spectators.length >= spectatorCap()) {
    return { ok: false, error: 'ROOM_FULL' };
  }
  const seat = { socketId: socket.id, name: String(playerName).slice(0, 24) };
  room.spectators.push(seat);
  socket.join(room.id);
  setRoomId(socket.id, room.id);

  const now = Date.now();
  socket.emit(EV.ROOM_JOINED, { room: toPublic(room), timestamp: now });
  socket.emit(EV.MATCH_STATE, {
    roomId: room.id,
    phase: room.phase,
    mode: room.mode,
    mapId: room.mapId,
    playerCount: room.players.length,
    timestamp: now,
  });
  socket.emit(EV.SCORE_UPDATE, {
    roomId: room.id,
    mode: room.mode,
    scores: scoreboard(room),
    teams: room.mode === 'tdm' && room.sim ? { ...room.sim.teamScores } : null,
    overtime: Boolean(room.sim?.overtime),
    tick: room.sim?.tick || 0,
    timestamp: now,
  });
  socket.broadcast.to(room.id).emit(EV.ROOM_UPDATE, {
    room: toPublic(room),
    joinedSpectatorId: socket.id,
    timestamp: now,
  });
  return { ok: true, roomId: room.id, mode: room.mode, spectator: true };
}

/**
 * Shared seating: roster row + sim entity + io room + catch-up + notify.
 * Restored stats ride `restore` (reconnect); late joins pass team only.
 */
function seat(io, EV, room, socket, playerName, restore = {}) {
  const enemies = [];
  const all = [];
  if (room.sim?.entities) {
    for (const o of room.sim.entities.values()) {
      if (!o.alive) continue;
      all.push(o);
      const hostile = !restore.team || !o.team ? true : restore.team !== o.team;
      if (hostile) enemies.push(o);
    }
  }
  const spot = safeSpawn(enemies, all);
  const row = {
    id: socket.id,
    socketId: socket.id,
    name: String(playerName).slice(0, 24),
    team: restore.team ?? pickTeam(room),
    x: spot.x,
    y: spot.y,
    hp: 100,
    maxHp: 100,
    isBot: false,
  };
  room.players.push(row);
  if (!room.humanIds.includes(socket.id)) room.humanIds.push(socket.id);

  if (room.sim?.entities) {
    const e = createEntity(row, socket.id);
    e.kills = restore.kills || 0;
    e.deaths = restore.deaths || 0;
    e.score = restore.score || 0;
    e.streak = 0;
    e.cooldownScale = 1;
    e.damageScale = 1;
    e.weaponId = 'scrap-rifle';
    room.sim.entities.set(e.id, e);
  }

  socket.join(room.id);
  setRoomId(socket.id, room.id);

  // Catch-up manifest for the joiner (same channels as a fresh boot).
  const now = Date.now();
  socket.emit(EV.ROOM_JOINED, { room: toPublic(room), timestamp: now });
  socket.emit(EV.MATCH_STATE, {
    roomId: room.id,
    phase: room.phase,
    mode: room.mode,
    mapId: room.mapId,
    playerCount: room.players.length,
    timestamp: now,
  });
  socket.emit(EV.SCORE_UPDATE, {
    roomId: room.id,
    mode: room.mode,
    scores: scoreboard(room),
    teams: room.mode === 'tdm' && room.sim ? { ...room.sim.teamScores } : null,
    tick: room.sim?.tick || 0,
    timestamp: now,
  });

  // Survivors refresh (broadcast excludes the joiner, who just got the manifest).
  socket.broadcast.to(room.id).emit(EV.ROOM_UPDATE, {
    room: toPublic(room),
    joinedId: socket.id,
    timestamp: now,
  });
}

/** Debug helper. */
export function stats() {
  return { limboSize: limbo.size };
}
