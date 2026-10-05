/**
 * Astral Zero — responsive viewport configuration (FRONTEND).
 * ===========================================================
 * The game renders to a FIXED 1280x720 design surface and Phaser's
 * `Scale.FIT` maps that onto whatever window exists. That is the right call
 * for gameplay (the Arsenal camera's framing maths is resolution-independent
 * only as long as the design surface is stable) but it is the wrong call for
 * menus, where a 1280-wide layout letterboxed into a 375px phone is unusable.
 *
 * THE SOLUTION
 * The design surface never changes, so the world stays predictable. Instead we
 * classify the *displayed* size into a LAYOUT TIER and lay the lobby out
 * against that tier. The canvas is the same pixels; the furniture moves.
 *
 *   compact  ( < 640 CSS px )  — phone portrait: single column, big touch
 *                                targets, nav collapses to a bottom bar.
 *   medium   ( < 1024      )   — tablet / small laptop: two columns.
 *   wide     ( >= 1024     )   — desktop: full three-column arcade layout.
 *
 * WHY NOT `Scale.RESIZE` FOR EVERYTHING
 * Resizing the design surface would change `visibleW/visibleH` in the camera,
 * which is tuned around a 1280x720 arena. Pinning the surface keeps the
 * camera provably unchanged; only the menu layout responds.
 *
 * TOUCH TARGETS
 * Below 720 CSS px the pointer is almost certainly a finger, so the layout
 * promotes hit areas to 48px+ (the WCAG 2.5.5 / Apple HIG floor) and turns on
 * larger spacing. This is read from the layout tier, never from a UA sniff.
 */

/** Design surface every layout is authored against. */
export const DESIGN = Object.freeze({ width: 1280, height: 720 });

/** @typedef {'compact'|'medium'|'wide'} LayoutTier */

/**
 * Breakpoints in CSS pixels, measured against the CANVAS element rather than
 * the window so a desktop with devtools open behaves like its canvas.
 */
export const BREAKPOINTS = Object.freeze({
  compact: 640,
  medium: 1024,
});

/**
 * Classify a displayed canvas size into a layout tier.
 * @param {number} cssWidth - Canvas width in CSS pixels.
 * @returns {LayoutTier}
 */
export function tierFor(cssWidth) {
  if (cssWidth < BREAKPOINTS.compact) return 'compact';
  if (cssWidth < BREAKPOINTS.medium) return 'medium';
  return 'wide';
}

/**
 * Per-tier layout metrics, in DESIGN pixels (always 1280x720 space).
 *
 * `minTouch` is the HIT-AREA FLOOR and it applies at every tier, not only the
 * touch one: 44px is the reliable-pointer minimum (WCAG 2.5.5 / Apple HIG), and
 * a 40px target is genuinely fiddly on a trackpad or a short stylus even with
 * a mouse. The compact tier raises it to 48px for finger input.
 *
 * `columns` is the real structural switch: wide is 3 columns, medium is 2,
 * compact is 1. Everything else derives from that so the three layouts stay
 * recognisably the same product rather than three different screens.
 */
export const LAYOUTS = Object.freeze({
  wide: Object.freeze({
    tier: 'wide',
    /** 0 = header, 1 = left rail, 2 = centre, 3 = right. */
    columns: 3,
    showNavRail: true,
    showFooter: true,
    showModePanel: true,
    showFriendsPanel: true,
    headerHeight: 92,
    navRailWidth: 176,
    gutter: 20,
    margin: 24,
    footerHeight: 168,
    minTouch: 44,
    bodyScale: 1,
  }),
  medium: Object.freeze({
    tier: 'medium',
    // Friends moves under the party column; the nav rail becomes an icon strip.
    columns: 2,
    showNavRail: true,
    showFooter: true,
    showModePanel: true,
    showFriendsPanel: true,
    headerHeight: 86,
    navRailWidth: 76,
    gutter: 16,
    margin: 18,
    footerHeight: 152,
    minTouch: 44,
    bodyScale: 0.96,
  }),
  compact: Object.freeze({
    // One column. The nav rail becomes a bottom bar, so `navRailWidth` is the
    // bar HEIGHT here — the name is kept for API stability.
    tier: 'compact',
    columns: 1,
    showNavRail: true,
    showFooter: true,
    showModePanel: true,
    showFriendsPanel: true,
    headerHeight: 74,
    navRailWidth: 84,
    gutter: 12,
    margin: 12,
    footerHeight: 132,
    minTouch: 48,
    bodyScale: 1.06,
  }),
});

/**
 * Read the current layout from the live canvas.
 *
 * Falls back to the `wide` tier when there is no DOM (unit tests, SSR), so
 * headless callers always get a complete, valid layout object.
 *
 * @param {Phaser.Scale.ScaleManager} [scale] - `scene.scale`.
 * @returns {typeof LAYOUTS.wide}
 */
export function currentLayout(scale) {
  try {
    const display = scale?.gameSize ?? scale?.displaySize;
    const width = display?.width ?? scale?.parentSize?.width ?? DESIGN.width;
    return LAYOUTS[tierFor(width)];
  } catch {
    return LAYOUTS.wide;
  }
}

/**
 * True when the player is very likely using a finger. Drives hit-area floor
 * and whether hover-only affordances (tooltips) are acceptable.
 * @param {Phaser.Scale.ScaleManager} [scale]
 * @returns {boolean}
 */
export function isTouchPrimary(scale) {
  return currentLayout(scale).tier === 'compact';
}

export default LAYOUTS;
