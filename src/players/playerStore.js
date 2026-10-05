/**
 * Astral Zero — Player identity store (Phase 2).
 * ============================================================
 * PROBLEM: `socket.id` changes on every reconnect, but friends lists
 * and "first match protection" must SURVIVE reconnects. So we keep
 * TWO layers:
 *
 *  1. Session layer (ephemeral):  socketId → { id, socketId, name, ... }
 *     Created on `player_join`, deleted on `disconnect`.
 *
 *  2. Profile layer (persistent in-memory): normalizedName → {
 *       displayName, lastSocketId, completedRealMatches, firstSeenAt
 *     }
 *     NEVER deleted on disconnect — this is what makes friends and
 *     first-match protection survive a refresh.
 *
 * Normalization = trim + lowercase. "MopLord42" and "moplord42" are
 * the same janitor. Display name preserves original casing.
 *
 * First-match protection (locked requirement):
 *  - `hasFinishedRealMatch(key)` → false until the player completes
 *    at least one NON-bot_practice match (see recordMatchFinish).
 *  - Matchmaking FORCES such players into `bot_practice` even if they
 *    queued ffa/tdm (with `firstMatchProtection: true` in the ack).
 *
 * All state is in-memory Maps. No DB in Phase 2 (by design).
 */

const bySocket = new Map(); // socketId → session player
const byName = new Map(); // normalizedName → session player (online only)
const profiles = new Map(); // normalizedName → persistent profile

/**
 * Normalize a player name / id for stable keying.
 * @param {string} name
 * @returns {string} lowercase trimmed key ('' if invalid)
 */
export function normalizeKey(name) {
  return String(name || '').trim().toLowerCase();
}

/**
 * Get (or lazily create) the persistent profile for a name.
 * Profiles outlive sockets — that's the whole point.
 * @param {string} name display name
 * @returns {object} profile record
 */
export function ensureProfile(name) {
  const key = normalizeKey(name);
  if (!key) return null;
  let profile = profiles.get(key);
  if (!profile) {
    profile = {
      key,
      displayName: String(name).trim().slice(0, 24),
      lastSocketId: null,
      completedRealMatches: 0,
      totalXp: 0, // Phase 5: lifetime progression (level = totalXp/1000 + 1)
      matchesPlayed: 0, // every finished match counts (practice included)
      firstSeenAt: Date.now(),
    };
    profiles.set(key, profile);
  }
  // Phase 5: backfill for profiles created by older servers in this process.
  if (profile.totalXp === undefined) profile.totalXp = 0;
  if (profile.matchesPlayed === undefined) profile.matchesPlayed = 0;
  return profile;
}

/**
 * Register / refresh a session on `player_join`.
 * Reuses the Phase 1 shape { id, name, mapId, difficulty, joinedAt }
 * and adds partyCode / roomId / queueMode slots used by Phase 2.
 *
 * @param {string} socketId current socket.id
 * @param {object} opts { name, mapId?, difficulty? }
 * @returns {object} session player
 */
export function upsertOnJoin(socketId, opts = {}) {
  const name = String(opts.name || 'Unnamed Janitor').slice(0, 24);
  const key = normalizeKey(name) || socketId.toLowerCase();
  const profile = ensureProfile(name);
  if (profile) {
    profile.displayName = name; // keep latest casing
    profile.lastSocketId = socketId;
  }

  const player = {
    id: socketId, // Phase 1 contract: player.id === socket.id
    key, // stable cross-reconnect identity
    socketId,
    name,
    mapId: opts.mapId || 'junkyard',
    difficulty: opts.difficulty || 'normal',
    joinedAt: Date.now(),
    partyCode: bySocket.get(socketId)?.partyCode || null,
    roomId: null,
    queueMode: null,
  };
  bySocket.set(socketId, player);
  byName.set(key, player);
  return player;
}

/** @param {string} socketId */
export function getBySocket(socketId) {
  return bySocket.get(socketId) || null;
}

/**
 * Find the ONLINE session for a name (case-insensitive).
 * @param {string} name
 */
export function getOnlineByName(name) {
  const key = normalizeKey(name);
  if (!key) return null;
  return byName.get(key) || null;
}

/**
 * Resolve a friend identifier (socket id OR username) to an online player.
 * Lets `friend_add` / `party_invite` accept either form.
 * @param {object} query { friendId?, friendName? }
 */
export function resolveOnlinePeer(query = {}) {
  if (query.friendId && bySocket.has(query.friendId)) {
    return bySocket.get(query.friendId);
  }
  if (query.friendName && getOnlineByName(query.friendName)) {
    return getOnlineByName(query.friendName);
  }
  // friendId might itself be a stable key / name (client cached it).
  if (query.friendId) {
    const byKey = byName.get(normalizeKey(query.friendId));
    if (byKey) return byKey;
  }
  return null;
}

/**
 * Remove a session on disconnect. Profile + friends + match history KEPT.
 * @param {string} socketId
 * @returns {object|null} the removed session (if any)
 */
export function removeBySocket(socketId) {
  const player = bySocket.get(socketId) || null;
  if (player) {
    bySocket.delete(socketId);
    // Only clear the name→session pointer if it still points at us
    // (a reconnect may have already overwritten it).
    if (byName.get(player.key)?.socketId === socketId) {
      byName.delete(player.key);
    }
  }
  return player;
}

/**
 * First-match protection check.
 * Accepts a socketId, a display name, or a normalized key.
 * @param {string} who socketId | name | key
 * @returns {boolean} true if they finished ≥1 REAL (non-practice) match
 */
export function hasFinishedRealMatch(who) {
  // Direct socket lookup first (most common: queue_join handler).
  const session = bySocket.get(who);
  const key = session ? session.key : normalizeKey(who);
  const profile = profiles.get(key);
  return (profile?.completedRealMatches || 0) > 0;
}

/**
 * Record a finished match for every human participant.
 * Only NON-bot_practice modes count toward "real match" history —
 * bot_practice never graduates a player out of protection (by design:
 * you must finish a REAL match to leave the kiddie pool).
 *
 * Phase 5: banks XP (xpByName from scoring.buildMatchResult) and counts
 * every match played (practice included — lessons still count).
 *
 * @param {string[]} participantNames display names (or keys)
 * @param {string} mode game mode that just finished
 * @param {object} [xpByName] { displayName → xp } (or pass a Map)
 */
export function recordMatchFinish(participantNames = [], mode = 'ffa', xpByName = {}) {
  const xpMap = xpByName instanceof Map ? xpByName : new Map(Object.entries(xpByName || {}));
  if (mode === 'bot_practice') {
    // Practice graduates nobody but still banks (halved) XP + counts played.
    for (const name of participantNames) {
      const profile = ensureProfile(name);
      if (profile) {
        profile.totalXp += xpMap.get(name) || 0;
        profile.matchesPlayed += 1;
      }
    }
    return;
  }
  for (const name of participantNames) {
    const profile = ensureProfile(name);
    if (profile) {
      profile.completedRealMatches += 1;
      profile.totalXp += xpMap.get(name) || 0;
      profile.matchesPlayed += 1;
    }
  }
}

/**
 * Lifetime progression for XP levels (Phase 5).
 * @param {string} name display name
 * @returns {{ totalXp: number, matchesPlayed: number, level: number }}
 */
export function getProgress(name) {
  const profile = profiles.get(normalizeKey(name));
  const totalXp = profile?.totalXp || 0;
  return { totalXp, matchesPlayed: profile?.matchesPlayed || 0, level: Math.floor(totalXp / 1000) + 1 };
}

/** @param {string} socketId @param {string|null} partyCode */
export function setPartyCode(socketId, partyCode) {
  const player = bySocket.get(socketId);
  if (player) player.partyCode = partyCode;
}

/** @param {string} socketId @param {string|null} roomId */
export function setRoomId(socketId, roomId) {
  const player = bySocket.get(socketId);
  if (player) player.roomId = roomId;
}

/** @param {string} socketId @param {string|null} queueMode */
export function setQueueMode(socketId, queueMode) {
  const player = bySocket.get(socketId);
  if (player) player.queueMode = queueMode;
}

/** Debug / /api/info helper — counts only, never names. */
export function stats() {
  return { onlineSessions: bySocket.size, knownProfiles: profiles.size };
}
