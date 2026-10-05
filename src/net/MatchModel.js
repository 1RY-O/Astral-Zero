/**
 * Astral Zero — match payload normalisation (FRONTEND).
 * ============================================================
 * Converts the server's roster payloads into ONE predictable shape the Arena
 * scene can trust. The authoritative manifest arrives on `room_joined` as
 * `{ room }` (see src/rooms/roomManager.js → toPublic):
 *
 *   room = {
 *     roomId, mode, mapId, phase,
 *     players: [{ id, socketId, name, team, x, y, hp, maxHp, isBot }],
 *     bots:    [{ id, botId, name, botType, team, x, y, hp, maxHp, isBot }],
 *     entities: [...players, ...bots],   // convenience union
 *     playerCount, botCount, countdownMs
 *   }
 *
 *   → normalised to { roomId, mode, mapId, phase, players[], bots[],
 *                     teams{}, localPlayerId, countdownMs, ... }
 *
 * The same entity shape is reused by `match_state` (countdown payload), by the
 * per-entity `bot_spawn` push and by `room_update`, so ONE normaliser handles
 * all four — no duplicated parsing in the Arena.
 *
 * This module is pure (no Phaser, no network), so it is trivially testable.
 */

import { MATCH_MODES, MATCH_SPAWNS, PARTY, TEAMS } from '../config/lobbyConfig.js';

/** Valid mode ids we know how to spawn. */
export const VALID_MODES = Object.keys(MATCH_MODES);


/**
 * Coerce anything into a usable mode id, defaulting to Bot Practice (the
 * friendliest, always-spawnable mode) when the server says something new.
 * @param {string|null|undefined} mode
 * @returns {string}
 */
export function normaliseMode(mode) {
  if (typeof mode !== 'string') return 'bot_practice';
  const lower = mode.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (VALID_MODES.includes(lower)) return lower;

  // Friendly aliases so small naming differences don't break the lobby.
  const aliases = {
    freeforall: 'ffa',
    free_for_all: 'ffa',
    deathmatch: 'ffa',
    team_deathmatch: 'tdm',
    teamdeathmatch: 'tdm',
    bot: 'bot_practice',
    bots: 'bot_practice',
    botpractice: 'bot_practice',
    practice: 'bot_practice',
    training: 'bot_practice',
  };
  return aliases[lower] ?? 'bot_practice';
}

/**
 * Convert a team label into one of our two canonical team ids.
 * @param {any} raw
 * @param {number} index - Used to alternate when a mode has teams but the
 *   payload did not bother assigning one.
 * @returns {string} 'red' | 'blue'
 */
function normaliseTeam(raw, index) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (['blue', 'amber', 'orange', 'b', '1', 'team_b'].includes(value)) return 'blue';
  if (['red', 'cyan', 'crimson', 'r', '0', 'team_a', 'alpha'].includes(value)) return 'red';
  // Fall back to a balanced A/B split so TDM is never 3v0.
  return index % 2 === 0 ? 'red' : 'blue';
}

/**
 * True when the server downgraded the request because the player is on their
 * very first match (anti-stomp protection). Several aliases are accepted
 * because the flag may ride on the match, on the player, or inside a notice.
 * @param {object} raw
 * @param {object|null} localPlayer
 * @returns {boolean}
 */
function detectFirstMatchProtection(raw, localPlayer) {
  if (raw.firstMatchProtection === true) return true;
  if (raw.protection === 'first_match' || raw.protected === 'first_match') return true;
  if (localPlayer && (localPlayer.firstMatch === true || localPlayer.matchesPlayed === 0)) return true;
  return typeof raw.notice === 'string' && /first match/i.test(raw.notice);
}

/**
 * @param {string} code
 * @returns {string} Upper-cased, trimmed, alphanumeric-only party code.
 */
export function normalisePartyCode(code) {
  return String(code ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Party code validation shared by the UI (to disable the Join button) and
 * the network layer (to avoid a pointless round-trip).
 * @param {string} code
 * @returns {{ valid: boolean, reason: string|null }}
 */
export function validatePartyCode(code) {
  const clean = normalisePartyCode(code);
  if (clean.length === 0) return { valid: false, reason: 'Enter a party code.' };
  if (clean.length !== PARTY.codeLength) {
    return { valid: false, reason: `Party codes are exactly ${PARTY.codeLength} characters.` };
  }
  return { valid: true, reason: null };
}

/**
 * Normalise one party member entry.
 * @param {object} entry
 * @param {number} index
 * @returns {{id: string, name: string, isLeader: boolean, isSelf: boolean, ready: boolean}}
 */
export function normaliseMember(entry = {}, index = 0) {
  const id = String(entry.id ?? entry.playerId ?? entry.socketId ?? `member_${index}`);
  return {
    id,
    name: String(entry.name ?? entry.displayName ?? 'Janitor').slice(0, 24),
    isLeader: Boolean(entry.isLeader ?? entry.leader ?? index === 0),
    isSelf: Boolean(entry.isSelf ?? entry.self),
    ready: Boolean(entry.ready),
    // Raw passthrough so future fields (skin, level) need no UI change.
    raw: entry,
  };
}

/**
 * Normalise a whole party snapshot from `party_update`.
 *
 * Server shape (parties/partyManager.js → toPublic):
 *   { code, leaderId, leaderName, members: [{ id, socketId, name }],
 *     memberCount, maxSize, mode, roomId, createdAt }
 *
 * IMPORTANT: `leaderId` is a SOCKET id (leaderId is session-scoped and gets
 * reassigned on disconnect), so "am I the leader?" must be answered by
 * comparing it to OUR socket id, never by checking `members[0]`.
 *
 * @param {object} party
 * @param {string} [localId] Our socket id.
 * @returns {null|object} `null` means "not in a party" (server sends party:null
 *   on leave), which the lobby uses to reset its UI immediately.
 */
export function normaliseParty(party, localId = null) {
  if (!party) return null;

  // Members may arrive as an array or as an id-keyed object.
  const rawMembers = Array.isArray(party.members)
    ? party.members
    : Object.entries(party.members ?? {}).map(([id, value]) => ({ id, ...(value || {}) }));

  const members = rawMembers.slice(0, PARTY.maxMembers).map(normaliseMember);
  const leaderId = party.leaderId ?? party.leader ?? null;

  // Explicit leaderId always wins over an implicit isLeader flag.
  if (leaderId) members.forEach((m) => { m.isLeader = m.id === leaderId; });

  return {
    code: normalisePartyCode(party.code ?? party.partyCode),
    leaderId: leaderId ? String(leaderId) : null,
    leaderName: party.leaderName ?? null,
    mode: party.mode ? normaliseMode(party.mode) : null,
    roomId: party.roomId ?? null,
    members,
    memberCount: members.length,
    maxSize: party.maxSize ?? PARTY.maxMembers,
    isFull: members.length >= (party.maxSize ?? PARTY.maxMembers),
    // Resolved locally so the UI never has to know the socket-id semantics.
    isLeader: Boolean(localId && leaderId === localId),
    isSelfInParty: members.some((m) => m.id === localId),
    raw: party,
  };
}

/**
 * Normalise the friend list pushed on `friend_update` / returned in acks.
 *
 * Server shape (friends/friendManager.js → listFriends):
 *   [{ id, name, online }]  where `id` is the live socket id when the friend
 *   is online, else their normalized username key.
 *
 * @param {object[]} list
 * @returns {Array<{id: string, name: string, online: boolean, raw: object}>}
 */
export function normaliseFriends(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry = {}) => ({
      id: String(entry.id ?? entry.friendId ?? entry.name ?? 'unknown'),
      name: String(entry.name ?? entry.friendName ?? entry.id ?? 'Unknown Janitor').slice(0, 24),
      online: Boolean(entry.online ?? entry.isOnline),
      raw: entry,
    }))
    .sort((a, b) => {
      // Online friends float to the top — the useful ones are the reachable ones.
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Normalise one authoritative entity (human or bot) from `room_joined`.
 *
 * Server shape (rooms/roomManager.js + bots/botFactory.js):
 *   human { id, socketId, name, team, x, y, hp, maxHp, isBot: false }
 *   bot   { id, botId, name, botType, team, x, y, hp, maxHp, isBot: true }
 *
 * @param {object} raw
 * @param {number} [index]
 * @param {boolean} [fallbackIsBot]
 * @returns {object} normalised entity
 */
export function normaliseEntity(raw = {}, index = 0, fallbackIsBot = false) {
  const isBot = Boolean(raw.isBot ?? fallbackIsBot);
  const id = String(raw.id ?? raw.botId ?? raw.socketId ?? `entity_${index}`);
  return {
    id,
    // `socketId` is the wire id for humans and the key for `player_move`.
    socketId: String(raw.socketId ?? id),
    botId: raw.botId ?? null,
    name: String(raw.name ?? (isBot ? 'Scrap Bot' : 'Janitor')).slice(0, 24),
    botType: raw.botType ?? null,
    isBot,
    team: isBot || raw.team ? normaliseTeam(raw.team, index) : null,
    x: Number.isFinite(raw.x) ? raw.x : MATCH_SPAWNS.bots[index % MATCH_SPAWNS.bots.length].x,
    y: Number.isFinite(raw.y) ? raw.y : MATCH_SPAWNS.bots[index % MATCH_SPAWNS.bots.length].y,
    hp: Number.isFinite(raw.hp) ? raw.hp : 100,
    maxHp: Number.isFinite(raw.maxHp) ? raw.maxHp : 100,
    raw,
  };
}

/**
 * Group normalised entities into `{ red: [...], blue: [...] }` for the HUD.
 * @param {object[]} entities
 * @returns {{red: object[], blue: object[]}}
 */
export function groupTeams(entities = []) {
  return {
    red: entities.filter((e) => e.team === 'red'),
    blue: entities.filter((e) => e.team === 'blue'),
  };
}

/**
 * Normalise the `room_joined` / `room_update` / `match_state` manifest.
 *
 * Accepts:
 *   - `{ room: {...} }`               (room_joined / room_update)
 *   - `{ roomId, players, bots }`     (match_state countdown)
 *   - `{ players, bots, entities }`   (defensive: prefers explicit arrays)
 *
 * @param {object} payload
 * @param {object} [opts]
 * @param {string} [opts.localPlayerId] - Our socket id, used to resolve spawn.
 * @returns {object|null} normalised room, or null when there is nothing to spawn.
 */
export function normaliseRoom(payload = {}, { localPlayerId = null } = {}) {
  const room = payload.room ?? payload;
  if (!room) return null;

  const mode = normaliseMode(room.mode);
  const players = (room.players ?? []).map((p, i) => normaliseEntity(p, i, false));
  const bots = (room.bots ?? []).map((b, i) => normaliseEntity(b, i, true));

  // If the server only sent the union (`entities`), split it by isBot.
  if (!players.length && !bots.length && Array.isArray(room.entities)) {
    room.entities.forEach((e, i) => {
      const entity = normaliseEntity(e, i, false);
      (entity.isBot ? bots : players).push(entity);
    });
  }

  const all = [...players, ...bots];

  return {
    roomId: room.roomId ?? room.id ?? null,
    mode,
    mapId: room.mapId ?? 'junkyard',
    phase: room.phase ?? 'countdown',
    players,
    bots,
    teams: groupTeams(all),
    playerCount: players.length,
    botCount: bots.length,
    countdownMs: Number.isFinite(room.countdownMs) ? room.countdownMs : 3000,
    localPlayerId,
    raw: room,
  };
}

/**
 * Resolve our own spawn point + team from a normalised room.
 *
 * The server sends absolute x/y per entity, so this simply finds our entry.
 * If the server did not include us (edge case: we joined between broadcasts)
 * we fall back to the first team-appropriate slot from lobbyConfig.
 *
 * @param {object} room - Output of `normaliseRoom`.
 * @returns {{x: number, y: number, team: string|null, entity: object|null}}
 */
export function resolveLocalSpawn(room) {
  if (!room) return { x: MATCH_SPAWNS.solo[0].x, y: MATCH_SPAWNS.solo[0].y, team: null, entity: null };

  const me = room.players.find((p) => p.id === room.localPlayerId || p.socketId === room.localPlayerId);
  if (me) return { x: me.x, y: me.y, team: me.team, entity: me };

  // Not in the roster: pick a free team slot so the player is never stacked
  // exactly on top of a teammate.
  const slot = MATCH_SPAWNS.solo[room.players.length % MATCH_SPAWNS.solo.length];
  return { x: slot.x, y: slot.y, team: null, entity: null };
}

/**
 * Team colour lookup used by HUD + name tags.
 * @param {string|null} team
 * @returns {{id: string, name: string, color: string, colorInt: number}}
 */
export function teamInfo(team) {
  if (!team) return TEAMS.solo;
  return TEAMS[team] ?? TEAMS.solo;
}

/**
 * Describe what first-match protection did to the requested mode, so the
 * lobby can explain it instead of silently swapping the mode.
 *
 * @param {object} ack - `{ mode, requestedMode, firstMatchProtection }`.
 * @returns {{ applied: boolean, message: string|null }}
 */
export function describeProtection(ack = {}) {
  if (!ack.firstMatchProtection) return { applied: false, message: null };
  const requested = normaliseMode(ack.requestedMode);
  const mode = normaliseMode(ack.mode);
  if (requested === mode) return { applied: true, message: null };
  return {
    applied: true,
    message: `First-match protection: ${MATCH_MODES[mode].name} instead of ${MATCH_MODES[requested].name}.`,
  };
}
