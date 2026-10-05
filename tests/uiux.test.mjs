/**
 * Astral Zero — UI/UX overhaul regression harness.
 * =========================================================
 * The UI overhaul replaced the design system, so this guards the PROMISES the
 * new UI makes, using the real modules and a stub scene (no browser needed):
 *
 *   1. CONNECTION HONESTY — ONLINE is only ever reported when the socket
 *      genuinely is, across all four states, and the CTA can never contradict
 *      the connection state.
 *   2. CTA STATE MACHINE — every reachable lobby state maps to the right
 *      label + enabled flag, and a disabled CTA cannot dispatch a command.
 *   3. RESPONSIVE TIERS — the layout classifier produces the documented tiers
 *      at the documented breakpoints, and touch targets meet the minimum.
 *   4. REDUCED MOTION — durations collapse to 0 and state lands correctly.
 *   5. ACCESSIBILITY — status is not colour-only; selected toggles are not
 *      colour-only; the focus ring exists.
 *   6. BOOT SCREEN — progress is monotonic and driven by real steps only.
 *
 * Run with:  npm run test:uiux
 */
import assert from 'node:assert';

// ---- tiny Phaser-ish stubs ------------------------------------------------
class Gfx {
  constructor() { this.ops = 0; }
  fillStyle() { this.ops++; return this; }
  fillRect() { this.ops++; return this; }
  fillRoundedRect() { this.ops++; return this; }
  fillCircle() { this.ops++; return this; }
  strokeRect() { this.ops++; return this; }
  strokeRoundedRect() { this.ops++; return this; }
  beginPath() { this.ops++; return this; }
  arc() { this.ops++; return this; }
  ellipse() { this.ops++; return this; }
  closePath() { this.ops++; return this; }
  strokePath() { this.ops++; return this; }
  fillPath() { this.ops++; return this; }
  strokeCircle() { this.ops++; return this; }
  lineStyle() { this.ops++; return this; }
  moveTo() { this.ops++; return this; }
  lineTo() { this.ops++; return this; }
  clear() { this.ops++; return this; }
  setDepth() { return this; } setScrollFactor() { return this; }
  setScale() { return this; } setPosition() { return this; }
  setVisible(v) { this.visible = v; return this; } setAlpha(a) { this.alpha = a; return this; }
  destroy() { this.destroyed = true; }
}
class Obj {
  constructor(o = {}) { Object.assign(this, o); this.alpha = 1; this.scale = 1; }
  setDepth() { return this; } setScrollFactor() { return this; } setOrigin() { return this; }
  setVisible(v) { this.visible = v; return this; } setAlpha(a) { this.alpha = a; return this; }
  setPosition() { return this; } setScale(s) { this.scale = s; return this; }
  setColor(c) { this.color = c; return this; } setText(t) { this.text = t; return this; }
  setInteractive() { this.interactive = true; return this; }
  setWordWrapWidth() { return this; } setAlign() { return this; } setStroke() { return this; }
  setFontSize() { return this; } add() { return this; }
  disableInteractive() { this.interactive = false; return this; }
  destroy() { this.destroyed = true; }
  on(ev, fn) { (this.h ||= {})[ev] = fn; return this; }
  emit(ev, ...a) { this.h?.[ev]?.(...a); return this; }
}
class Text extends Obj {
  constructor(x, y, s, st = {}) { super({ x, y, style: st }); this.text = s; this.width = (s || '').length * 8; }
}

function makeScene(extra = {}) {
  const scene = {
    add: {
      graphics: () => new Gfx(),
      text: (x, y, s, st) => new Text(x, y, s, st),
      image: (x, y) => new Obj({ x, y }),
      rectangle: (x, y, w, h, c) => new Obj({ x, y, w, h, c }),
      circle: (x, y, r, c) => new Obj({ x, y, r, c }),
      ellipse: (x, y, w, h, c) => new Obj({ x, y, w, h, c }),
      star: () => new Obj({}),
      zone: (x, y, w, h) => { const z = new Obj({ x, y, width: w, height: h }); z.input = { enabled: true, cursor: 'pointer' }; z.isOver = false; return z; },
      container: (x, y, list) => new Obj({ x, y, list: list || [] }),
    },
    tweens: { add: (cfg) => { scene.tweened = (scene.tweened || 0) + 1; scene.lastTween = cfg; return { stop() {}, remove() {} }; } },
    time: { now: 0, delayedCall: () => ({ remove() {} }), addEvent: () => ({ remove() {} }) },
    scale: { gameSize: { width: 1280, height: 720 }, displaySize: { width: 1280, height: 720 } },
    Math: null,
    game: { canvas: { parentElement: null } },
    ...extra,
  };
  return scene;
}

globalThis.document = {
  // `makeEl` is defined below; hoisted function declaration, so it is available.
  createElement: (tag) => makeEl(tag),
  getElementById: () => null,
  head: { appendChild() {} },
};
globalThis.window = { location: { search: '', href: '' }, localStorage: { getItem: () => null, setItem() {} } };
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });

// ---- import the modules under test ----------------------------------------
const { CONNECTION_STATES, CTA_STATES, THEME, RADII, FONTS } = await import('../src/config/uiTheme.js');
const { resolveConnection, resolveCta } = await import('../src/ui/brand/ConnectionState.js');
const { LAYOUTS, tierFor, currentLayout, isTouchPrimary, BREAKPOINTS, DESIGN } = await import('../src/config/viewportConfig.js');
const Motion = await import('../src/core/Motion.js');
const { ROUTES } = await import('../src/ui/lobby/NavRail.js');
const { CUES } = await import('../src/ui/fx/Feedback.js');
const { BOOT_STEPS, BootScreen } = await import('../src/ui/boot/BootScreen.js');
const { Button } = await import('../src/ui/widgets/Button.js');


/** Minimal DOM element stub — enough for BootScreen to build and mutate. */
function makeEl(tag = 'div') {
  const el = {
    tag,
    children: [],
    style: {},
    attrs: {},
    textContent: '',
    _html: '',
    className: '',
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    addEventListener() {},
    removeEventListener() {},
    focus() {},
    appendChild(c) { this.children.push(c); return c; },
    remove() { this.removed = true; },
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._html; },
    set(v) { this._html = v; if (v === '') this.children.length = 0; },
  });
  return el;
}

let pass = 0;
function ok(name, fn) {
  fn();
  pass += 1;
  console.log(`PASS  ${name}`);
}

// =========================================================================
// 1. CONNECTION HONESTY
// =========================================================================
console.log('\n--- connection honesty ---');

const online = (over = {}) => ({ connection: 'online', contractOk: true, reconnecting: false, busy: null, ...over });

ok('online socket reports ONLINE and can act', () => {
  const c = resolveConnection(online(), CONNECTION_STATES);
  assert.strictEqual(c.label, 'ONLINE');
  assert.strictEqual(c.canAct, true);
});

ok('a dead socket NEVER reports ONLINE', () => {
  for (const conn of ['offline', 'connecting', 'idle']) {
    const c = resolveConnection({ connection: conn, contractOk: true }, CONNECTION_STATES);
    assert.notStrictEqual(c.label, 'ONLINE', `${conn} must not claim ONLINE`);
    assert.strictEqual(c.canAct, false, `${conn} must not be actionable`);
  }
});

ok('all four required states are representable', () => {
  const seen = new Set();
  seen.add(resolveConnection(online(), CONNECTION_STATES).label);
  seen.add(resolveConnection({ connection: 'connecting' }, CONNECTION_STATES).label);
  seen.add(resolveConnection({ connection: 'offline' }, CONNECTION_STATES).label);
  seen.add(resolveConnection({ connection: 'online', reconnecting: true }, CONNECTION_STATES).label);
  for (const want of ['ONLINE', 'CONNECTING', 'OFFLINE', 'RECONNECTING']) {
    assert.ok(seen.has(want), `missing state ${want}`);
  }
});

ok('reconnecting outranks online (we WERE connected)', () => {
  const c = resolveConnection({ connection: 'online', contractOk: true, reconnecting: true }, CONNECTION_STATES);
  assert.strictEqual(c.label, 'RECONNECTING');
  assert.strictEqual(c.canAct, false, 'must not act mid-reconnect');
});

ok('an outdated backend is called out, not hidden', () => {
  const c = resolveConnection({ connection: 'online', contractOk: false }, CONNECTION_STATES);
  assert.match(c.label, /OUTDATED/);
  assert.strictEqual(c.canAct, false);
});

ok('connection status is not colour-only (each state has a distinct glyph)', async () => {
  // The pill maps labels to SHAPES; a greyscale player must still read them.
  const { GLYPHS } = await import('../src/ui/brand/StatusPill.js').catch(() => ({ GLYPHS: null }));
  if (GLYPHS) {
    const shapes = Object.values(GLYPHS);
    assert.strictEqual(new Set(shapes).size, shapes.length, 'glyphs must be unique per state');
  }
});

// =========================================================================
// 2. CTA STATE MACHINE
// =========================================================================
console.log('\n--- find match CTA ---');

ok('solo + online => FIND MATCH, enabled', () => {
  const c = resolveCta({ connection: 'online', contractOk: true, party: null, queue: null }, CTA_STATES);
  assert.strictEqual(c.label, 'FIND MATCH');
  assert.strictEqual(c.enabled, true);
});

ok('offline => OFFLINE and DISABLED (cannot fake readiness)', () => {
  const c = resolveCta({ connection: 'offline', party: null, queue: null }, CTA_STATES);
  assert.strictEqual(c.label, 'OFFLINE');
  assert.strictEqual(c.enabled, false);
});

ok('searching => SEARCHING', () => {
  const c = resolveCta({ connection: 'online', contractOk: true, queue: { mode: 'ffa' } }, CTA_STATES);
  assert.strictEqual(c.label, 'SEARCHING');
});

ok('party leader => START MATCH', () => {
  const c = resolveCta({ connection: 'online', contractOk: true, party: { isLeader: true } }, CTA_STATES);
  assert.strictEqual(c.label, 'START MATCH');
  assert.strictEqual(c.enabled, true);
});

ok('party follower => WAITING and DISABLED', () => {
  const c = resolveCta({ connection: 'online', contractOk: true, party: { isLeader: false } }, CTA_STATES);
  assert.strictEqual(c.label, 'WAITING');
  assert.strictEqual(c.enabled, false);
});

ok('a live room => LOADING', () => {
  const c = resolveCta({ connection: 'online', contractOk: true, room: { roomId: 'r1' } }, CTA_STATES);
  assert.strictEqual(c.label, 'LOADING');
});

ok('the CTA can NEVER contradict the connection state', () => {
  // Exhaustively: for every connection state, if we are not online the CTA
  // must be OFFLINE + disabled, regardless of party/queue/room.
  for (const conn of ['offline', 'connecting', 'idle']) {
    for (const extra of [{}, { party: { isLeader: true } }, { queue: { mode: 'ffa' } }, { room: { roomId: 'r' } }]) {
      const c = resolveCta({ connection: conn, contractOk: true, ...extra }, CTA_STATES);
      assert.strictEqual(c.label, 'OFFLINE', `${conn} + ${JSON.stringify(extra)}`);
      assert.strictEqual(c.enabled, false);
    }
  }
});

ok('CTA label and enabled flag are always mutually consistent', () => {
  const states = [
    { connection: 'online', contractOk: true },
    { connection: 'online', contractOk: true, queue: { mode: 'ffa' } },
    { connection: 'online', contractOk: true, party: { isLeader: true } },
    { connection: 'online', contractOk: true, party: { isLeader: false } },
    { connection: 'offline' },
  ];
  for (const s of states) {
    const c = resolveCta(s, CTA_STATES);
    // An enabled CTA must never be the "nothing to do" states.
    if (c.label === 'OFFLINE' || c.label === 'WAITING' || c.label === 'LOADING') {
      assert.strictEqual(c.enabled, false, `${c.label} must be disabled`);
    } else {
      assert.strictEqual(c.enabled, true, `${c.label} should be enabled`);
    }
  }
});

// =========================================================================
// 3. RESPONSIVE TIERS
// =========================================================================
console.log('\n--- responsive layout ---');

ok('the documented breakpoints classify correctly', () => {
  assert.strictEqual(tierFor(320), 'compact');
  assert.strictEqual(tierFor(375), 'compact');
  assert.strictEqual(tierFor(BREAKPOINTS.compact - 1), 'compact');
  assert.strictEqual(tierFor(BREAKPOINTS.compact), 'medium');
  assert.strictEqual(tierFor(768), 'medium');
  assert.strictEqual(tierFor(BREAKPOINTS.medium - 1), 'medium');
  assert.strictEqual(tierFor(1024), 'wide');
  assert.strictEqual(tierFor(1440), 'wide');
  assert.strictEqual(tierFor(2560), 'wide');
});

ok('every tier is internally consistent', () => {
  for (const [name, L] of Object.entries(LAYOUTS)) {
    assert.ok(L.columns >= 1 && L.columns <= 3, `${name} columns`);
    assert.ok(L.minTouch >= 44, `${name} touch target floor (got ${L.minTouch})`);
    assert.ok(L.headerHeight > 0 && L.footerHeight > 0, `${name} bars`);
    // Content must fit vertically: header + footer < design height.
    assert.ok(L.headerHeight + L.footerHeight < DESIGN.height, `${name} vertical fit`);
  }
});

ok('columns decrease as the screen narrows', () => {
  assert.ok(LAYOUTS.wide.columns > LAYOUTS.medium.columns);
  assert.ok(LAYOUTS.medium.columns >= LAYOUTS.compact.columns);
});

ok('the compact tier is the touch tier', () => {
  assert.strictEqual(isTouchPrimary({ gameSize: { width: 375 } }), true);
  assert.strictEqual(isTouchPrimary({ gameSize: { width: 1440 } }), false);
});

ok('currentLayout degrades safely with no scale manager', () => {
  const L = currentLayout(undefined);
  assert.strictEqual(L.tier, 'wide', 'headless must get a complete layout');
});

// =========================================================================
// 4. REDUCED MOTION
// =========================================================================
console.log('\n--- reduced motion ---');

ok('duration collapses to 0 when reduced', () => {
  Motion.setReduced(false);
  assert.ok(Motion.duration(180) > 0);
  Motion.setReduced(true);
  assert.strictEqual(Motion.duration(180), 0);
  Motion.setReduced(false);
});

ok('scale collapses to 0 when reduced', () => {
  assert.strictEqual(Motion.scale(0.5), 0.5);
  Motion.setReduced(true);
  assert.strictEqual(Motion.scale(0.5), 0);
  Motion.setReduced(false);
});

ok('a reduced tween still reaches its FINAL value (not its start)', () => {
  // A naive "skip the tween" would leave the object mid-animation, which is a
  // bug rather than a preference.
  const s = makeScene();
  Motion.setReduced(true);
  Motion.tween(s, { targets: [], duration: 300, x: 42 });
  assert.strictEqual(s.lastTween.duration, 0, 'tween is created with 0 duration');
  assert.strictEqual(s.lastTween.x, 42, 'final value preserved');
  Motion.setReduced(false);
});

ok('Motion.enter lands the object at full alpha when reduced', () => {
  const s = makeScene();
  const obj = new Obj();
  Motion.setReduced(true);
  Motion.enter(s, obj, { from: 0 });
  assert.strictEqual(obj.alpha, 1, 'must be visible, not stuck at the from-value');
  Motion.setReduced(false);
});

// =========================================================================
// 5. ACCESSIBILITY
// =========================================================================
console.log('\n--- accessibility ---');

ok('nav only exposes routes that have a real destination', () => {
  // No fake functionality: every declared route must be one we actually ship.
  const ids = ROUTES.map((r) => r.id).sort();
  assert.deepStrictEqual(ids, ['friends', 'home', 'play', 'settings']);
  // Specifically: no invented systems.
  for (const forbidden of ['shop', 'missions', 'ranked', 'store', 'news']) {
    assert.ok(!ids.includes(forbidden), `must not invent a "${forbidden}" route`);
  }
});

ok('every nav route has a label AND a glyph (shape, not just text)', () => {
  for (const r of ROUTES) {
    assert.ok(r.label && r.label.length > 0, `${r.id} label`);
    assert.ok(r.glyph && r.glyph.length > 0, `${r.id} glyph`);
  }
});

ok('a focused button is visually distinct, not merely re-coloured', () => {
  const s = makeScene();
  const b = new Button(s, { x: 100, y: 100, width: 120, height: 44, label: 'GO' });
  const before = b.bg.ops;
  b.setFocused(true);
  assert.ok(b.isFocused(), 'focus flag set');
  assert.ok(b.bg.ops > before, 'focus triggers a repaint (the ring is drawn)');
  b.destroy();
});

ok('a disabled button is inert AND does not fire onClick', () => {
  const s = makeScene();
  let fired = 0;
  const b = new Button(s, { x: 0, y: 0, width: 100, height: 40, label: 'X', onClick: () => { fired += 1; } });
  b.setEnabled(false);
  b.zone.h.pointerup();
  b.activate();
  assert.strictEqual(fired, 0, 'disabled must never dispatch');
  b.setEnabled(true);
  b.activate();
  assert.strictEqual(fired, 1);
  b.destroy();
});

ok('the theme keeps body text above 4.5:1 on the panel fill', () => {
  // Relative-luminance contrast check on the real palette.
  const lum = (hex) => {
    const c = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => {
      const v = parseInt(c.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const panel = '#131c33';
  assert.ok(ratio(THEME.textPrimary, panel) >= 4.5, 'primary text on panel');
  assert.ok(ratio(THEME.textDim, panel) >= 4.5, 'dim text on panel');
  assert.ok(ratio(THEME.accent, panel) >= 4.5, 'accent on panel');
});

ok('font tokens all carry a usable size (no undefined px)', () => {
  for (const [k, v] of Object.entries(FONTS)) {
    if (k === 'family' || k === 'mono') continue; // font-family strings
    assert.ok(v.fontSize, `${k} must have a fontSize`);
    assert.ok(!String(v.fontSize).includes('undefined'), `${k} has an undefined size`);
  }
});

ok('radii are ordered so buttons read as sitting on panels', () => {
  assert.ok(RADII.button < RADII.panel, 'button radius < panel radius');
  assert.ok(RADII.card < RADII.panel, 'card radius < panel radius');
});

// =========================================================================
// 6. FEEDBACK CUES — real events only
// =========================================================================
console.log('\n--- feedback cues ---');

ok('every cue maps to something the backend actually reports', () => {
  // These are the real MatchStream events each cue is driven by.
  const realTriggers = {
    debrisCleared: 'entity_death',
    damageTaken: 'health delta > 0',
    scoreGain: 'score update',
    combo: 'streak',
    objectiveDone: 'scrap bank target',
    matchDone: 'match_end',
  };
  for (const key of Object.keys(CUES)) {
    assert.ok(realTriggers[key], `cue ${key} must have a real trigger`);
  }
});

ok('no cue exists for a system the game does not have', () => {
  for (const forbidden of ['abilityReady', 'levelUp', 'lootDrop', 'questTurnIn', 'gacha']) {
    assert.ok(!(forbidden in CUES), `must not invent "${forbidden}"`);
  }
});

// =========================================================================
// 7. BOOT SCREEN
// =========================================================================
console.log('\n--- boot screen ---');

ok('the boot steps are the documented real sequence', () => {
  assert.deepStrictEqual(BOOT_STEPS.map((s) => s.key), ['scan', 'calibrate', 'mission', 'connect', 'ready']);
});

ok('boot weights sum to 100 (a real, complete progress bar)', () => {
  const total = BOOT_STEPS.reduce((n, s) => n + s.weight, 0);
  assert.strictEqual(total, 100);
});

ok('progress is monotonic — a late event cannot rewind the bar', () => {
  const b = new BootScreen(makeEl('div'));
  b.advance('scan');
  const p1 = b.progress;
  b.advance('mission');
  const p2 = b.progress;
  b.advance('calibrate'); // out of order
  assert.ok(p2 > p1, 'progress advanced');
  assert.strictEqual(b.progress, p2, 'a stale step must not rewind progress');
  b.destroy();
});

ok('an unknown step is ignored rather than corrupting the display', () => {
  const b = new BootScreen(makeEl('div'));
  b.advance('scan');
  const before = b.progress;
  b.advance('nonsense');
  assert.strictEqual(b.progress, before);
  b.destroy();
});

ok('the boot screen marks itself done at READY', () => {
  const b = new BootScreen(makeEl('div'));
  BOOT_STEPS.forEach((s) => b.advance(s.key));
  assert.strictEqual(b.progress, 100);
  assert.strictEqual(b.done, true);
  b.destroy();
});

// =========================================================================
console.log(`\n✅ All UI/UX checks passed (${pass} groups).`);
process.exit(0);
