/**
 * Astral Zero — client-side socket event registry (FRONTEND).
 * ============================================================
 * MIRROR of the backend registry `src/sockets/events.js` (contract
 * `1.1.0-phase2`). This copy exists because the Phaser client must never
 * import from `src/sockets/` — those files are Node/server-only and pulling
 * them into the bundle would break the Vite build.
 *
 * If the backend renames something, this is the ONLY frontend file that
 * needs the matching edit; every emit/listen site imports the constant.
 *
 * DIRECTIONAL LEGEND
 *   C→S  client emits, server acks with `{ ok, ... }`
 *   S→C  server pushes, client listens only
 */

/** Contract version this client was written against (see `/api/info`). */
export const EXPECTED_SOCKET_EVENTS_VERSION = '1.4.0-phase5';

export const NET_EVENTS = Object.freeze({
  // --- Connection lifecycle -------------------------------------------------
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',
  /** S→C welcome: `{ socketId, game, serverVersion, socketEventsVersion }`. */
  CONNECTED: 'connected',
  /** S→C uniform error envelope: `{ code, message }`. */
  ERROR: 'error_event',

  // --- Player core (Phase 1 names, unchanged; room-scoped in Phase 2) -------
  PLAYER_JOIN: 'player_join',
  PLAYER_LEAVE: 'player_leave',
  PLAYER_MOVE: 'player_move',
  PLAYER_SHOOT: 'player_shoot',

  // --- Bots (server-driven; roster ships inside `room_joined`) --------------
  BOT_SPAWN: 'bot_spawn',
  BOT_UPDATE: 'bot_update',
  BOT_DEATH: 'bot_death',

  // --- Phase 3: authoritative simulation + combat -------------------------
  // The backend is landing these alongside this client. Each name is additive
  // (nothing in Phase 1/2 changed), and the client degrades gracefully when a
  // server does not implement them yet — see src/net/MatchStream.js.
  //
  /** S→C `{ tick, serverTime, phase, entities:[{id,x,y,vx,vy,hp,facing,alive,score,kills,deaths}] }`
   *  — the full world, 20 Hz. ★ The authoritative source of truth.
   *  NOTE: there is deliberately NO `heat` field. The server computes spread at
   *  fire time and ships the FINAL angle on `player_shoot`; heat is not
   *  published, so the client must never try to predict the cone. */
  ENTITY_SNAPSHOT: 'entity_snapshot',

  // --- ★ PHASE 4 CORRECTION -----------------------------------------------
  // Phase 3 of the CLIENT invented `player_hit`, `entity_hit`, `kill`,
  // `player_death` and `player_spawn` and listened for all five. The Phase 3/4
  // SERVER never declared or emitted any of them (they are absent from
  // src/sockets/events.js), so confirmed hits, kill-feed rows and respawns
  // silently never fired in a real match — the whole feedback layer was dead
  // code that only ever passed against a fake socket.
  //
  // The REAL contract routes ALL of that through three events:
  //   player_health_update  → damage taken, and carries `reason`
  //   entity_death          → death + killfeed row (victimId/killedById/cause)
  //   entity_respawn        → authoritative revive placement
  // Kept here ONLY as inert legacy names so old call sites fail loudly at
  // lookup rather than subscribing to events that will never arrive.
  // ------------------------------------------------------------------------

  /** S→C `{ id, hp, maxHp, reason, timestamp }` — the ONLY damage signal. */
  PLAYER_HEALTH_UPDATE: 'player_health_update',
  /**
   * S→C death + killfeed row.
   * `{ roomId, victimId, victimName, victimIsBot, victimTeam, killedById,
   *    killedByName, killerIsBot, cause, x, y, respawnInMs, tick, timestamp }`
   */
  ENTITY_DEATH: 'entity_death',
  /** S→C `{ roomId, id, name, x, y, hp, maxHp, isBot }` — authoritative revive. */
  ENTITY_RESPAWN: 'entity_respawn',
  /**
   * S→C `{ roomId, mode, scores:[{id,name,team,kills,deaths,score,isBot}],
   *    teams: {red,blue}|null, overtime, tick, timestamp }`
   * `overtime: true` flips the TDM HUD into sudden-death.
   */
  SCORE_UPDATE: 'score_update',
  /**
   * S→C `{ roomId, kind:'first_blood'|'streak', id, name, isBot, team,
   *    streak, text, tick, timestamp }` — medal/streak popup.
   */
  STREAK_EVENT: 'streak_event',
  /**
   * C→S late join: `{}` | `{ roomId }` | `{ mode }`
   * → ack `{ ok, roomId, mode }` or `{ ok:false, error }`. The catch-up
   * (room_joined + match_state + score_update) follows on success.
   */
  ROOM_JOIN: 'room_join',
  /** S→C `{ remaining, endsAt, duration }` — match clock. */
  MATCH_TIME: 'match_time',

  // --- Party (max 4, 6-char code, leader starts) ----------------------------
  /** C→S `{}` → ack `{ ok, party }` */
  PARTY_CREATE: 'party_create',
  /** C→S `{ code }` → ack `{ ok, party }` */
  PARTY_JOIN: 'party_join',
  /** C→S `{}` → ack `{ ok, party, disbanded }` */
  PARTY_LEAVE: 'party_leave',
  /** S→C `{ party: {...} | null }` — pushed to EVERY member on any change. */
  PARTY_UPDATE: 'party_update',
  /** C→S `{ mode, mapId? }` (leader only) → ack `{ ok, roomId, mode,
   *   requestedMode, firstMatchProtection }` */
  PARTY_START_MATCH: 'party_start_match',
  /** C→S `{ friendId } | { friendName }` → ack `{ ok, invited, partyCode }` */
  PARTY_INVITE: 'party_invite',
  /** S→C `{ partyCode, fromId, fromName, memberCount }` — sent to the friend. */
  PARTY_INVITED: 'party_invited',

  // --- Friends (in-memory, survives reconnect) ------------------------------
  /** C→S `{ friendId } | { friendName }` → ack `{ ok, friends }` */
  FRIEND_ADD: 'friend_add',
  /** C→S `{ friendId }` → ack `{ ok, friends }` */
  FRIEND_REMOVE: 'friend_remove',
  /** C→S `{}` → ack `{ ok, friends }` (explicit refresh) */
  FRIEND_LIST: 'friend_list',
  /** S→C `{ friends }` — pushed after every add/remove and on join. */
  FRIEND_UPDATE: 'friend_update',

  // --- Matchmaking (solo queue; server bot-fills) ---------------------------
  /** C→S `{ mode, mapId? }` → ack `{ ok, mode, requestedMode,
   *   firstMatchProtection, position, roomId, instant }` */
  QUEUE_JOIN: 'queue_join',
  /** C→S `{}` → ack `{ ok }` */
  QUEUE_LEAVE: 'queue_leave',
  /** S→C `{ mode, position, playersInQueue }` */
  QUEUE_UPDATE: 'queue_update',
  /** S→C `{ roomId, mode, mapId, partyCode }` — "match ready, load arena". */
  MATCH_FOUND: 'match_found',

  // --- Room lifecycle (authoritative roster; return to lobby) --------------
  /** S→C `{ room }` — ★ THE SPAWN MANIFEST (players + bots + entities). */
  ROOM_JOINED: 'room_joined',
  /** C→S `{}` → ack `{ ok, left, empty }` (voluntary exit). */
  ROOM_LEAVE: 'room_leave',
  /** S→C `{ room }` — membership delta for survivors */
  ROOM_UPDATE: 'room_update',
  /** C→S `{ reason? }` → ack `{ ok, result }`; S→C `{ roomId, results }`. */
  MATCH_END: 'match_end',
  /** S→C `{ roomId, phase, mode, mapId, players, bots, entities,
   *   countdownMs }` — countdown → playing → gameover → lobby. */
  MATCH_STATE: 'match_state',
});
/**
 * Server→client only. SocketClient refuses to emit these: the backend would
 * answer with `error_event { code: 'SERVER_ONLY_EVENT' }` anyway, so refusing
 * locally keeps the console clean and makes the bug obvious.
 */
export const SERVER_ONLY_EVENTS = Object.freeze([
  // Phase 3 — the authoritative simulation and its derived feeds. A client
  // that emitted any of these could spoof positions, damage and score for
  // everyone in the room, so SocketClient refuses them outright.
  NET_EVENTS.ENTITY_SNAPSHOT,
  NET_EVENTS.ENTITY_DEATH,
  NET_EVENTS.ENTITY_RESPAWN,
  NET_EVENTS.PLAYER_HEALTH_UPDATE,
  NET_EVENTS.SCORE_UPDATE,
  NET_EVENTS.STREAK_EVENT,
  NET_EVENTS.MATCH_TIME,
  // Phase 1/2 server-owned feeds.
  NET_EVENTS.PARTY_UPDATE,
  NET_EVENTS.PARTY_INVITED,
  NET_EVENTS.FRIEND_UPDATE,
  NET_EVENTS.QUEUE_UPDATE,
  NET_EVENTS.MATCH_FOUND,
  NET_EVENTS.ROOM_JOINED,
  NET_EVENTS.ROOM_UPDATE,
  NET_EVENTS.MATCH_STATE,
  NET_EVENTS.BOT_SPAWN,
  NET_EVENTS.BOT_UPDATE,
  NET_EVENTS.BOT_DEATH,
  NET_EVENTS.ERROR,
]);

/**
 * Lobby events probed against `/api/info → supportedSocketEvents` to decide
 * whether the connected backend implements Phase 2. When it does not, the
 * NetworkManager surfaces an explicit "backend too old" state instead of
 * silently failing every button.
 */
export const LOBBY_CONTRACT_EVENTS = Object.freeze([
  NET_EVENTS.PARTY_CREATE,
  NET_EVENTS.PARTY_JOIN,
  NET_EVENTS.PARTY_LEAVE,
  NET_EVENTS.PARTY_START_MATCH,
  NET_EVENTS.FRIEND_ADD,
  NET_EVENTS.FRIEND_REMOVE,
  NET_EVENTS.QUEUE_JOIN,
  NET_EVENTS.ROOM_JOINED,
  // The authoritative sim + every feedback feed the HUD renders from. If any
  // of these are missing the client is talking to a pre-Phase-3 backend and
  // the entire combat feedback layer would silently no-op.
  NET_EVENTS.ENTITY_SNAPSHOT,
  NET_EVENTS.ENTITY_DEATH,
  NET_EVENTS.ENTITY_RESPAWN,
  NET_EVENTS.SCORE_UPDATE,
  NET_EVENTS.STREAK_EVENT,
  NET_EVENTS.ROOM_JOIN,
]);

/**
 * Human-readable text for every ack failure code the backend can return.
 * Keeps error wording out of the UI components entirely.
 * @type {Record<string, string>}
 */
export const ERROR_MESSAGES = Object.freeze({
  NOT_JOINED: 'You are not registered with the server yet — reconnecting.',
  MISSING_CODE: 'Enter a party code first.',
  PARTY_NOT_FOUND: 'No party found with that code.',
  PARTY_FULL: 'That party is already full (4 members max).',
  NOT_IN_PARTY: 'You are not in a party.',
  NOT_LEADER: 'Only the party leader can start the match.',
  FRIEND_OFFLINE: 'That friend is not online right now.',
  FRIEND_SELF: 'You cannot invite yourself.',
  CANNOT_ADD_SELF: 'You cannot add yourself as a friend.',
  MISSING_FRIEND: 'Enter a friend name or ID.',
  FRIEND_NOT_FOUND: 'No janitor by that name.',
  ALREADY_IN_MATCH: 'You are already in a match — leave it first.',
  ROOM_FULL: 'That match is full.',
  NO_ROOM_TO_JOIN: 'No open matches to join right now.',
  INVALID_MODE: 'That game mode is not available.',
  RATE_LIMITED: 'Slow down a moment — too many requests.',
  BAD_PAYLOAD: 'The server rejected that request.',
  NOT_IN_ROOM: 'You are not in a room.',
  ROOM_NOT_FOUND: 'That room no longer exists.',
  TIMEOUT: 'The server did not respond in time.',
  OFFLINE: 'Not connected to the server.',
});

/**
 * Turn any ack / error_event into a message safe to show a player.
 *
 * NOTE the two different failure channels in the contract:
 *   - ack callbacks use  `{ ok: false, error: 'PARTY_FULL' }`
 *   - error_event pushes use `{ code: 'NOT_LEADER', message: '...' }`
 * Both are handled here so no caller has to care.
 *
 * @param {{ok?: boolean, code?: string, error?: string, message?: string}} res
 * @returns {string}
 */
export function describeError(res = {}) {
  if (!res) return 'Something went wrong.';
  const key = res.error || res.code;
  if (key && ERROR_MESSAGES[key]) return ERROR_MESSAGES[key];
  return res.message || (key ? `Request failed (${key}).` : 'Request failed.');
}

export default NET_EVENTS;
