/**
 * Astral Zero — Friends manager (Phase 2).
 * ============================================================
 * LOCKED REQUIREMENTS:
 *  - Add friend by player ID (socket id) OR username (case-insensitive)
 *  - Remove friend
 *  - Persistent list in-memory "across reconnects of the same socket session"
 *    → interpreted as: keyed by STABLE player key (normalized username),
 *    NOT by socket.id, so a refresh with the same name keeps friends.
 *  - Invite friend directly into your party (no code sharing) — the actual
 *    emit lives in partyHandlers.js; this module answers "who are my friends
 *    and are they online?".
 *
 * MODEL:
 *  friendsByKey: Map<ownerKey, Map<friendKey, { name, addedAt }>>
 *  - ownerKey / friendKey are normalized (lowercase) names.
 *  - We store display `name` (latest casing) for UI rendering.
 *  - Online presence is resolved LIVE via playerStore (not cached here),
 *    so `friend_update` always reflects current connections.
 *
 * Friendship is stored ONE-WAY (follow-style) in Phase 2: adding someone
 * puts them on YOUR list; they don't auto-get you back. Mutual add =
 * mutual listing. A request/accept flow is a Phase 3 stretch goal.
 */

import { normalizeKey, ensureProfile, getOnlineByName } from '../players/playerStore.js';

/** ownerKey → Map(friendKey → { name, addedAt }) — NEVER cleared on disconnect. */
const friendsByKey = new Map();

function ownerList(ownerKey) {
  let list = friendsByKey.get(ownerKey);
  if (!list) {
    list = new Map();
    friendsByKey.set(ownerKey, list);
  }
  return list;
}

/**
 * Build the client-facing friends array for an owner, with live presence.
 * Shape (see websocket_events.md): [{ id, name, online, lastSeen? }]
 *  - `id` is the friend's CURRENT socket id when online, else their stable key.
 *  - `online` lets Phaser render green/grey dots without a second round-trip.
 */
export function listFriends(ownerNameOrKey) {
  const ownerKey = normalizeKey(ownerNameOrKey);
  const list = friendsByKey.get(ownerKey);
  if (!list) return [];
  return [...list.entries()].map(([friendKey, entry]) => {
    const onlinePlayer = getOnlineByName(friendKey);
    return {
      id: onlinePlayer ? onlinePlayer.socketId : friendKey,
      name: onlinePlayer ? onlinePlayer.name : entry.name,
      online: Boolean(onlinePlayer),
    };
  });
}

/**
 * Add a friend by socket id OR username.
 * @param {string} ownerName your display name (stable key derived inside)
 * @param {object} query { friendId?, friendName? } — at least one required
 * @param {object} resolver optional { resolveOnlinePeer } for socket-id lookup
 *   (injected to avoid a circular import; defaults to playerStore lookup).
 */
export function addFriend(ownerName, query = {}, resolveOnlinePeer = null) {
  const ownerKey = normalizeKey(ownerName);
  if (!ownerKey) return { ok: false, error: 'NOT_JOINED' };

  // Resolve target display name: prefer live session, fall back to raw string
  // (offline friends can still be added by name — they'll show offline).
  let targetName = null;
  if (resolveOnlinePeer) {
    const peer = resolveOnlinePeer(query);
    if (peer) targetName = peer.name;
  }
  if (!targetName) {
    targetName = (query.friendName || query.friendId || '').trim();
  }
  if (!targetName) return { ok: false, error: 'MISSING_FRIEND' };

  const friendKey = normalizeKey(targetName);
  if (friendKey === ownerKey) return { ok: false, error: 'CANNOT_ADD_SELF' };

  ensureProfile(ownerName);
  ensureProfile(targetName);
  const list = ownerList(ownerKey);
  const already = list.has(friendKey);
  list.set(friendKey, { name: String(targetName).slice(0, 24), addedAt: Date.now() });

  return { ok: true, friends: listFriends(ownerKey), added: !already };
}

/**
 * Remove a friend. Accepts socket id, username, or stable key.
 * Idempotent: removing a non-friend still returns ok (with removed:false).
 * Like addFriend, a live-socket `friendId` is resolved to the friend's
 * username first (socket ids are session-scoped and never stored as keys).
 */
export function removeFriend(ownerName, query = {}, resolveOnlinePeer = null) {
  const ownerKey = normalizeKey(ownerName);
  if (!ownerKey) return { ok: false, error: 'NOT_JOINED' };
  let raw = query.friendId || query.friendName || '';
  // Resolve live socket ids → stable username keys (mirrors addFriend).
  if (resolveOnlinePeer && raw) {
    const peer = resolveOnlinePeer({ friendId: raw, friendName: raw });
    if (peer) raw = peer.name;
  }
  const friendKey = normalizeKey(raw);
  if (!friendKey) return { ok: false, error: 'MISSING_FRIEND' };

  const list = friendsByKey.get(ownerKey);
  const removed = list ? list.delete(friendKey) : false;
  return { ok: true, friends: listFriends(ownerKey), removed };
}

/** True if `friendKey` is on the owner's list (for invite guards). */
export function isFriend(ownerName, friendNameOrKey) {
  const ownerKey = normalizeKey(ownerName);
  return Boolean(friendsByKey.get(ownerKey)?.has(normalizeKey(friendNameOrKey)));
}

/** Debug helper. */
export function stats() {
  let edges = 0;
  for (const list of friendsByKey.values()) edges += list.size;
  return { owners: friendsByKey.size, edges };
}
