/**
 * Astral Zero — CONTROL POINT (S14.5).
 * ============================================================
 * A three-state objective in the middle of the arena. You do not "win" by
 * holding scrap — you win by holding GROUND, and ground has to be taken from
 * someone who wants it too. That is what pulls two teams onto the same square
 * instead of letting them farm opposite corners, which is the failure mode that
 * makes team modes feel dead.
 *
 * THE STATE MACHINE (one point, two teams, three owners)
 *   neutral  → whoever holds it unopposed captures it
 *   red/blue → that team owns it and ticks score
 *
 * WHY "UNOPPOSED" IS THE WHOLE DESIGN
 * The single most important rule is that presence from BOTH teams FREEZES the
 * point. A naive "last body standing owns it" implementation makes the point a
 * pure numbers check — the bigger team walks in and the game is over. Freezing
 * it means a 4v4 becomes a genuine contest of who can clear the point, and a
 * lone defender can actually hold one against a rush.
 *
 * ANTI-FARM
 * Two guards, because a capture point in a shooter will always get camped:
 *  1. CAPTURE DECAY — an uncontested point that is NOT being actively held by
 *     its owner bleeds back toward neutral. So parking a body on it is not a
 *     strategy; you have to win it and then keep winning it.
 *  2. CONTEST WINDOW — a team that just lost the point cannot instantly
 *     re-take it. It has to be cleared first. This kills the see-saw where two
 *     teams trade the same square every second and nobody ever gets to use it.
 *
 * All of it is server-side. The client renders a bar; it never decides an owner.
 */

import config from '../server-config.js';

const now = () => Date.now();

const DEFAULTS = Object.freeze({
  enabled: false,
  /** Capture/hold radius in px. */
  radius: 96,
  /** Percent-per-second toward capture. ~2.5s to flip a neutral point. */
  captureRate: 40,
  /** Percent-per-second of hold score accrual while owned. */
  tickRate: 1,
  /** Score needed to win. */
  scoreLimit: 150,
  /** Seconds a team must be locked out after LOSING the point. */
  contestLockMs: 4000,
  /** Percent-per-second bleed toward neutral when owned but unattended. */
  decayRate: 3,
  /** How close the point sits to the arena floor by default. */
  yOffset: -0,
});

function pointCfg(room) {
  const cfg = config.gameModes?.[room.mode]?.controlPoint;
  return cfg && cfg.enabled === true ? { ...DEFAULTS, ...cfg } : null;
}

/**
 * Where the point sits: the map may name one, otherwise the arena's centre.
 * @param {object} room
 * @returns {{x:number,y:number}}
 */
export function pointCentre(room) {
  const named = room.map?.controlPoint;
  if (named && Number.isFinite(named.x) && Number.isFinite(named.y)) {
    return { x: named.x, y: named.y };
  }
  const b = room.map.bounds;
  return { x: Math.round((b.minX + b.maxX) / 2), y: Math.round(b.groundY + (pointCfg(room)?.yOffset ?? 0)) };
}

/**
 * Attach the objective to a room. Off unless the mode opts in.
 * @param {object} room
 * @returns {object|null}
 */
export function initControlPoint(room) {
  const cfg = pointCfg(room);
  if (!cfg) { room.controlPoint = null; return null; }
  const c = pointCentre(room);
  room.controlPoint = {
    enabled: true,
    cfg,
    x: c.x,
    y: c.y,
    /** 'neutral' | 'red' | 'blue' */
    owner: 'neutral',
    /** 0–100 progress toward `contender`. */
    progress: 0,
    /** Which team `progress` belongs to. */
    contender: null,
    /** Lockout: { red: ms, blue: ms } applied after LOSING the point. */
    locked: { red: 0, blue: 0 },
    /** Team scores. Only the owner ticks. */
    scores: { red: 0, blue: 0 },
    lastEvent: null,
  };
  return room.controlPoint;
}

/** Living, connected bodies of one team inside the radius. */
function presence(cp, sim, nowMs) {
  const out = { red: 0, blue: 0 };
  for (const e of sim?.entities?.values?.() || []) {
    if (!e?.alive || e.disconnected) continue;
    if (e.team !== 'red' && e.team !== 'blue') continue;
    // Feet point vs the point's centre — the same anchor space as every other
    // distance test in the sim, so "I am standing on it" means the same thing
    // here as it does for pickups and melee.
    const d = Math.hypot(e.x - cp.x, e.y - cp.y);
    if (d <= cp.cfg.radius) out[e.team] += 1;
  }
  return out;
}

/**
 * Advance the point one tick.
 *
 * Returns an event only when something READABLE changed (a flip, a lockout
 * clearing, a capture completing) — not every frame, so the client gets a
 * beat to react to instead of a bar jittering at 20 Hz.
 *
 * @param {object} room
 * @param {number} dt seconds
 * @param {number} nowMs
 * @param {object} io
 * @param {object} EV
 * @returns {object|null}
 */
export function tickControlPoint(room, dt, nowMs = now(), io = null, EV = null) {
  const cp = room.controlPoint;
  if (!cp?.enabled) return null;
  const cfg = cp.cfg;
  const pres = presence(cp, room.sim, nowMs);

  // Expire lockouts.
  let lockoutCleared = null;
  for (const team of ['red', 'blue']) {
    if (cp.locked[team] > 0 && nowMs >= cp.locked[team]) {
      cp.locked[team] = 0;
      lockoutCleared = team;
    }
  }

  const contested = pres.red > 0 && pres.blue > 0;
  let event = null;

  if (contested) {
    // THE core rule: two teams on the point and NOTHING happens. The bar HOLDS
    // — it does not tick, and it does not bleed either. Any drift here would
    // hand the point to whichever team happened to have more bodies, which is
    // exactly the numbers check this mode exists to avoid. A contested point is
    // resolved by the fight, not by the maths.
    cp.lastEvent = 'contested';
    return lockoutCleared ? { kind: 'unlock', team: lockoutCleared, ...snapshot(cp) } : null;
  }

  const present = pres.red > 0 ? 'red' : pres.blue > 0 ? 'blue' : null;

  if (!present) {
    // Anti-farm 1: an owned point nobody is standing on bleeds back to neutral,
    // so camping it is worthless and the map keeps flowing.
    if (cp.owner !== 'neutral') {
      const bleed = cfg.decayRate * dt;
      if (cp.progress > 0) {
        cp.progress -= bleed;
        if (cp.progress <= 0) { cp.progress = 0; cp.contender = null; }
      } else {
        cp.progress += bleed;
        if (cp.progress >= 100) { cp.progress = 100; cp.contender = cp.owner; }
      }
      if (cp.progress === 0 && cp.contender === null) {
        const prev = cp.owner;
        cp.owner = 'neutral';
        cp.scores.red = Math.max(0, cp.scores.red);
        event = { kind: 'decay', from: prev, ...snapshot(cp) };
      }
    }
    cp.lastEvent = 'idle';
    return event || (lockoutCleared ? { kind: 'unlock', team: lockoutCleared, ...snapshot(cp) } : null);
  }

  // A locked-out team still standing there gets no progress — it must be
  // cleared first (anti-farm 2, the see-saw guard).
  if (cp.locked[present] > 0) {
    cp.lastEvent = 'locked';
    return lockoutCleared ? { kind: 'unlock', team: lockoutCleared, ...snapshot(cp) } : null;
  }

  if (cp.owner === present) {
    // Held: no capture progress to earn, just score.
    cp.progress = 100;
    cp.contender = present;
    cp.lastEvent = 'held';
  } else if (cp.contender !== present) {
    // Flipping the fight: the bar restarts from whoever owns it.
    cp.contender = present;
    cp.progress = 0;
  }

  const before = cp.progress;
  cp.progress = Math.min(100, cp.progress + cfg.captureRate * dt);

  // Captured a point the other team held → they eat the contest lockout.
  if (cp.progress >= 100 && (before < 100 || cp.owner !== present)) {
    const prev = cp.owner;
    cp.owner = present;
    // The loser is simply whoever HELD it a moment ago — taking a neutral point
    // locks nobody out, so a round start is not gated behind a clear.
    if (prev !== 'neutral') cp.locked[prev] = nowMs + cfg.contestLockMs;
    cp.lastEvent = 'capture';
    event = { kind: 'capture', team: present, from: prev, ...snapshot(cp) };
    io?.to?.(room.id)?.emit?.(EV?.OBJECTIVE_EVENT, { roomId: room.id, ...event, timestamp: nowMs });
  }

  // Held point accrues score toward the win condition.
  if (cp.owner !== 'neutral' && cp.lastEvent !== 'contested') {
    cp.scores[cp.owner] += cfg.tickRate * dt;
  }

  return event;
}

/**
 * Win check: has either team crossed the score limit?
 * @param {object} room
 * @returns {object|null} { team, scores } when a team has won
 */
export function checkControlWin(room) {
  const cp = room.controlPoint;
  if (!cp?.enabled) return null;
  const limit = cp.cfg.scoreLimit;
  if (cp.scores.red >= limit || cp.scores.blue >= limit) {
    const team = cp.scores.red >= limit && cp.scores.red >= cp.scores.blue ? 'red' : 'blue';
    return { team, scores: { ...cp.scores } };
  }
  return null;
}

/** Wire view — the whole objective is public state; there is nothing to hide. */
export function controlWire(room) {
  const cp = room.controlPoint;
  if (!cp?.enabled) return null;
  return {
    enabled: true,
    x: cp.x,
    y: cp.y,
    radius: cp.cfg.radius,
    owner: cp.owner,
    progress: Math.round(cp.progress),
    contender: cp.contender,
    scores: { red: Math.round(cp.scores.red), blue: Math.round(cp.scores.blue) },
    scoreLimit: cp.cfg.scoreLimit,
    locked: { red: cp.locked.red > 0, blue: cp.locked.blue > 0 },
    state: cp.lastEvent,
  };
}

function snapshot(cp) {
  return {
    owner: cp.owner,
    progress: Math.round(cp.progress),
    contender: cp.contender,
    scores: { red: Math.round(cp.scores.red), blue: Math.round(cp.scores.blue) },
  };
}
