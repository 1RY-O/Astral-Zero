/**
 * Astral Zero — canonical aim conversion regression (laser/cursor alignment).
 * ============================================================
 * The laser sight and the cursor disagreed because the aim read the cached
 * `pointer.worldX/worldY` fields, which are NOT transformed through the live
 * camera (scroll + zoom + rotation + viewport) every frame. The error grew
 * toward the screen edges and with zoom — up to ~119° in a live measurement.
 *
 * The fix (`src/input/aimPoint.js`) projects the live screen pointer through
 * the ACTIVE camera every frame, and the weapon, laser and barrel all derive
 * from that ONE canonical target. These tests pin the conversion:
 *
 *   1. screenToWorld honours scroll + zoom through getWorldPoint.
 *   2. The camera's own transform (incl. rotation) is used verbatim.
 *   3. The stub fallback never returns screen pixels as world pixels.
 *   4. canonicalAimPoint reads the live pointer + active camera, null-safe.
 *   5. angleToTarget agrees across all four quadrants + muzzle offsets.
 *
 * Run with: npm run test:aim
 */
import assert from 'node:assert';
import { screenToWorld, canonicalAimPoint, angleToTarget } from '../src/input/aimPoint.js';

let pass = 0;
const ok = (name, fn) => { fn(); pass += 1; console.log(`PASS  ${name}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// A fake camera that applies scroll/zoom like Phaser's getWorldPoint does.
const fakeCamera = (scrollX, scrollY, zoom) => ({
  scrollX, scrollY, zoom, width: 1280, height: 720,
  getWorldPoint(sx, sy) {
    return { x: scrollX + sx / zoom, y: scrollY + sy / zoom };
  },
});

console.log('\n--- screenToWorld through the live camera ---');

ok('applies scroll + zoom from the camera transform', () => {
  const p = screenToWorld(fakeCamera(100, 50, 2), 200, 100);
  assert.ok(near(p.x, 200) && near(p.y, 100), `got (${p.x}, ${p.y})`);
});

ok('identity at rest (scroll 0, zoom 1)', () => {
  const p = screenToWorld(fakeCamera(0, 0, 1), 320, 180);
  assert.ok(near(p.x, 320) && near(p.y, 180));
});

ok('uses the camera transform verbatim (rotation included)', () => {
  // A camera rotated 90° maps screen +x to world -y; the point is that WE do
  // not second-guess the matrix — whatever the camera says stands.
  const rotated = { scrollX: 0, scrollY: 0, zoom: 1, getWorldPoint: (sx, sy) => ({ x: -sy, y: sx }) };
  const p = screenToWorld(rotated, 100, 0);
  assert.ok(near(p.x, 0) && near(p.y, 100), `got (${p.x}, ${p.y})`);
});

ok('stub fallback never leaks screen pixels as world pixels', () => {
  const p = screenToWorld({ scrollX: 400, scrollY: 300, zoom: 2 }, 1280, 720);
  assert.ok(near(p.x, 400 + 640) && near(p.y, 300 + 360), `got (${p.x}, ${p.y})`);
});

ok('garbage camera degrades to screen coords, not NaN', () => {
  const p = screenToWorld(null, 10, 20);
  assert.ok(near(p.x, 10) && near(p.y, 20));
});

console.log('\n--- canonicalAimPoint reads the live pointer ---');

const sceneWith = (px, py, cam) => ({
  input: { activePointer: { x: px, y: py } },
  cameras: { main: cam },
});

ok('projects the live pointer through the active camera', () => {
  const p = canonicalAimPoint(sceneWith(640, 360, fakeCamera(60, 60, 1)));
  assert.ok(p && near(p.x, 700) && near(p.y, 420), `got ${JSON.stringify(p)}`);
});

ok('null-safe: no pointer, no camera, no scene', () => {
  assert.strictEqual(canonicalAimPoint(null), null);
  assert.strictEqual(canonicalAimPoint({}), null);
  assert.strictEqual(canonicalAimPoint({ input: {}, cameras: { main: fakeCamera(0, 0, 1) } }), null);
  assert.strictEqual(canonicalAimPoint({ input: { activePointer: { x: 1, y: 2 } }, cameras: {} }), null);
});

console.log('\n--- angleToTarget: one direction for weapon + laser ---');

ok('agrees in all four screen quadrants', () => {
  const cases = [
    [100, 0, 0], [0, 100, Math.PI / 2], [-100, 0, Math.PI], [0, -100, -Math.PI / 2],
  ];
  for (const [dx, dy, want] of cases) {
    const got = angleToTarget(500, 500, 500 + dx, 500 + dy);
    assert.ok(near(got, want), `dir (${dx},${dy}): got ${got}, want ${want}`);
  }
});

ok('measures from the MUZZLE, not the body centre', () => {
  // Muzzle 26px ahead of the body along +x; a target just above the body is
  // nearly perpendicular from the muzzle's point of view.
  const fromBody = Math.atan2(-100, 0);
  const fromMuzzle = angleToTarget(526, 500, 500, 400);
  assert.ok(!near(fromMuzzle, fromBody, 0.01), 'muzzle origin differs from body origin');
  assert.ok(near(fromMuzzle, Math.atan2(-100, -26)), 'exact muzzle-relative angle');
});

ok('degenerate (target on muzzle) keeps the previous angle', () => {
  assert.strictEqual(angleToTarget(5, 5, 5, 5, 1.2), 1.2);
});

console.log(`\n✅ Aim conversion checks passed (${pass} groups).`);
process.exit(0);
