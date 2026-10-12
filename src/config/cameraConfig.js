/**
 * Astral Zero — third-person camera configuration.
 * ============================================================
 * Tuning for the Arsenal (Roblox) style over-the-shoulder camera used by
 * ArenaScene. Every number here was chosen by eye while playing; they are
 * grouped by concern so a designer can tweak feel without reading code.
 *
 * WHAT "OVER-THE-SHOULDER" MEANS IN A 2D SIDE-VIEW GAME
 * ----------------------------------------------------
 * Arsenal is a 3D game: the camera orbits behind a 3D character and the mouse
 * swings it around. Astral Zero is a 2D side-scroller, so a literal orbit
 * (around the Z axis) has no meaning here — the "over the shoulder" feeling
 * is instead produced by four things, all of which live in this file:
 *
 *  1. ANCHOR OFFSET — the player is NOT centred. They sit ~32% from the left
 *     edge, so most of the screen shows the space they are aiming INTO.
 *  2. AIM LEAD — the framing slides horizontally toward the cursor, so
 *     looking right reveals more of the right-hand side of the arena.
 *  3. SHOULDER BIAS — a small constant push away from the aim direction
 *     reproduces the "camera sits behind and to the side" look.
 *  4. ZOOM RESPONSE — pulling the camera in tightens the framing when the
 *     player aims (Arsenal's ADS feel) and out again when they move fast.
 *
 * The camera is ALWAYS third person. There is no first-person mode and no
 * code path that hides the player sprite.
 */

/**
 * All camera values. Units:
 *  - `x`/`y` in game pixels, `zoom` is a Phaser camera zoom multiplier
 *    (>1 = zoomed IN, i.e. closer to the player).
 */
export const CAMERA = {
  // --- Framing -------------------------------------------------------------
  /**
   * Horizontal anchor as a fraction of the viewport width.
   * 0.5 would be dead-centre (classic follow-cam). ~0.32 pushes the player
   * to the left third and opens up the aiming side — the Arsenal look.
   * (At the default zoom the whole arena fits, so the anchor only takes
   * effect while zoomed in; it is kept so zoomed moments keep their framing.)
   */
  anchorXRatio: 0.32,

  /**
   * Vertical anchor. Slightly below centre so there is more headroom to see
   * platforms above the player than floor below.
   */
  anchorYRatio: 0.56,

  // --- Distance ------------------------------------------------------------
  /**
   * Zoom while idle/walking — the default "third person" distance.
   *
   * 1.0 shows the ENTIRE 1280x720 arena: player, nearby enemies and
   * surroundings in one readable frame. The old 1.22 default cropped ~15% off
   * every edge, so players could not tell where they stood or what approached.
   * At exactly 1.0 the visible area equals the arena rect, so the camera locks
   * to (0,0): no pan, no jitter, no empty-space views — the calmest possible
   * default. Zoom only ever rises ABOVE 1.0 (subtle aim tighten), never below,
   * so the arena edge is never crossed.
   */
  baseZoom: 1.0,
  /** Extra zoom-in when aiming. Small: readability first, punch second. */
  aimZoomBonus: 0.1,
  /** Zoom pulled back at top running speed. 0 = never zoom out past base. */
  sprintZoomOut: 0,
  /**
   * Hard clamps. `minZoom` is exactly 1.0 (zooming out past the arena rect
   * would show void); `maxZoom` stays far below "inside the head" (~3x would
   * be first person) — the player must ALWAYS be visible.
   */
  minZoom: 1.0,
  maxZoom: 1.2,

  // --- Overscan ------------------------------------------------------------
  /**
   * Extra world margin added around the arena for camera bounds ONLY.
   *
   * WHY IT CANNOT BE 0: Phaser's `clampX` pins the camera scroll to `bounds.x`
   * whenever the bounds rect is not WIDER than the viewport
   * (`bw = max(bx, bx + bounds.width - displayWidth)` collapses to `bx`). Every
   * map in this project is narrower and shorter than the 1280x720 viewport, so
   * with zero padding the scroll is pinned to a single value on every axis —
   * which silently disables the off-centre anchor, the aim lead, the shoulder
   * bias and the jump lead. The player then walks around inside a FIXED frame,
   * and every framing parameter in this file becomes dead code while blank void
   * is visible past the arena edges.
   *
   * So the padding is a floor, not a constant: it is grown whatever the
   * viewport needs for the camera to be able to actually move (see
   * `_boundsPadding`). The arena itself is never left behind — the overscan is
   * empty headroom used by the framing maths, exactly as the comment above
   * intends.
   */
  boundsPadding: 0,
  /**
   * The framing headroom the overscan must always leave available on each side,
   * in world px. Covers the largest framing offset the rig can ask for
   * (aimLeadPixels + shoulderBias) so the scroll is never clamped while the
   * player is mid-screen.
   */
  framingOverscan: 220,

  // --- Responsiveness ------------------------------------------------------
  /**
   * Per-frame lerp factor for position, converted to a frame-rate
   * independent smoothing value. Lower = snappier.
   */
  positionLerp: 0.12,
  /** Slightly slower than position so zoom never "pops". */
  zoomLerp: 0.08,

  // --- Aim lead ------------------------------------------------------------
  /**
   * How far (in px) the camera slides toward the cursor at full deflection.
   * Kept modest: the player must never leave the frame.
   */
  aimLeadPixels: 150,
  /**
   * Fraction of the screen height used to normalise cursor deflection, so
   * `aimLeadPixels` is reached at this distance from the player.
   */
  aimLeadRange: 420,
  /** Maximum vertical aim lead — vertical is more nauseating than horizontal. */
  aimLeadYRatio: 0.55,

  // --- Shoulder bias -------------------------------------------------------
  /**
   * Constant horizontal push away from the aim direction, in px. Reproduces
   * the "camera is behind your shoulder" parallax of a 3D over-the-shoulder
   * rig, where the body sits opposite the aim.
   */
  shoulderBias: 34,
  /** Vertical shoulder bias (camera sits slightly above the shoulder line). */
  shoulderBiasY: -18,

  // --- Jump / fall lead ----------------------------------------------------
  /**
   * While airborne the camera looks slightly ahead of the arc so jumps read
   * as powerful. Applied as a fraction of velocity, in px.
   */
  jumpLeadRatio: 0.12,
  /** Cap on that lead so a fast fall cannot slam the camera into the floor. */
  jumpLeadMax: 90,

  // --- Feel ----------------------------------------------------------------
  /**
   * When the player is NOT moving, the camera drifts a few px toward the
   * cursor. This is what makes Arsenal feel "alive" while standing still.
   */
  idleDriftRatio: 0.25,
  /** Ignore camera input below this cursor speed (kills micro-jitter). */
  deadzone: 6,
};

/** Debug flag: `?debug` draws the camera frame + anchor so tuning is visual. */
export const CAMERA_DEBUG = true;

export default CAMERA;
