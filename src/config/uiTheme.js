/**
 * Astral Zero — shared lobby/arena UI theme (FRONTEND).
 * ===========================================================
 * ONE place for every colour/font/radius used by the lobby + arena HUD.
 * Phaser text styles are plain objects, so a `{ fontFamily, fontSize, color }`
 * triple here can be spread straight into `scene.add.text(x, y, str, style)`.
 *
 * DESIGN DIRECTION — "arcade energy + orbital cleanup"
 * A colourful, chunky, high-contrast sci-fi arcade UI: big rounded panels,
 * thick outlines, saturated accents that POP against deep space. Deliberately
 * NOT a corporate dashboard — heavy type, playful accents, and buttons that
 * read as physical objects you press.
 *
 * BRANDING
 * Astral Zero's identity is original: an orbital ring, a cleanup swoosh and a
 * star motif. No skull/star emblems, no third-party characters or marks.
 *
 * Everything is drawn with Graphics (rounded rects + thick borders), never
 * image assets, so the game works with zero art committed.
 */

/**
 * Connection state → colour + label. Drives BOTH the status pill and the
 * Find Match button, so those two can never contradict each other.
 *
 * These map 1:1 onto REAL signals on `net.state` (see ConnectionPill.js):
 * `connection` (idle|connecting|online|offline) × `reconnecting` (boolean).
 * Nothing here is cosmetic-only or faked.
 */
export const CONNECTION_STATES = Object.freeze({
  idle: { label: 'CONNECTING', color: 0x7fe7ff, text: '#7fe7ff', tone: 'info' },
  connecting: { label: 'CONNECTING', color: 0xffd166, text: '#ffd166', tone: 'warning' },
  online: { label: 'ONLINE', color: 0x4ade80, text: '#4ade80', tone: 'success' },
  reconnecting: { label: 'RECONNECTING', color: 0xffd166, text: '#ffd166', tone: 'warning' },
  offline: { label: 'OFFLINE', color: 0xff6b8b, text: '#ff6b8b', tone: 'error' },
});

/**
 * Find Match CTA states. The button's label, colour and enabled flag are all
 * derived from this — the UI can never claim "READY" while the socket is down
 * or "SEARCHING" when the player is actually the party leader waiting.
 */
export const CTA_STATES = Object.freeze({
  offline: { label: 'OFFLINE', sub: 'cannot reach the orbital relay', enabled: false, tone: 'error' },
  loading: { label: 'LOADING', sub: 'bringing up the arena', enabled: false, tone: 'info' },
  queued: { label: 'SEARCHING', sub: 'scanning for a debris field', enabled: true, tone: 'warning' },
  leader: { label: 'START MATCH', sub: 'launch with your crew', enabled: true, tone: 'primary' },
  waiting: { label: 'WAITING', sub: 'the leader starts the match', enabled: false, tone: 'neutral' },
  ready: { label: 'FIND MATCH', sub: 'drop into a debris field', enabled: true, tone: 'primary' },
});

export const THEME = Object.freeze({
  // --- Surfaces -----------------------------------------------------------
  /** Deep space. Kept dark so the saturated accents read as light sources. */
  bg: 0x070b18,
  bgDeep: 0x04060f,
  /** Card fill — navy, translucent enough that the backdrop hints through. */
  panel: 0x131c33,
  panelAlt: 0x1b2745,
  panelSunken: 0x0c1322,
  panelBorder: 0x2f4370,
  panelBorderBright: 0x5ad8ff,

  inputBg: 0x1a2440,
  trackBg: 0x0a1120,

  // --- Brand accents (original Astral Zero identity) -----------------------
  /** Primary brand cyan — orbital sweeps, main CTA. */
  accent: '#5ad8ff',
  accentDark: '#1e88b0',
  accentDeep: 0x0e5a78,
  /** Secondary brand amber — cleanup/scrap, energy. */
  amber: '#ffc247',
  amberDeep: 0x7a5410,
  /** Tertiary brand violet — medals/progression, used sparingly. */
  violet: '#b58cff',
  violetDeep: 0x4a2f80,

  // --- Semantic ------------------------------------------------------------
  textPrimary: '#f2f8ff',
  textDim: '#a9bcd8',
  textFaint: '#6b7f9e',
  success: '#4ade80',
  warning: '#ffd166',
  danger: '#ff6b8b',
  online: '#4ade80',
  offline: '#6b7f9e',

  /** Team colours, mirrored from lobbyConfig.TEAMS for HUD use. */
  teamRed: 0x5ad8ff,
  teamBlue: 0xffc247,
});

/**
 * Type scale. Arcade games lean on WEIGHT and SIZE, not on many weights:
 * heavy for anything read at a glance (titles, numbers, buttons), lighter
 * for supporting detail.
 */
export const FONTS = Object.freeze({
  family: '"Trebuchet MS", "Segoe UI", system-ui, -apple-system, sans-serif',
  mono: '"SF Mono", "Consolas", monospace',

  /** Big brand wordmark. */
  logo: { fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif', fontSize: '38px', color: '#ffffff', fontStyle: '900' },
  logoSub: { fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif', fontSize: '13px', color: '#5ad8ff', fontStyle: '700' },

  /** Section headers — chunky and confident. */
  h2: { fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif', fontSize: '22px', color: '#ffffff', fontStyle: '800' },
  h3: { fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif', fontSize: '17px', color: '#ffffff', fontStyle: '800' },
  /** Panel title strip. */
  panelTitle: { fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif', fontSize: '15px', color: '#5ad8ff', fontStyle: '800' },

  body: { fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif', fontSize: '15px', color: '#f2f8ff' },
  bodyStrong: { fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif', fontSize: '15px', color: '#ffffff', fontStyle: '800' },
  dim: { fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif', fontSize: '14px', color: '#a9bcd8' },
  small: { fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif', fontSize: '13px', color: '#a9bcd8' },
  tiny: { fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif', fontSize: '12px', color: '#6b7f9e', fontStyle: '600' },

  /** Numeric readouts (match timer, damage, score). */
  metric: { fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif', fontSize: '30px', color: '#ffffff', fontStyle: '900' },
  metricSm: { fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif', fontSize: '18px', color: '#ffffff', fontStyle: '900' },

  /** Party code — monospace so characters are never ambiguous. */
  code: { fontFamily: '"SF Mono", "Consolas", monospace', fontSize: '30px', color: '#5ad8ff', fontStyle: '700' },

  /**
   * Backwards-compatible alias for `h2`, kept because five existing widgets
   * (ArenaHud, MatchResults, MatchSummary, SettingsMenu) spread `FONTS.title`
   * and then override `fontSize`. Removing it would have silently produced
   * `fontSize: "undefinedpx"` in the HUD banner.
   */
  title: { fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif', fontSize: '22px', color: '#ffffff', fontStyle: '800' },
});

/**
 * Corner radii. Arcade panels are noticeably rounder than dashboard cards.
 * Button < panel, so buttons read as sitting on top of the surface.
 */
export const RADII = Object.freeze({
  panel: 22,
  card: 16,
  button: 14,
  pill: 999,
  chip: 10,
});

/**
 * Interaction + motion tokens. `pressScale` is what gives buttons their
 * "physical object you push" feel.
 */
export const MOTION = Object.freeze({
  pressScale: 0.96,
  hoverScale: 1.03,
  fast: 110,
  base: 180,
  slow: 320,
  /** Card entrance stagger when the lobby builds. */
  stagger: 55,
  toastMs: 3000,
});

export default THEME;
