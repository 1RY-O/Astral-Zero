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
 * Session state (bySocket / byName) is in-memory and SHOULD be: it is tied to
 * a live socket.
 * Persistent profiles are mirrored to disk by `src/players/persistence.js`
 * (S14). `ensureProfile` hydrates from that store on first touch and every
 * mutation schedules a debounced atomic write, so XP, unlocks and ranked
 * ratings survive a restart. When persistence is disabled (tests) the store
 * degrades to exactly the old in-memory behaviour.
 */

import { sanitizeName } from './identity.js';
import { persistence, normaliseProfile } from './persistence.js';
import { CHARACTERS, isKnownCharacter, STARTER_CHARACTER } from '../shared/characters.js';
import { isKnownVariant, resolveLoadout } from '../shared/loadouts.js';
import { applyRankedResult, averageOpponentRating, seasonId, rateFor } from '../shared/ranked.js';

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
    // Hydrate from the durable store first: a returning player must NOT get a
    // blanked profile just because this process has never seen them.
    const stored = persistence()?.get(key);
    profile = normaliseProfile(
      {
        ...(stored || {}),
        key,
        displayName: String(name).trim().slice(0, 24),
      },
      key,
    );
    profile.lastSocketId = null; // session-only field, never persisted
    profiles.set(key, profile);
  }
  // Phase 5: backfill for profiles created by older servers in this process.
  if (profile.totalXp === undefined) profile.totalXp = 0;
  if (profile.matchesPlayed === undefined) profile.matchesPlayed = 0;
  return profile;
}

/**
 * Mark a profile dirty so the durable store schedules a write.
 * Session-only fields are stripped on write by `normaliseProfile`.
 * @param {object|null} profile
 * @returns {void}
 */
export function saveProfile(profile) {
  if (!profile?.key) return;
  persistence()?.set(profile);
}

/**
 * The character a player will bring to their NEXT match.
 *
 * Server-owned and profile-backed: the value is validated against the shared
 * roster here, on the way in AND on the way out, so a tampered profile cannot
 * smuggle a non-existent character into a match. An unknown stored id falls
 * back to the starter rather than erroring — a bad save should not brick a
 * player.
 *
 * @param {string} name display name / normalised key
 * @returns {string} a valid character id
 */
export function activeCharacterFor(name) {
  const profile = ensureProfile(name);
  if (!profile) return STARTER_CHARACTER;
  return isKnownCharacter(profile.activeCharacter) ? profile.activeCharacter : STARTER_CHARACTER;
}

/**
 * Select a character's loadout variant for a character (S14.2).
 * Validated against the character's own approved list; anything else is refused.
 *
 * @param {string} name display name
 * @param {string} characterId
 * @param {string} variantId
 * @returns {{ ok: boolean, variant?: string, error?: string }}
 */
export function setLoadout(name, characterId, variantId) {
  const profile = ensureProfile(name);
  if (!profile) return { ok: false, error: 'NOT_JOINED' };
  if (!isKnownCharacter(characterId)) return { ok: false, error: 'BAD_CHARACTER' };
  const c = CHARACTERS[characterId];
  if (!isKnownVariant(characterId, variantId)) return { ok: false, error: 'BAD_VARIANT' };
  profile.loadouts[characterId] = variantId;
  saveProfile(profile);
  return { ok: true, variant: variantId };
}

/**
 * Choose the active character, gating it behind an unlock.
 *
 * @param {string} name display name
 * @param {string} characterId
 * @returns {{ ok: boolean, character?: string, error?: string }}
 */
export function setActiveCharacter(name, characterId) {
  const profile = ensureProfile(name);
  if (!profile) return { ok: false, error: 'NOT_JOINED' };
  if (!isKnownCharacter(characterId)) return { ok: false, error: 'BAD_CHARACTER' };
  // Ownership: the starter is always available; anything else needs an unlock.
  if (characterId !== STARTER_CHARACTER && !profile.unlockedCharacters.includes(characterId)) {
    return { ok: false, error: 'LOCKED' };
  }
  profile.activeCharacter = characterId;
  saveProfile(profile);
  return { ok: true, character: characterId };
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
  // The caller already sanitised; this is the second enforcement layer for a
  // path that writes an IDENTITY (friends, protection, progression are all
  // keyed on it). Never trust one caller to be the only gate.
  const name = sanitizeName(opts.name);
  const key = normalizeKey(name) || socketId.toLowerCase();
  const profile = ensureProfile(name);
  if (profile) {
    profile.displayName = name; // keep latest casing
    profile.lastSocketId = socketId;
  }

  // S14: the character comes from the player's own (persisted, validated)
  // selection, not from the join payload — so a client cannot join AS a
  // character it has not earned.
  const character = activeCharacterFor(name);
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
    character,
    loadoutVariant: profile?.loadouts?.[character] || null,
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
        saveProfile(profile);
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
      saveProfile(profile);
    }
  }
}

/**
 * S14.6 — fold a finished RANKED match into every participant's rating.
 *
 * The rules this must not break:
 *  - Only ranked rooms count. A practice or scrap result never touches a
 *    rating, so grinding a mode against bots cannot move a ladder.
 *  - Rating is derived from SERVER results only (`wonById` comes from
 *    buildMatchResult, which reads the sim). The client is never consulted.
 *  - Everyone is updated together, against the SAME opponent average computed
 *    once — so two players in one room cannot see inconsistent Elo for the
 *    same matchup.
 *
 * @param {object} room ended room (still alive at this point)
 * @param {object} result the built match result
 * @returns {Map<string, object>} displayName → { placed, rating, league, delta }
 */
export function applyRankedMatch(room, result) {
  const out = new Map();
  if (!room?.ranked) return out;

  const season = seasonId();
  // One opponent pool for the whole room: every ranked human, bots excluded.
  const rows = room.players.map((p) => ({
    id: p.id,
    isBot: false,
    rated: ensureProfile(p.name)?.ranked?.placed ? ensureProfile(p.name).ranked.rating : null,
  }));
  const scores = result?.scores || [];
  // S14.6: a DRAW (the sim declared no winner — 'draw', an early manual end
  // without winInfo, a safety timeout) moves NOTHING. Counting it as a loss
  // would invent an outcome the server never produced; `drew: true` lets the
  // client report "finished, unrated" instead of a defeat. Placement series
  // therefore only advance on decided matches, which is the honest reading
  // of "played N placement games".
  const drew = !result?.winner;

  for (const p of room.players) {
    const profile = ensureProfile(p.name);
    if (!profile) continue;
    if (drew) {
      out.set(p.name, {
        placed: profile.ranked.placed,
        rating: profile.ranked.rating,
        league: rateFor(profile.ranked.rating).id,
        delta: 0,
        won: false,
        drew: true,
      });
      continue;
    }
    const selfRow = scores.find((s) => s.name === p.name);
    const won = winnerIs(selfRow, result);
    const opponentRating = averageOpponentRating(rows, p.id);
    const { ranked, delta } = applyRankedResult(profile.ranked, { won, opponentRating, season });
    profile.ranked = ranked;
    saveProfile(profile);
    out.set(p.name, {
      placed: ranked.placed,
      rating: ranked.rating,
      league: rateFor(ranked.rating).id,
      delta,
      won,
    });
  }
  return out;
}

/** Did this score row win its match? Team modes need the team, not the person. */
function winnerIs(row, result) {
  if (!row) return false;
  if (result?.winner?.id) return result.winner.id === row.id;
  if (result?.winner?.team && row.team) return result.winner.team === row.team;
  return false;
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
