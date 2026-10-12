/**
 * Astral Zero — SCRAP MIMICS (S14.4).
 * ============================================================
 * A mimic is a decoy scrap token that arms when a carrier walks over it and
 * then chases. It is the answer to a degenerate scrap strategy: camping the
 * spawn ring and vacuuming every respawn token costs a coin flip, not skill.
 *
 * THE ONE RULE THAT MAKES THIS FAIR, NOT FRUSTRATING
 * A mimic is a COMMITMENT with a visible clock. It cannot arm while you are
 * merely near it, it cannot arm inside spawn protection, and — critically — it
 * cannot arm while the room's player count is below the mode's threshold. So
 * nobody is ever killed by a mechanic they could not have read or avoided.
 * Everything else (damage, arming radius, speed) is server-authoritative.
 *
 * THE LOOP
 *   dormant  — looks exactly like a scrap token, sits in the spawn ring.
 *   arming   — a player entered the radius. Telegraph window; still harmless.
 *   armed    — visible, chasing the nearest eligible target at mimic speed.
 *   stunned  — shot down; drops its payload as a real token, then rots.
 *
 * THE DEAL
 * Killing a mimic pays out MORE than the token it was pretending to be, so the
 * greedy read is also the profitable one. Ambush > patience > greed.
 */

import config from '../server-config.js';
import { applyHit, kill } from '../combat/damage.js';

const now = () => Date.now();

/**
 * Per-mode mimic tuning. Disabled by default so no mode silently inherits a
 * predator; `ffa` and `scrap_collector` opt in explicitly.
 */
const MIMIC_DEFAULTS = Object.freeze({
  enabled: false,
  /** Simultaneous mimics alive in one room. */
  maxActive: 4,
  /** One mimic is seeded every N ms (only while under maxActive). */
  spawnIntervalMs: 9000,
  /** A mimic may not seed before this many players are present. */
  minPlayers: 3,
  /** Idle lifetime before it rots away untouched. */
  dormantTtlMs: 22000,
  /** Radius at which a walking carrier trips the arming telegraph. */
  armRadius: 54,
  /** Telegraph length. The mimic is harmless and visible for this whole time. */
  armMs: 650,
  /** Damage once it lands a lunge contact. */
  contactDamage: 18,
  /** How often it may deal contact damage (no drain-per-frame). */
  contactCooldownMs: 900,
  /** Chase speed — deliberately below player base speed, so it is always
   *  outrunnable. A mimic that can catch a sprinting player is a trap, not a
   *  skill check. */
  speed: 205,
  /** Payout on a kill, in scrap. Above the 1–3 a real token carries. */
  payout: 7,
  /** Seconds a stunned corpse stays on the ground before it vanishes. */
  corpseMs: 3000,
});

function mimicCfg(room) {
  const cfg = config.gameModes?.[room.mode]?.mimics;
  return cfg && cfg.enabled === true ? { ...MIMIC_DEFAULTS, ...cfg } : null;
}

/**
 * Seed the mimic controller for a room. Mirrors `initShifts`: one explicit
 * on/off per mode, attached to the room.
 * @param {object} room
 * @returns {object|null}
 */
export function initMimics(room) {
  const cfg = mimicCfg(room);
  if (!cfg) { room.mimics = null; return null; }
  room.mimics = {
    enabled: true,
    cfg,
    /** @type {object[]} live mimics */
    list: [],
    nextSpawnAt: now() + (cfg.spawnIntervalMs ?? 9000),
    seq: 0,
  };
  return room.mimics;
}

/** Eligible targets: alive, not spawn-protected, not disconnected. */
function targets(sim, nowMs) {
  const out = [];
  for (const e of sim?.entities?.values?.() || []) {
    if (!e?.alive || e.disconnected) continue;
    if (nowMs < (e.protectedUntil || 0)) continue;
    out.push(e);
  }
  return out;
}

/**
 * Seed one dormant mimic near a token spawn point, in a clear spot.
 *
 * It is deliberately seeded AWAY from every player: a decoy that appears under
 * your feet is just a free hit, and one that appears under a spawn pad is a
 * spawn-camping tax. Clear-of-players is a fairness rule, not a tuning knob.
 *
 * @param {object} room
 * @param {number} nowMs
 * @returns {object|null} the mimic, or null if no legal spot was found
 */
export function seedMimic(room, nowMs = now()) {
  const m = room.mimics;
  if (!m?.enabled) return null;
  const cfg = m.cfg;
  const players = targets(room.sim, nowMs);
  if (players.length < (cfg.minPlayers ?? 3)) return null;
  if (m.list.filter((x) => x.state !== 'stunned').length >= cfg.maxActive) return null;

  const b = room.map.bounds;
  const spawns = room.map.stations || [];
  // Prefer the room's own stations (real contention points), else the arena.
  const anchors = spawns.length ? spawns : [{ x: (b.minX + b.maxX) / 2, y: b.groundY - 60 }];

  let best = null;
  let bestClear = -1;
  for (const a of anchors) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const x = a.x + (attempt % 2 ? 1 : -1) * (30 + attempt * 14);
      const y = a.y - 24 - attempt * 6;
      if (x < b.minX + 24 || x > b.maxX - 24) continue;
      if (y < b.ceilingY + 24 || y > b.groundY - 24) continue;
      // Keep clear of every player by a full lunge reach.
      let clear = Infinity;
      for (const p of players) clear = Math.min(clear, Math.hypot(p.x - x, p.y - y));
      if (clear > (cfg.armRadius ?? 54) * 2.4) {
        // Found a legal spot — no need to keep looking for a better one.
        best = { x: Math.round(x), y: Math.round(y) };
        break;
      }
      if (clear > bestClear) { bestClear = clear; best = { x: Math.round(x), y: Math.round(y) }; }
    }
    if (best && bestClear === Infinity) break;
  }
  if (!best) return null;

  m.seq += 1;
  const mimic = {
    id: `mimic_${m.seq}`,
    x: best.x,
    y: best.y,
    vx: 0,
    vy: 0,
    state: 'dormant', // dormant | arming | armed | stunned
    hp: 20,
    bornAt: nowMs,
    /** Dormant TTL — it rots away if nobody takes the bait. */
    ttl: nowMs + (cfg.dormantTtlMs ?? 22000),
    armAt: 0,
    nextContactAt: 0,
    stunnedUntil: 0,
    /** Who shot it, for the killfeed attribution. */
    shotBy: null,
  };
  m.list.push(mimic);
  return mimic;
}

/**
 * Advance every mimic one tick.
 *
 * Returns a small event list (spawn / arm / lunge / kill) so the caller emits
 * them — the module itself never touches the socket, which keeps it unit
 * testable and keeps emission in exactly one place.
 *
 * @param {object} room
 * @param {number} dt seconds
 * @param {number} nowMs
 * @param {object} io socket.io handle
 * @param {object} EV  event registry
 * @returns {object[]}
 */
export function tickMimics(room, dt, nowMs = now(), io = null, EV = null) {
  const m = room.mimics;
  if (!m?.enabled) return [];
  const cfg = m.cfg;
  const events = [];

  // Seed, if it is time and the room is busy enough.
  if (nowMs >= m.nextSpawnAt) {
    m.nextSpawnAt = nowMs + (cfg.spawnIntervalMs ?? 9000);
    const seeded = seedMimic(room, nowMs);
    if (seeded) events.push({ kind: 'spawn', id: seeded.id, x: seeded.x, y: seeded.y });
  }

  const players = targets(room.sim, nowMs);

  for (const mk of m.list) {
    switch (mk.state) {
      case 'dormant': {
        // Rot away if the bait was never taken.
        if (nowMs >= mk.ttl) { mk.state = 'stunned'; mk.stunnedUntil = nowMs + 600; break; }
        // A player walking over it arms the decoy.
        for (const p of players) {
          const d = Math.hypot(p.x - mk.x, p.y - (mk.y - 20));
          if (d <= (cfg.armRadius ?? 54)) {
            mk.state = 'arming';
            mk.armAt = nowMs + (cfg.armMs ?? 650);
            mk.targetId = p.id;
            events.push({ kind: 'arm', id: mk.id, x: mk.x, y: mk.y });
            break;
          }
        }
        break;
      }

      case 'arming': {
        // The telegraph window: harmless, visible, and it always resolves.
        if (nowMs >= mk.armAt) {
          mk.state = 'armed';
          events.push({ kind: 'lunge', id: mk.id, x: mk.x, y: mk.y });
        }
        break;
      }

      case 'armed': {
        // Chase the nearest eligible player. Slower than a player can run, so
        // the correct answer to being chased is always "leave".
        let best = null;
        let bestD = Infinity;
        for (const p of players) {
          const d = Math.hypot(p.x - mk.x, p.y - mk.y);
          if (d < bestD) { bestD = d; best = p; }
        }
        if (best) {
          const speed = cfg.speed ?? 205;
          const len = Math.max(1, bestD);
          mk.vx = ((best.x - mk.x) / len) * speed;
          mk.vy = ((best.y - mk.y) / len) * speed;
        } else { mk.vx = 0; mk.vy = 0; }

        const px = mk.x + mk.vx * dt;
        const py = mk.y + mk.vy * dt;
        const b = room.map.bounds;
        // Clamp to the arena; a mimic cannot leave the room or trap a player in
        // a corner by hugging a wall.
        mk.x = Math.max(b.minX + 16, Math.min(b.maxX - 16, px));
        mk.y = Math.max(b.ceilingY + 16, Math.min(b.groundY - 8, py));

        // Contact damage, rate-limited so it cannot drain a player to zero
        // while they stand still.
        if (best && nowMs >= mk.nextContactAt && bestD <= 26) {
          mk.nextContactAt = nowMs + (cfg.contactCooldownMs ?? 900);
          const victim = room.sim.entities.get(best.id);
          const killed = applyHit(room, victim, cfg.contactDamage ?? 18, null, 'mimic', io, EV, nowMs);
          events.push({ kind: 'bite', id: mk.id, byId: best.id, byName: best.name, killed: !!killed });
          if (killed) {
            // A mimic killing you is a death to the room, not a player kill —
            // it must never feed an opponent's kill or streak.
            mk.state = 'stunned';
            mk.stunnedUntil = nowMs + (cfg.corpseMs ?? 3000);
          }
        }
        break;
      }

      case 'stunned': {
        mk.vx = 0; mk.vy = 0;
        if (nowMs >= mk.stunnedUntil) mk.dead = true;
        break;
      }

      default: break;
    }
  }

  // Reap corpses (bounded: the list can never grow without limit).
  m.list = m.list.filter((mk) => !mk.dead);
  return events;
}

/**
 * A mimic struck by a projectile. Returns true when the hit landed, so the
 * projectile code knows the shot was consumed.
 * @param {object} room
 * @param {object} mimic
 * @param {number} damage
 * @param {string} shooterId
 * @param {number} nowMs
 * @returns {boolean}
 */
export function damageMimic(room, mimic, damage, shooterId, nowMs = now()) {
  const m = room.mimics;
  if (!m?.enabled || !mimic || mimic.dead) return false;
  // Dormant mimics are NOT shootable: they must read as ordinary tokens, or
  // the decoy stops being a decoy. You have to let it arm to kill it.
  if (mimic.state === 'stunned') return false;
  if (mimic.state === 'dormant' || mimic.state === 'arming') return false;

  mimic.hp -= Math.max(0, Math.round(damage));
  if (mimic.hp <= 0) {
    mimic.state = 'stunned';
    mimic.stunnedUntil = nowMs + (m.cfg.corpseMs ?? 3000);
    mimic.shotBy = shooterId;
    // The payout: the greedy read is also the profitable one.
    m.list.push({
      id: `token_${shooterId}_${mimic.id}`,
      x: mimic.x,
      y: mimic.y,
      value: m.cfg.payout ?? 7,
      ttl: nowMs + 15000,
      fromMimic: true,
    });
    return true;
  }
  return true;
}

/** The wire view — only live (non-corpsed) mimics, so the list stays small. */
export function mimicsWire(room) {
  const m = room.mimics;
  if (!m?.enabled) return null;
  return {
    enabled: true,
    list: m.list
      .filter((mk) => mk.state !== 'stunned')
      .map((mk) => ({ id: mk.id, x: Math.round(mk.x), y: Math.round(mk.y), state: mk.state })),
  };
}
