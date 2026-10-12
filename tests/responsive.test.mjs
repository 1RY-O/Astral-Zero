/**
 * Astral Zero — responsive tier bus test.
 *
 * Scenes read their layout tier once, inside create(). Nothing used to listen
 * for a resize, so rotating a phone (or dragging a window across a breakpoint)
 * left the previous tier's structure in place until the scene was restarted by
 * some unrelated event. This locks down the bus that fixes it.
 *
 * Run: node tests/responsive.test.mjs
 */

import assert from 'node:assert/strict';
import test from 'node:test';

// Minimal browser-ish globals for the module, which only touches window if it
// exists. The test drives the debounce by faking timers explicitly, so a real
// setTimeout is fine.
const listeners = [];
globalThis.window = {
  addEventListener: (name, cb) => listeners.push([name, cb]),
};
globalThis.__viewport = { width: 1200, height: 800 };

const { reloadOnTierChange, onTierChange, tierNow } = await import('../src/core/Responsive.js');

const restarts = [];
const fakeScene = (key = 'HomeScene', active = true) => ({
  scene: { key, isActive: () => active, restart: () => restarts.push(key) },
  game: {},
});

// BREAKPOINTS: <640 compact, <1024 medium, else wide. At import there is no
// window width, so the module's own baseline is `compact` (tierFor(0)).
const WIDE = 1440;
const MEDIUM = 900;
const COMPACT = 480;

/** Set the viewport width, fire the plumbing, let the debounce elapse. */
async function resize(width) {
  globalThis.window.innerWidth = width;
  for (const [name, cb] of listeners) {
    if (name === 'resize' || name === 'orientationchange') cb();
  }
  await new Promise((r) => setTimeout(r, 260));
}

test('a tier change restarts a scene that opts in', async () => {
  restarts.length = 0;
  const scene = fakeScene('HomeScene');
  const off = reloadOnTierChange(scene);

  await resize(WIDE); // compact -> wide: a real breakpoint crossing
  assert.deepEqual(restarts, ['HomeScene'], 'the scene must be rebuilt for the new tier');
  assert.equal(tierNow(), 'wide');
  off();
});

test('an INACTIVE scene is never restarted out from under a background scene', async () => {
  restarts.length = 0;
  const scene = fakeScene('LobbyScene', false); // not active
  const off = reloadOnTierChange(scene);

  await resize(MEDIUM); // wide -> medium: the publish DOES happen
  assert.strictEqual(restarts.length, 0, 'a background scene must not be restarted');
  // ...and the subscriber really was reached: the tier moved.
  assert.equal(tierNow(), 'medium');
  off();
});

test('a scene that opts OUT (layout locked) is never restarted', async () => {
  restarts.length = 0;
  const scene = fakeScene('ArenaScene', true);
  scene._layoutLocked = true; // the arena does this — a live match would be destroyed
  const off = reloadOnTierChange(scene);

  await resize(WIDE); // medium -> wide: publish, but the scene is locked
  assert.strictEqual(restarts.length, 0, 'the arena must survive a resize mid-match');
  assert.equal(tierNow(), 'wide');
  off();
});

test('a resize that does not change tier restarts nothing', async () => {
  restarts.length = 0;
  const scene = fakeScene('HomeScene');
  const off = reloadOnTierChange(scene);

  await resize(WIDE - 7); // staying inside `wide`
  assert.strictEqual(restarts.length, 0, 'staying inside a tier must not rebuild the scene');
  off();
});

test('a subscriber that throws does not break the others', async () => {
  const seen = [];
  const offGood = onTierChange((tier) => seen.push(tier));
  const offBad = onTierChange(() => { throw new Error('boom'); });

  await resize(COMPACT); // wide -> compact, so the publishing genuinely runs
  assert.deepEqual(seen, ['compact'], 'the surviving subscriber still received the new tier');
  offGood();
  offBad();

  // The bus is still usable after a throwing subscriber.
  await resize(WIDE);
  assert.equal(tierNow(), 'wide', 'the tier is still readable after a throw');
});

console.log('\nresponsive bus checks done');
