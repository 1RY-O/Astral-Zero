/**
 * Astral Zero — Input intent store (Phase 3).
 * ============================================================
 * The server never trusts client POSITIONS — it trusts client INTENT and
 * simulates the rest. Two ingress channels feed one store:
 *
 *  1. `player_input` (NEW, primary): { moveX, jump, jumpHeld, aimX, aimY,
 *     fire, melee, weaponSlot?, seq, timestamp } — matches the frontend
 *     InputManager intent shape plus combat buttons.
 *  2. `player_move` (LEGACY bridge): the Phase 1/2 position broadcast.
 *     Out of a room it keeps its old global-relay behavior; IN a room the
 *     claimed position is IGNORED and only intent is extracted — and that
 *     means the FULL intent: moveX, the derived jump edge from `jumpHeld`,
 *     and the world-space aim point the client sends alongside its position.
 *     (Earlier versions of this bridge kept only moveX, which left the
 *     authoritative sim blind to where every human was looking and unable to
 *     jump them at all — see storeLegacyMove for the details.)
 *
 * VALIDATION (anti-cheat-lite, all cheap):
 *  - moveX clamped to [-1, 1]; NaN → 0. jump/fire/melee coerced to bool.
 *  - aim point clamped to the arena (no aiming at infinity for angle math).
 *  - seq must advance; STALE seq (reordered/duplicate packet) is dropped so
 *    a lag spike can't rewind a player into old input.
 *  - Rate cap: inputs faster than 120 Hz from one socket are dropped
 *    (the frontend sends at 60 Hz; anything above is a bug or a flood).
 *
 * STALENESS: if no input arrives for 1500 ms the entry is marked stale and
 * the tick loop treats the player as idle (prevents "corpse keeps running
 * right" after a disconnect between packets). Disconnect cleanup removes
 * the entry outright.
 */

import config from '../server-config.js';
import { clampToArena } from './arena.js';

/** socketId → { intent, lastSeq, lastAt, stale } */
const inputs = new Map();

const STALE_AFTER_MS = 1500;
const MIN_INTERVAL_MS = 12; // Phase 5: ~83 Hz flood cap. The client sends at
// 60 Hz (≥15 ms gaps), so legit traffic always passes; packet floods above
// ~80 Hz are dropped with RATE_LIMITED (cheap anti-spam, no gameplay cost).

function cleanIntent(raw = {}) {
  let moveX = Number(raw.moveX);
  if (!Number.isFinite(moveX)) moveX = 0;
  moveX = Math.max(-1, Math.min(1, moveX));

  const aim = clampToArena(raw.aimX, raw.aimY);
  return {
    moveX,
    jump: Boolean(raw.jump || raw.jumpPressed),
    jumpHeld: Boolean(raw.jumpHeld ?? raw.jump ?? false),
    aimX: aim.x,
    aimY: aim.y,
    fire: Boolean(raw.fire),
    melee: Boolean(raw.melee),
    // Weapon switching is validated trackside (loop checks WEAPONS keys);
    // unknown ids are ignored there, so passing the raw string through is safe.
    weaponId: typeof raw.weaponId === 'string' ? raw.weaponId.slice(0, 32) : null,
    weaponSlot: Number.isInteger(raw.weaponSlot) ? raw.weaponSlot : null,
    seq: Number.isInteger(raw.seq) ? raw.seq : 0,
    timestamp: Number.isFinite(raw.timestamp) ? raw.timestamp : Date.now(),
  };
}

/**
 * Store a fresh `player_input` payload.
 *
 * Phase 4 hardening (all additive, all cheap):
 *  - Junk guard: >32 keys or non-object payloads are dropped (INPUT_JUNK).
 *  - Seq-jump resync: a seq AHEAD by >1000 (client restarted its counter,
 *    new Phaser build mid-session) is accepted once and re-bases lastSeq
 *    instead of wedging the sender on STALE_SEQ forever.
 *  - Latency stamp: `now - timestamp` (clamped) feeds lag compensation.
 * @param {string} socketId
 * @param {object} raw client payload
 * @returns {{ ok: boolean, seq?: number, dropped?: string }}
 */
export function storeInput(socketId, raw = {}) {
  const now = Date.now();
  const prev = inputs.get(socketId);
  // Flood guard (per-sender; bots write directly and bypass this).
  if (prev && now - prev.lastAt < MIN_INTERVAL_MS) {
    return { ok: false, dropped: 'RATE_LIMITED' };
  }
  if (!raw || typeof raw !== 'object' || Object.keys(raw).length > 32) {
    return { ok: false, dropped: 'INPUT_JUNK' };
  }
  const intent = cleanIntent(raw);
  // Sticky/duplicate guard: only forward-moving seq updates state — EXCEPT a
  // clearly restarted counter (new Phaser build mid-session sends seq=1 while
  // we remember seq=5000): accept once and re-base instead of wedging forever.
  if (prev && intent.seq !== 0 && intent.seq <= prev.lastSeq && prev.lastSeq - intent.seq <= 1000) {
    return { ok: false, dropped: 'STALE_SEQ' };
  }
  // Preserve edges that have not been consumed yet. A client ticks at 60 Hz
  // against a 20 Hz sim, so up to three payloads land per tick and each one
  // replaces the stored intent; without ORing the pending edge in, the first
  // packet's jump/fire/melee pulse is erased by the next packet before the tick
  // loop ever reads it.
  inputs.set(socketId, {
    intent: {
      ...intent,
      jump: intent.jump || Boolean(prev?.intent.jump),
      fire: intent.fire || Boolean(prev?.intent.fire),
      melee: intent.melee || Boolean(prev?.intent.melee),
    },
    lastSeq: intent.seq !== 0 ? intent.seq : (prev?.lastSeq || 0),
    lastAt: now,
    stale: false,
    latencyMs: estimateLatency(intent.timestamp, now),
  });
  return { ok: true, seq: intent.seq };
}

/**
 * Convert a legacy `player_move` into intent (in-room bridge).
 * Claimed x/y are DELIBERATELY ignored — position is server-owned.
 * Speed-hack check: |vx| beyond maxSpeed×tolerance is clamped, not trusted.
 */
export function storeLegacyMove(socketId, raw = {}) {
  const maxSpeed = config.sim?.maxSpeed || 260;
  const tol = config.sim?.speedHackTolerance || 1.35;
  let vx = Number(raw.vx);
  if (!Number.isFinite(vx)) vx = 0;
  vx = Math.max(-maxSpeed * tol, Math.min(maxSpeed * tol, vx));

  let moveX = 0;
  if (Number.isFinite(Number(raw.moveX))) moveX = Math.max(-1, Math.min(1, Number(raw.moveX)));
  else if (raw.facing === -1 || raw.facing === 1) moveX = raw.facing;
  else if (Math.abs(vx) > 20) moveX = Math.sign(vx);

  const prev = inputs.get(socketId);
  const prevAim = prev?.intent;
  const seq = Number.isInteger(raw.seq) ? raw.seq : (prev?.lastSeq || 0) + 1;
  if (prev && seq <= prev.lastSeq) return { ok: false, dropped: 'STALE_SEQ' };
  // Aim IS carried on the legacy channel: every 1.x client already sends the
  // canonical world-space aim point beside its move, so honour it instead of
  // silently pinning every human's stored aim at the (640, 300) default. Without
  // this the authoritative sim never learned which way a player was looking —
  // their facing, melee arc, knockback direction and the bot targeting that
  // resolves against them were all derived from a constant.
  // A packet that omits aim keeps the LAST aim (not the default), so turret
  // characters never snap back to screen centre between frames; only a
  // non-finite/absent aim falls through to the default.
  const hasAim = Number.isFinite(Number(raw.aimX)) && Number.isFinite(Number(raw.aimY));
  const aim = hasAim ? clampToArena(raw.aimX, raw.aimY) : null;
  const aimX = aim ? aim.x : (prevAim?.aimX ?? 640);
  const aimY = aim ? aim.y : (prevAim?.aimY ?? 300);

  // Jump: derive the EDGE here rather than trusting a client edge flag. The
  // client's `jumpPressed` is a one-frame pulse sent on a 60 Hz cadence, against
  // a 20 Hz server — a pulse can land between two ticks and be dropped, and
  // honouring a held flag directly would re-arm every packet and reproduce the
  // OS-auto-repeat bunny-hop the client already fixed. Tracking held state per
  // socket reproduces the client's own repeat-proof rule exactly, and
  // `jumpHeld` still reaches the sim so variable jump height works.
  const jumpHeld = Boolean(raw.jumpHeld ?? raw.jumpPressed ?? false);
  const prevJumpHeld = Boolean(prevAim?.jumpHeld ?? false);
  const jumpEdge = jumpHeld && !prevJumpHeld;

  const now = Date.now();
  inputs.set(socketId, {
    intent: {
      moveX,
      // One-shot edges are STICKY until the tick loop consumes them. The client
      // sends ~3 packets per 20 Hz tick; without stickiness an edge carried by
      // the first packet is overwritten by the second and the jump is lost.
      jump: jumpEdge || Boolean(prevAim?.jump),
      jumpHeld,
      aimX,
      aimY,
      fire: false,
      melee: false,
      weaponSlot: null,
      seq,
      timestamp: now,
    },
    lastSeq: seq,
    lastAt: now,
    stale: false,
    latencyMs: estimateLatency(Number(raw.timestamp), now),
  });
  return { ok: true, seq, bridged: true, jumped: jumpEdge };
}

/**
 * One-way latency estimate for a socket (ms), from client send timestamps.
 * Garbage/absent timestamps → 0 (no compensation, never a penalty).
 * Clamped to lagComp.maxLatencyMs — beyond that, history can't be trusted.
 */
function estimateLatency(sentAt, now) {
  const max = config.sim?.lagComp?.maxLatencyMs || 500;
  if (!Number.isFinite(sentAt)) return 0;
  const d = now - sentAt;
  if (d < 0 || d > max) return 0; // future stamp or absurd lag: don't compensate
  return Math.round(d);
}

/**
 * Latest latency estimate for a socket (0 when unknown).
 * The tick loop copies this onto the sim entity each tick.
 */
export function latencyFor(socketId) {
  return inputs.get(socketId)?.latencyMs || 0;
}

/**
 * Latest intent for the tick loop. Returns a NEUTRAL intent when the player
 * never sent input, disconnected, or went stale (fail-safe: idle, no fire).
 */
export function intentFor(socketId) {
  const entry = inputs.get(socketId);
  if (!entry) return neutralIntent();
  if (Date.now() - entry.lastAt > STALE_AFTER_MS) {
    entry.stale = true;
    return neutralIntent(entry.intent);
  }
  return entry.intent;
}

/** Idle intent that preserves aim (so turrets don't snap on packet loss). */
export function neutralIntent(keepAim = null) {
  return {
    moveX: 0,
    jump: false,
    jumpHeld: false,
    aimX: keepAim?.aimX ?? 640,
    aimY: keepAim?.aimY ?? 300,
    fire: false,
    melee: false,
    weaponSlot: null,
    seq: 0,
    timestamp: Date.now(),
  };
}

/** Consume one-shot edges (jump/fire/melee fire once per press, not per tick). */
export function consumeEdges(socketId) {
  const entry = inputs.get(socketId);
  if (!entry) return;
  entry.intent.jump = false;
  entry.intent.fire = false;
  entry.intent.melee = false;
}

/** Forget a socket (disconnect / room exit). */
export function clearInput(socketId) {
  inputs.delete(socketId);
}

/** Debug helper. */
export function stats() {
  return { trackedInputs: inputs.size };
}
