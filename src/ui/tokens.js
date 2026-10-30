/**
 * Debris Derby — design tokens (JavaScript source for the canvas renderer).
 *
 * The CSS custom properties in `src/ui/tokens.css` mirror these values for
 * DOM/UI use. Canvas code must import from this module rather than hardcoding
 * colours, so a palette change never leaves the two renderers out of sync.
 *
 * Palette discipline: sky = player / tether / clean actions; hot pink =
 * danger / cascade / penalty / CTA; white = text, frames, clean surfaces.
 */

export const PALETTE = Object.freeze({
  sky300: '#7DD3FC',
  sky400: '#38BDF8',
  sky500: '#0EA5E9',
  pink400: '#FF5FB0',
  pink500: '#FF2D95',
  // Darkened hot pink used ONLY for text on light surfaces (WCAG AA 4.57:1).
  pink500TextOnLight: '#E01A7A',
  white: '#FFFFFF',
  canvasDark: '#060D1F',
  canvasLight: '#F8FAFC',
  ink: '#0B1220',
  muted: 'rgba(255, 255, 255, 0.62)',
  mutedLight: 'rgba(11, 18, 32, 0.62)',
});

export const SEMANTIC = Object.freeze({
  player: PALETTE.sky400,
  tether: PALETTE.sky300,
  clean: PALETTE.sky400,
  interactive: PALETTE.sky400,
  pressed: PALETTE.sky500,
  danger: PALETTE.pink500,
  cascade: PALETTE.pink500,
  penalty: PALETTE.pink500,
  cta: PALETTE.pink500,
  textOnDark: PALETTE.white,
  textOnLight: PALETTE.ink,
  mutedOnDark: PALETTE.muted,
  mutedOnLight: PALETTE.mutedLight,
});

export const THEME_TOKENS = Object.freeze({
  dark: Object.freeze({
    background: PALETTE.canvasDark,
    text: PALETTE.white,
    muted: PALETTE.muted,
    player: PALETTE.sky400,
    tether: PALETTE.sky300,
    danger: PALETTE.pink500,
    safe: PALETTE.sky400,
  }),
  light: Object.freeze({
    background: PALETTE.canvasLight,
    text: PALETTE.ink,
    muted: PALETTE.mutedLight,
    player: PALETTE.sky500,
    tether: PALETTE.sky500,
    danger: PALETTE.pink500TextOnLight,
    safe: PALETTE.sky500,
  }),
});

export const TYPOGRAPHY = Object.freeze({
  display: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  body: "'Inter', system-ui, -apple-system, sans-serif",
  numeric: "ui-monospace, 'SFMono-Regular', 'Cascadia Mono', Menlo, monospace",
  weights: Object.freeze({
    body: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  }),
  tracking: Object.freeze({
    display: '-0.03em',
    hud: '0.08em',
    eyebrow: '0.16em',
  }),
});

export const MOTION = Object.freeze({
  easeEntrance: 'cubic-bezier(0.22, 1, 0.36, 1)',
  easePhysics: 'linear',
  durationMicro: 160,
  durationStandard: 320,
  durationEntrance: 640,
  cascadeSlowMoScale: 0.25,
  cascadeSlowMoMs: 700,
});

export const LAYOUT = Object.freeze({
  touchTargetMin: 44,
  tetherHitboxMultiplier: 2.5,
  worldWidth: 1600,
  worldHeight: 900,
  worldAspect: 16 / 9,
});

export const Z_INDEX = Object.freeze({
  canvas: 0,
  hud: 10,
  overlay: 20,
  modal: 30,
  toast: 40,
  cursor: 50,
});

/** Read a CSS custom property from the document, with a token fallback. */
export function cssColor(name, fallback = PALETTE.white) {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}
