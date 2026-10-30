import test from 'node:test';
import assert from 'node:assert/strict';
import { World, isHit } from '../src/physics/world.js';

test('hit detection: direct hit at center (d = 0)', () => {
  const result = isHit(100, 100, 100, 100, 20, 2.5);
  assert.strictEqual(result, true, 'center hit must be true');
});

test('hit detection: hit at exactly 1.0x radius', () => {
  const result = isHit(120, 100, 100, 100, 20, 2.5);
  assert.strictEqual(result, true, 'hit on perimeter must be true');
});

test('hit detection: hit inside 2.5x radius boundary (2.0x)', () => {
  // Radius = 20, 2.5x radius = 50. Distance = 40 (2.0x)
  const result = isHit(140, 100, 100, 100, 20, 2.5);
  assert.strictEqual(result, true, 'hit at 2.0x radius must be true');
});

test('hit detection: hit at exact 2.5x radius boundary', () => {
  // Distance = 50, exactly 2.5 * 20
  const result = isHit(150, 100, 100, 100, 20, 2.5);
  assert.strictEqual(result, true, 'hit at exactly 2.5x radius must be true');
});

test('hit detection: miss outside 2.5x radius boundary (2.55x)', () => {
  // Distance = 51 > 50
  const result = isHit(151, 100, 100, 100, 20, 2.5);
  assert.strictEqual(result, false, 'miss outside 2.5x radius must be false');
});

test('world.grab: clicking within 2.5x radius grabs the debris object', () => {
  const world = new World({ width: 800, height: 600, seed: 2026 });
  world.particles = [
    {
      id: 'target-sat',
      x: 400,
      y: 300,
      px: 400,
      py: 300,
      ax: 0,
      ay: 0,
      invMass: 1 / 10,
      radius: 20,
      mass: 10,
      fixed: false,
      color: '#fff',
      releaseDot: -1,
      releasedAt: 0,
      chainedFrom: null,
    },
  ];

  // Click at distance 45px (2.25x radius, <= 2.5 * 20 = 50px)
  const grabbed = world.grab(445, 300);
  assert.strictEqual(grabbed, true, 'world.grab must return true when clicking within 2.5x radius');
  assert.strictEqual(world.grabbed?.id, 'target-sat', 'world.grabbed must be the targeted satellite');
  assert.ok(world.tether, 'tether constraint must be attached');
});

test('world.grab: clicking outside 2.5x radius does not grab', () => {
  const world = new World({ width: 800, height: 600, seed: 2026 });
  world.particles = [
    {
      id: 'target-sat',
      x: 400,
      y: 300,
      px: 400,
      py: 300,
      ax: 0,
      ay: 0,
      invMass: 1 / 10,
      radius: 20,
      mass: 10,
      fixed: false,
      color: '#fff',
      releaseDot: -1,
      releasedAt: 0,
      chainedFrom: null,
    },
  ];

  // Click at distance 55px (> 50px)
  const grabbed = world.grab(455, 300);
  assert.strictEqual(grabbed, false, 'world.grab must return false when clicking outside 2.5x radius');
  assert.strictEqual(world.grabbed, null, 'world.grabbed must remain null');
  assert.strictEqual(world.tether, null, 'world.tether must remain null');
});
