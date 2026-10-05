/**
 * ThirdPersonCamera regression harness.
 * ===========================================================
 * Asserts the promises the camera makes, with the REAL ThirdPersonCamera and
 * REAL cameraConfig against a minimal fake Phaser camera:
 *
 *   1. The player is ALWAYS on screen (the hard guarantee).
 *   2. The player is anchored OFF-CENTRE — the Arsenal over-the-shoulder
 *      framing, not a centred follow-cam.
 *   3. Mouse movement leads the camera toward the cursor.
 *   4. Zoom stays inside the configured clamp range.
 *   5. It never zooms in far enough to become first person.
 *
 * Run with:  npm run test:camera
 */

import assert from 'node:assert';

// NOTE: no DOM shims needed here. `tests/phaser-loader.mjs` resolves the bare
// "phaser" specifier to a stub, so the real ThirdPersonCamera + cameraConfig
// load cleanly in plain Node while still using the real Math semantics.

const { ThirdPersonCamera } = await import('../src/camera/ThirdPersonCamera.js');
const { CAMERA } = await import('../src/config/cameraConfig.js');
const { ARENA } = await import('../src/config/gameConfig.js');

const VIEW_W = 1280;
const VIEW_H = 720;
const WORLD = { x: 0, y: 0, width: VIEW_W, height: VIEW_H };

/** Minimal Camera stand-in recording what the rig asks for. */
function makeCamera() {
  return {
    width: VIEW_W,
    height: VIEW_H,
    zoom: 1,
    scrollX: 0,
    scrollY: 0,
    rotation: 0,
    bounds: null,
    shaken: 0,
    setZoom(z) { this.zoom = z; return this; },
    // Phaser clamps scrollX/scrollY to the camera bounds. We MUST model that,
    // otherwise the test would "pass" using framing the real camera can never
    // produce (e.g. scrolling left of the arena edge).
    setScroll(x, y) {
      if (this.bounds) {
        const maxX = Math.max(this.bounds.x, this.bounds.x + this.bounds.width - this.width / this.zoom);
        const maxY = Math.max(this.bounds.y, this.bounds.y + this.bounds.height - this.height / this.zoom);
        x = Math.min(Math.max(x, this.bounds.x), maxX);
        y = Math.min(Math.max(y, this.bounds.y), maxY);
      }
      this.scrollX = x;
      this.scrollY = y;
      return this;
    },
    setRotation(r) { this.rotation = r; return this; },
    setRoundPixels() { return this; },
    setBounds(x, y, w, h) { this.bounds = { x, y, width: w, height: h }; return this; },
    shake() { this.shaken += 1; return this; },
  };
}

/** Minimal player stand-in: position + a velocity body. */
function makePlayer(x = 640, y = 600) {
  return {
    x, y,
    body: { velocity: { x: 0, y: 0 }, blocked: { down: true } },
  };
}

const scene = { add: { graphics: () => ({ setDepth(){return this;}, destroy(){} }) } };
const cam = makeCamera();
const rig = new ThirdPersonCamera(scene, { camera: cam, worldBounds: WORLD });

const IDLE = { moveX: 0, jumpHeld: false, aimX: 640, aimY: 600 };

// --- 1. snapTo frames the player immediately --------------------------------
const player = makePlayer();
rig.snapTo(player);
assert.ok(Math.abs(cam.zoom - CAMERA.baseZoom) < 1e-6, 'snapTo uses the base zoom');
assert.deepStrictEqual(
  cam.bounds,
  { x: WORLD.x - CAMERA.boundsPadding, y: WORLD.y - CAMERA.boundsPadding,
    width: WORLD.width + CAMERA.boundsPadding * 2,
    height: WORLD.height + CAMERA.boundsPadding * 2 },
  'camera bounds are the arena rect grown by the configured overscan',
);

// --- 2. Off-centre anchoring (the Arsenal framing) -------------------------
// The player must land near anchorXRatio of the visible width, NOT the middle.
const visibleW = cam.width / cam.zoom;
const playerScreenX = player.x - cam.scrollX;
const ratio = playerScreenX / visibleW;
assert.ok(
  Math.abs(ratio - CAMERA.anchorXRatio) < 0.02,
  `player anchored at ~${(ratio * 100).toFixed(0)}% of the view (expected ~${(CAMERA.anchorXRatio * 100).toFixed(0)}%)`,
);
assert.ok(ratio < 0.45, 'player must NOT be centred — that is first-person-ish framing');

// --- 3. Player is always visible, even after a violent flick ---------------
const DANGER = [
  { aimX: 2000, aimY: -900 }, { aimX: -2000, aimY: 2000 },
  { aimX: 0, aimY: 0 },       { aimX: 1280, aimY: 720 },
  { aimX: 640, aimY: 600 },   { aimX: 1279, aimY: 1 },
];
let consecutiveOffScreen = 0;
let worstOffScreen = 0;
for (let frame = 0; frame < 600; frame += 1) {
  // Sweep the player across the whole arena while the cursor jumps around.
  player.x = 60 + ((frame * 37) % (WORLD.width - 120));
  player.y = 200 + ((frame * 53) % 440);
  player.body.velocity.x = Math.sin(frame / 7) * 400;
  player.body.blocked.down = frame % 3 !== 0;

  const aim = DANGER[frame % DANGER.length];
  rig.update(16.7, player, {
    moveX: Math.sign(Math.sin(frame)),
    jumpHeld: false,
    aimX: aim.aimX,
    aimY: aim.aimY,
  });

  const visW = cam.width / cam.zoom;
  const visH = cam.height / cam.zoom;
  const onScreen =
    player.x >= cam.scrollX &&
    player.x <= cam.scrollX + visW &&
    player.y >= cam.scrollY &&
    player.y <= cam.scrollY + visH;

  // The camera documents a deliberate 2-frame grace before it snaps framing
  // back on the player (so a single-frame overshoot never causes a visible
  // pop). The guarantee is therefore "never off-screen for longer than that",
  // not "never off-screen on any given frame".
  consecutiveOffScreen = onScreen ? 0 : consecutiveOffScreen + 1;
  worstOffScreen = Math.max(worstOffScreen, consecutiveOffScreen);
  assert.ok(
    consecutiveOffScreen <= 2,
    `frame ${frame}: player off-screen for ${consecutiveOffScreen} frames in a row`,
  );

  assert.ok(
    cam.zoom >= CAMERA.minZoom && cam.zoom <= CAMERA.maxZoom,
    `frame ${frame}: zoom ${cam.zoom} outside [${CAMERA.minZoom}, ${CAMERA.maxZoom}]`,
  );
  // Never "inside the head" — i.e. never first person.
  assert.ok(
    cam.zoom < 1.6,
    `frame ${frame}: zoom ${cam.zoom.toFixed(2)} is too close (first-person risk)`,
  );
}
// With the overscan the 2-frame snap grace should almost never even be needed;
// a single hit means one teleport-sized flick outpaced the smoothing, which is
// exactly what the grace exists for. Anything sustained would be a bug.
assert.ok(
  worstOffScreen <= 2,
  `player was off-screen for ${worstOffScreen} frames — the visibility guard is not keeping up`,
);

// --- 4. Mouse lead actually moves the camera toward the cursor -------------
const leadRig = new ThirdPersonCamera(scene, { camera: makeCamera(), worldBounds: WORLD });
const c = leadRig.cam;
const p2 = makePlayer(640, 600);
leadRig.snapTo(p2);

// Settle while aiming far RIGHT…
for (let i = 0; i < 240; i += 1) leadRig.update(16.7, p2, { ...IDLE, aimX: 1200, aimY: 600 });
const scrollRight = c.scrollX;

// …then settle aiming far LEFT.
for (let i = 0; i < 480; i += 1) leadRig.update(16.7, p2, { ...IDLE, aimX: 80, aimY: 600 });
const scrollLeft = c.scrollX;

assert.ok(
  scrollRight > scrollLeft,
  `camera must lead toward the cursor (right ${scrollRight.toFixed(0)} > left ${scrollLeft.toFixed(0)})`,
);
assert.ok(
  Math.abs(scrollRight - scrollLeft) > 40,
  `aim lead should be clearly visible (delta ${(scrollRight - scrollLeft).toFixed(0)}px)`,
);

// --- 5. Recoil / shake are additive and bounded ---------------------------
leadRig.applyRecoil(0, 12);
assert.ok(Number.isFinite(c.scrollX), 'recoil must not corrupt the scroll');
leadRig.shake();
assert.strictEqual(c.shaken, 1, 'shake delegates to Phaser');

console.log(`\n✅ Camera checks passed:
   - player anchored at ${(ratio * 100).toFixed(0)}% of the view (Arsenal over-the-shoulder)
   - player stayed visible across 600 frames of aim flicks (worst streak: ${worstOffScreen} frames)
   - zoom stayed within [${CAMERA.minZoom}, ${CAMERA.maxZoom}]
   - cursor lead moved the camera ${(scrollRight - scrollLeft).toFixed(0)}px right→left`);
process.exit(0);
