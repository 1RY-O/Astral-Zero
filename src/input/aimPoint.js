/**
 * Astral Zero — canonical world-space aim (FRONTEND).
 * ============================================================
 * ONE place that converts the screen-space pointer into the world-space aim
 * target every gameplay system shares: the player body (rotation), the weapon
 * (shot direction) and the laser sight (guide) all derive from this value.
 *
 * WHY THIS EXISTS (the laser/cursor drift bug)
 * `InputManager` used to read `pointer.worldX / worldY` directly. Those fields
 * are only correct when Phaser's input plugin happens to have transformed the
 * pointer through the CURRENT camera (scroll + zoom + rotation + viewport) on
 * the same frame. With the over-the-shoulder camera panning, zooming and
 * tilting every frame, the cached fields lagged or skipped the transform, so
 * the laser pointed somewhere the cursor was not — and the error grew toward
 * the screen edges and at higher zoom.
 *
 * The fix: every frame, explicitly project the LIVE screen pointer through the
 * ACTIVE camera (`camera.getWorldPoint`), which applies the camera's current
 * scroll, zoom, rotation and viewport in one matrix. No sensitivity
 * multipliers, no second smoothing pass, no per-system variants.
 *
 * NOTE ON PROJECTILES: weapons still fire physical projectiles with travel
 * time and server-side spread (see src/combat/weapons.js). The canonical point
 * is the AIM INTENT (where the barrel points), not a hit promise — the laser
 * shows the muzzle direction toward it, and the round may land elsewhere at
 * range. That distinction is intentional and documented on AimRay.
 */

/**
 * Project a screen-space point into world space through a camera.
 *
 * Uses the camera's own transform when available (it accounts for scroll,
 * zoom, rotation and viewport in one step). Falls back to the manual
 * scroll/zoom inversion only when the camera object is a test stub without
 * `getWorldPoint`.
 *
 * @param {{getWorldPoint?: Function, scrollX?: number, scrollY?: number, zoom?: number}} camera
 * @param {number} screenX - Pointer X in canvas pixels.
 * @param {number} screenY - Pointer Y in canvas pixels.
 * @returns {{x: number, y: number}} World-space point.
 */
export function screenToWorld(camera, screenX, screenY) {
  if (camera && typeof camera.getWorldPoint === 'function') {
    const out = camera.getWorldPoint(screenX, screenY);
    if (out && Number.isFinite(out.x) && Number.isFinite(out.y)) {
      return { x: out.x, y: out.y };
    }
  }
  // Manual fallback (scroll + zoom only; no rotation): keeps headless tests
  // and stub cameras honest instead of returning screen pixels as world.
  const zoom = Number.isFinite(camera?.zoom) && camera.zoom !== 0 ? camera.zoom : 1;
  const sx = Number.isFinite(camera?.scrollX) ? camera.scrollX : 0;
  const sy = Number.isFinite(camera?.scrollY) ? camera.scrollY : 0;
  const w = Number.isFinite(camera?.width) ? camera.width : 0;
  const h = Number.isFinite(camera?.height) ? camera.height : 0;
  void w;
  void h;
  return { x: sx + screenX / zoom, y: sy + screenY / zoom };
}

/**
 * The canonical aim target: the world-space point under the live cursor,
 * projected through the scene's ACTIVE camera this frame.
 *
 * @param {Phaser.Scene} scene - Owning scene (reads input + cameras).
 * @returns {{x: number, y: number}|null} World target, or null when there is
 *   no pointer to read (headless / pre-boot).
 */
export function canonicalAimPoint(scene) {
  const pointer = scene?.input?.activePointer;
  if (!pointer || !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) return null;
  const camera = scene?.cameras?.main ?? null;
  if (!camera) {
    // No camera yet (early boot): the pointer has no world mapping, so report
    // nothing rather than a screen-space value masquerading as world-space.
    return null;
  }
  return screenToWorld(camera, pointer.x, pointer.y);
}

/**
 * Aim angle from a muzzle position to the canonical target.
 *
 * @param {number} muzzleX - Weapon muzzle X (world).
 * @param {number} muzzleY - Weapon muzzle Y (world).
 * @param {number} targetX - Canonical aim X (world).
 * @param {number} targetY - Canonical aim Y (world).
 * @param {number} [fallbackAngle=0] - Returned when the target sits on the muzzle.
 * @returns {number} Radians, 0 = pointing right.
 */
export function angleToTarget(muzzleX, muzzleY, targetX, targetY, fallbackAngle = 0) {
  const dx = targetX - muzzleX;
  const dy = targetY - muzzleY;
  if (Math.hypot(dx, dy) <= 1) return fallbackAngle;
  return Math.atan2(dy, dx);
}

export default canonicalAimPoint;
