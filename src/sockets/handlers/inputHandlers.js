/**
 * Astral Zero — Authoritative input handlers (Phase 3).
 * ============================================================
 *  - `player_input` (NEW primary channel): validated intent → store →
 *    ack { ok, seq, tick }. The tick loop consumes it; stale seq and floods
 *    are dropped with honest ack errors (never silently).
 *  - Legacy in-room bridges for `player_shoot` / `player_melee` live here
 *    too (called from sockets/index.js): re-anchor at the SERVER body,
 *    run the shared triggers.js path, ack the outcome. Out-of-room senders
 *    keep the exact Phase 2 global-relay behavior (handled in index.js).
 */

import { SOCKET_EVENTS } from '../events.js';
import { getBySocket } from '../../players/playerStore.js';
import { getRoomForSocket } from '../../rooms/roomManager.js';
import { storeInput } from '../../game/inputs.js';
import { tryFire, tryMelee, knownWeaponIds } from '../../combat/triggers.js';
import { clampToArena } from '../../game/arena.js';

export function registerInputHandlers(io, socket) {
  // -- player_input: intent, not position --------------------------------------
  socket.on(SOCKET_EVENTS.PLAYER_INPUT, (payload = {}, ack) => {
    const player = getBySocket(socket.id);
    if (!player) {
      if (typeof ack === 'function') ack({ ok: false, error: 'NOT_JOINED' });
      return;
    }
    const res = storeInput(socket.id, payload || {});
    if (!res.ok) {
      if (typeof ack === 'function') ack({ ok: false, error: res.dropped || 'BAD_PAYLOAD' });
      return;
    }
    if (typeof ack === 'function') ack({ ok: true, seq: res.seq });
  });
}

/**
 * In-room validated shot from a legacy `player_shoot` payload
 * ({ x, y, angle, weaponId }). Angle honored, origin re-anchored.
 *
 * Phase 5 origin sanity: when the client includes a muzzle claim, it must
 * sit within ORIGIN_SLOP px of the server body — across-the-map muzzles are
 * rejected (BAD_ORIGIN) instead of silently re-anchored, so spoofers get
 * loud feedback and honest packets (which always pass) notice nothing.
 * @returns ack-shaped result
 */
const ORIGIN_SLOP = 400;

export function bridgeShoot(io, EV, socket, payload = {}) {
  const now = Date.now();
  const room = getRoomForSocket(socket.id);
  const entity = room?.sim?.entities?.get(socket.id);
  if (!room?.sim || !entity) return { ok: false, error: 'NOT_IN_ROOM' };
  if (!entity.alive) return { ok: false, error: 'DEAD' };

  if (Number.isFinite(Number(payload.x)) && Number.isFinite(Number(payload.y))) {
    const d = Math.hypot(Number(payload.x) - entity.x, Number(payload.y) - (entity.y - 20));
    if (d > ORIGIN_SLOP) return { ok: false, error: 'BAD_ORIGIN' };
  }

  let angle = Number(payload.angle);
  if (!Number.isFinite(angle)) angle = entity.facing >= 0 ? 0 : Math.PI;
  // Re-anchor: server body + client angle (300 px probe → clamped aim point).
  const aim = clampToArena(entity.x + Math.cos(angle) * 300, entity.y - 20 + Math.sin(angle) * 300);
  // Weapon switching via legacy event (validated; unknown ids keep current).
  if (typeof payload.weaponId === 'string' && knownWeaponIds().includes(payload.weaponId)) {
    entity.weaponId = payload.weaponId;
  }
  const res = tryFire(room, entity, aim.x, aim.y, io, EV, now);
  return res.ok ? { ok: true, tick: room.sim.tick } : { ok: false, error: res.error };
}

/**
 * In-room validated swing from a legacy `player_melee` payload
 * ({ direction }). Facing overridden when the client declares ±1.
 */
export function bridgeMelee(io, EV, socket, payload = {}) {
  const room = getRoomForSocket(socket.id);
  const entity = room?.sim?.entities?.get(socket.id);
  if (!room?.sim || !entity) return { ok: false, error: 'NOT_IN_ROOM' };
  if (payload.direction === -1 || payload.direction === 1) {
    entity.facing = payload.direction;
  }
  const res = tryMelee(room, entity, io, EV, Date.now());
  return res.ok ? { ok: true, hits: res.hits, tick: room.sim.tick } : { ok: false, error: res.error };
}
