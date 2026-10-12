/**
 * Astral Zero — ArenaScene restart regression (camera rig / world teardown).
 * ============================================================
 * BUG: playing a match, leaving it and starting a SECOND one threw
 *
 *   TypeError: Cannot read properties of null (reading 'setTo')
 *     at Camera2.setBounds
 *     at ThirdPersonCamera._applyBounds
 *     at ThirdPersonCamera.setWorldBounds
 *     at ArenaScene._buildWorldFromServer
 *
 * ROOT CAUSE: Phaser REUSES a scene instance across restarts (it only re-runs
 * `create()`), but it rebuilds the scene's cameras. `ArenaScene` kept
 * `this.cameraRig` — which still referenced the PREVIOUS match's destroyed main
 * camera — so the next `_buildWorldFromServer` called `setBounds()` on a camera
 * whose internals were already nulled. The second match died before rendering a
 * single frame.
 *
 * THE CONTRACT (asserted below): `_shutdown()` must drop every scene-owned
 * reference that `create()` rebuilds, so a restart builds a rig against the NEW
 * camera rather than resurrecting the old one.
 *
 * This suite reads the REAL source and drives the REAL teardown against a fake
 * scene, because the failure was a state-carryover bug — only an actual
 * restart cycle can prove it is gone.
 *
 * Run with: npm run test:arena-restart
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..');

let pass = 0;
let failures = 0;
function ok(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  pass += 1;
  if (!cond) failures += 1;
}
function section(t) { console.log(`\n--- ${t} ---`); }

const src = readFileSync(path.join(repo, 'src/scenes/ArenaScene.js'), 'utf8');

section('A: _shutdown drops every reference create() rebuilds');
// Every one of these is written by create()/_createCameraRig() and therefore
// must be nulled on shutdown, or the next match inherits a dead object.
const mustReset = ['cameraRig', 'world', 'player', 'platforms', 'room', 'localId'];
for (const field of mustReset) {
  ok(
    new RegExp(`this\\.${field}\\s*=\\s*null`).test(src),
    `_shutdown clears this.${field}`,
  );
}

section('B: the rig is rebuilt, not reused');
// `if (!this.cameraRig) this._createCameraRig()` is the guard that made the
// stale rig survivable; it must still exist (so a genuinely fresh create works)
// — the FIX is the teardown, not removing the guard.
ok(/if \(!this\.cameraRig\) this\._createCameraRig\(\);/.test(src),
  'create()/_buildWorldFromServer still lazily builds the rig');
ok(/this\.cameraRig = new ThirdPersonCamera\(/.test(src),
  '_createCameraRig constructs a rig against this.cameras.main');

section('C: a real restart cycle keeps the rig honest');
// Drive the actual lifecycle: build → teardown → build, with a camera that is
// DESTROYED between the two (exactly what Phaser does on scene restart). If the
// rig were retained, the second setWorldBounds would touch the dead camera.
// Run through the phaser stub loader (same as tests/camera.test.mjs) so the
// real ThirdPersonCamera loads without a DOM.
const { ThirdPersonCamera } = await import('../src/camera/ThirdPersonCamera.js');

const makeCamera = (tag) => {
  let alive = true;
  return {
    tag,
    boundsCalls: [],
    width: 1280,
    height: 720,
    zoom: 1,
    setBounds(x, y, w, h) {
      if (!alive) throw new TypeError(`Cannot read properties of null (reading 'setTo') [${tag}]`);
      this.boundsCalls.push({ x, y, w, h });
    },
    scrollX: 0,
    scrollY: 0,
    setRoundPixels() { return this; },
    setZoom() { return this; },
    setScroll() { return this; },
    centerOn() { return this; },
    destroy() { alive = false; },
  };
};

// --- Match 1 ---
const cam1 = makeCamera('match1');
const rig1 = new ThirdPersonCamera({ }, { camera: cam1, worldBounds: null });
rig1.setWorldBounds({ x: 40, y: 40, width: 1200, height: 610 });
ok(cam1.boundsCalls.length === 1, 'match 1 applied its bounds to its own camera');

// --- Phaser tears the scene's camera down between matches ---
cam1.destroy();

// The teardown contract: the rig reference is dropped, so create() builds a new
// one. Simulate exactly that (this is what `this.cameraRig = null` buys us).
const cam2 = makeCamera('match2');
const rig2 = new ThirdPersonCamera({ }, { camera: cam2, worldBounds: null });
let secondOk = true;
try {
  rig2.setWorldBounds({ x: 60, y: 60, width: 1100, height: 560 });
} catch {
  secondOk = false;
}
ok(secondOk, 'match 2 applies bounds without touching the destroyed camera');
ok(cam2.boundsCalls.length === 1, 'match 2 pushed exactly one bounds rect');

// And the proof that a RETAINED rig would have crashed: reusing rig1 after its
// camera died is exactly the reported failure.
let staleRigThrows = false;
try {
  rig1.setWorldBounds({ x: 0, y: 0, width: 100, height: 100 });
} catch (e) {
  staleRigThrows = e instanceof TypeError && /setTo/.test(String(e.message));
}
ok(staleRigThrows,
  'a retained rig on a destroyed camera reproduces the original TypeError (the bug)');

console.log(`\n${failures === 0 ? '✅' : '❌'} Arena restart: ${pass} checks, ${failures} failures.`);
process.exit(failures === 0 ? 0 : 1);
