import test from 'node:test';
import assert from 'node:assert/strict';

import {
  World,
  TETHER_MAX,
} from '../src/physics/world.js';

const WIDTH = 800;
const HEIGHT = 600;

/**
 * Run a headless simulation and sample particle positions. Same seed +
 * no inputs => a fully deterministic trace.
 */
function trace(seed, steps = 360, sampleEvery = 60) {
  const world = new World({ width: WIDTH, height: HEIGHT, seed });
  const samples = [];
  for (let s = 0; s < steps; s += 1) {
    world.step();
    if (s % sampleEvery === 0) {
      samples.push(world.particles.map((p) => [p.x, p.y]));
    }
  }
  return samples;
}

test('physics: same seed produces the same trace', () => {
  assert.deepEqual(trace(2026), trace(2026));
});

test('physics: different seeds place debris differently', () => {
  const a = trace(1);
  const b = trace(2);
  let different = false;
  outer: for (let s = 0; s < a.length; s += 1) {
    for (let i = 0; i < a[s].length; i += 1) {
      if (a[s][i][0] !== b[s][i][0] || a[s][i][1] !== b[s][i][1]) {
        different = true;
        break outer;
      }
    }
  }
  assert.ok(different, 'seeds 1 and 2 produced identical traces');
});

test('physics: positions stay finite over a long run', () => {
  const world = new World({ width: WIDTH, height: HEIGHT, seed: 7 });
  for (let s = 0; s < 3600; s += 1) world.step();
  for (const p of world.particles) {
    assert.ok(
      Number.isFinite(p.x) && Number.isFinite(p.y),
      `particle ${p.id} escaped the world`,
    );
  }
  assert.ok(
    Number.isFinite(world.anchor.x) && Number.isFinite(world.anchor.y),
    'anchor escaped the world',
  );
});

test('physics: tether keeps the grabbed body within max length', () => {
  const world = new World({ width: WIDTH, height: HEIGHT, seed: 11 });

  // Place the pointer on the particle nearest the anchor and grab it.
  let nearest = null;
  let best = Infinity;
  for (const p of world.particles) {
    const dx = p.x - world.anchor.x;
    const dy = p.y - world.anchor.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < best) {
      best = d;
      nearest = p;
    }
  }
  assert.ok(nearest, 'debris swarm is empty');
  assert.ok(world.grab(nearest.x, nearest.y), 'grab failed');
  assert.ok(world.tether, 'tether not attached');
  assert.strictEqual(world.grabbed, nearest);

  for (let s = 0; s < 180; s += 1) world.step();

  const dx = world.grabbed.x - world.anchor.x;
  const dy = world.grabbed.y - world.anchor.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  assert.ok(
    d <= TETHER_MAX + 1e-3,
    `tether stretched to ${d.toFixed(2)} px > max ${TETHER_MAX} px`,
  );
});

test('physics: thrust drains fuel; release clears the tether and stops drain', () => {
  const world = new World({ width: WIDTH, height: HEIGHT, seed: 3 });

  let nearest = null;
  let best = Infinity;
  for (const p of world.particles) {
    const dx = p.x - world.anchor.x;
    const dy = p.y - world.anchor.y;
    const d = Math.hypot(dx, dy);
    if (d < best) {
      best = d;
      nearest = p;
    }
  }
  assert.ok(world.grab(nearest.x, nearest.y), 'grab failed');

  const fuelBefore = world.fuel;
  world.setThrusting(true);
  for (let s = 0; s < 60; s += 1) world.step();
  assert.ok(world.fuel < fuelBefore, 'thrust did not drain fuel');

  const fuelAfterThrust = world.fuel;
  world.release();
  assert.ok(!world.tether, 'tether still attached after release');
  assert.strictEqual(world.grabbed, null, 'grabbed body not cleared');

  world.setThrusting(false);
  for (let s = 0; s < 60; s += 1) world.step();
  assert.strictEqual(world.fuel, fuelAfterThrust, 'fuel drained without thrust');
});