/**
 * Astral Zero — shared lobby/arena UI theme (FRONTEND).
 * ============================================================
 * ONE place for every colour/font used by the Phase 2 lobby + arena HUD.
 * Phaser text styles are plain objects, so a `{ fontFamily, fontSize, color }`
 * triple here can be spread straight into `scene.add.text(x, y, str, style)`.
 *
 * Palette: dark-space background, cyan primary, amber/green/pink accents.
 * All panels are drawn with Graphics (rounded rects + 1px borders), never
 * image assets, so the lobby works with zero art committed.
 */

export const THEME = Object.freeze({
  bg: 0x05070f,
  panel: 0x0d1526,
  panelBorder: 0x1e2b45,
  panelBorderBright: 0x38e1ff,
  inputBg: 0x111b30,
  textPrimary: '#e8f4ff',
  textDim: '#8fa3bf',
  textFaint: '#5b6b85',
  accent: '#38e1ff',
  accentDark: '#0e7490',
  success: '#4ade80',
  warning: '#ff9f43',
  danger: '#ff6b8b',
  online: '#4ade80',
  offline: '#5b6b85',
});

export const FONTS = Object.freeze({
  family: 'Segoe UI, system-ui, -apple-system, sans-serif',
  title: { fontFamily: 'Segoe UI, system-ui, sans-serif', fontSize: '30px', color: '#ffffff' },
  h2: { fontFamily: 'Segoe UI, system-ui, sans-serif', fontSize: '19px', color: '#ffffff' },
  h3: { fontFamily: 'Segoe UI, system-ui, sans-serif', fontSize: '15px', color: '#ffffff' },
  body: { fontFamily: 'Segoe UI, system-ui, sans-serif', fontSize: '14px', color: '#e8f4ff' },
  dim: { fontFamily: 'Segoe UI, system-ui, sans-serif', fontSize: '13px', color: '#8fa3bf' },
  small: { fontFamily: 'Segoe UI, system-ui, sans-serif', fontSize: '12px', color: '#8fa3bf' },
  tiny: { fontFamily: 'Segoe UI, system-ui, sans-serif', fontSize: '11px', color: '#5b6b85' },
  code: { fontFamily: 'Consolas, monospace', fontSize: '26px', color: '#38e1ff' },
});

export default THEME;
