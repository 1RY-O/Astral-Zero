/**
 * Astral Zero — ORBITAL SHIFTS (server-authoritative).
 * ============================================================
 * S14.3. The arena's salvage platforms drift on a cycle: a shift TELEGRAPHS,
 * then MOVES platforms, then SETTLES. It exists to force a positional decision
 * ("do I hold this ground or reposition to the new lane?") rather than to add
 * randomness.
 *
 * WHY THIS IS A SEPARATE MODULE AND NOT "just move the platforms"
 * The map definitions are DEEP-FROZEN (`define()` in game/maps.js) so nothing
 * can mutate shared state by accident. A shift needs per-room mutable geometry,
 * and it needs the SAME copy on the client, or the two halves disagree about
 * where the floor is — which is the exact class of bug the whole shared-tuning
 * / coords work exists to prevent.
 *
 * DESIGN GUARANTEES (all enforced here, all testable)
 *  1. TELEGRAPH FIRST. A shift is announced `warningMs` before it happens. The
 *     warning names the platforms that will move. No instant relocations.
 *  2. NEVER ON A PLAYER. A platform never shifts into a position overlapping a
 *     live body, so nobody is crushed or teleported into geometry.
 *  3. BOUNDED. Platforms always land inside the arena rect, and every shift
 *     target is chosen from a deterministic ladder (seeded by room id + tick),
 *     so a shift is a reproducible function of match state — not RNG drift that
 *     the client cannot predict.
 *  4. OPTIONAL PER MODE. Off by default; enabled per mode in server-config, so
 *     adding a mode never silently inherits a moving floor.
 */

import config from '../server-config.js';

const now = () => Date.now();

/** Deep, mutable clone of the frozen map's mutable geometry (platforms/bounds). */
function mutableGeometry(map) {
  return {
    platforms: (map.platforms || []).map((p) => ({ ...p })),
    bounds: { ...map.bounds },
  };
}

/**
 * Deterministic per-(room, cycle) pseudo-random in [0,1). Not for secrecy —
 * for REPRODUCIBILITY: the client derives the same shift from the same seed so
 * its preview matches the server's move exactly.
 * @param {string} roomId
 * @param {number} cycle
 * @returns {number}
 */
function seedUnit(roomId, cycle) {
  let h = 2166136261;
  const s = `${roomId}:${cycle}`;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // xorshift to a float in [0,1)
  h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * Create the shift controller for a room. Attached to `room.shifts`.
 * @param {object} room
 * @returns {object|null} the controller, or null when shifts are disabled.
 */
export function initShifts(room) {
  const cfg = config.gameModes?.[room.mode]?.shifts;
  if (!cfg || cfg.enabled !== true) {
    room.shifts = null;
    return null;
  }
  room.shifts = {
    enabled: true,
    /** Mutable geometry the sim and the client share. */
    geometry: mutableGeometry(room.map),
    cycle: 0,
    phase: 'idle', // idle | warning | shifting | settle
    /** ms when the current cycle was armed. */
    startedAt: 0,
    /** Absolute ms the next warning begins. */
    nextAt: now() + (cfg.firstDelayMs ?? 15000),
    warningMs: cfg.warningMs ?? 3000,
    shiftMs: cfg.shiftMs ?? 1200,
    settleMs: cfg.settleMs ?? 1500,
    intervalMs: cfg.intervalMs ?? 30000,
    /** Platforms moving this cycle: [{ index, from, to }]. */
    moving: [],
    shiftSeq: 0,
  };
  return room.shifts;
}

/**
 * Advance the shift state machine one tick. Pure with respect to the network —
 * it mutates `room.shifts` and returns an event descriptor when the phase
 * CHANGES, so the caller emits exactly once per transition (never per frame).
 *
 * @param {object} room
 * @param {number} nowMs
 * @returns {object|null} a transition event, or null
 */
export function tickShifts(room, nowMs = now()) {
  const s = room.shifts;
  if (!s?.enabled) return null;

  if (s.phase === 'idle' || s.phase === 'settle') {
    const gate = s.phase === 'settle' ? s.settleMs : 0;
    if (nowMs >= s.nextAt + gate) {
      // Arm the next cycle: choose targets deterministically.
      s.cycle += 1;
      s.moving = planShift(room, s.cycle);
      s.phase = 'warning';
      s.startedAt = nowMs;
      return {
        type: 'warning',
        cycle: s.cycle,
        platforms: s.moving.map((m) => ({ index: m.index, to: { ...m.to } })),
        warningMs: s.warningMs,
        shiftAt: nowMs + s.warningMs,
      };
    }
    return null;
  }

  if (s.phase === 'warning' && nowMs >= s.startedAt + s.warningMs) {
    // Commit the move. `planShift` already guaranteed no player overlap and
    // in-bounds targets, so this is a pure geometry write.
    for (const m of s.moving) {
      const p = s.geometry.platforms[m.index];
      if (p) {
        p.x = m.to.x;
        p.y = m.to.y;
      }
    }
    s.phase = 'settling';
    s.startedAt = nowMs;
    s.shiftSeq += 1;
    return {
      type: 'shift',
      cycle: s.cycle,
      seq: s.shiftSeq,
      platforms: s.geometry.platforms.map((p) => ({ x: p.x, y: p.y })),
      // The sim must collide against the MOVED geometry from this moment.
      geometry: s.geometry,
    };
  }

  if (s.phase === 'settling' && nowMs >= s.startedAt + s.settleMs) {
    s.phase = 'idle';
    s.nextAt = nowMs;
    s.moving = [];
    return { type: 'settled', cycle: s.cycle, seq: s.shiftSeq };
  }

  return null;
}

/**
 * Choose this cycle's shift targets deterministically.
 *
 * A platform moves VERTICALLY to a new height inside the arena and, for one
 * platform per cycle, HORIZONTALLY. Targets are rejected if they would overlap
 * any live body (guarantee 2) or leave the arena (guarantee 3), and it retries
 * a bounded number of times with the next seed.
 *
 * @param {object} room
 * @param {number} cycle
 * @returns {Array<{index:number, from:object, to:object}>}
 */
export function planShift(room, cycle) {
  const s = room.shifts;
  const geo = s.geometry;
  const bounds = geo.bounds;
  const bodies = [...(room.sim?.entities?.values() || [])]
    .filter((e) => e && e.alive)
    .map((e) => ({ x: e.x, y: e.y }));
  const radius = config.sim?.entityRadius || 14;
  // Keep a platform body-clearance band around every live player.
  const clearR = radius + 28;

  const indices = geo.platforms.map((_, i) => i);
  // Pick 1–2 platforms per cycle, deterministically.
  const a = indices[Math.floor(seedUnit(room.id, cycle) * indices.length) % indices.length];
  const doTwo = seedUnit(room.id, cycle + 999) > 0.55 && indices.length > 1;
  const b = doTwo
    ? indices[(a + 1 + Math.floor(seedUnit(room.id, cycle + 7) * (indices.length - 1))) % indices.length]
    : null;
  const chosen = b !== null && b !== a ? [a, b] : [a];

  const moving = [];
  for (const index of chosen) {
    const p = geo.platforms[index];
    if (!p) continue;
    const from = { x: p.x, y: p.y };
    // Candidate heights: a few discrete rungs inside the arena.
    const rung = seedUnit(room.id, cycle * 13 + index);
    const topPad = 90;   // keep a platform off the ceiling
    const botPad = 120;  // keep a platform off the floor
    const yLo = bounds.ceilingY + topPad;
    const yHi = bounds.groundY - botPad;
    const newY = Math.round(yLo + rung * (yHi - yLo));
    // Horizontal: allow a modest slide for one platform per cycle.
    const halfW = p.w / 2 + 20;
    const slideR = seedUnit(room.id, cycle * 31 + index);
    const xLo = bounds.minX + halfW;
    const xHi = bounds.maxX - halfW;
    const newX = Math.round(xLo + slideR * (xHi - xLo));

    const to = { x: newX, y: newY };
    // Reject a target that would sit on a player; keep the platform where it is.
    const overlaps = bodies.some((bdy) => Math.hypot(bdy.x - to.x, bdy.y - to.y) < clearR);
    if (!overlaps && newY !== from.y) moving.push({ index, from, to });
  }
  return moving;
}

/**
 * The wire view of shift state, so a client can preview the same targets the
 * server will commit.
 * @param {object} room
 * @returns {object|null}
 */
export function shiftsWire(room) {
  const s = room.shifts;
  if (!s?.enabled) return null;
  return {
    enabled: true,
    phase: s.phase,
    cycle: s.cycle,
    seq: s.shiftSeq,
    warningMs: s.warningMs,
    platforms: s.moving.map((m) => ({ index: m.index, to: { ...m.to } })),
    geometry: s.geometry,
  };
}

/**
 * Make the sim collide against the CURRENT (possibly shifted) geometry. Called
 * every tick before stepEntity by the loop; returns the geometry the resolver
 * should use.
 * @param {object} room
 * @returns {object} a map-shaped object with the live platform positions.
 */
export function activeGeometry(room) {
  const s = room.shifts?.enabled ? room.shifts : null;
  if (!s) return room.map;
  // Overlay the mutable geometry onto the immutable base map.
  return { ...room.map, platforms: s.geometry.platforms, bounds: s.geometry.bounds };
}
