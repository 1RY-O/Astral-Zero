/**
 * Astral Zero — per-socket event rate limiting (SERVER).
 * ============================================================
 * A fixed-window counter per (socket, event). Deliberately coarse and cheap:
 * this is not bot detection, it is a ceiling that stops one client from
 * monopolising the event loop or the broadcast path.
 *
 * WHY IT WAS NEEDED
 * `player_input` already had a ~83 Hz flood cap hand-rolled into the input
 * store. Everything else had NOTHING: `queue_join`, `room_leave`, `party_*`,
 * `friend_*`, `match_end` and the lobby relay events (`player_move`,
 * `player_shoot`, `player_melee`) were unbounded. Two concrete consequences:
 *
 *  - matchmaking spam: `queue_join` is the only path that allocates a room, and
 *    `leaveRoom` on the way out — hammering it creates and destroys rooms as
 *    fast as the socket can send.
 *  - broadcast amplification: every lobby `player_move` is re-broadcast to every
 *    other connected client. With N clients each sending at 60 Hz that is O(N^2)
 *    messages per second, driven entirely by one malicious socket.
 *
 * A limiter here is measured in "events per second, per socket", with a small
 * burst allowance, and it is cheap enough to run on every high-frequency event.
 */

/** windowMs → { key, count, windowStart } */
const buckets = new Map();

const DEFAULTS = Object.freeze({
  windowMs: 1000,
  limit: 30,
});

/**
 * Create a limiter for one event name.
 *
 * @param {string} event - Name used in logs/answers only.
 * @param {{ windowMs?: number, limit?: number }} [opts]
 * @returns {{
 *   check: (socketId: string, now?: number) => boolean,
 *   reset: (socketId: string) => void,
 *   sweep: (now?: number) => number
 * }}
 */
export function makeLimiter(event, opts = {}) {
  const { windowMs, limit } = { ...DEFAULTS, ...opts };
  const table = new Map();

  /**
   * @param {string} socketId
   * @param {number} [now]
   * @returns {boolean} true when the event is allowed through.
   */
  function check(socketId, now = Date.now()) {
    const key = socketId || 'unknown';
    let entry = table.get(key);
    if (!entry || now - entry.windowStart >= windowMs) {
      entry = { count: 0, windowStart: now };
      table.set(key, entry);
    }
    entry.count += 1;
    return entry.count <= limit;
  }

  /** @param {string} socketId */
  function reset(socketId) {
    table.delete(socketId || 'unknown');
  }

  /**
   * Drop buckets for sockets that are no longer connected, so a long-running
   * server does not accumulate one map entry per client it has ever seen.
   * @param {Set<string>|((id: string) => boolean)} live
   * @returns {number} buckets removed
   */
  function sweep(live) {
    const isLive = live instanceof Set ? (id) => live.has(id) : live;
    if (typeof isLive !== 'function') return 0;
    let removed = 0;
    for (const key of table.keys()) {
      if (!isLive(key)) {
        table.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  return { check, reset, sweep, event, limit, windowMs };
}

/**
 * Forget every bucket for a socket across ALL limiter instances. Call on
 * disconnect so a reconnect is not punished for a previous session's traffic.
 */
export function makeGate(limiters) {
  return {
    allow(event, socketId, now = Date.now()) {
      const lim = limiters[event];
      if (!lim) return true; // no rule for this event = no throttle
      return lim.check(socketId, now);
    },
    reset(socketId) {
      for (const lim of Object.values(limiters)) lim.reset(socketId);
    },
    sweep(live) {
      let removed = 0;
      for (const lim of Object.values(limiters)) removed += lim.sweep(live);
      return removed;
    },
  };
}

export default { makeLimiter, makeGate };
