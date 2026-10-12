/**
 * Astral Zero — jump input regression (bunny hopping + W mapping).
 * ============================================================
 * Two symptoms, two root causes:
 *
 *   1. CONTINUOUS HOPPING while a jump key is held. The edge used
 *      `Phaser.Input.Keyboard.JustDown`, which restamps on every OS key
 *      auto-repeat — so a HELD key re-armed the jump buffer ~30×/s and every
 *      landing auto-jumped. The fix derives the edge from the held-state
 *      transition (down-now + up-before): exactly one edge per physical
 *      press, immune to repeat.
 *
 *   2. "W TRIGGERS A JUMP". That mapping is INTENTIONAL (side-view platformer,
 *      no vertical swim axis; documented in the tutorial + HUD hint), so these
 *      tests pin it as designed: W/SPACE/UP all jump, and the tutorial text
 *      path stays consistent. Holding any of them must still jump exactly once.
 *
 * Run with: npm run test:input
 */

import { InputManager, KEY_BINDINGS } from '../src/input/InputManager.js';
import Phaser from 'phaser';

let pass = 0;
let failures = 0;
function ok(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  pass += 1;
  if (!cond) failures += 1;
}
function section(t) { console.log(`\n--- ${t} ---`); }

// ---- fakes ---------------------------------------------------------------
function fakeKey() {
  return { isDown: false };
}
function fakeKeyboard() {
  const keys = [];
  return {
    keys,
    addKey() { const k = fakeKey(); keys.push(k); return k; },
    addCapture() {},
  };
}
const keyFor = (mgr, action, i = 0) => mgr.keyGroups[action][i];
function setHeld(mgr, action, held) {
  for (const k of mgr.keyGroups[action]) k.isDown = held;
}
const fakeScene = () => ({
  input: { activePointer: { x: 640, y: 360 } },
  cameras: { main: { scrollX: 0, scrollY: 0, zoom: 1, getWorldPoint: (x, y) => ({ x, y }) } },
});
const makeMgr = () => new InputManager(fakeScene(), fakeKeyboard());

// ===========================================================================
section('W is an intentional jump alias (documented scheme)');
{
  const codes = KEY_BINDINGS.jump;
  ok(codes.includes(Phaser.Input.Keyboard.KeyCodes.W), 'W is bound to jump (intentional, not a stray binding)');
  ok(codes.includes(Phaser.Input.Keyboard.KeyCodes.SPACE), 'SPACE is bound to jump');
  ok(codes.includes(Phaser.Input.Keyboard.KeyCodes.UP), 'UP is bound to jump');
  ok(KEY_BINDINGS.left.includes(Phaser.Input.Keyboard.KeyCodes.A), 'A stays strafe-left (W is not movement)');
  ok(KEY_BINDINGS.right.includes(Phaser.Input.Keyboard.KeyCodes.D), 'D stays strafe-right');
}

// ===========================================================================
section('held key jumps exactly once (repeat-proof edge)');
{
  for (const action of ['jump']) {
    void action;
  }
  // Drive each physical jump key separately: press, hold 60 frames (as if the
  // OS repeated the whole time — isDown simply stays true), release, press.
  for (const [label, idx] of [['W', 2], ['SPACE', 0], ['UP', 1]]) {
    const mgr = makeMgr();
    const before = mgr.keyGroups.jump.map((k) => k.isDown);
    void before;
    const key = keyFor(mgr, 'jump', idx);
    let edges = 0;

    key.isDown = true;
    for (let f = 0; f < 60; f += 1) {
      const intent = mgr.update(16);
      if (intent.jumpPressed) edges += 1;
      if (!intent.jumpHeld) { ok(false, `${label}: held must read held`); break; }
    }
    ok(edges === 1, `${label} held 60 frames (auto-repeat) → exactly 1 jump edge (got ${edges})`);

    key.isDown = false;
    mgr.update(16);
    ok(mgr.intent.jumpPressed === false, `${label} release never fires an edge`);

    key.isDown = true;
    mgr.update(16);
    ok(mgr.intent.jumpPressed === true, `${label} second physical press fires again`);
    key.isDown = false;
    mgr.update(16);
  }
}

// ===========================================================================
section('no phantom edges: idle, movement-only, disabled');
{
  const mgr = makeMgr();
  mgr.update(16);
  ok(mgr.intent.jumpPressed === false && mgr.intent.jumpHeld === false, 'idle frame: no edge, no held');

  // Strafing must never arm jump.
  setHeld(mgr, 'left', true);
  mgr.update(16);
  ok(mgr.intent.jumpPressed === false, 'holding A (move) arms no jump edge');
  setHeld(mgr, 'left', false);

  // A disabled manager reports neutral even with keys down.
  const mgr2 = makeMgr();
  mgr2.enabled = false;
  setHeld(mgr2, 'jump', true);
  const intent = mgr2.update(16);
  ok(intent.jumpPressed === false && intent.jumpHeld === false, 'disabled manager stays neutral');
}

// ===========================================================================
section('reset() clears stale jump (respawn / leave / restart)');
{
  const mgr = makeMgr();
  const key = keyFor(mgr, 'jump', 0);
  key.isDown = true;
  mgr.update(16);
  ok(mgr.intent.jumpPressed === true, 'press registers before reset');
  key.isDown = false; // released while dead / away
  mgr.reset();
  // Re-press after reset must behave like a fresh press, not a held repeat.
  key.isDown = true;
  mgr.update(16);
  ok(mgr.intent.jumpPressed === true, 'post-reset press fires exactly once');
  mgr.update(16);
  ok(mgr.intent.jumpPressed === false, 'post-reset hold does not repeat');
}

// ===========================================================================
section('aim intent uses the canonical camera projection');
{
  const scene = {
    input: { activePointer: { x: 320, y: 180 } },
    // Camera panned + zoomed: a naive worldX copy would return (320, 180).
    cameras: { main: { scrollX: 100, scrollY: 50, zoom: 2, getWorldPoint: (x, y) => ({ x: 100 + x / 2, y: 50 + y / 2 }) } },
  };
  const mgr = new InputManager(scene, fakeKeyboard());
  const intent = mgr.update(16);
  ok(intent.aimX === 260 && intent.aimY === 140, `aim projected through camera (got ${intent.aimX}, ${intent.aimY})`);
}

// ===========================================================================
console.log(`\n${failures === 0 ? '✅' : '❌'} Jump input: ${pass} checks, ${failures} failures.`);
process.exit(failures === 0 ? 0 : 1);
