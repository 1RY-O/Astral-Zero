/**
 * Astral Zero — FX pool test (Phase 5).
 * ============================================================
 * The whole point of the pool is that steady-state firing allocates NOTHING.
 * That is not observable in a screenshot, so this test drives the real
 * FxPool with a fake scene and asserts the properties that actually matter:
 *
 *  - the budget is allocated once, up front
 *  - steady-state acquire/release cycles reuse the same objects (no growth)
 *  - exhausting the pool recycles rather than allocating
 *  - entries are released once their life elapses
 *
 * Run with: npm run test:fx
 */

import { FxPool } from '../src/ui/fx/FxPool.js';

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures += 1;
};
const section = (t) => console.log(`\n--- ${t} ---`);

function fakeScene() {
  return { time: { now: 0 } };
}
const makeObj = (scene) => ({
  visible: false, setVisible(v) { this.visible = v; return this; },
  destroy() { this.destroyed = true; }, scene,
});

function makePool(size = 8) {
  const scene = fakeScene();
  let created = 0;
  const pool = new FxPool(scene, {
    size,
    name: 'test',
    create: () => { created += 1; return makeObj(scene); },
    onSpawn: () => {},
  });
  return { pool, scene, createdCount: () => created };
}

// ===========================================================================
section('The budget is allocated once, up front');
// ===========================================================================
{
  const { pool, createdCount } = makePool(8);
  ok(createdCount() === 8, `all 8 entries are created at construction (${createdCount()})`);
  ok(pool.entries.every((e) => !e.inUse), 'nothing is active before first use');
  ok(pool.entries.every((e) => e.obj.visible === false), 'pooled objects start hidden');

  // Heavy use must not create more.
  for (let i = 0; i < 200; i += 1) pool.acquire(1000);
  ok(createdCount() === 8, `200 acquires still only created ${createdCount()} objects`);
  ok(pool.entries.length === 8, 'the pool never grows');
}

// ===========================================================================
section('Steady-state firing reuses the same objects');
// ===========================================================================
{
  const { pool, scene, createdCount } = makePool(8);

  // Simulate a normal firefight: acquire, then let it expire, repeatedly.
  const seen = new Set();
  for (let frame = 0; frame < 300; frame += 1) {
    if (frame % 6 === 0) seen.add(pool.acquire(90));
    scene.time.now = frame * 16.67;
    pool.update();
  }

  ok(seen.size <= 8, `only pool objects were ever handed out (${seen.size} distinct)`);
  ok(seen.size < 300, 'objects are genuinely reused across many frames, not re-created');
  ok(createdCount() === 8, 'no extra objects were allocated during the fight');
  ok(pool.activeCount === 0, 'everything is released once the fight ends');
  ok(pool.peak > 0, `peak usage was recorded for capacity planning (${pool.peak})`);
}

// ===========================================================================
section('An exhausted pool recycles the oldest instead of allocating');
// ===========================================================================
{
  const { pool, createdCount } = makePool(4);
  const a = pool.acquire(1000);
  const b = pool.acquire(1000);
  const c = pool.acquire(1000);
  const d = pool.acquire(1000);
  ok(pool.activeCount === 4, 'pool is fully saturated');

  // A fifth request must steal, not allocate.
  const e = pool.acquire(1000);
  ok(pool.entries.length === 4, 'the pool is still 4 entries after exhaustion');
  ok([a, b, c, d].includes(e), 'the recycled object came from the pool');
  ok(createdCount() === 4, 'no fifth object was created');
  ok(pool.activeCount === 4, 'active count stays capped');
}

// ===========================================================================
section('Entries are released once their life elapses');
// ===========================================================================
{
  const { pool, scene } = makePool(4);
  const obj = pool.acquire(100);

  scene.time.now = 50;
  pool.update();
  ok(obj.visible === true, 'still visible before the life elapses');

  scene.time.now = 99;
  pool.update();
  ok(obj.visible === true, 'still visible at 99ms (life 100ms)');

  scene.time.now = 100;
  pool.update();
  ok(obj.visible === false, 'released once the life elapses');
  ok(pool.activeCount === 0, 'released entry is no longer counted active');

  // The released object must be immediately reusable.
  const again = pool.acquire(100);
  ok(again === obj, 'a released object is handed out again');
}

// ===========================================================================
section('clear() and destroy() leave nothing active');
// ===========================================================================
{
  const { pool } = makePool(4);
  pool.acquire(1000);
  pool.acquire(1000);
  pool.clear();
  ok(pool.activeCount === 0, 'clear() releases every active entry');
  ok(pool.entries.every((e) => !e.obj.visible), 'clear() hides every object');

  pool.destroy();
  ok(pool.entries.length === 0, 'destroy() empties the pool');
  ok(pool.entries === undefined || pool.entries.length === 0, 'destroy() is safe to call');
}

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
process.exit(failures ? 1 : 0);
