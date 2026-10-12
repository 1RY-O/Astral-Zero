/**
 * Astral Zero — HomeScene reference-homepage construction + honesty test.
 * =========================================================
 * Proves the redesigned homepage ASSEMBLES at every tier and keeps its
 * functional promises without a browser:
 *
 *   1. Builds on wide/medium/compact: header, 5-entry nav (incl. an honest
 *      SOON missions entry — no dead buttons, no invented routes), party +
 *      friends panels (reused lobby widgets), horizontal mode cards, yellow
 *      FIND MATCH CTA, single status line, season-coming-soon + squad strips.
 *   2. Panels fit the 1280x720 design surface without overlapping.
 *   3. CTA + status derive from the shared resolveCta machine (offline reads
 *      OFFLINE/disabled; a live room reads LOADING/disabled).
 *   4. Balances are honest zeroes (no currency system exists to invent from).
 *   5. Teardown releases listeners + widgets (no duplicate match-ready).
 *
 * Run with: npm run test:home
 */
import assert from 'node:assert';

// ---- scene stub (mirrors lobby-scene.test.mjs) -----------------------------
class Gfx {
  constructor() { this.ops = 0; this.scaleX = 1; this.alpha = 1; }
  fillStyle() { this.ops++; return this; } fillRect() { this.ops++; return this; }
  fillRoundedRect() { this.ops++; return this; } fillCircle() { this.ops++; return this; }
  strokeRect() { this.ops++; return this; } strokeRoundedRect() { this.ops++; return this; }
  beginPath() { this.ops++; return this; } arc() { this.ops++; return this; }
  ellipse() { this.ops++; return this; } closePath() { this.ops++; return this; }
  strokePath() { this.ops++; return this; } fillPath() { this.ops++; return this; }
  strokeCircle() { this.ops++; return this; } lineStyle() { this.ops++; return this; }
  moveTo() { this.ops++; return this; } lineTo() { this.ops++; return this; }
  clear() { this.ops++; return this; }
  setDepth() { return this; } setScrollFactor() { return this; }
  setPosition() { return this; } setScale(s) { this.scaleX = s; return this; }
  setVisible(v) { this.visible = v; return this; } setAlpha(a) { this.alpha = a; return this; }
  destroy() { this.destroyed = true; }
}
const HANDLERS = Symbol('handlers');
class Obj {
  constructor(o = {}) { Object.assign(this, o); this.alpha = 1; this.scaleX = 1; this.visible = true; }
  setDepth() { return this; } setScrollFactor() { return this; } setOrigin() { return this; }
  setVisible(v) { this.visible = v; return this; } setAlpha(a) { this.alpha = a; return this; }
  setPosition(x, y) { this.x = x; this.y = y; return this; }
  setScale(s) { this.scaleX = s; return this; }
  setColor(c) { this.color = c; return this; } setText(t) { this.text = t; return this; }
  setInteractive() { this.interactive = true; return this; }
  setWordWrapWidth() { return this; } setAlign() { return this; } setStroke() { return this; }
  setFontSize() { return this; } add() { return this; } setSize() { return this; }
  setX(x) { this.x = x; return this; } setY(y) { this.y = y; return this; }
  setFillStyle() { return this; } setTextColor() { return this; }
  setPadding() { return this; } setFixedSize() { return this; }
  setOrigin(x, y) { this.originX = x; this.originY = y; return this; }
  setDisplaySize() { return this; } setFlipX() { return this; } setFlipY() { return this; }
  setRotation() { return this; } setTint() { return this; } clearTint() { return this; }
  setActive() { return this; } setName() { return this; } setData() { return this; }
  getData() { return undefined; } getBounds() { return { x: this.x, y: this.y, width: 0, height: 0 }; }
  disableInteractive() { this.interactive = false; return this; }
  destroy() { this.destroyed = true; }
  on(ev, fn) { (this[HANDLERS] ||= {})[ev] = fn; return this; }
}
class Text extends Obj { constructor(x, y, s, st = {}) { super({ x, y, style: st }); this.text = s; } }

function makeScene(gameW = 1280) {
  const noopTimer = { remove() {}, addEvent: () => noopTimer, delayedCall: () => noopTimer };
  return {
    add: {
      graphics: () => new Gfx(),
      text: (x, y, s, st) => new Text(x, y, s, st),
      image: (x, y) => new Obj({ x, y }),
      rectangle: (x, y, w, h, c) => new Obj({ x, y, w, h, c }),
      circle: (x, y, r, c) => new Obj({ x, y, r, c }),
      ellipse: (x, y, w, h, c) => new Obj({ x, y, w, h, c }),
      star: () => new Obj({}),
      container: (x, y, list) => new Obj({ x, y, list: list || [] }),
      zone: (x, y, w, h) => { const z = new Obj({ x, y, width: w, height: h }); z.input = { enabled: true, cursor: 'pointer' }; z.isOver = false; return z; },
    },
    tweens: { add: () => ({ stop() {}, remove() {} }) },
    time: { now: 0, ...noopTimer },
    scale: { gameSize: { width: gameW, height: 720 }, displaySize: { width: gameW, height: 720 } },
    input: {
      keyboard: { addKey: () => ({ isDown: false }), on() {}, off() {}, addCapture() {} },
      on() {}, off() {},
      activePointer: { x: 640, y: 360, worldX: 640, worldY: 360, isDown: false },
    },
    game: { canvas: { parentElement: null } },
    Math: null,
    events: { once() {}, on() {}, off() {} },
    scene: { start() {}, isActive: () => false },
  };
}

globalThis.document = { createElement: () => ({ style: { cssText: '' }, setAttribute() {}, addEventListener() {}, remove() {}, focus() {}, blur() {}, select() {}, value: '' }) };
globalThis.window = { location: { search: '?skipName', href: '' }, localStorage: { getItem: () => 'Tester', setItem() {} } };
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });

const { HomeScene } = await import('../src/scenes/HomeScene.js');
const { getHomeBalances } = await import('../src/scenes/HomeScene.js');
const { DESIGN } = await import('../src/config/viewportConfig.js');
const { MODE_ORDER } = await import('../src/config/lobbyConfig.js');

let pass = 0;
const ok = (name, fn) => { fn(); pass += 1; console.log(`PASS  ${name}`); };

function buildHome(gameW = 1280) {
  const scene = makeScene(gameW);
  const home = new HomeScene();
  home.sys = { game: { canvas: { parentElement: null } } };
  Object.assign(home, { scale: scene.scale, add: scene.add, tweens: scene.tweens, time: scene.time, input: scene.input, events: scene.events, game: scene.game });
  home.create();
  return { home, scene };
}

function panelBoxes(home) {
  const out = [];
  if (home.partyPanel) out.push(['party', home.partyPanel.panel]);
  if (home.friendsPanel) out.push(['friends', home.friendsPanel.panel]);
  if (home.modePanel) out.push(['mode', home.modePanel]);
  return out;
}

console.log('\n--- homepage construction ---');

ok('builds on wide: header, 5 nav entries, 3 panels, CTA, strips', () => {
  const { home } = buildHome(1280);
  assert.strictEqual(home.tier, 'wide');
  assert.ok(home.logo, 'logo');
  assert.ok(home.profile, 'profile');
  assert.ok(home.statusPill, 'status pill');
  assert.ok(home.menuButton, 'settings button');
  assert.strictEqual(home.currencyPills.length, 3, 'three currency pills');
  assert.strictEqual(home.navItems.length, 5, 'five nav entries (home/play/friends/missions/settings)');
  assert.ok(home.partyPanel && home.friendsPanel && home.modePanel, 'all three panels');
  assert.strictEqual(Object.keys(home.modeCards).length, MODE_ORDER.length, 'one card per mode');
  assert.ok(home.primary, 'FIND MATCH CTA');
  assert.ok(home.statusLine, 'single status line');
  assert.ok(home.seasonTitle && home.squadTitle, 'season + squad strips');
  home._teardown();
});

ok('builds on medium (2 columns + friends strip)', () => {
  const { home } = buildHome(800);
  assert.strictEqual(home.tier, 'medium');
  assert.strictEqual(home.navItems.length, 5);
  assert.ok(home.partyPanel && home.friendsPanel && home.modePanel);
  assert.strictEqual(Object.keys(home.modeCards).length, MODE_ORDER.length);
  home._teardown();
});

ok('builds on compact (mode + party; friends via nav)', () => {
  const { home } = buildHome(375);
  assert.strictEqual(home.tier, 'compact');
  assert.strictEqual(home.navItems.length, 5);
  assert.ok(home.modePanel && home.partyPanel, 'primary panels present');
  assert.strictEqual(home.friendsPanel, null, 'friends list lives in the lobby on phones');
  home._teardown();
});

console.log('\n--- layout fits the design surface ---');

ok('no panel overflows 1280x720 and none overlap', () => {
  for (const w of [1280, 800, 375]) {
    const { home } = buildHome(w);
    const boxes = panelBoxes(home);
    assert.ok(boxes.length >= 2, `panels exist at ${w}`);
    for (const [name, p] of boxes) {
      assert.ok(p.x >= 0 && p.y >= 0, `${name} origin at ${w}`);
      assert.ok(p.x + p.width <= DESIGN.width + 0.5, `${name} overflows right at ${w}`);
      assert.ok(p.y + p.height <= DESIGN.height + 0.5, `${name} overflows bottom at ${w}`);
    }
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const [an, a] = boxes[i];
        const [bn, b] = boxes[j];
        const overlapX = a.x < b.x + b.width && b.x < a.x + a.width;
        const overlapY = a.y < b.y + b.height && b.y < a.y + a.height;
        assert.ok(!(overlapX && overlapY), `${an} overlaps ${bn} at ${w}`);
      }
    }
    home._teardown();
  }
});

console.log('\n--- honesty: one status, honest CTA, honest balances ---');

ok('missions is marked SOON and never a dead button', () => {
  const { home } = buildHome(1280);
  const soon = home.navButtons.missions;
  assert.ok(soon, 'missions entry exists');
  assert.match(soon.sublabel.text, /SOON/, 'visibly marked coming soon');
  let toasted = null;
  home.toasts.show = (tone, text) => { toasted = text; };
  soon.onClick();
  assert.ok(toasted && /coming soon/i.test(toasted), 'explains itself instead of leading nowhere');
  home._teardown();
});

ok('balances are honest zeroes (no invented economy)', () => {
  const balances = getHomeBalances();
  assert.strictEqual(balances.length, 3);
  for (const b of balances) {
    assert.strictEqual(b.balance, 0, `${b.id} is 0`);
    assert.strictEqual(b.available, false, `${b.id} is not spendable`);
  }
  const { home } = buildHome(1280);
  for (const pill of home.currencyPills) {
    assert.match(pill.sublabel.text, /SOON/, 'pill marked SOON');
  }
  home._teardown();
});

ok('offline CTA reads OFFLINE and is disabled (never fake-ready)', () => {
  const { home } = buildHome(1280);
  home.net.state.connection = 'offline';
  home.net.state.room = null;
  home.net.state.queue = null;
  home._refreshMode();
  assert.strictEqual(home.primary.label.text, 'OFFLINE');
  assert.strictEqual(home.primary.enabled, false, 'disabled while offline');
  home._teardown();
});

ok('a live room reads LOADING/disabled; cleared room reads FIND MATCH', () => {
  const { home } = buildHome(1280);
  home.net.state.connection = 'online';
  home.net.state.contractOk = true;
  home.net.state.room = { roomId: 'r1' };
  home._refreshMode();
  assert.strictEqual(home.primary.label.text, 'LOADING', 'seated → LOADING');
  home.net.state.room = null;
  home._refreshMode();
  assert.strictEqual(home.primary.label.text, 'FIND MATCH', 'cleared → FIND MATCH (never stuck)');
  home.net.state.connection = 'offline';
  home.net.state.contractOk = null;
  home._teardown();
});

ok('mode selection updates state and repaints the selected card', () => {
  const { home } = buildHome(1280);
  home.net.setMode('fFA');
  assert.strictEqual(home.net.state.selectedMode, 'ffa');
  home._refreshMode();
  assert.ok(home.modeCards.ffa.selected, 'ffa card selected');
  assert.strictEqual(home.modeCrowns.ffa.visible, true, 'crown marks the selection (not colour-only)');
  home._teardown();
});

console.log('\n--- lifecycle ---');

ok('teardown detaches listeners (no duplicate match-ready)', () => {
  const { home } = buildHome(1280);
  const withScene = home.net._listeners.get('match-ready')?.size ?? 0;
  assert.ok(withScene >= 1, 'scene subscribed to match-ready');
  home._teardown();
  const after = home.net._listeners.get('match-ready')?.size ?? 0;
  assert.ok(after < withScene, `teardown removed the scene handlers (${withScene} → ${after})`);
  // A second visit adds exactly one fresh set — visits never stack.
  const second = buildHome(1280);
  const again = second.home.net._listeners.get('match-ready')?.size ?? 0;
  assert.ok(again <= withScene, `second visit does not accumulate handlers (${again} <= ${withScene})`);
  second.home._teardown();
});

ok('update() drives the backdrop without throwing', () => {
  const { home } = buildHome(1280);
  assert.doesNotThrow(() => home.update(0, 16.67));
  home._teardown();
});

console.log(`\n✅ All homepage checks passed (${pass} groups).`);
process.exit(0);
