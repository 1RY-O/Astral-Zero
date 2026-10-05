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
 *     claimed position is IGNORED and only a velocity hint is extracted
 *     (moveX from `moveX ?? facing ?? sign(vx)`), so 1.1.0-phase2 Phaser
 *     builds keep steering instead of freezing the day the server goes
 *     authoritative.
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
  // Stale/duplicate guard: only forward-moving seq updates state — EXCEPT a
  // clearly restarted counter (new Phaser build mid-session sends seq=1 while
  // we remember seq=5000): accept once and re-base instead of wedging forever.
  if (prev && intent.seq !== 0 && intent.seq <= prev.lastSeq && prev.lastSeq - intent.seq <= 1000) {
    return { ok: false, dropped: 'STALE_SEQ' };
  }
  inputs.set(socketId, {
    intent,
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
  const seq = Number.isInteger(raw.seq) ? raw.seq : (prev?.lastSeq || 0) + 1;
  if (prev && seq <= prev.lastSeq) return { ok: false, dropped: 'STALE_SEQ' };
  const now = Date.now();
  inputs.set(socketId, {
    intent: {
      moveX,
      jump: false,
      jumpHeld: false,
      aimX: prev?.intent.aimX ?? 640,
      aimY: prev?.intent.aimY ?? 300,
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
  return { ok: true, seq, bridged: true };
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
