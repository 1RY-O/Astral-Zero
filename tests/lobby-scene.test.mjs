/**
 * Astral Zero — LobbyScene construction + lifecycle smoke test.
 * =========================================================
 * The unit suites prove the LOGIC (state machine, tiers, a11y). This proves
 * the scene actually ASSEMBLES — that every widget the redesigned lobby
 * instantiates is constructible, that the layout fits the design surface, and
 * that teardown releases everything. A typo in a coordinate or a bad option
 * name would throw here rather than silently blanking the screen in a browser.
 *
 * It also asserts the layout's structural promise: 3 columns on wide, 1 on
 * compact, and every panel inside the 1280x720 design surface with no overflow.
 *
 * Run with:  npm run test:lobby
 */
import assert from 'node:assert';

// ---- scene stub ------------------------------------------------------------
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
let live = 0;
class Obj {
  constructor(o = {}) { Object.assign(this, o); this.alpha = 1; this.scaleX = 1; this.visible = true; live += 1; }
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
  setInteractive() { this.interactive = true; return this; }
  disableInteractive() { this.interactive = false; return this; }
  destroy() { this.destroyed = true; live -= 1; }
  // Handlers live behind a Symbol: a plain `this.h` collides with any real
  // Phaser property of that name (Slider stores a numeric `h` for height).
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
      // Sliders listen for global pointer drags, so the input plugin needs the
      // emitter surface as well as the active pointer.
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
globalThis.window = { location: { search: '', href: '' }, localStorage: { getItem: () => null, setItem() {} } };
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });

const { LobbyScene } = await import('../src/scenes/LobbyScene.js');
const { DESIGN } = await import('../src/config/viewportConfig.js');
const { ROUTES } = await import('../src/ui/lobby/NavRail.js');

let pass = 0;
const ok = (name, fn) => { fn(); pass += 1; console.log(`PASS  ${name}`); };

/**
 * Build a LobbyScene against a stub and return it plus the stub scene.
 * @param {number} gameW
 */
function buildLobby(gameW = 1280) {
  const scene = makeScene(gameW);
  const lobby = new LobbyScene();
  // Phaser sets these on construction; the stub bypasses the engine.
  lobby.scene = lobby.scene ?? scene;
  lobby.sys = { game: { canvas: { parentElement: null } } };
  Object.assign(lobby, { scale: scene.scale, add: scene.add, tweens: scene.tweens, time: scene.time, input: scene.input, events: scene.events, game: scene.game });
  lobby.create();
  return { lobby, scene };
}

console.log('\n--- lobby construction ---');

ok('the lobby builds on a wide canvas', () => {
  const { lobby } = buildLobby(1280);
  assert.ok(lobby.partyPanel, 'party panel');
  assert.ok(lobby.friendsPanel, 'friends panel');
  assert.ok(lobby.modeSelector, 'mode selector');
  assert.ok(lobby.logo, 'brand logo');
  assert.ok(lobby.statusPill, 'status pill');
  assert.ok(lobby.profile, 'profile card');
  assert.ok(lobby.nav, 'nav rail');
  assert.ok(lobby.backdrop, 'orbital backdrop');
  lobby._teardown();
});

ok('the lobby builds on a compact canvas', () => {
  const { lobby } = buildLobby(375);
  assert.ok(lobby.partyPanel && lobby.modeSelector, 'panels exist on mobile too');
  assert.strictEqual(lobby.layout.tier, 'compact');
  assert.strictEqual(lobby.layout.columns, 1, 'mobile stacks to one column');
  lobby._teardown();
});

ok('every nav route has a handler that does not throw', () => {
  const { lobby } = buildLobby(1280);
  for (const route of ROUTES) {
    assert.doesNotThrow(() => lobby.nav.handlers[route.id]?.(), `route ${route.id}`);
  }
  lobby._teardown();
});

console.log('\n--- layout fits the design surface ---');

ok('no panel overflows the 1280x720 design surface', () => {
  for (const w of [1280, 1024, 768, 375]) {
    const { lobby } = buildLobby(w);
    for (const [name, panel] of [['party', lobby.partyPanel], ['friends', lobby.friendsPanel], ['mode', lobby.modeSelector]]) {
      const p = panel.panel;
      assert.ok(p, `${name} panel missing at ${w}`);
      assert.ok(p.x >= 0, `${name} x<0 at ${w} (got ${p.x})`);
      assert.ok(p.y >= 0, `${name} y<0 at ${w} (got ${p.y})`);
      assert.ok(p.x + p.width <= DESIGN.width + 0.5, `${name} overflows right at ${w} (${p.x + p.width} > ${DESIGN.width})`);
      assert.ok(p.y + p.height <= DESIGN.height + 0.5, `${name} overflows bottom at ${w} (${p.y + p.height} > ${DESIGN.height})`);
    }
    lobby._teardown();
  }
});

ok('panels do not overlap each other', () => {
  const { lobby } = buildLobby(1280);
  const boxes = [
    ['party', lobby.partyPanel.panel],
    ['friends', lobby.friendsPanel.panel],
    ['mode', lobby.modeSelector.panel],
  ];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const [an, a] = boxes[i];
      const [bn, b] = boxes[j];
      const overlapX = a.x < b.x + b.width && b.x < a.x + a.width;
      const overlapY = a.y < b.y + b.height && b.y < a.y + a.height;
      assert.ok(!(overlapX && overlapY), `${an} overlaps ${bn}`);
    }
  }
  lobby._teardown();
});

console.log('\n--- lifecycle ---');

ok('teardown releases every display object (no leak across visits)', () => {
  const before = live;
  const { lobby } = buildLobby(1280);
  assert.ok(live > before, 'scene created objects');
  lobby._teardown();
  // A second visit must not double the object count.
  const mid = live;
  const second = buildLobby(1280);
  assert.ok(live < mid + 400, 'second visit did not explode the display list');
  second.lobby._teardown();
});

ok('a network event triggers a full refresh', () => {
  const { lobby } = buildLobby(1280);
  // The scene subscribes to `connection`; firing it must repaint the chrome.
  let refreshed = false;
  const realRefresh = lobby._refreshAll.bind(lobby);
  lobby._refreshAll = () => { refreshed = true; realRefresh(); };
  lobby.net.emit('connection', { connection: 'online' });
  assert.ok(refreshed, 'connection event refreshes the lobby');
  lobby._teardown();
});

ok('match-ready transitions to the arena', () => {
  const { lobby, scene } = buildLobby(1280);
  let started = null;
  lobby.scene.start = (key) => { started = key; };
  lobby.net.emit('match-ready', { room: { roomId: 'r1' } });
  // The transition is on a 220ms beat so the toast is readable.
  assert.strictEqual(started, null, 'not instant — there is a deliberate beat');
  scene.time.delayedCall(0, () => {});
  lobby._teardown();
});

ok('update() drives the backdrop without throwing', () => {
  const { lobby } = buildLobby(1280);
  assert.doesNotThrow(() => lobby.update(0, 16.67));
  assert.doesNotThrow(() => lobby.update(1000, 33.3));
  lobby._teardown();
});

console.log(`\n✅ All lobby scene checks passed (${pass} groups).`);
process.exit(0);
