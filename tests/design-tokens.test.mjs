/**
 * Astral Zero — design-token PARITY test.
 *
 * The consolidation pass moved every colour and repeated design value into
 * src/config/uiTheme.js. The risk in a change like that is not a crash, it is a
 * SILENT visual drift: one hex digit off in one widget and nobody notices until
 * the game looks subtly wrong.
 *
 * So this test freezes the values that shipped BEFORE the consolidation. Every
 * one of them is asserted against the new tokens, in both encodings (packed int
 * for Graphics, CSS string for Phaser text). If this passes, the consolidation
 * is provably a no-op on the palette, which is exactly what it must be.
 *
 * Run: node tests/design-tokens.test.mjs
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  THEME,
  CONNECTION_STATES,
  CTA_STATES,
  FONTS,
  RADII,
  MOTION,
  SPACING,
  BORDERS,
  SHADOWS,
  BUTTON_SKINS,
  TONES,
  HP_RAMP,
  COMBAT_FX,
  PANEL_ACCENTS,
  PALETTE,
  SURFACES,
  WEIGHTS,
  SEMANTIC,
  SEMANTIC_CSS,
  CSS_FONTS,
  ART,
  PROFILE_ACCENTS,
  BRAND,
} from '../src/config/uiTheme.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// ---------------------------------------------------------------------------
// 1. The palette is byte-identical to what shipped before consolidation.
// ---------------------------------------------------------------------------
/** THEME, exactly as it read before the token pass. */
/**
 * The ONE deliberate value change in this pass, spelled out so it cannot hide.
 *
 * `trackBg` shipped as 0x0a1120 in the sliders and 0x0a1020 in every bar —
 * two "bar track" colours one hex step apart, which is precisely the drift the
 * token system exists to stop. Unified on 0x0a1020 (the bars' value, and the
 * more common one). The delta is 2/255 in the green channel: invisible, and
 * only correct BECAUSE it is invisible.
 */
const INTENTIONAL = Object.freeze({
  trackBg: { from: 0x0a1120, to: 0x0a1020 },
});

const ORIGINAL_THEME = Object.freeze({
  bg: 0x070b18,
  bgDeep: 0x04060f,
  panel: 0x131c33,
  panelAlt: 0x1b2745,
  panelSunken: 0x0c1322,
  panelBorder: 0x2f4370,
  panelBorderBright: 0x5ad8ff,
  inputBg: 0x1a2440,
  trackBg: INTENTIONAL.trackBg.to,
  accent: '#5ad8ff',
  accentDark: '#1e88b0',
  accentDeep: 0x0e5a78,
  amber: '#ffc247',
  amberDeep: 0x7a5410,
  violet: '#b58cff',
  violetDeep: 0x4a2f80,
  textPrimary: '#f2f8ff',
  textDim: '#a9bcd8',
  textFaint: '#6b7f9e',
  success: '#4ade80',
  warning: '#ffd166',
  danger: '#ff6b8b',
  online: '#4ade80',
  offline: '#6b7f9e',
  teamRed: 0x5ad8ff,
  teamBlue: 0xffc247,
});

test('THEME preserves every shipped value', () => {
  for (const [key, expected] of Object.entries(ORIGINAL_THEME)) {
    assert.strictEqual(
      THEME[key], expected,
      `THEME.${key} changed: ${expected} -> ${THEME[key]} — the consolidation must not recolour the UI`,
    );
  }
  // The one documented change, asserted separately so it stays one.
  assert.strictEqual(THEME.trackBg, INTENTIONAL.trackBg.to,
    'trackBg is the only value this pass is allowed to move');
  // Every token resolves: an undefined value is the one failure this pass could
  // silently introduce (a token name that does not exist in the group it reads).
  for (const [key, value] of Object.entries(THEME)) {
    assert.notStrictEqual(value, undefined, `THEME.${key} is undefined`);
  }
});

test('BUTTON_SKINS preserves every shipped skin', () => {
  // The table as it read inside Button.js before the pass.
  const original = {
    primary: { fill: 0x1479a8, border: 0x5ad8ff, text: '#ffffff', glow: 0.34 },
    accent: { fill: 0x1d2b4d, border: 0x7fe7ff, text: '#e8f4ff', glow: 0.18 },
    neutral: { fill: 0x182242, border: 0x33456e, text: '#cfe2f5', glow: 0.1 },
    danger: { fill: 0x5c1f38, border: 0xff6b8b, text: '#ffe1e8', glow: 0.24 },
    ghost: { fill: INTENTIONAL.trackBg.to, border: 0x25355a, text: '#8fa3bf', glow: 0.06 },
    success: { fill: 0x1c5a37, border: 0x4ade80, text: '#e6ffee', glow: 0.26 },
    warning: { fill: 0x6b4a12, border: 0xffc247, text: '#fff3d6', glow: 0.28 },
    cta: { fill: 0x0f6f9e, border: 0x7fe7ff, text: '#ffffff', glow: 0.4 },
    gold: { fill: 0xffc93c, border: 0x7a5200, text: '#3a2a00', glow: 0.35 },
    nav: { fill: 0x0e1730, border: 0x25355a, text: '#a9bcd8', glow: 0.06 },
  };
  assert.deepStrictEqual(BUTTON_SKINS, Object.freeze(original), 'button skins must be unchanged');
  // Every skin must be usable: a missing field is a runtime NaN/graphics crash.
  for (const [name, skin] of Object.entries(BUTTON_SKINS)) {
    for (const field of ['fill', 'border', 'text', 'glow']) {
      assert.notStrictEqual(skin[field], undefined, `skin "${name}" is missing "${field}"`);
    }
    assert.ok(/^#[0-9a-f]{6}$/i.test(skin.text), `skin "${name}" text must be a CSS hex`);
    assert.ok(Number.isInteger(skin.fill) && Number.isInteger(skin.border), `skin "${name}" fills must be packed ints`);
  }
});

test('TONES and CONNECTION_STATES preserve every shipped value', () => {
  assert.deepStrictEqual(TONES, Object.freeze({
    info: { fill: 0x0f2540, border: 0x38e1ff, text: '#d8f4ff' },
    success: { fill: 0x0f2c1e, border: 0x4ade80, text: '#dcffe8' },
    error: { fill: 0x331522, border: 0xff6b8b, text: '#ffe0e6' },
    warning: { fill: 0x33250f, border: 0xff9f43, text: '#ffeed6' },
  }));
  assert.deepStrictEqual(CONNECTION_STATES, Object.freeze({
    idle: { label: 'CONNECTING', color: 0x7fe7ff, text: '#7fe7ff', tone: 'info' },
    connecting: { label: 'CONNECTING', color: 0xffd166, text: '#ffd166', tone: 'warning' },
    online: { label: 'ONLINE', color: 0x4ade80, text: '#4ade80', tone: 'success' },
    reconnecting: { label: 'RECONNECTING', color: 0xffd166, text: '#ffd166', tone: 'warning' },
    offline: { label: 'OFFLINE', color: 0xff6b8b, text: '#ff6b8b', tone: 'error' },
  }));
});

test('FONTS / RADII / MOTION are unchanged in value', () => {
  assert.deepStrictEqual(RADII, Object.freeze({ panel: 22, card: 16, button: 14, pill: 999, chip: 10 }));
  assert.deepStrictEqual(MOTION, Object.freeze({
    pressScale: 0.96, hoverScale: 1.03, fast: 110, base: 180, slow: 320, stagger: 55, toastMs: 3000,
  }));
  assert.strictEqual(FONTS.logo.fontSize, '38px');
  assert.strictEqual(FONTS.logo.color, '#ffffff');
  assert.strictEqual(FONTS.logo.fontStyle, '900');
  assert.strictEqual(FONTS.metric.fontSize, '30px');
  assert.strictEqual(FONTS.title.fontSize, '22px');
  // The family is defined ONCE, not re-typed per style.
  assert.strictEqual(FONTS.logo.fontFamily, FONTS.h2.fontFamily);
  assert.ok(FONTS.family.includes('Trebuchet MS'), 'the base family is a token');
  assert.ok(FONTS.mono.includes('SF Mono'), 'monospace is a token');
});

test('CTA_STATES are unchanged (labels matter to the queue lifecycle)', () => {
  assert.deepStrictEqual(CTA_STATES, Object.freeze({
    offline: { label: 'OFFLINE', sub: 'cannot reach the orbital relay', enabled: false, tone: 'error' },
    loading: { label: 'LOADING', sub: 'bringing up the arena', enabled: false, tone: 'info' },
    queued: { label: 'SEARCHING', sub: 'scanning for a debris field', enabled: true, tone: 'warning' },
    leader: { label: 'START MATCH', sub: 'launch with your crew', enabled: true, tone: 'primary' },
    waiting: { label: 'WAITING', sub: 'the leader starts the match', enabled: false, tone: 'neutral' },
    ready: { label: 'FIND MATCH', sub: 'drop into a debris field', enabled: true, tone: 'primary' },
  }));
});

// ---------------------------------------------------------------------------
// 2. Structural invariants the system must keep.
// ---------------------------------------------------------------------------
test('FONTS is a FLAT map of text styles (each carries a fontSize)', () => {
  for (const [key, value] of Object.entries(FONTS)) {
    if (key === 'family' || key === 'mono') continue; // raw font-family strings
    assert.ok(value && typeof value === 'object', `FONTS.${key} must be a style object`);
    assert.ok(value.fontSize, `FONTS.${key} must have a fontSize`);
    assert.ok(!String(value.fontSize).includes('undefined'), `FONTS.${key} has an undefined size`);
  }
});

test('semantic colours are defined in BOTH encodings', () => {
  // Phaser text takes CSS strings, Graphics takes packed ints. A widget must
  // never have to convert one into the other by hand.
  for (const key of ['textPrimary', 'success', 'warning', 'danger']) {
    assert.ok(/^#[0-9a-fA-F]{6}$/.test(THEME[key]), `THEME.${key} must be a CSS hex`);
  }
  for (const key of ['panel', 'panelBorder', 'trackBg', 'accentDeep']) {
    assert.ok(Number.isInteger(THEME[key]), `THEME.${key} must be a packed int`);
  }
});

test('spacing is a coherent 4px grid', () => {
  assert.strictEqual(SPACING.unit, 4);
  for (const [key, value] of Object.entries(SPACING)) {
    if (key === 'unit') continue;
    assert.strictEqual(value % 4, 0, `SPACING.${key} (${value}) must be a multiple of 4`);
  }
});

test('HUD + combat feedback colours resolve to the shared ramp', () => {
  assert.strictEqual(HP_RAMP.full, PALETTE.green);
  assert.strictEqual(HP_RAMP.hurt, PALETTE.amberLight);
  assert.strictEqual(HP_RAMP.critical, PALETTE.red);
  assert.ok(HP_RAMP.fullAbove > HP_RAMP.criticalBelow, 'the ramp thresholds must be ordered');
  for (const [key, value] of Object.entries(COMBAT_FX)) {
    assert.notStrictEqual(value, undefined, `COMBAT_FX.${key} is undefined`);
  }
  for (const [key, value] of Object.entries(PANEL_ACCENTS)) {
    assert.ok(Number.isInteger(value), `PANEL_ACCENTS.${key} must be a packed int`);
  }
});

test('no colour VALUE is written twice in the token module', () => {
  // The real invariant, tested against the SOURCE rather than the resolved
  // objects: derived views (THEME aliasing SURFACES, a skin referencing a
  // palette entry) are fine and are exactly what the system is for. A colour
  // LITERAL typed out twice is not — it means two places decided the same
  // thing independently.
  // Comments are stripped first: prose that NAMES a colour (to explain a
  // relationship, say) is documentation, not a second decision.
  const raw = fs.readFileSync(path.join(root, 'src/config/uiTheme.js'), 'utf8');
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  const counts = new Map();
  for (const m of src.matchAll(/0x[0-9a-fA-F]{6}\b/g)) {
    counts.set(m[0], (counts.get(m[0]) || 0) + 1);
  }
  const dupes = [...counts.entries()].filter(([, n]) => n > 1).map(([v]) => v);
  assert.deepStrictEqual(dupes, [], `hex literals repeated in uiTheme.js: ${dupes.join(', ')}`);
});

test('every token group resolves — no dangling references', () => {
  // A token that reads from another group is the one way this system can break
  // silently (the name exists, the key does not). Walk them all.
  const groups = {
    PALETTE, SURFACES, THEME, BUTTON_SKINS, TONES, HP_RAMP, COMBAT_FX,
    PANEL_ACCENTS, FONTS, RADII, BORDERS, SHADOWS, MOTION, SPACING,
    WEIGHTS, CONNECTION_STATES, CTA_STATES, SEMANTIC, SEMANTIC_CSS,
    CSS_FONTS, ART, BRAND, PROFILE_ACCENTS,
  };
  for (const [name, group] of Object.entries(groups)) {
    assert.ok(group && typeof group === 'object', `${name} must be an object`);
    const undef = Object.entries(group).filter(([k, v]) => v === undefined).map(([k]) => k);
    assert.deepStrictEqual(undef, [], `${name} has undefined members: ${undef.join(',')}`);
  }
});

// ---------------------------------------------------------------------------
// 3. The hardening: literals are gone from the component layer.
// ---------------------------------------------------------------------------
test('no UI/scene module hard-codes a colour it should be importing', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) check(full);
    }
  };
  const check = (file) => {
    const src = fs.readFileSync(file, 'utf8');
    const hexes = src.match(/0x[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{6}\b/g) || [];
    if (hexes.length) offenders.push([path.relative(root, file), hexes.length]);
  };
  walk(path.join(root, 'src/ui'));
  walk(path.join(root, 'src/scenes'));

  // NO EXCEPTIONS. During the pass there were module-by-module stalls on the
  // theory that some values "need" to be local (the boot screen's CSS, BootScene's
  // procedural textures, OrbitalBackdrop's nebula). All of them turned out to
  // belong in a token group, so the rule is now absolute: the UI layer owns no
  // colours. `src/config/` is the only place a hex literal may appear.
  assert.deepStrictEqual(
    offenders, [],
    `hard-coded colours remain: ${offenders.map(([f, n]) => `${f}(${n})`).join(', ')}`,
  );
});

test('the font family is never re-typed outside the theme', () => {
  const offenders = [];
  const scan = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(full);
      else if (entry.name.endsWith('.js')) {
        const src = fs.readFileSync(full, 'utf8');
        const hits = (src.match(/"Trebuchet MS"|"Segoe UI"/g) || []).length;
        if (hits) offenders.push([path.relative(root, full), hits]);
      }
    }
  };
  scan(path.join(root, 'src/ui'));
  scan(path.join(root, 'src/scenes'));
  assert.deepStrictEqual(offenders, [],
    `font-family strings re-typed outside the theme: ${offenders.map(([f, n]) => `${f}(${n})`).join(', ')}`);
});

test('every consumer config resolves its tokens (no undefined leaves)', async () => {
  // The failure mode this catches: a config module references a token that does
  // not exist, producing `undefined` in a leaf. Nothing throws at import time,
  // the existing suite still passes, and the game crashes the first time a
  // widget reaches for the value (`Cannot read properties of undefined`).
  // That happened twice during this pass, so it earns a permanent guard.
  const files = [
    '../src/config/netConfig.js',
    '../src/config/weapons.js',
    '../src/config/gameConfig.js',
    '../src/config/cameraConfig.js',
    '../src/config/lobbyConfig.js',
    '../src/config/uiTheme.js',
  ];
  for (const file of files) {
    const mod = await import(new URL(file, import.meta.url).href);
    for (const [exportName, value] of Object.entries(mod)) {
      if (!value || typeof value !== 'object') continue;
      const bad = [];
      const walk = (o, p) => {
        for (const [k, v] of Object.entries(o)) {
          const at = `${p}.${k}`;
          if (v === undefined) { bad.push(at); continue; }
          if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, at);
        }
      };
      walk(value, exportName);
      assert.deepStrictEqual(bad, [],
        `${file} exports "${exportName}" with undefined members: ${bad.join(', ')}`);
    }
  }
});

test('keyed lookup tables carry every key their consumer indexes', () => {
  // A keyed style table is an INTERFACE. Renaming a key is a breaking change
  // that no type checker catches: the lookup returns `undefined` and the caller
  // crashes the first time that hazard appears. `ART.hazards.default` was
  // renamed during this pass and the arena stopped loading.
  const consumers = {
    'ART.hazards': { keys: ['coolant', 'acid', 'default'], table: ART.hazards },
  };
  for (const [name, { keys, table }] of Object.entries(consumers)) {
    for (const key of keys) {
      assert.notStrictEqual(table[key], undefined, `${name} is missing the "${key}" key`);
      assert.strictEqual(typeof table[key], 'number', `${name}.${key} must be a packed colour`);
    }
  }
});

console.log('\ndesign token checks done');
