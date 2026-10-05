/**
 * Astral Zero — Friends socket handlers (Phase 2).
 * ============================================================
 * Events: friend_add / friend_remove / friend_list (C→S, acked) plus
 *         friend_update (S→C push after every mutation + on join).
 *
 * Add accepts `{ friendId }` (live socket id) OR `{ friendName }`
 * (username, online or offline). Offline-by-name adds still work — the
 * entry renders `online: false` until they connect (presence resolves
 * live via playerStore on every list).
 *
 * Friendship is one-way (follow-style) in Phase 2: adding someone puts
 * them on YOUR list. Mutual listing needs a mutual add. Lists survive
 * reconnects because friendManager keys on normalized usernames.
 */

import { SOCKET_EVENTS } from '../events.js';
import { getBySocket, resolveOnlinePeer } from '../../players/playerStore.js';
import { addFriend, removeFriend, listFriends } from '../../friends/friendManager.js';

/** Push the caller's current list (used after join + every mutation). */
export function emitFriendUpdate(socket, ownerName) {
  socket.emit(SOCKET_EVENTS.FRIEND_UPDATE, {
    friends: listFriends(ownerName),
    timestamp: Date.now(),
  });
}

export function registerFriendHandlers(io, socket) {
  void io; // friends are per-socket pushes; no broadcasts in Phase 2.

  // -- friend_add --------------------------------------------------------------
  socket.on(SOCKET_EVENTS.FRIEND_ADD, (payload = {}, ack) => {
    const player = getBySocket(socket.id);
    if (!player) {
      if (typeof ack === 'function') ack({ ok: false, error: 'NOT_JOINED' });
      return;
    }
    const res = addFriend(player.name, payload, resolveOnlinePeer);
    if (!res.ok) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: res.error,
        message: `friend_add failed: ${res.error}`,
      });
      if (typeof ack === 'function') ack({ ok: false, error: res.error });
      return;
    }
    console.log(`[Astral Zero] friend_add ${player.name} → ${payload.friendName || payload.friendId}`);
    emitFriendUpdate(socket, player.name);
    if (typeof ack === 'function') ack({ ok: true, friends: res.friends });
  });

  // -- friend_remove (idempotent) ------------------------------------------------
  socket.on(SOCKET_EVENTS.FRIEND_REMOVE, (payload = {}, ack) => {
    const player = getBySocket(socket.id);
    if (!player) {
      if (typeof ack === 'function') ack({ ok: false, error: 'NOT_JOINED' });
      return;
    }
    const res = removeFriend(player.name, payload, resolveOnlinePeer);
    if (!res.ok) {
      if (typeof ack === 'function') ack({ ok: false, error: res.error });
      return;
    }
    emitFriendUpdate(socket, player.name);
    if (typeof ack === 'function') ack({ ok: true, friends: res.friends });
  });

  // -- friend_list (explicit fetch; join also pushes one automatically) ------------
  socket.on(SOCKET_EVENTS.FRIEND_LIST, (_payload = {}, ack) => {
    const player = getBySocket(socket.id);
    if (!player) {
      if (typeof ack === 'function') ack({ ok: false, error: 'NOT_JOINED' });
      return;
    }
    const friends = listFriends(player.name);
    if (typeof ack === 'function') ack({ ok: true, friends });
  });
}
