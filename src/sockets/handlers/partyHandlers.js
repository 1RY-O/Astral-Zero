/**
 * Astral Zero — Party socket handlers (Phase 2).
 * ============================================================
 * Events: party_create / party_join / party_leave / party_start_match /
 *         party_invite (+ server fan-out party_update / party_invited).
 *
 * Pattern (same stub style as Phase 1): validate → mutate via
 * partyManager → `party_update` to ALL affected members → ack the sender.
 * Every ack is `{ ok, ... }` so Phaser can branch without parsing errors.
 */

import { SOCKET_EVENTS } from '../events.js';
import { getBySocket, resolveOnlinePeer, setPartyCode } from '../../players/playerStore.js';
import {
  createParty,
  joinParty,
  leaveParty,
  _getRawParty,
  toPublic,
  getPartyCodeForSocket,
} from '../../parties/partyManager.js';
import { startPartyMatch } from '../../matchmaking/matchmakingManager.js';
import config from '../../server-config.js';

/**
 * Emit the SAME public snapshot to every member socket.
 * Leavers get an explicit `{ party: null }` from their own handler;
 * survivors each get the fresh roster (covers promotion on leader leave).
 */
function broadcastParty(io, rawParty) {
  if (!rawParty) return;
  const pub = toPublic(rawParty);
  for (const m of rawParty.members) {
    io.to(m.socketId).emit(SOCKET_EVENTS.PARTY_UPDATE, { party: pub, timestamp: Date.now() });
  }
}

export function registerPartyHandlers(io, socket) {
  // -- party_create: caller becomes leader + member #1 -----------------------
  socket.on(SOCKET_EVENTS.PARTY_CREATE, (payload = {}, ack) => {
    const player = getBySocket(socket.id);
    if (!player) {
      if (typeof ack === 'function') ack({ ok: false, error: 'NOT_JOINED' });
      return;
    }
    const res = createParty({ id: player.id, socketId: socket.id, name: player.name });
    if (!res.ok) {
      if (typeof ack === 'function') ack({ ok: false, error: res.error });
      return;
    }
    setPartyCode(socket.id, res.party.code);
    broadcastParty(io, _getRawParty(res.party.code));
    console.log(`[Astral Zero] party_create ${res.party.code} by ${player.name}`);
    if (typeof ack === 'function') ack({ ok: true, party: res.party });
  });

  // -- party_join: join by 6-char code (case-insensitive) --------------------
  socket.on(SOCKET_EVENTS.PARTY_JOIN, (payload = {}, ack) => {
    const player = getBySocket(socket.id);
    if (!player) {
      if (typeof ack === 'function') ack({ ok: false, error: 'NOT_JOINED' });
      return;
    }
    const res = joinParty(
      { id: player.id, socketId: socket.id, name: player.name },
      payload.code,
    );
    if (!res.ok) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: res.error,
        message: `party_join failed: ${res.error}`,
      });
      if (typeof ack === 'function') ack({ ok: false, error: res.error });
      return;
    }
    setPartyCode(socket.id, res.party.code);
    broadcastParty(io, _getRawParty(res.party.code));
    console.log(`[Astral Zero] party_join ${res.party.code} by ${player.name}`);
    if (typeof ack === 'function') ack({ ok: true, party: res.party });
  });

  // -- party_leave: survivors get promotion-aware roster ---------------------
  socket.on(SOCKET_EVENTS.PARTY_LEAVE, (_payload = {}, ack) => {
    const res = leaveParty(socket.id);
    setPartyCode(socket.id, null);
    if (res.code && !res.disbanded) {
      const raw = _getRawParty(res.code);
      if (raw) broadcastParty(io, raw);
    }
    if (typeof ack === 'function') {
      ack({ ok: true, party: res.party || null, disbanded: Boolean(res.disbanded) });
    }
    // Explicit null-state so the leaver's lobby UI can reset immediately.
    socket.emit(SOCKET_EVENTS.PARTY_UPDATE, { party: null, timestamp: Date.now() });
  });

  // -- party_start_match: LEADER ONLY → whole party into one room ------------
  socket.on(SOCKET_EVENTS.PARTY_START_MATCH, (payload = {}, ack) => {
    const player = getBySocket(socket.id);
    if (!player) {
      if (typeof ack === 'function') ack({ ok: false, error: 'NOT_JOINED' });
      return;
    }
    // Leader hits Start without retyping the code: resolve via membership,
    // explicit `code` wins when both are present.
    const code = payload.code ? String(payload.code) : getPartyCodeForSocket(socket.id);
    const party = code ? _getRawParty(code) : null;
    if (!party) {
      if (typeof ack === 'function') ack({ ok: false, error: 'NOT_IN_PARTY' });
      return;
    }
    if (party.leaderId !== socket.id) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'NOT_LEADER',
        message: 'Only the party leader can start the match.',
      });
      if (typeof ack === 'function') ack({ ok: false, error: 'NOT_LEADER' });
      return;
    }
    const res = startPartyMatch(party, payload.mode || 'ffa', payload.mapId || 'junkyard');
    if (!res.ok) {
      if (typeof ack === 'function') ack({ ok: false, error: res.error });
      return;
    }
    // launchRoom already emitted match_found/room_joined/match_state to all;
    // refresh party_update so lobby UI shows the room link.
    const updated = _getRawParty(party.code);
    if (updated) broadcastParty(io, updated);
    console.log(`[Astral Zero] party_start_match ${party.code} → ${res.roomId} (${res.mode})`);
    if (typeof ack === 'function') {
      ack({
        ok: true,
        roomId: res.roomId,
        mode: res.mode,
        requestedMode: res.requestedMode,
        firstMatchProtection: res.firstMatchProtection || false,
      });
    }
  });

  // -- party_invite: direct invite, no code sharing ---------------------------
  socket.on(SOCKET_EVENTS.PARTY_INVITE, (payload = {}, ack) => {
    const player = getBySocket(socket.id);
    if (!player) {
      if (typeof ack === 'function') ack({ ok: false, error: 'NOT_JOINED' });
      return;
    }
    const code = getPartyCodeForSocket(socket.id);
    const party = code ? _getRawParty(code) : null;
    if (!party) {
      if (typeof ack === 'function') ack({ ok: false, error: 'NOT_IN_PARTY' });
      return;
    }
    const maxSize = config.party?.maxSize || 4;
    if (party.members.length >= maxSize) {
      if (typeof ack === 'function') ack({ ok: false, error: 'PARTY_FULL' });
      return;
    }
    // Accept EITHER { friendId } (socket id) OR { friendName } (username).
    const peer = resolveOnlinePeer(payload);
    if (!peer) {
      if (typeof ack === 'function') ack({ ok: false, error: 'FRIEND_OFFLINE' });
      return;
    }
    // Deliver the invite straight to the friend — they join with the code.
    io.to(peer.socketId).emit(SOCKET_EVENTS.PARTY_INVITED, {
      partyCode: party.code,
      fromId: socket.id,
      fromName: player.name,
      memberCount: party.members.length,
      timestamp: Date.now(),
    });
    console.log(`[Astral Zero] party_invite ${party.code} ${player.name} → ${peer.name}`);
    if (typeof ack === 'function') {
      ack({ ok: true, invited: peer.name, partyCode: party.code });
    }
  });
}
