/**
 * Astral Zero — orbital shifts (S14.3) rules test.
 *
 * The shifts must be a REPRODUCIBLE function of match state (the client
 * previews the same targets the server commits) and must never place a platform
 * on a live body (guarantee 2) or outside the arena (guarantee 3). These are
 * pure-function properties of `planShift` / `tickShifts`, testable without io.
 *
 * Run: node tests/shifts.test.mjs
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { initShifts, tickShifts, planShift, activeGeometry, shiftsWire } from '../src/game/shifts.js';
import { resolveMap } from '../src/game/maps.js';

function makeRoom(mode = 'ffa', entities = []) {
  const room = {
    id: 'room_test_1',
    mode,
    map: resolveMap('orbital_junkyard'),
    sim: { entities: new Map(entities.map((e) => [e.id, e])), projectiles: [], tokens: [] },
  };
  return room;
}

const entity = (id, x, y) => ({ id, x, y, alive: true });

// ---------------------------------------------------------------------------
test('shifts are OFF unless the mode opts in', () => {
  const r = makeRoom('bot_practice');
  const s = initShifts(r);
  assert.equal(s, null, 'practice must not inherit a moving floor');
  assert.equal(r.shifts, null);
  // …and the geometry falls through to the immutable map.
  assert.strictEqual(activeGeometry(r), r.map);
});

test('shifts are ON for ffa and produce an enabled controller', () => {
  const r = makeRoom('ffa');
  const s = initShifts(r);
  assert.ok(s, 'ffa opts in');
  assert.equal(s.enabled, true);
  assert.equal(s.phase, 'idle');
  assert.ok(s.geometry.platforms.length > 0, 'mutable geometry is seeded from the map');
});

test('the mutable geometry is a COPY — the frozen map def is never mutated', () => {
  const r = makeRoom('ffa');
  const before = r.map.platforms.map((p) => ({ ...p }));
  const s = initShifts(r);
  s.geometry.platforms[0].x = -9999;
  assert.deepEqual(r.map.platforms.map((p) => ({ ...p })), before,
    'the shared frozen map must be untouched by a room-local shift');
});

// ---------------------------------------------------------------------------
test('planShift is DETERMINISTIC for a (room, cycle) — client can predict it', () => {
  const a = makeRoom('ffa'); initShifts(a);
  const b = makeRoom('ffa'); initShifts(b);
  const pa = planShift(a, 3);
  const pb = planShift(b, 3);
  assert.deepEqual(pa, pb, 'same room id + cycle → identical plan on both sides');
});

test('a shift target never lands outside the arena bounds', () => {
  const r = makeRoom('ffa');
  initShifts(r);
  const b = r.map.bounds;
  for (let cycle = 1; cycle <= 40; cycle += 1) {
    for (const m of planShift(r, cycle)) {
      assert.ok(m.to.y >= b.ceilingY, `cycle ${cycle}: y above ceiling`);
      assert.ok(m.to.y <= b.groundY, `cycle ${cycle}: y below floor`);
      assert.ok(m.to.x >= b.minX, `cycle ${cycle}: x left of wall`);
      assert.ok(m.to.x <= b.maxX, `cycle ${cycle}: x right of wall`);
    }
  }
});

test('a shift NEVER moves a platform onto a live body (guarantee 2)', () => {
  // Place a body at the centre of every possible rung so any naive move would
  // collide; planShift must refuse those and return an empty/smaller plan.
  const b = resolveMap('orbital_junkyard').bounds;
  const midX = (b.minX + b.maxX) / 2;
  const bodies = [];
  for (let y = b.ceilingY + 90; y <= b.groundY - 120; y += 20) bodies.push(entity('p' + y, midX, y));
  const r = makeRoom('ffa', bodies);
  initShifts(r);
  for (let cycle = 1; cycle <= 25; cycle += 1) {
    for (const m of planShift(r, cycle)) {
      const clash = bodies.some((e) => Math.hypot(e.x - m.to.x, e.y - m.to.y) < 14 + 28);
      assert.equal(clash, false, `cycle ${cycle} moved a platform onto a player`);
    }
  }
});

// ---------------------------------------------------------------------------
test('tickShifts walks warn → shift → settled and emits one event per phase', () => {
  const r = makeRoom('ffa');
  const s = initShifts(r);
  s.warningMs = 100; s.shiftMs = 10; s.settleMs = 10;
  // Start from the controller's own clock: `nextAt` is seeded from Date.now(),
  // so an arbitrary epoch would sit in the future and never arm.
  let t = s.nextAt - 1000;

  // Advance to the point the first warning arms.
  let ev = null;
  for (let i = 0; i < 4000 && !ev; i += 1) { t += 100; ev = tickShifts(r, t); }
  assert.ok(ev, 'a warning eventually fires');
  assert.equal(ev.type, 'warning');
  assert.ok(Array.isArray(ev.platforms));

  // Nothing else fires during the warning window.
  assert.equal(tickShifts(r, t + 10), null, 'no spam during the telegraph');

  // The commit fires once and carries the moved geometry.
  const commit = tickShifts(r, t + 100);
  assert.ok(commit, 'the shift commits after the warning');
  assert.equal(commit.type, 'shift');
  assert.ok(commit.geometry, 'commit carries the geometry the sim must now use');

  // And it settles.
  const settled = tickShifts(r, t + 200);
  assert.ok(settled);
  assert.equal(settled.type, 'settled');
});

test('the geometry the sim collides against actually MOVES after a commit', () => {
  const r = makeRoom('ffa');
  const s = initShifts(r);
  const before = activeGeometry(r).platforms.map((p) => `${p.x},${p.y}`);
  s.warningMs = 1; s.shiftMs = 1; s.settleMs = 1;
  let t = s.nextAt - 1000;
  let commit = null;
  for (let i = 0; i < 4000 && !commit; i += 1) { t += 100; const e = tickShifts(r, t); if (e?.type === 'shift') commit = e; }
  assert.ok(commit, 'a shift commits');
  const after = activeGeometry(r).platforms.map((p) => `${p.x},${p.y}`);
  assert.notDeepEqual(after, before, 'the sim geometry the player collides with moved');
});

test('shiftsWire publishes the state a client needs to preview + render', () => {
  const r = makeRoom('ffa');
  const s = initShifts(r);
  const wire = shiftsWire(r);
  assert.equal(wire.enabled, true);
  assert.ok(Array.isArray(wire.platforms));
  assert.ok(wire.geometry, 'the client needs the live geometry to draw the same floor');
  assert.equal(typeof wire.seq, 'number');
  assert.equal(s.shifts, undefined); // sanity: shiftsWire is read-only
});

test('a disabled room serialises as null so the client never fakes a shift', () => {
  const r = makeRoom('bot_practice');
  initShifts(r);
  assert.equal(shiftsWire(r), null, 'no state is better than fake state');
});

console.log('\norbital shift checks done');
