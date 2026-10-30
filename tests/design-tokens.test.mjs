import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PALETTE,
  SEMANTIC,
  THEME_TOKENS,
  TYPOGRAPHY,
  MOTION,
  LAYOUT,
} from '../src/ui/tokens.js';
import { resolveTheme, THEME_CHOICES } from '../src/ui/theme.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const tokensCss = readFileSync(join(root, 'src/ui/tokens.css'), 'utf8');

function cssValue(name) {
  const match = tokensCss.match(new RegExp(`${name}:\\s*([^;]+);`));
  return match?.[1].trim();
}

test('brand palette is exactly the sanctioned six colours plus derived text variant', () => {
  assert.deepEqual(
    {
      sky300: PALETTE.sky300,
      sky400: PALETTE.sky400,
      sky500: PALETTE.sky500,
      pink400: PALETTE.pink400,
      pink500: PALETTE.pink500,
      white: PALETTE.white,
    },
    {
      sky300: '#7DD3FC',
      sky400: '#38BDF8',
      sky500: '#0EA5E9',
      pink400: '#FF5FB0',
      pink500: '#FF2D95',
      white: '#FFFFFF',
    },
  );
  assert.equal(PALETTE.pink500TextOnLight, '#E01A7A');
});

test('CSS tokens match the JavaScript palette', () => {
  assert.equal(cssValue('--sky-300'), PALETTE.sky300);
  assert.equal(cssValue('--sky-400'), PALETTE.sky400);
  assert.equal(cssValue('--sky-500'), PALETTE.sky500);
  assert.equal(cssValue('--pink-400'), PALETTE.pink400);
  assert.equal(cssValue('--pink-500'), PALETTE.pink500);
  assert.equal(cssValue('--white'), PALETTE.white);
  assert.equal(cssValue('--canvas-dark'), PALETTE.canvasDark);
  assert.equal(cssValue('--canvas-light'), PALETTE.canvasLight);
  assert.equal(cssValue('--ink'), PALETTE.ink);
});

test('semantic mapping keeps sky for the player and pink for danger', () => {
  assert.equal(SEMANTIC.player, PALETTE.sky400);
  assert.equal(SEMANTIC.tether, PALETTE.sky300);
  assert.equal(SEMANTIC.clean, PALETTE.sky400);
  assert.equal(SEMANTIC.danger, PALETTE.pink500);
  assert.equal(SEMANTIC.cascade, PALETTE.pink500);
  assert.equal(SEMANTIC.cta, PALETTE.pink500);
  assert.equal(THEME_TOKENS.light.danger, PALETTE.pink500TextOnLight);
});

test('legacy Solar Sentinel colours are gone from the token system', () => {
  for (const colour of ['#00f3ff', '#ff003c', '#ffc247', '#39ff88', '#ffd60a']) {
    assert.equal(tokensCss.toLowerCase().includes(colour), false, `${colour} still present`);
  }
});

test('design tokens cover required layout and motion values', () => {
  assert.equal(LAYOUT.tetherHitboxMultiplier, 2.5);
  assert.equal(LAYOUT.touchTargetMin, 44);
  assert.equal(MOTION.durationMicro, 160);
  assert.equal(MOTION.durationStandard, 320);
  assert.equal(MOTION.durationEntrance, 640);
  assert.equal(MOTION.easeEntrance, 'cubic-bezier(0.22, 1, 0.36, 1)');
  assert.match(TYPOGRAPHY.display, /Space Grotesk/);
  assert.match(TYPOGRAPHY.body, /Inter/);
});

test('theme preference accepts only system, dark, or light', () => {
  assert.deepEqual(THEME_CHOICES, ['system', 'dark', 'light']);
  assert.equal(resolveTheme('dark'), 'dark');
  assert.equal(resolveTheme('light'), 'light');
  assert.equal(resolveTheme('system'), 'dark');
});

test('UI source contains no raw hex colours outside the token modules', () => {
  const uiDir = join(root, 'src/ui');
  const offenders = [];
  for (const file of readdirSync(uiDir)) {
    if (!/\.(js|jsx|css)$/.test(file)) continue;
    if (file === 'tokens.js' || file === 'tokens.css') continue;
    const source = readFileSync(join(uiDir, file), 'utf8');
    if (/#[0-9a-f]{3,8}\b/i.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});
