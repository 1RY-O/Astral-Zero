import test from 'node:test';
import assert from 'node:assert/strict';
import { World, FIXED_DT } from '../src/physics/world.js';

test('tether physics: rigid constraint prevents object from drifting or flying away while grabbed', () => {
  const world = new World({ width: 800, height: 600, seed: 2026 });
  const ax = 400;
  const ay = 150;
  world.anchor = { x: ax, y: ay, px: ax, py: ay, radius: 10, mass: Infinity, invMass: 0, fixed: true };

  // Place object 120px to the right of the anchor
  const initialDist = 120;
  world.particles = [
    {
      id: 'sat-1',
      x: ax + initialDist,
      y: ay,
      px: ax + initialDist,
      py: ay,
      ax: 0,
      ay: 0,
      invMass: 1 / 15,
      radius: 15,
      mass: 15,
      fixed: false,
      color: '#fff',
      releaseDot: -1,
      releasedAt: 0,
      chainedFrom: null,
    },
  ];

  const grabbed = world.grab(ax + initialDist, ay);
  assert.strictEqual(grabbed, true, 'must grab object');
  assert.ok(world.tether, 'tether must exist');

  // Step 120 frames without thrust; distance must strictly stay at initialDist
  for (let s = 0; s < 120; s += 1) {
    world.step();
    const currentDist = Math.hypot(world.grabbed.x - world.anchor.x, world.grabbed.y - world.anchor.y);
    assert.ok(
      Math.abs(currentDist - initialDist) < 1.0,
      `distance drifted to ${currentDist.toFixed(2)}, expected ~${initialDist}`,
    );
  }
});

test('tether physics: holding thrust swings object in a circular arc without breaking distance constraint', () => {
  const world = new World({ width: 800, height: 600, seed: 2026 });
  const ax = 400;
  const ay = 150;
  world.anchor = { x: ax, y: ay, px: ax, py: ay, radius: 10, mass: Infinity, invMass: 0, fixed: true };

  const initialDist = 140;
  world.particles = [
    {
      id: 'swing-sat',
      x: ax + initialDist,
      y: ay,
      px: ax + initialDist,
      py: ay,
      ax: 0,
      ay: 0,
      invMass: 1 / 15,
      radius: 15,
      mass: 15,
      fixed: false,
      color: '#fff',
      releaseDot: -1,
      releasedAt: 0,
      chainedFrom: null,
    },
  ];

  world.grab(ax + initialDist, ay);
  world.setThrusting(true);

  // Step 60 frames under thrust
  for (let s = 0; s < 60; s += 1) {
    world.step();
  }

  // Calculate speed: object must have gained high tangential velocity from thrust
  const sat = world.grabbed;
  const vx = (sat.x - sat.px) / FIXED_DT;
  const vy = (sat.y - sat.py) / FIXED_DT;
  const speed = Math.hypot(vx, vy);

  assert.ok(speed > 100, `tangential speed ${speed.toFixed(1)} px/s should be > 100 px/s`);

  // Distance must still be constrained to ~initialDist
  const distAfterThrust = Math.hypot(sat.x - world.anchor.x, sat.y - world.anchor.y);
  assert.ok(
    Math.abs(distAfterThrust - initialDist) < 2.0,
    `tether distance stretched to ${distAfterThrust.toFixed(2)} px under thrust, expected ~${initialDist}`,
  );
});

test('tether physics: releasing object detaches constraint and flings object tangentially at speed', () => {
  const world = new World({ width: 800, height: 600, seed: 2026 });
  const ax = 400;
  const ay = 150;
  world.anchor = { x: ax, y: ay, px: ax, py: ay, radius: 10, mass: Infinity, invMass: 0, fixed: true };

  const initialDist = 140;
  world.particles = [
    {
      id: 'fling-sat',
      x: ax + initialDist,
      y: ay,
      px: ax + initialDist,
      py: ay,
      ax: 0,
      ay: 0,
      invMass: 1 / 15,
      radius: 15,
      mass: 15,
      fixed: false,
      color: '#fff',
      releaseDot: -1,
      releasedAt: 0,
      chainedFrom: null,
    },
  ];

  world.grab(ax + initialDist, ay);
  world.setThrusting(true);

  // Build swing momentum for 45 steps
  for (let s = 0; s < 45; s += 1) {
    world.step();
  }

  const satBeforeRelease = world.grabbed;
  const vxBefore = (satBeforeRelease.x - satBeforeRelease.px) / FIXED_DT;
  const vyBefore = (satBeforeRelease.y - satBeforeRelease.py) / FIXED_DT;
  const speedBefore = Math.hypot(vxBefore, vyBefore);
  assert.ok(speedBefore > 50, 'speed before release must be significant');

  // Release tether
  const released = world.release();
  assert.strictEqual(world.grabbed, null, 'world.grabbed must be null after release');
  assert.strictEqual(world.tether, null, 'world.tether must be null after release');
  assert.strictEqual(released.id, 'fling-sat', 'released object must be the satellite');

  const posAtRelease = { x: released.x, y: released.y };

  // Step 30 frames after release: object must fly away freely in zero-g
  for (let s = 0; s < 30; s += 1) {
    world.step();
  }

  const distTraveled = Math.hypot(released.x - posAtRelease.x, released.y - posAtRelease.y);
  assert.ok(distTraveled > 20, `released satellite traveled ${distTraveled.toFixed(1)} px, must fly away`);

  // Distance from anchor must now be different from initial tether distance
  const distFromAnchor = Math.hypot(released.x - ax, released.y - ay);
  assert.ok(
    Math.abs(distFromAnchor - initialDist) > 10,
    `released satellite must fly away from tether radius, currently ${distFromAnchor.toFixed(1)} px`,
  );
});
