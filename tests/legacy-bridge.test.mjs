/**
 * Astral Zero — regression tests for the legacy `player_move` intent bridge.
 *
 * WHY THESE EXIST (root cause that motivated them)
 * The Phaser client only ever emits `player_move` — never `player_input`.
 * The legacy bridge used to keep `moveX` and throw everything else away:
 *
 *   - `aimX/aimY` were dropped, so every human's server-side stored aim stayed
 *     pinned at the (640, 300) default forever. Facing, the melee arc,
 *     knockback direction and the bot AI that resolves against them were all
 *     derived from a constant, not from the player's mouse.
 *   - `jump` was hard-coded false, so the authoritative simulation NEVER jumped
 *     a human player. The local player jumped (client prediction) while the
 *     server kept them on the floor, which is the reconciliation ping-pong that
 *     makes a player visibly snap back down after every jump.
 *
 * Run: node tests/legacy-bridge.test.mjs
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  storeInput,
  storeLegacyMove,
  intentFor,
  clearInput,
  consumeEdges,
  stats,
} from '../src/game/inputs.js';

const S = 'sock-legacy-1';

test.beforeEach(() => {
  clearInput(S);
});

test.afterEach(() => {
  clearInput(S);
});

// ---------------------------------------------------------------------------
test('the legacy channel carries the client aim instead of defaulting to 640,300', () => {
  const r = storeLegacyMove(S, {
    moveX: 0, vx: 0, aimX: 1200, aimY: 500, seq: 1, timestamp: Date.now(),
  });
  assert.equal(r.ok, true);
  const intent = intentFor(S);
  assert.equal(intent.aimX, 1200, 'aimX must reach the sim');
  assert.equal(intent.aimY, 500, 'aimY must reach the sim');
});

test('aim survives a packet that omits it (no snap back to screen centre)', () => {
  storeLegacyMove(S, { moveX: 0, aimX: 300, aimY: 200, seq: 1, timestamp: Date.now() });
  storeLegacyMove(S, { moveX: 1, vx: 10, seq: 2, timestamp: Date.now() });
  const intent = intentFor(S);
  assert.equal(intent.aimX, 300, 'last aim must persist');
  assert.equal(intent.aimY, 200, 'last aim must persist');
});

test('aim is clamped into the arena, never allowed to be infinity', () => {
  storeLegacyMove(S, { moveX: 0, aimX: 1e9, aimY: -1e9, seq: 1, timestamp: Date.now() });
  const intent = intentFor(S);
  assert.ok(Number.isFinite(intent.aimX) && Number.isFinite(intent.aimY));
  assert.ok(intent.aimX <= 1240 && intent.aimX >= 40, `aimX clamped, got ${intent.aimX}`);
  assert.ok(intent.aimY <= 650 && intent.aimY >= 40, `aimY clamped, got ${intent.aimY}`);
});

// ---------------------------------------------------------------------------
test('a held jump key fires exactly ONE edge at the server', () => {
  // The client sends a new packet every ~16 ms; the server ticks at 50 ms.
  for (let seq = 1; seq <= 20; seq += 1) {
    storeLegacyMove(S, { moveX: 0, jumpHeld: true, seq, timestamp: Date.now() });
  }
  assert.equal(intentFor(S).jump, true, 'the first packet must be an edge');
  assert.equal(intentFor(S).jumpHeld, true);
  consumeEdges(S);
  assert.equal(intentFor(S).jump, false, 'edges are consumed once');
});

test('a held jump key does NOT re-arm on every packet (no server auto-repeat)', () => {
  let edges = 0;
  for (let seq = 1; seq <= 12; seq += 1) {
    const r = storeLegacyMove(S, { moveX: 0, jumpHeld: true, seq, timestamp: Date.now() });
    if (r.jumped) edges += 1;
    consumeEdges(S);
  }
  assert.equal(edges, 1, `expected exactly one jump edge across 12 held packets, got ${edges}`);
});

test('release clears held state so a second press jumps again', () => {
  storeLegacyMove(S, { jumpHeld: true, seq: 1, timestamp: Date.now() });
  storeLegacyMove(S, { jumpHeld: false, seq: 2, timestamp: Date.now() });
  assert.equal(intentFor(S).jumpHeld, false, 'release must clear held');
  const r = storeLegacyMove(S, { jumpHeld: true, seq: 3, timestamp: Date.now() });
  assert.equal(r.jumped, true, 'second physical press re-arms');
});

test('jumpHeld still reaches the sim so variable jump height works', () => {
  storeLegacyMove(S, { jumpHeld: true, seq: 1, timestamp: Date.now() });
  assert.equal(intentFor(S).jumpHeld, true);
});

// ---------------------------------------------------------------------------
test('a lone move packet cannot steer a stranger: seq must advance', () => {
  storeLegacyMove(S, { moveX: 1, seq: 7, timestamp: Date.now() });
  const r = storeLegacyMove(S, { moveX: -1, seq: 7, timestamp: Date.now() });
  assert.equal(r.ok, false);
  assert.equal(r.dropped, 'STALE_SEQ');
  assert.equal(intentFor(S).moveX, 1, 'the stale packet must not steer');
});

test('clearInput forgets the socket (room leave / disconnect)', () => {
  storeLegacyMove(S, { moveX: 1, seq: 1, timestamp: Date.now() });
  assert.equal(stats().trackedInputs >= 1, true);
  clearInput(S);
  const intent = intentFor(S);
  assert.equal(intent.moveX, 0, 'an untracked socket gets a neutral intent');
  assert.equal(intent.jump, false);
});

// ---------------------------------------------------------------------------
test('player_input path is unchanged by the bridge work', () => {
  const r = storeInput(S, {
    moveX: 0.5, jump: true, aimX: 800, aimY: 400, seq: 3, timestamp: Date.now(),
  });
  assert.equal(r.ok, true);
  const intent = intentFor(S);
  assert.equal(intent.moveX, 0.5);
  assert.equal(intent.jump, true);
  assert.equal(intent.aimX, 800);
});

console.log('\nlegacy bridge checks done');
