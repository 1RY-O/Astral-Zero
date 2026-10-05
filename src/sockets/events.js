/**
 * Astral Zero — Socket.io event name registry (single source of truth).
 * ============================================================
 * Import this file from BOTH:
 *  - src/sockets/index.js (server handlers), and
 *  - future frontend netcode (copy the strings into Phaser).
 *
 * Why a registry instead of raw strings? A typo in 'player_shoot'
 * vs 'player_shot' would silently break gunfire. Central constants
 * + `websocket_events.md` prevent that class of bug.
 *
 * CONTRACT VERSIONING:
 *  - Bump SOCKET_EVENTS_VERSION on ANY breaking change
 *    (rename / remove / change payload shape).
 *  - Additive changes (new optional event) bump MINOR only.
 *  - `/api/info` exposes the current version so the Phaser client
 *    can warn on mismatch at boot.
 *
 * FULL JSON SHAPES live in websocket_events.md (repo root).
 * This file holds NAMES ONLY — intentionally no game logic.
 *
 * Phase 2 adds: parties, friends, matchmaking queues, rooms.
 * All Phase 1 names are UNCHANGED (backward compatible).
 *
 * Phase 3 adds: authoritative sim (player_input, entity_snapshot),
 * combat lifecycle (entity_death, entity_respawn, score_update).
 * Legacy movement/combat events KEEP their names; in-room semantics become
 * server-authoritative (see websocket_events.md §13). Out-of-room (lobby)
 * behavior is byte-identical to Phase 2.
 *
 * Phase 4 adds: lag-compensated hits (server-internal, no wire change),
 * killfeed medals (streak_event), late join (room_join), reconnect grace
 * (player_join ack gains optional rejoined/roomId), TDM overtime
 * (score_update gains overtime flag; match_end gains 'overtime' reason).
 * Everything is ADDITIVE — 1.0–1.2 clients keep working untouched.
 *
 * Phase 5 adds: 3 authoritative maps (room_joined.map + match_state.map),
 * scrap_collector mode (tokens in entity_snapshot, scrap_event economy),
 * spectator booths (room_joined.spectators, room_update joinedSpectatorId,
 * SPECTATING rejections), progression in match_end (xp/level/medals/mvp/
 * telemetry on score rows). All ADDITIVE — 1.0–1.3 keeps working.
 */

export const SOCKET_EVENTS_VERSION = '1.4.0-phase5';

export const SOCKET_EVENTS = Object.freeze({
  // --- Connection lifecycle (Socket.io built-ins + our hello) ---
  CONNECTION: 'connection', // built-in: fired server-side per client
  DISCONNECT: 'disconnect', // built-in: fired on leave/timeout
  CONNECTED: 'connected', // S->C: welcome + socket id + contract version

  // --- Player core (Phase 1: skeleton, Phase 2: room-scoped relay) ---
  PLAYER_JOIN: 'player_join', // C->S then S->C broadcast (lobby presence)
  PLAYER_LEAVE: 'player_leave', // S->C broadcast (built on disconnect)
  PLAYER_MOVE: 'player_move', // C->S legacy intent bridge (authoritative in rooms)
  PLAYER_SHOOT: 'player_shoot', // C->S validated trigger (server spawns shells)
  PLAYER_MELEE: 'player_melee', // C->S validated swing (server arc-tests)
  PLAYER_HEALTH_UPDATE: 'player_health_update', // S->C ONLY (server is truth)

  // --- Bots (Phase 1: shape defined, Phase 2: spawned per-room) ---
  BOT_SPAWN: 'bot_spawn', // S->C (per-bot; also batched inside match_state/room_joined)
  BOT_UPDATE: 'bot_update', // S->C (bulk snapshot)
  BOT_DEATH: 'bot_death', // S->C

  // --- Reserved for future features (defined early, implemented later) ---
  // Keeping names stable NOW avoids breaking the Phaser client later.
  PUZZLE_SOLVED: 'puzzle_solved', // C->S (mid-fight puzzle completion)
  JUMPSCARE_TRIGGER: 'jumpscare_trigger', // S->C (server tells client to scare)
  ROCKET_JUMP: 'rocket_jump', // C->S (easter egg movement tech)
  PICKUP_COLLECTED: 'pickup_collected', // C->S (ammo/health/scrap)
  MATCH_STATE: 'match_state', // S->C (lobby → countdown → playing → gameover)
  ERROR: 'error_event', // S->C: uniform error envelope (avoid clash w/ built-in 'error')

  // --- Phase 2: Party system (max 4, 6-char code, leader starts) ---
  PARTY_CREATE: 'party_create', // C->S { name? } → ack { ok, party }
  PARTY_JOIN: 'party_join', // C->S { code } → ack { ok, party }
  PARTY_LEAVE: 'party_leave', // C->S {} → ack { ok } + party_update to rest
  PARTY_UPDATE: 'party_update', // S->C { party | null } real-time member sync
  PARTY_START_MATCH: 'party_start_match', // C->S { mode } (leader only) → room
  PARTY_INVITE: 'party_invite', // C->S { friendId?, friendName? } invite w/o code
  PARTY_INVITED: 'party_invited', // S->C { partyCode, fromId, fromName } to invitee

  // --- Phase 2: Friends system (in-memory, survives reconnect) ---
  FRIEND_ADD: 'friend_add', // C->S { friendId?, friendName? } → ack { ok, friends }
  FRIEND_REMOVE: 'friend_remove', // C->S { friendId } → ack { ok, friends }
  FRIEND_LIST: 'friend_list', // C->S {} → ack { ok, friends }
  FRIEND_UPDATE: 'friend_update', // S->C { friends } push after add/remove/presence

  // --- Phase 2: Matchmaking (solo queue + party start + bot fill) ---
  QUEUE_JOIN: 'queue_join', // C->S { mode } → ack { ok, mode (effective), position }
  QUEUE_LEAVE: 'queue_leave', // C->S {} → ack { ok }
  QUEUE_UPDATE: 'queue_update', // S->C { mode, position, playersInQueue }
  MATCH_FOUND: 'match_found', // S->C { roomId, mode, mapId } lobby UI hook

  // --- Phase 2: Room lifecycle (authoritative roster, return to lobby) ---
  ROOM_JOINED: 'room_joined', // S->C { room } full roster (players + bots) to spawn
  ROOM_LEAVE: 'room_leave', // C->S {} voluntary exit → ack + room_update
  ROOM_UPDATE: 'room_update', // S->C { room } membership delta (join/leave)
  MATCH_END: 'match_end', // S->C { roomId, results, reason } + C->S request (stub)

  // --- Phase 3: authoritative sim + combat lifecycle ---
  PLAYER_INPUT: 'player_input', // C->S intent { moveX, jump, aim, fire, melee, seq } → ack
  ENTITY_SNAPSHOT: 'entity_snapshot', // S->C { roomId, tick, serverTime, entities } 20 Hz
  ENTITY_DEATH: 'entity_death', // S->C { victim, killer, cause, respawnInMs }
  ENTITY_RESPAWN: 'entity_respawn', // S->C { id, x, y, hp } safe-spawn revive
  SCORE_UPDATE: 'score_update', // S->C { scores, teams } on kills + match start

  // --- Phase 4: killfeed medals + late join (additive) ---
  STREAK_EVENT: 'streak_event', // S->C { kind, id, name, streak, text } first blood + tiers
  ROOM_JOIN: 'room_join', // C->S { roomId? } late join a live room → ack + catch-up

  // --- Phase 5: scrap economy (additive) ---
  SCRAP_EVENT: 'scrap_event', // S->C { kind: drop|pickup|deposit, byId, amount, ... }
});

/**
 * Phase 2 game modes (locked by design), plus Phase 5's scrap_collector.
 *  - ffa:          Free-for-All, max 10 players (humans + bot fill).
 *  - tdm:          Team Deathmatch, 4v4 (8 total, red vs blue).
 *  - bot_practice: friendly practice, human(s) vs bots only.
 *  - scrap_collector: bank dropped scrap at docks; most banked wins.
 *
 * Kept here (next to event names) so client + server share literals.
 * Tuning (targets, timers) lives in src/server-config.js.
 */
export const GAME_MODES = Object.freeze({
  FFA: 'ffa',
  TDM: 'tdm',
  BOT_PRACTICE: 'bot_practice',
  SCRAP: 'scrap_collector',
});

export const GAME_MODE_LIST = Object.freeze(Object.values(GAME_MODES));
