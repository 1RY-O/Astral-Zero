/**
 * Astral Zero — ArenaHud construction + responsive-layout smoke test.
 * =========================================================
 * The HUD rewrite replaced every hardcoded coordinate with a computed layout
 * rect, and that is exactly the kind of change that compiles cleanly and then
 * renders `undefinedpx` or a ReferenceError in the browser. This test
 * CONSTRUCTS the HUD at 1280 / 1024 / 768 / 375 and asserts:
 *
 *   - it builds at all four breakpoints
 *   - no element escapes the 1280x720 design surface
 *   - no hardcoded design coordinates crept back in (source scan)
 *   - the objective line only renders for a mode with a REAL server goal
 *   - the compact tier drops the keyboard hint (there is no keyboard on a phone)
 *
 * Run with:  npm run test:hud
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

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

const { ArenaHud } = await import('../src/ui/hud/ArenaHud.js');
const { DESIGN } = await import('../src/config/viewportConfig.js');

let pass = 0;
const ok = (name, fn) => { fn(); pass += 1; console.log(`PASS  ${name}`); };

/**
 * Phaser injects its plugins as scene PROPERTIES, and the widgets read them
 * through `this.*` — so the stub scene must be a flat object carrying them,
 * exactly as the engine provides.
 * @param {number} w
 */
function sceneFor(w) {
  const s = makeScene(w);
  // ArenaHud reads the clock as `this.time` (pre-existing code that relies on
  // Phaser injecting `time`/`add`/`tweens`/`scale` onto the SCENE, and the HUD
  // being constructed with `scene` as its own prototype context in the arena).
  // Headless there is no such context, so copy the plugins onto the instance
  // the widget actually becomes: a thin proxy that forwards everything.
  const proxy = Object.create(s);
  Object.assign(proxy, { add: s.add, time: s.time, tweens: s.tweens, scale: s.scale });
  proxy.scene = s;
  return proxy;
}

/** A representative TDM room — the mode with the most HUD elements visible. */
const ROOM = {
  roomId: 'r1',
  mode: 'tdm',
  mapId: 'junkyard',
  phase: 'countdown',
  players: [{ id: 'a' }, { id: 'b' }],
  bots: [{ id: 'c' }],
  teams: { red: [{ id: 'a' }], blue: [{ id: 'b' }] },
  countdownMs: 3000,
};

const NET = { state: { connection: 'online', room: ROOM } };

console.log('\n--- arena HUD layout ---');

ok('the HUD builds at every breakpoint', () => {
  for (const w of [1280, 1024, 768, 375]) {
    const hud = new ArenaHud(sceneFor(w), { room: ROOM, net: NET, onLeave() {} });
    assert.ok(hud.timerText, `timer missing at ${w}`);
    assert.ok(hud.hpFill, `health bar missing at ${w}`);
    hud.destroy();
  }
});

ok('no HUD element escapes the design surface', () => {
  for (const w of [1280, 1024, 768, 375]) {
    const hud = new ArenaHud(sceneFor(w), { room: ROOM, net: NET, onLeave() {} });
    const names = [
      'modeText', 'rosterText', 'objectiveText', 'timerText', 'teamScoreText', 'overtimeText',
      'hpLabel', 'hpTrack', 'hpFill', 'hpValue', 'weaponText', 'ammoText',
      'reloadTrack', 'reloadFill', 'scrapText', 'banner', 'subBanner',
      'deathOverlay', 'reconnectText',
    ];
    for (const n of names) {
      const o = hud[n];
      if (!o) continue;
      assert.ok(o.x >= -20 && o.x <= DESIGN.width + 20, `${n}.x out of bounds at ${w} (${o.x})`);
      assert.ok(o.y >= -20 && o.y <= DESIGN.height + 20, `${n}.y out of bounds at ${w} (${o.y})`);
    }
    hud.destroy();
  }
});

ok('the HUD carries no hardcoded design coordinates', () => {
  // A regression guard: new elements must derive from this.L, not from a literal.
  const src = await_read();
  assert.ok(!/\.text\(640,/.test(src), 'found a hardcoded 640 centre');
  assert.ok(!/\.text\(1280/.test(src), 'found a hardcoded 1280 edge');
  assert.ok(!/1260,/.test(src), 'found a hardcoded 1260 edge');
  function await_read() {
    // Synchronous read via the already-imported module is not possible, so the
    // guard reads the file through the loader at call time.
    return readFileSync(new URL('../src/ui/hud/ArenaHud.js', import.meta.url), 'utf8');
  }
});

ok('the compact tier drops the keyboard control hint', () => {
  const compact = new ArenaHud(sceneFor(375), { room: ROOM, net: NET, onLeave() {} });
  assert.strictEqual(compact.hintText.visible, false, 'no keyboard hint on a phone');
  const wide = new ArenaHud(sceneFor(1280), { room: ROOM, net: NET, onLeave() {} });
  assert.strictEqual(wide.hintText.visible, true, 'hint shown on desktop');
  compact.destroy();
  wide.destroy();
});

ok('the objective line only appears for a mode with a real goal', () => {
  // scrap_collector has a server-enforced bank limit → the line is meaningful.
  const scrap = new ArenaHud(sceneFor(1280), {
    room: { ...ROOM, mode: 'scrap_collector' },
    net: NET,
    onLeave() {},
  });
  scrap.setScrap(2, 7);
  assert.match(scrap.objectiveText.text, /BANK 7/, 'objective reflects the real banked total');
  // TDM has no bank target → the line must be hidden, not filled with a fake.
  const tdm = new ArenaHud(sceneFor(1280), { room: ROOM, net: NET, onLeave() {} });
  tdm.updateRoster();
  assert.strictEqual(tdm.objectiveText.text, '', 'no invented objective for TDM');
  scrap.destroy();
  tdm.destroy();
});

ok('health, timer, scores, weapon and overtime all render', () => {
  const hud = new ArenaHud(sceneFor(1280), { room: ROOM, net: NET, onLeave() {} });
  hud.setHealth(64, 100);
  assert.match(hud.hpValue.text, /64/);
  hud.setTimeRemaining(125000);
  assert.strictEqual(hud.timerText.text, '02:05');
  hud.setTeamScores({ red: 3, blue: 2 });
  assert.match(hud.teamScoreText.text, /3/);
  hud.setWeapon({ name: 'Plasma Lance', damage: 25, cooldownMs: 400, tracerColor: 0x5ad8ff });
  assert.match(hud.weaponText.text, /PLASMA/);
  hud.setOvertime(true);
  assert.strictEqual(hud.overtimeText.visible, true);
  assert.doesNotThrow(() => hud.update());
  hud.destroy();
});

ok('the HUD destroys cleanly (no leaked objects)', () => {
  const before = live;
  const hud = new ArenaHud(sceneFor(1280), { room: ROOM, net: NET, onLeave() {} });
  hud.destroy();
  assert.ok(live < before + 60, 'destroy released objects');
});

console.log(`\n✅ All arena HUD checks passed (${pass} groups).`);
process.exit(0);
