/**
 * Astral Zero — the server's rate-limit policy.
 * ============================================================
 * One table of per-socket ceilings, shared by every handler, in its own module
 * so it can be imported by `src/sockets/index.js` AND by the modular handlers
 * without a circular import.
 *
 * WHY A POLICY MODULE RATHER THAN A LOCAL CHECK
 * A limit decided in the handler that happens to remember it will be missed by
 * the next handler. Every event that can create server state or fan out to
 * other clients belongs here, in one auditable list.
 *
 * The lobby relay events (move / shoot / melee) are the ones that actually
 * amplify: each is re-broadcast to every other connected client, so one socket
 * sending faster than everyone else turns the broadcast path into an O(N^2)
 * load. The ceilings sit well above what the Phaser client produces (intent at
 * 60 Hz) while capping a hostile socket, and the headroom absorbs a lag spike
 * instead of dropping legitimate input.
 */

import { makeGate, makeLimiter } from './rateLimit.js';

/** @type {Record<string, {limit: number}>} */
export const LIMITS = Object.freeze({
  player_move: { limit: 90 },
  player_shoot: { limit: 40 },
  player_melee: { limit: 20 },
  player_input: { limit: 90 },
  player_join: { limit: 6 },
  queue_join: { limit: 8 },
  queue_leave: { limit: 12 },
  room_join: { limit: 12 },
  room_leave: { limit: 12 },
  match_end: { limit: 4 },
  party_create: { limit: 8 },
  party_join: { limit: 20 },
  party_leave: { limit: 20 },
  party_start_match: { limit: 12 },
  party_invite: { limit: 20 },
  friend_add: { limit: 20 },
  friend_remove: { limit: 30 },
  friend_list: { limit: 20 },
  // S14: selection is rare and deliberate; a burst is either a stuck key or a
  // client bug, never legitimate. Board reads are cheap but not free.
  character_set: { limit: 20 },
  ranked_board: { limit: 20 },
});

const limiters = {};
for (const [event, opts] of Object.entries(LIMITS)) limiters[event] = makeLimiter(event, opts);

const gate = makeGate(limiters);

/**
 * @param {string} event
 * @param {string} socketId
 * @param {number} [now]
 * @returns {boolean} true = allowed through
 */
export function allow(event, socketId, now = Date.now()) {
  return gate.allow(event, socketId, now);
}

/** Forget one socket's buckets (disconnect). @param {string} socketId */
export function resetSocket(socketId) {
  gate.reset(socketId);
}

/**
 * Drop buckets for sockets that are no longer connected, so a long-running
 * server does not accumulate one entry per client it has ever served.
 * @param {Set<string>|((id: string) => boolean)} live
 * @returns {number} buckets removed
 */
export function sweep(live) {
  return gate.sweep(live);
}

/** @returns {Record<string, number>} the configured ceilings. */
export function limitsNow() {
  return Object.fromEntries(Object.entries(limiters).map(([k, v]) => [k, v.limit]));
}

export default { allow, resetSocket, sweep, limitsNow, LIMITS };
