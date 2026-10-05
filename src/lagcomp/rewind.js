/**
 * Astral Zero — Rewind hit tests (Phase 4, lag compensation).
 * ============================================================
 * Decides ONE question: "the shell missed the live position, but would it
 * have hit where the victim was when the shooter fired?"
 *
 * RULES (bounded favor-the-shooter):
 *  1. Direct hits on LIVE positions always count (fast path, unchanged).
 *  2. A miss is only re-tested when the shell passed within
 *     (hitRadius + lagComp.gracePx) of the live body — the "grace band".
 *     Anything wider was never close on anyone's screen; no rewind.
 *  3. Rewind target time = shell.impactTime − shooterLatencyMs, where
 *     latency is clamped to [0, lagComp.maxLatencyMs]. Beyond the clamp the
 *     sample is too stale to trust → no hit.
 *  4. Rewound hits count at FULL damage (no falloff games) but are flagged
 *     `lagComp: true` so damage logs can distinguish them.
 *  5. Melee uses the same rule on its arc test (range + grace, rewound feet
 *     point) — knife fights stay honest at 120 ms too.
 *
 * ANTI-ABUSE: grace is ±26 px and history is 2 s; a lag-switcher gains no
 * teleport kills because rewind only NARROWLY widens a near-miss. Latency
 * itself is estimated from client send timestamps (inputs.js) and clamped.
 *
 * Pure math over (positions, histories) — no io, fully unit-testable.
 */

import config from '../server-config.js';
import { sampleAt } from './history.js';

const gracePx = () => config.sim?.lagComp?.gracePx ?? 26;

/**
 * Rewind circle test for projectiles.
 * @param {object} proj projectile (carries shooterLatencyMs)
 * @param {object} victim sim entity (carries history[])
 * @param {number} px, py shell position this tick
 * @param {number} hitRadius direct-hit radius used by the caller
 * @param {number} now server ms
 * @returns {{ hit: boolean, lagComp: boolean }} lagComp=true when rewound
 */
export function rewindCircleTest(proj, victim, px, py, hitRadius, now) {
  const t = torsoOf(victim);
  const dLive = Math.hypot(t.x - px, t.y - py);
  if (dLive <= hitRadius) return { hit: true, lagComp: false }; // fast path
  if (dLive > hitRadius + gracePx()) return { hit: false, lagComp: false }; // never close

  const latency = clampLatency(proj.shooterLatencyMs);
  if (latency <= 0) return { hit: false, lagComp: false }; // no info → no favor
  const past = sampleAt(victim.history, now - latency);
  if (!past) return { hit: false, lagComp: false }; // history too short
  // Feet→torso anchor matches the live test (feet y − 20).
  const dPast = Math.hypot(past.x - px, past.y - 20 - py);
  return dPast <= hitRadius ? { hit: true, lagComp: true } : { hit: false, lagComp: false };
}

/**
 * Rewind arc test for melee (same band rule, rewound feet point).
 * @param {number} ax, ay attacker torso anchor
 * @param {number} dir swing direction (-1 | 1)
 * @param {object} victim sim entity
 * @param {number} range melee range + body (caller's direct-test radius)
 * @param {number} halfArc arc half-angle (caller's)
 * @param {number} attackerLatencyMs shooter's estimate
 * @param {number} now server ms
 * @returns {{ hit: boolean, lagComp: boolean }}
 */
export function rewindArcTest(ax, ay, dir, victim, range, halfArc, attackerLatencyMs, now) {
  const dx = victim.x - ax;
  const dy = victim.y - 20 - ay;
  const dLive = Math.hypot(dx, dy);
  if (dLive <= range && arcOk(dx, dy, dir, halfArc, dLive)) {
    return { hit: true, lagComp: false };
  }
  if (dLive > range + gracePx()) return { hit: false, lagComp: false };

  const latency = clampLatency(attackerLatencyMs);
  if (latency <= 0) return { hit: false, lagComp: false };
  const past = sampleAt(victim.history, now - latency);
  if (!past) return { hit: false, lagComp: false };
  const pdx = past.x - ax;
  const pdy = past.y - 20 - ay;
  const dPast = Math.hypot(pdx, pdy);
  if (dPast <= range && arcOk(pdx, pdy, dir, halfArc, dPast)) {
    return { hit: true, lagComp: true };
  }
  return { hit: false, lagComp: false };
}

/** Feet-point torso anchor (mirrors combat/projectiles.torso). */
function torsoOf(e) {
  return { x: e.x, y: e.y - 20 };
}

/** Arc gate shared with damage.js (angle within ±halfArc, or point-blank). */
function arcOk(dx, dy, dir, halfArc, dist) {
  const ang = Math.abs(Math.atan2(dy, dx * dir));
  return ang <= halfArc || dist <= 30;
}

function clampLatency(ms) {
  const max = config.sim?.lagComp?.maxLatencyMs || 500;
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(max, n);
}
