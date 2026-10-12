/**
 * Astral Zero — UI freeze + aiming-ray regression test (Phase 5).
 * ============================================================
 * Two things that are NOT observable from a screenshot and were the difference
 * between "playable" and "the game is stuck":
 *
 *  1. BUTTON KEYBOARD GATING (the freeze root cause). Every menu button binds to
 *     its scene's keyboard. The bug: the handler activated on ANY Space/Enter
 *     press, whether or not the button was focused. In the arena, Space is the
 *     JUMP key — so jumping also fired the HUD Leave/Reset buttons and kicked
 *     the player out of the match; in menus, one press fired every control at
 *     once (e.g. party_create spam). These tests pin the fix: activation is
 *     focus-gated, so only the focused button responds.
 *
 *  2. AIMING RAY geometry + lifecycle. The ray must point exactly along the
 *     aim angle, stop at the first platform, hide on demand, and destroy its
 *     own objects (no leak). Driven with fake Phaser objects so it runs headless.
 *
 * Run with: npm run test:ui-ray
 */

import { Button } from '../src/ui/widgets/Button.js';
import { AimRay, rayAabb } from '../src/ui/fx/AimRay.js';
import * as Motion from '../src/core/Motion.js';

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures += 1;
};
const section = (t) => console.log(`\n--- ${t} ---`);

// Motion is normally reduced by an OS preference; force it so the Button takes
// its no-tween path (no scene.tweens needed).
Motion.setReduced(true);

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/** A chainable no-op object: any unknown method returns the proxy. */
function chainable(extra = {}) {
  const target = { ...extra };
  const p = new Proxy(target, {
    get(t, prop) {
      if (prop === 'then') return undefined; // not a promise
      if (prop in t) return t[prop];
      const fn = () => p;
      t[prop] = fn;
      return fn;
    },
  });
  return p;
}

/** Minimal Phaser keyboard emitter with captured handlers. */
function fakeKeyboard() {
  const handlers = new Map();
  return {
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, new Set());
      handlers.get(evt).add(fn);
      return this;
    },
    off(evt, fn) {
      handlers.get(evt)?.delete(fn);
      return this;
    },
    emit(evt, arg) {
      for (const fn of handlers.get(evt) ?? []) fn(arg);
    },
    count(evt) {
      return handlers.get(evt)?.size ?? 0;
    },
  };
}

const fakeScene = (kb) => ({
  add: {
    graphics: () => chainable(),
    text: () => chainable(),
    zone: () => chainable(),
  },
  input: { keyboard: kb },
  tweens: { add: () => ({}) },
  depth: 0,
});

const keyEvent = (code) => ({ code, preventDefault() {} });

// ===========================================================================
section('Button keyboard activation is FOCUS-GATED (freeze regression)');
// ===========================================================================
{
  const kb = fakeKeyboard();
  const scene = fakeScene(kb);
  let fires = 0;
  const b = new Button(scene, {
    x: 0, y: 0, width: 40, height: 20, label: 'X', keyboard: kb,
    onClick: () => { fires += 1; },
  });

  kb.emit('keydown', keyEvent('Space'));
  ok(fires === 0, 'Space does NOT activate an UNFOCUSED button (the jump→leave bug)');

  kb.emit('keydown', keyEvent('Enter'));
  ok(fires === 0, 'Enter does NOT activate an UNFOCUSED button');

  b.setFocused(true);
  kb.emit('keydown', keyEvent('Space'));
  ok(fires === 1, 'Space activates the FOCUSED button');

  kb.emit('keydown', keyEvent('Enter'));
  ok(fires === 2, 'Enter activates the FOCUSED button');

  b.setFocused(false);
  kb.emit('keydown', keyEvent('Space'));
  ok(fires === 2, 'blurring stops further keyboard activation');
}
{
  // The exact arena scenario: two HUD buttons, only one focused. A single Space
  // must NOT fire both (previously it fired every enabled button in the scene).
  const kb = fakeKeyboard();
  const scene = fakeScene(kb);
  let leave = 0;
  let reset = 0;
  const leaveBtn = new Button(scene, { x: 0, y: 0, width: 40, height: 20, label: 'Leave', keyboard: kb, onClick: () => { leave += 1; } });
  const resetBtn = new Button(scene, { x: 0, y: 0, width: 40, height: 20, label: 'Reset', keyboard: kb, onClick: () => { reset += 1; } });
  resetBtn.setFocused(true);
  kb.emit('keydown', keyEvent('Space'));
  ok(leave === 0 && reset === 1, 'one Space fires ONLY the focused button (leave=0, reset=1)');
  ok(leaveBtn.isFocused() === false, 'unfocused sibling is not silently focused');
}
{
  // A disabled focused button must still refuse to fire.
  const kb = fakeKeyboard();
  const scene = fakeScene(kb);
  let fires = 0;
  const b = new Button(scene, { x: 0, y: 0, width: 40, height: 20, label: 'X', keyboard: kb, onClick: () => { fires += 1; } });
  b.setFocused(true);
  b.setEnabled(false);
  kb.emit('keydown', keyEvent('Space'));
  ok(fires === 0, 'a disabled button never fires from the keyboard');
}
{
  // destroy() must unbind so a torn-down scene cannot react to key events.
  const kb = fakeKeyboard();
  const scene = fakeScene(kb);
  const b = new Button(scene, { x: 0, y: 0, width: 40, height: 20, label: 'X', keyboard: kb, onClick: () => {} });
  const before = kb.count('keydown');
  b.destroy();
  ok(kb.count('keydown') === before - 1, 'destroy() removes the keyboard listener');
}

// ===========================================================================
section('rayAabb: ray vs axis-aligned platform');
// ===========================================================================
{
  ok(rayAabb(0, 0, 1, 0, 50, -10, 60, 10, 1000) === 50, 'straight-on hit returns entry distance');
  ok(rayAabb(0, 0, -1, 0, 50, -10, 60, 10, 1000) === Infinity, 'ray pointing away misses');
  ok(rayAabb(0, 5, 1, 0, 50, -10, 60, 10, 1000) === 50, 'ray inside the y-slab hits');
  ok(rayAabb(0, 50, 1, 0, 50, -10, 60, 10, 1000) === Infinity, 'ray outside the y-slab misses (parallel)');
  ok(rayAabb(0, 0, 0, 1, -10, 50, 10, 60, 1000) === 50, 'vertical ray hits');
  const beyond = rayAabb(0, 0, 1, 0, 200, -10, 210, 10, 100);
  ok(beyond === Infinity, 'a hit beyond the max range is ignored');
}

// ===========================================================================
section('AimRay direction matches the aim angle');
// ===========================================================================
function recGraphics() {
  return {
    visible: false, depth: 0, blend: 0, destroyed: false, cleared: 0,
    lines: [], styles: [],
    setDepth(d) { this.depth = d; return this; },
    setBlendMode(m) { this.blend = m; return this; },
    setVisible(v) { this.visible = v; return this; },
    clear() { this.cleared += 1; this.lines = []; return this; },
    lineStyle(w, c, a) { this.styles.push({ w, c, a }); return this; },
    lineBetween(x1, y1, x2, y2) { this.lines.push({ x1, y1, x2, y2 }); return this; },
    destroy() { this.destroyed = true; },
  };
}
function recCircle() {
  return {
    x: 0, y: 0, visible: false, destroyed: false,
    setDepth() { return this; }, setBlendMode() { return this; },
    setPosition(x, y) { this.x = x; this.y = y; return this; },
    setVisible(v) { this.visible = v; return this; },
    setFillStyle() { return this; }, destroy() { this.destroyed = true; },
  };
}
function rayScene(platforms = []) {
  const g = recGraphics();
  const tip = recCircle();
  return { platforms, add: { graphics: () => g, circle: () => tip }, _g: g, _tip: tip };
}
const near = (a, b, eps = 0.6) => Math.abs(a - b) <= eps;

{
  const scene = rayScene();
  const ray = new AimRay(scene, { segments: 4 });

  ray.update({ x: 100, y: 200, angle: 0, range: 80, visible: true });
  let last = scene._g.lines.at(-1);
  ok(scene._g.visible === true, 'ray becomes visible when shown');
  ok(near(last.x2, 180) && near(last.y2, 200), 'angle 0 → ray ends at +x by exactly range');
  ok(near(scene._tip.x, 180) && near(scene._tip.y, 200) && scene._tip.visible, 'terminus dot at the ray end');
  ok(scene._g.lines.length === 4, 'ray is drawn in the requested segment count');
  ok(scene._g.styles[0].a > scene._g.styles.at(-1).a, 'opacity fades from muzzle to tip');

  ray.update({ x: 100, y: 200, angle: Math.PI / 2, range: 80, visible: true });
  last = scene._g.lines.at(-1);
  ok(near(last.x2, 100) && near(last.y2, 280), 'angle π/2 → ray points straight down');

  ray.update({ x: 100, y: 200, angle: Math.PI, range: 80, visible: true });
  last = scene._g.lines.at(-1);
  ok(near(last.x2, 20) && near(last.y2, 200), 'angle π → ray points straight left');
}

// ===========================================================================
section('AimRay stops at the first platform');
// ===========================================================================
{
  const scene = rayScene([{ body: { left: 140, top: 190, right: 150, bottom: 210 } }]);
  const ray = new AimRay(scene, { segments: 4 });
  ray.update({ x: 100, y: 200, angle: 0, range: 400, visible: true });
  const last = scene._g.lines.at(-1);
  ok(near(last.x2, 140), 'ray stops at the platform face (x=140), not at full range');
  ok(near(scene._tip.x, 140), 'terminus dot sits on the platform face');
}

// ===========================================================================
section('AimRay lifecycle: hide on demand, destroy cleanly');
// ===========================================================================
{
  const scene = rayScene();
  const ray = new AimRay(scene, { segments: 4 });
  ray.update({ x: 100, y: 200, angle: 0, range: 80, visible: true });
  ok(scene._g.visible === true, 'visible before hiding');

  ray.update({ x: 100, y: 200, angle: 0, range: 80, visible: false });
  ok(scene._g.visible === false, 'visible:false hides the ray (dead / spectating / out of match)');

  ray.update({ x: 100, y: 200, angle: 0, range: 0, visible: true });
  ok(scene._g.visible === false, 'a non-positive range hides the ray (no weapon)');

  ray.update({ x: NaN, y: 200, angle: 0, range: 80, visible: true });
  ok(scene._g.visible === false, 'invalid coordinates hide instead of drawing a NaN line');

  ray.setVisible(true);
  ray.destroy();
  ok(scene._g.destroyed === true && scene._tip.destroyed === true, 'destroy() tears down graphics AND terminus dot');
}

// ===========================================================================
console.log(`\n${failures === 0 ? '✅' : '❌'} UI freeze + aiming ray: ${failures === 0 ? 'all checks passed' : failures + ' FAILURES'}.`);
process.exit(failures === 0 ? 0 : 1);
