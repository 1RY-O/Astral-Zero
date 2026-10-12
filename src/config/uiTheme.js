/**
 * Astral Zero — the design token system (FRONTEND).
 * ===========================================================
 * ONE place for every colour, type style, spacing, radius, border, shadow and
 * motion value used by the UI. Phaser text styles are plain objects, so a
 * `{ fontFamily, fontSize, color }` triple here can be spread straight into
 * `scene.add.text(x, y, str, style)`; packed ints feed `Graphics.fillStyle` /
 * `lineStyle`.
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
 *
 * WHY THIS FILE EXISTS AS A SYSTEM, NOT A COLOUR LIST
 * The values used to be re-declared in ~22 separate UI modules: every widget
 * invented its own navy, its own "bar track", its own border, and three
 * different scrim colours existed for the same overlay job. 142+ hard-coded
 * literals plus 13 copies of the same font-family string. Nothing looked broken
 * — each file was internally consistent — but the surfaces drifted apart by one
 * hex digit at a time, so the UI stopped being ONE thing and started being 22
 * things that happened to sit next to each other.
 *
 * THE RULE NOW
 *   A value appears here ONCE. A UI module that would write a hex literal
 *   imports a token instead. The single exception is `ART` below: the backdrop,
 *   boot textures and ambient motes are a continuous illustration, not a
 *   semantic colour, so they live in one art block here rather than being
 *   forced into surface/semantic roles that do not exist.
 */

// ===========================================================================
// 1. RAW PALETTE
// ===========================================================================
// The physical colours the brand is made of. Nothing names a *purpose* yet —
// `BRAND`/`SURFACES`/`SEMANTIC` below do that. Grouping them here is what makes
// it possible to see that 0x7fe7ff and 0x38e1ff are two different cyans and
// that both are needed, rather than accidentally introducing a third.

export const PALETTE = Object.freeze({
  // — deep space / near-black —
  void0: 0x03060d,
  void1: 0x04060f,
  void2: 0x050810,
  void3: 0x070b18,
  navy0: 0x0a1024,
  navy1: 0x0a1020,
  navySunken: 0x0c1322,
  navy0b: 0x101826,
  amberSoft2: 0xfff3c4,
  /**
   * The former "slider track" value, kept ONLY so this file can state the
   * historical 0x20 drift against navy1 in one place. Not referenced by any
   * component; see SURFACES.trackBg.
   */
  legacyTrack: 0x0a1120,
  navy3: 0x0a1223,
  navy4: 0x0b1424,
  navy5: 0x0e1730,
  navy6: 0x0f1830,
  navy7: 0x10263d,
  navy8: 0x131c33,
  navy9: 0x1a2440,
  navy10: 0x1a2444,
  navy11: 0x1b2745,
  navy12: 0x1d2b4d,
  navy13: 0x182242,
  navy14: 0x25355a,
  navy15: 0x2b3a67,
  navy16: 0x2b3d5e,
  navy17: 0x2f4370,
  navy18: 0x33456e,
  navy19: 0x0f2540,

  // — brand cyan family —
  cyanEdge: 0x38e1ff,   // high-energy rim, toasts, leader pips
  cyanLight: 0x7fe7ff,  // secondary cyan: laser, aim lead, orbit rim
  cyan: 0x5ad8ff,       // PRIMARY brand cyan — orbital sweeps, main CTA
  cyanDeep: 0x1479a8,
  cyanDeep2: 0x1e88b0,
  cyanDeep3: 0x0e5a78,
  cyanDeep4: 0x04263a,
  cyanDeep5: 0x0f6f9e,

  // — amber / hazard family —
  amber: 0xffc247,      // cleanup + scrap, warnings
  amberSoft: 0xffc93c,  // the gold action fill
  amberLight: 0xffd166, // "caution" semantic
  amberHot: 0xff9f43,   // opponent tracer, incoming damage
  amberDeep: 0x7a5410,
  amberDeep2: 0x6b4a12,
  amberDeep3: 0x4a3405,
  amberDeep4: 0x7a5200,
  amberDeep5: 0x33250f,

  // — threat / danger family —
  red: 0xff6b8b,
  redPink: 0xff5f7a,
  redDeep: 0x5c1f38,
  redDeep2: 0x331522,
  magenta: 0x501a44,

  // — progression / violet family —
  violet: 0xb58cff,
  violetUI: 0x8b5cf6,
  violetDeep: 0x4a2f80,
  violetDeep2: 0x2a1a5e,

  // — utility blue + green —
  bluePanel: 0x2f7bff,
  blueGlow: 0x2f7fbf,
  teal: 0x123f52,
  teal2: 0x0d3a5c,
  green: 0x4ade80,
  greenDeep: 0x1c5a37,
  greenDeep2: 0x0f2c1e,

  // — greys / inks —
  white: 0xffffff,
  ink100: 0xf2f8ff,
  ink200: 0xcfe2f5,
  ink300: 0xa9bcd8,
  ink400: 0x8fa3bf,
  ink500: 0x9fb6cc,
  ink600: 0x6b7f9e,
  steel: 0x4a5f86,
  brass: 0x6b4f2a,
  slate: 0x3d5a72,
  sand: 0x7a6a4a,
  starBlue: 0x9fe8ff,
  starBlue2: 0x9fd4ff,
  starBlue3: 0xcfe6ff,
  earthFill: 0x0d2a4a,
  satelliteLight: 0xb8c6dd,
  satelliteBody: 0x3f6ea8,
  satellitePanel: 0x8fd8ff,
  artVoid: 0x03050c,
  /** void2 as a CSS string (gameConfig.backgroundColor is a CSS colour). */
  void2Css: '#05070f',
  acidGreen: 0x9dff5c,
  deathTint: 0x556070,
  muzzleFlash: 0xffe9a8,
  hullCeiling: 0x141d33,
  hullWall: 0x14203a,
});

// ===========================================================================
// 2. TYPOGRAPHY
// ===========================================================================
// Built from a base rather than repeating the same family 13 times. Type in an
// arcade game leans on WEIGHT and SIZE, not on many weights: heavy for anything
// read at a glance, lighter for supporting detail.

const FONT_FAMILY = '"Trebuchet MS", "Segoe UI", system-ui, -apple-system, sans-serif';
const DISPLAY_FAMILY = '"Trebuchet MS", "Segoe UI", sans-serif';
const MONO_FAMILY = '"SF Mono", "Consolas", monospace';

/**
 * `fontStyle` keywords, so weights are named rather than re-typed.
 * Exported separately from FONTS on purpose: FONTS is a flat map of text STYLES
 * (each carrying a `fontSize`), and anything else in it breaks that contract for
 * every caller that iterates it.
 */
export const WEIGHTS = Object.freeze({
  regular: '',
  semibold: '600',
  bold: '700',
  extrabold: '800',
  black: '900',
});

/**
 * Build a Phaser text style. Centralising this is what stops a dozen widgets
 * each half-inheriting the family via a spread and half re-typing it.
 *
 * @param {object} style
 * @returns {object} ready to spread into `scene.add.text(...)`
 */
function type(style) {
  return {
    fontFamily: style.mono ? MONO_FAMILY : (style.display ? DISPLAY_FAMILY : FONT_FAMILY),
    fontSize: style.size,
    color: style.color,
    ...(style.weight ? { fontStyle: style.weight } : {}),
  };
}

/**
 * Type scale. `title` is a backwards-compatible alias for `h2` — five widgets
 * spread `FONTS.title` and then override `fontSize`, and removing it produced
 * `fontSize: "undefinedpx"`. Keeping the alias costs one entry and removes a
 * whole class of silent breakage.
 */
export const FONTS = Object.freeze({
  family: FONT_FAMILY,
  mono: MONO_FAMILY,

  /** Big brand wordmark. */
  logo: type({ display: true, size: '38px', color: '#ffffff', weight: WEIGHTS.black }),
  logoSub: type({ display: true, size: '13px', color: PALETTE.cyan, weight: WEIGHTS.bold }),

  /** Section headers — chunky and confident. */
  h2: type({ display: true, size: '22px', color: '#ffffff', weight: WEIGHTS.extrabold }),
  h3: type({ display: true, size: '17px', color: '#ffffff', weight: WEIGHTS.extrabold }),
  /** Panel title strip. */
  panelTitle: type({ display: true, size: '15px', color: PALETTE.cyan, weight: WEIGHTS.extrabold }),

  body: type({ size: '15px', color: '#f2f8ff' }),
  bodyStrong: type({ display: true, size: '15px', color: '#ffffff', weight: WEIGHTS.extrabold }),
  dim: type({ size: '14px', color: '#a9bcd8' }),
  small: type({ size: '13px', color: '#a9bcd8' }),
  tiny: type({ size: '12px', color: '#6b7f9e', weight: WEIGHTS.semibold }),

  /** Numeric readouts (match timer, damage, score). */
  metric: type({ display: true, size: '30px', color: '#ffffff', weight: WEIGHTS.black }),
  metricSm: type({ display: true, size: '18px', color: '#ffffff', weight: WEIGHTS.black }),

  /** Party code — monospace so characters are never ambiguous. */
  code: type({ mono: true, size: '30px', color: PALETTE.cyan, weight: WEIGHTS.bold }),

  /** Alias of `h2`, retained for API compatibility (see note above). */
  title: type({ display: true, size: '22px', color: '#ffffff', weight: WEIGHTS.extrabold }),
});

// ===========================================================================
// 3. SURFACES
// ===========================================================================
// Deep space is kept dark so the saturated accents read as light sources.

export const SURFACES = Object.freeze({
  bg: PALETTE.void3,
  bgDeep: PALETTE.void1,
  panel: PALETTE.navy8,
  panelAlt: PALETTE.navy11,
  panelSunken: PALETTE.navySunken,
  /** A mode/character card sitting directly on a panel. */
  panelCard: PALETTE.navy6,
  /** One row inside a list (party member, friend). */
  panelRow: PALETTE.navy4,
  /** The leader's row — lifted one step so the eye finds it. */
  panelRowLeader: PALETTE.navy7,
  panelBorder: PALETTE.navy17,
  /** Quieter border for cards nested inside a bordered panel. */
  panelBorderSoft: PALETTE.navy16,
  panelBorderBright: PALETTE.cyan,

  inputBg: PALETTE.navy9,
  inputBorder: PALETTE.navy3,
  /**
   * The track EVERY bar fills along — health, reload, sliders. This used to be
   * two values 0x20 apart (`legacyTrack` in the sliders, `navy1` in the bars), which
   * is exactly the drift this file exists to stop. Unified here.
   */
  trackBg: PALETTE.navy1,

  /** Overlay scrim. Three near-identical values used to exist; now one. */
  scrim: PALETTE.void0,
});

// ===========================================================================
// 4. BRAND ACCENTS + SEMANTIC STATES
// ===========================================================================
// Semantic colours are about MEANING, not hue: `danger` must read as danger
// everywhere it appears, and must never be swapped for a decorative red.

export const BRAND = Object.freeze({
  cyan: PALETTE.cyan,
  cyanEdge: PALETTE.cyanEdge,
  cyanLight: PALETTE.cyanLight,
  amber: PALETTE.amber,
  amberSoft: PALETTE.amberSoft,
  violet: PALETTE.violet,
});

/**
 * Semantic colour + readable text, in BOTH encodings. Phaser text takes a CSS
 * string; Graphics takes a packed int. Keeping both here means a widget never
 * hand-converts one into the other.
 */
export const SEMANTIC = Object.freeze({
  /** Brand cyan as a CSS string (text/stroke sites need this encoding). */
  cyan: '#5ad8ff',
  /** Amber-light as a CSS string — the OUTDATED SERVER / caution label. */
  amberLight: '#ffd166',
  textPrimary: '#f2f8ff',
  textDim: '#a9bcd8',
  textFaint: '#6b7f9e',
  success: '#4ade80',
  warning: '#ffd166',
  danger: '#ff6b8b',
  /** Brand amber + violet as CSS strings (the originals were CSS, so they stay CSS). */
  amber: '#ffc247',
  violet: '#b58cff',
  online: '#4ade80',
  offline: '#6b7f9e',
});

/**
 * CSS-side font families, for the DOM boot screen.
 *
 * The Phaser layer consumes `FONTS` (objects that spread into `scene.add.text`).
 * The boot screen is plain DOM/CSS, so it needs the same families as CSS strings
 * for the `font:` shorthand. Typing them out here re-created the group of copy
 * this module exists to end, so they are exported as tokens too.
 */
export const CSS_FONTS = Object.freeze({
  display: DISPLAY_FAMILY,
  body: FONT_FAMILY,
  mono: MONO_FAMILY,
});

/** CSS-side mirrors, for the DOM boot screen which cannot import packed ints. */
export const SEMANTIC_CSS = Object.freeze({
  ...SEMANTIC,
  cyanEdge: '#38e1ff',
  cyanLight: '#7fe7ff',
  amberHot: '#ff9f43',
  red: '#ff6b8b',
  green: '#4ade80',
  cyanDeep2: '#1e88b0',
  cyanDeep5: '#0f6f9e',
  white: '#ffffff',
  amberSoft: '#ffc93c',
  panel: '#0f1830',
  nav: '#0e1730',
  bg: '#070b18',
  bgDeep: '#04060f',
  scrim: '#03060d',
});

/**
 * Connection state → colour + label. Drives BOTH the status pill and the
 * Find Match button, so those two can never contradict each other.
 *
 * These map 1:1 onto REAL signals on `net.state` (see ConnectionPill.js):
 * `connection` (idle|connecting|online|offline) × `reconnecting` (boolean).
 * Nothing here is cosmetic-only or faked.
 */
export const CONNECTION_STATES = Object.freeze({
  idle: { label: 'CONNECTING', color: PALETTE.cyanLight, text: '#7fe7ff', tone: 'info' },
  connecting: { label: 'CONNECTING', color: PALETTE.amberLight, text: '#ffd166', tone: 'warning' },
  online: { label: 'ONLINE', color: PALETTE.green, text: '#4ade80', tone: 'success' },
  reconnecting: { label: 'RECONNECTING', color: PALETTE.amberLight, text: '#ffd166', tone: 'warning' },
  offline: { label: 'OFFLINE', color: PALETTE.red, text: '#ff6b8b', tone: 'error' },
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

/**
 * Panel identity colours. Each lobby panel owns ONE accent so "party" and
 * "friends" are distinguishable without reading the title — but they are drawn
 * from a sanctioned set, so a fourth panel does not invent a fourth hue.
 */
export const PANEL_ACCENTS = Object.freeze({
  party: PALETTE.bluePanel,
  friends: PALETTE.violetUI,
  mode: PALETTE.redPink,
});

/** Avatar tint rotation. Cycles accent → amber → violet → success. */
/**
 * Per-character body tint. Purely cosmetic — it marks WHO on the roster you are
 * and must never encode relative power (the tiers read as labels, not bars).
 */
export const CHARACTER_TINTS = Object.freeze({
  halcyon: PALETTE.cyanEdge,   // bright cyan — the scope
  marlowe: PALETTE.cyan,       // brand cyan — the standard issue
  bodge: PALETTE.amberSoft,    // amber — fast and loud
  vesper: PALETTE.violet,      // violet — containment
  nettle: PALETTE.green,       // green — toxin
});

export const PROFILE_ACCENTS = Object.freeze([
  PALETTE.cyan,
  PALETTE.amber,
  PALETTE.violet,
  PALETTE.green,
]);

/**
 * THEME — the historic export.
 *
 * Kept as a flat object because ~30 modules read `THEME.panel` /
 * `THEME.accent` and call sites are cheap to leave alone. It is now DERIVED
 * from the groups above rather than being a second list of literals, so it
 * cannot drift from them.
 */
export const THEME = Object.freeze({
  // Surfaces
  bg: SURFACES.bg,
  bgDeep: SURFACES.bgDeep,
  panel: SURFACES.panel,
  panelAlt: SURFACES.panelAlt,
  panelSunken: SURFACES.panelSunken,
  panelCard: SURFACES.panelCard,
  panelRow: SURFACES.panelRow,
  panelRowLeader: SURFACES.panelRowLeader,
  panelBorder: SURFACES.panelBorder,
  panelBorderSoft: SURFACES.panelBorderSoft,
  panelBorderBright: SURFACES.panelBorderBright,
  inputBg: SURFACES.inputBg,
  inputBorder: SURFACES.inputBorder,
  trackBg: SURFACES.trackBg,
  scrim: SURFACES.scrim,

  // Brand accents
  accent: SEMANTIC.cyan,
  accentDark: '#1e88b0',
  accentDeep: PALETTE.cyanDeep3,
  cyanEdge: PALETTE.cyanEdge,
  cyanLight: PALETTE.cyanLight,
  amber: SEMANTIC.amber,
  amberSoft: SEMANTIC_CSS.amberSoft,
  amberDeep: PALETTE.amberDeep,
  violet: SEMANTIC.violet,
  violetDeep: PALETTE.violetDeep,

  // Semantic
  textPrimary: SEMANTIC.textPrimary,
  textDim: SEMANTIC.textDim,
  textFaint: SEMANTIC.textFaint,
  success: SEMANTIC.success,
  warning: SEMANTIC.warning,
  danger: SEMANTIC.danger,
  online: SEMANTIC.online,
  offline: SEMANTIC.offline,

  /**
   * Team colours, mirrored from lobbyConfig.TEAMS for HUD use.
   * NOTE: these read as inverted (teamRed IS the brand cyan). That is a real
   * defect, but changing it would silently recolour every team-based HUD, so it
   * is left exactly as shipped and flagged for a deliberate fix.
   */
  teamRed: PALETTE.cyan,
  teamBlue: PALETTE.amber,
});

// ===========================================================================
// 5. LAYOUT: spacing, radii, borders, shadow
// ===========================================================================
// An arcade UI is spaced on a coarse grid. Every number here is a multiple of a
// 4px unit so panels, cards and buttons snap together instead of arriving at
// eyecatching-but-unrepeatable offsets.

export const SPACING = Object.freeze({
  unit: 4,
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
});

/** Corner radii. Arcade panels are noticeably rounder than dashboard cards. */
export const RADII = Object.freeze({
  panel: 22,
  card: 16,
  button: 14,
  pill: 999,
  chip: 10,
});

/**
 * Border weights, in px. Arcade outlines are THICK — a 1px hairline would read
 * as a web form. `emphasis` is the bright inner rim that makes a selected item
 * look lit rather than merely bordered.
 */
export const BORDERS = Object.freeze({
  hairline: 1,
  thin: 2,
  base: 3,
  thick: 4,
  emphasis: 5,
});

/**
 * Glow / depth alphas. Buttons sit in the surface by a shadow and lift by a
 * glow; both are expressed as alpha so they scale with any fill colour.
 */
export const SHADOWS = Object.freeze({
  panelInner: 0.05,
  cardInner: 0.08,
  lift: 0.06,
  hover: 0.18,
  focus: 0.34,
  glow: 0.4,
});

// ===========================================================================
// 6. MOTION
// ===========================================================================
// `pressScale` is what gives buttons their "physical object you push" feel.

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

// ===========================================================================
// 7. COMPONENT TOKENS
// ===========================================================================
// Component-level palettes that used to live inside the component files. They
// moved here so a button, a toast and a nav item all agree on what "neutral"
// means, and so a skin change is one edit instead of a hunt.

/**
 * Button skins. `fill` is the resting face, `border` the rim, `text` the label
 * colour (contrast-checked: dark text only on the bright `gold` fill), `glow`
 * the hover alpha.
 *
 * This table used to be `SKINS` inside Button.js. It lived in exactly one file,
 * which is why it was never caught by "find the duplicated colour" — the
 * problem was not duplication but RE-DECLARATION: every value is a re-spelling
 * of a brand colour that already existed here.
 */
export const BUTTON_SKINS = Object.freeze({
  primary: { fill: PALETTE.cyanDeep, border: PALETTE.cyan, text: '#ffffff', glow: 0.34 },
  accent: { fill: PALETTE.navy12, border: PALETTE.cyanLight, text: '#e8f4ff', glow: 0.18 },
  neutral: { fill: PALETTE.navy13, border: PALETTE.navy18, text: '#cfe2f5', glow: 0.1 },
  danger: { fill: PALETTE.redDeep, border: PALETTE.red, text: '#ffe1e8', glow: 0.24 },
  ghost: { fill: PALETTE.navy1, border: PALETTE.navy14, text: '#8fa3bf', glow: 0.06 },
  success: { fill: PALETTE.greenDeep, border: PALETTE.green, text: '#e6ffee', glow: 0.26 },
  warning: { fill: PALETTE.amberDeep2, border: PALETTE.amber, text: '#fff3d6', glow: 0.28 },
  /** The big Find Match CTA. */
  cta: { fill: PALETTE.cyanDeep5, border: PALETTE.cyanLight, text: '#ffffff', glow: 0.4 },
  /**
   * Chunky arcade-yellow primary (homepage hero actions, selected nav/mode).
   * Dark text on the bright fill keeps contrast high; matches the reference
   * homepage's yellow actions with bold dark type.
   */
  gold: { fill: PALETTE.amberSoft, border: PALETTE.amberDeep4, text: '#3a2a00', glow: 0.35 },
  /** Navigation rail item. */
  nav: { fill: PALETTE.navy5, border: PALETTE.navy14, text: '#a9bcd8', glow: 0.06 },
});

/** Toast tone styles: a colour per SEVERITY, never a colour per message. */
export const TONES = Object.freeze({
  info: { fill: PALETTE.navy19, border: PALETTE.cyanEdge, text: '#d8f4ff' },
  success: { fill: PALETTE.greenDeep2, border: PALETTE.green, text: '#dcffe8' },
  error: { fill: PALETTE.redDeep2, border: PALETTE.red, text: '#ffe0e6' },
  warning: { fill: PALETTE.amberDeep5, border: PALETTE.amberHot, text: '#ffeed6' },
});

/**
 * Health ramp. Shared by the HUD bar, the floating name-tag bar and the local
 * player's overlay, so "low health" is the same red in all three places.
 */
export const HP_RAMP = Object.freeze({
  full: PALETTE.green,
  hurt: PALETTE.amberLight,
  critical: PALETTE.red,
  /** Ratio thresholds (0..1) at which the ramp steps down. */
  fullAbove: 0.6,
  criticalBelow: 0.3,
});

/**
 * Combat feedback colours. These are semantic, not decorative: the player reads
 * them to tell "my shot" from "someone else's shot" and "confirmed hit" from
 * "predicted hit" without looking at anything else.
 */
export const COMBAT_FX = Object.freeze({
  muzzleFlash: PALETTE.muzzleFlash,
  /** Packed-int mirrors for sites that feed Graphics rather than text. */
  damagePredictedInt: PALETTE.ink500,
  firstBloodColor: PALETTE.amberLight,
  tracerAmber: PALETTE.amberLight,
  tracerCyan: PALETTE.cyanLight,
  tracerHot: PALETTE.amberHot,
  tracer: PALETTE.white,
  tracerOpponent: PALETTE.amberHot,
  damageConfirmed: '#ffffff',
  damagePredicted: '#9fb6cc',
  damageIncoming: '#ff9f43',
  numberStroke: '#0a1020',
  spawnMark: '#7fe7ff',
  practiceNotice: '#ffd166',
});

// ===========================================================================
// 8. ART — the backdrop / boot illustration palette
// ===========================================================================
// Deliberately separate from semantics. These are continuous illustration
// values (a nebula, a star, a piece of debris), not states: forcing them into
// `SURFACES` would imply meanings they do not have. Kept in ONE block so the
// whole scene can be re-tuned as a picture.

export const ART = Object.freeze({
  /** Deep-space bands, top → bottom. */
  bands: Object.freeze([
    { color: PALETTE.void2, alpha: 1 },
    { color: PALETTE.void3, alpha: 1 },
    { color: PALETTE.navy0, alpha: 1 },
  ]),
  nebula: Object.freeze([
    PALETTE.violetDeep2,
    PALETTE.teal2,
    PALETTE.magenta,
    PALETTE.teal,
  ]),
  stars: Object.freeze({
    far: PALETTE.starBlue3,
    near: PALETTE.white,
    twinkle: PALETTE.starBlue,
    twinkleAlt: PALETTE.starBlue2,
  }),
  earth: Object.freeze({
    fill: PALETTE.navy7,
    rim: PALETTE.blueGlow,
    glow: PALETTE.cyanLight,
  }),
  /** Debris shards. Rust/steel/slate/sand — salvaged metal, not grey boxes. */
  debris: Object.freeze([
    PALETTE.steel,
    PALETTE.brass,
    PALETTE.slate,
    PALETTE.sand,
  ]),
  /** Procedural BootScene texture fills (the gray-box janitor + platform). */
  boot: Object.freeze({
    body: PALETTE.cyanEdge,
    bodyShade: PALETTE.cyanDeep4,
    visor: PALETTE.white,
    boot: PALETTE.amberHot,
    platform: PALETTE.navy15,
    platformRim: PALETTE.cyanLight,
    platformShade: PALETTE.navy10,
    player: PALETTE.amberLight,
    playerShade: PALETTE.navy10,
  }),
  ambient: Object.freeze({
    mote: PALETTE.starBlue2,
    vent: PALETTE.cyanLight,
    /** Per-arena haze tints. Each map is a different place, so each gets one. */
    tintJunkyard: 0x12060a,
    tintBiodome: 0x07140c,
  }),
  /** The control point (S14.5). Ownership is server state; these are its skin. */
  controlPoint: Object.freeze({
    /** Fully transparent — the ring is drawn by its STROKE, never a fill. */
    clear: 0x000000,
    /** The capture bar's backing plate: near-opaque so the fill reads on any bg. */
    barBackAlpha: 0.55,
  }),
  /** The arena hull plates: floor, ceiling, walls. */
  hull: Object.freeze({
    plate: PALETTE.navy10,
    ceiling: PALETTE.hullCeiling,
    wall: PALETTE.hullWall,
  }),
  /** Hazard volumes. Coolant = freezing blue, acid = corrosive green. */
  hazards: Object.freeze({
    // Keyed by hazard FAMILY — WorldRenderer indexes these with
    // 'coolant' | 'acid' | 'default', so the key names are part of the contract.
    coolant: PALETTE.cyanEdge,
    acid: PALETTE.acidGreen,
    default: PALETTE.red,
    /** The hazard chevron trim along the walkable edges. */
    stripeLight: PALETTE.amberHot,
    stripeDark: PALETTE.navy0b,
  }),
  /** Scrap tokens (scrap_collector mode). Salvage must read as VALUABLE. */
  scrap: Object.freeze({
    core: PALETTE.amber,
    highlight: PALETTE.amberSoft2,
    label: PALETTE.amber,
  }),
  /** Low-gravity volumes — the floaty tint. */
  lowGravity: PALETTE.starBlue2,
  /** Orbit-guide + vignette tints for the backdrop layers. */
  vignette: PALETTE.artVoid,
  /** Satellites: the small salvage structures tumbling through the far layer. */
  satellite: Object.freeze({
    light: PALETTE.satelliteLight,
    body: PALETTE.satelliteBody,
    panel: PALETTE.satellitePanel,
  }),
});

export default THEME;
