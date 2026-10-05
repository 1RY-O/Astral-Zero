/**
 * Astral Zero — netcode integration test (Phase 3).
 * ============================================================
 * The unit suite (netcode.test.mjs) proves each module in isolation. This one
 * proves they work TOGETHER through a realistic match: a real MatchStream fed
 * by a fake socket, a real Prediction, a real Combat and a real BotBrain.
 *
 * It reconstructs ArenaScene's netcode responsibilities (input → snapshot →
 * reconcile → interpolate → combat → death) as a plain loop, so the exact
 * ordering and guard conditions the scene uses get exercised without a canvas.
 *
 * Run with: npm run test:net
 */

import { MatchStream } from '../src/net/MatchStream.js';
import { Prediction } from '../src/net/Prediction.js';
import { Combat } from '../src/combat/Combat.js';
import { BotBrain } from '../src/entities/BotBrain.js';
import { NET_EVENTS } from '../src/net/events.js';
import { Emitter } from '../src/core/Emitter.js';
import { NET_TICK, RECONCILIATION, HEALTH } from '../src/config/netConfig.js';

let failures = 0;
function ok(condition, message) {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${message}`);
  if (!condition) failures += 1;
}
function section(title) {
  console.log(`\n--- ${title} ---`);
}

/** Fake SocketClient that dispatches synchronously. */
class FakeSocket extends Emitter {
  constructor() {
    super();
    this.sent = [];
  }

  emit(event, payload) {
    this.sent.push({ event, payload });
    super.emit(event, payload);
  }

  /** Last payload emitted for an event, or null. */
  lastFor(event) {
    for (let i = this.sent.length - 1; i >= 0; i -= 1) {
      if (this.sent[i].event === event) return this.sent[i].payload;
    }
    return null;
  }
}

/**
 * Minimal stand-in for the parts of ArenaScene the netcode touches. Its frame()
 * mirrors the scene's real order exactly (see ArenaScene._update), so the
 * ordering guarantees the real scene relies on are actually tested here.
 */
class FakeArena {
  constructor(socket, { localId = 'me' } = {}) {
    this.socket = socket;
    this.net = { socket, state: { localId } };
    this.localId = localId;
    this.now = () => 1000;

    this.player = { x: 100, y: 600, hp: HEALTH.defaultMax, dead: false };
    this.actors = new Map();
    this.room = [];

    this.stream = new MatchStream(this.net, { now: () => this.now() });
    this.stream.start();
    this.prediction = new Prediction();
    this.sentPositions = new Map();
    this.lastReconciledSeq = -1;
    this.moveSeq = 0;

    this.events = [];
    this.stream.on('hit', (e) => this.events.push(['hit', e]));
    this.stream.on('death', (e) => this.events.push(['death', e]));
    this.stream.on('kill', (e) => this.events.push(['kill', e]));
    this.stream.on('spawn', (e) => this.events.push(['spawn', e]));
  }

  /** Live target list, mirroring ArenaScene._combatTargets. */
  getTargets() {
    return [...this.actors.values()]
      .filter((a) => a.id !== this.localId)
      .map((a) => {
        const sample = this.stream.sample(a.id);
        return {
          id: a.id,
          x: sample?.x ?? a.x,
          y: sample?.y ?? a.y,
          hp: a.hp,
          maxHp: 100,
          alive: a.alive,
          isBot: a.isBot,
        };
      });
  }

  _sendInput() {
    const seq = (this.moveSeq += 1);
    this.socket.emit(NET_EVENTS.PLAYER_MOVE, {
      moveX: 1,
      jumpHeld: false,
      jumpPressed: false,
      aimX: 900,
      aimY: 600,
      seq,
      x: Math.round(this.player.x),
      y: Math.round(this.player.y),
      timestamp: Date.now(),
    });
    this.sentPositions.set(seq, { x: this.player.x, y: this.player.y });
    while (this.sentPositions.size > RECONCILIATION.inputHistorySize) {
      this.sentPositions.delete(this.sentPositions.keys().next().value);
    }
  }

  _reconcile(delta) {
    const step = this.prediction.step(delta);
    this.player.x += step.x;
    this.player.y += step.y;

    const auth = this.stream.snapshots.latest(this.localId);
    if (!auth || auth.seq === this.lastReconciledSeq) return;
    this.lastReconciledSeq = auth.seq;

    const sent = this.sentPositions.get(auth.seq) ?? { x: this.player.x, y: this.player.y };
    const result = this.prediction.reconcile({ x: auth.x, y: auth.y, clientX: sent.x, clientY: sent.y });

    // Mirrors ArenaScene._applyReconciliation exactly: a 'decay' result needs
    // no action here because step() above already bleeds it off gradually,
    // while a 'snap' must clear any stale pending correction.
    if (result.action === 'snap') {
      this.player.x = auth.x;
      this.player.y = auth.y;
      this.prediction.reset();
    }
  }

  /** Interpolate remotes out of the snapshot buffer (no sprites here). */
  _updateRemotes() {
    for (const entity of this.room) {
      if (entity.id === this.localId) continue;
      const actor = this.actors.get(entity.id) ?? { ...entity, alive: true };
      const sample = this.stream.sample(entity.id);
      if (sample) {
        actor.x = sample.x;
        actor.y = sample.y;
        if (Number.isFinite(sample.hp)) actor.hp = sample.hp;
        if (Number.isFinite(sample.alive)) actor.alive = sample.alive;
      }
      this.actors.set(entity.id, actor);
    }
  }

  /**
   * One frame, in the same order as ArenaScene._update: predict → reconcile →
   * interpolate remotes → mirror authoritative health.
   * @returns {void}
   */
  frame() {
    const delta = 16.67;
    this._sendInput();
    this._reconcile(delta);
    this._updateRemotes(delta);
  }
}

// ===========================================================================
section('Prediction + reconciliation under a live stream');
// ===========================================================================
{
  const socket = new FakeSocket();
  const arena = new FakeArena(socket);
  let clock = 1000;
  arena.now = () => clock;
  arena.room = [{ id: 'me', x: 100, y: 600, hp: 100 }];

  socket.emit(NET_EVENTS.ENTITY_SNAPSHOT, {
    tick: 1,
    entities: [{ id: 'me', x: 100, y: 600, hp: 100, seq: 0 }],
  });

  // 120 frames where the server consistently trails our prediction by 3px.
  for (let i = 0; i < 120; i += 1) {
    arena.frame();
    clock += 16.67;
    socket.emit(NET_EVENTS.ENTITY_SNAPSHOT, {
      tick: i + 2,
      entities: [{ id: 'me', x: 100 + (i + 1) * 3, y: 600, hp: 100, seq: i + 1 }],
    });
  }

  ok(Number.isFinite(arena.player.x), 'player position stays finite across 120 disagreeing frames');
  ok(arena.prediction.stats.snaps === 0, '3px disagreement NEVER snaps');
  ok(arena.sentPositions.size <= RECONCILIATION.inputHistorySize + 1, 'input history stays bounded');
  ok(socket.lastFor(NET_EVENTS.PLAYER_MOVE)?.moveX === 1,
    'input payload carries intent (moveX) for an authoritative server');
  ok(socket.lastFor(NET_EVENTS.PLAYER_MOVE)?.seq > 100, 'input seq is monotonic across frames');
}

// ===========================================================================
section('A real desync snaps once — not on every subsequent frame');
// ===========================================================================
{
  const socket = new FakeSocket();
  const arena = new FakeArena(socket);
  let clock = 5000;
  arena.now = () => clock;
  arena.room = [{ id: 'me', x: 100, y: 600, hp: 100 }];

  socket.emit(NET_EVENTS.ENTITY_SNAPSHOT, { entities: [{ id: 'me', x: 100, y: 600, hp: 100, seq: 0 }] });
  arena.frame();

  clock += 66;
  socket.emit(NET_EVENTS.ENTITY_SNAPSHOT, { entities: [{ id: 'me', x: 700, y: 600, hp: 100, seq: 1 }] });
  arena.frame();
  ok(arena.prediction.stats.snaps === 1, 'a 600px desync snaps exactly once');
  ok(Math.abs(arena.player.x - 700) < 1, 'player lands on the authoritative position');

  // 30 frames with NO new snapshot must not re-snap the same one.
  for (let i = 0; i < 30; i += 1) {
    clock += 16.67;
    arena.frame();
  }
  ok(arena.prediction.stats.snaps === 1, 'repeated frames do not re-apply the same snapshot');
}

// ===========================================================================
section('Remotes interpolate smoothly out of a 15 Hz stream');
// ===========================================================================
{
  const socket = new FakeSocket();
  const arena = new FakeArena(socket);
  let clock = 20000;
  arena.now = () => clock;
  arena.room = [
    { id: 'me', x: 0, y: 600, hp: 100 },
    { id: 'bot1', x: 500, y: 600, hp: 100, isBot: true },
  ];

  const drawn = [];
  for (let tick = 0; tick <= 10; tick += 1) {
    const x = 500 + tick * 20;
    clock += 66;
    socket.emit(NET_EVENTS.ENTITY_SNAPSHOT, {
      tick,
      entities: [
        { id: 'me', x: 0, y: 600, hp: 100, seq: tick },
        { id: 'bot1', x, y: 600, hp: 100 },
      ],
    });
    // Render 4 frames of 60 fps between each snapshot.
    for (let f = 0; f < 4; f += 1) {
      clock += 16.67;
      arena.frame();
      const sample = arena.stream.sample('bot1');
      if (sample) drawn.push(sample.x);
    }
  }

  const distinct = new Set(drawn.map((p) => Math.round(p)));
  ok(distinct.size > drawn.length / 2,
    `remotes interpolate (${distinct.size} distinct positions across ${drawn.length} frames)`);
  ok(Math.max(...drawn) < 710 && Math.min(...drawn) >= 495,
    'interpolated positions stay inside the streamed range (no overshoot)');
}

// ===========================================================================
section('Combat: hitscan, feedback and no false positives');
// ===========================================================================
{
  const socket = new FakeSocket();
  const arena = new FakeArena(socket);
  arena.room = [{ id: 'me', x: 100, y: 600, hp: 100 }, { id: 'bot1', x: 300, y: 600, hp: 100, isBot: true }];
  arena.actors.set('bot1', { id: 'bot1', x: 300, y: 600, hp: 100, alive: true, isBot: true });

  const shootRight = () => new Combat({
    getOrigin: () => ({ x: 100, y: 600, angle: 0 }),
    getTargets: () => arena.getTargets(),
  });

  const shot = shootRight().tryFire(true, true);
  ok(shot.fired, 'firing produces a shot');
  ok(shot.hit?.id === 'bot1', 'hitscan finds a target dead ahead');
  ok(shot.damage > 0 && shot.damage < 100, `predicted damage is sane (${shot.damage})`);
  ok(shot.endX <= 320, 'the tracer stops AT the target rather than past it');

  const missed = new Combat({
    getOrigin: () => ({ x: 100, y: 600, angle: Math.PI }),
    getTargets: () => arena.getTargets(),
  }).tryFire(true, true);
  ok(missed.fired && missed.hit === null, 'aiming away misses (no false positives)');

  // A target behind the muzzle must not be hit by a forward shot.
  arena.actors.set('bot1', { id: 'bot1', x: 40, y: 600, hp: 100, alive: true, isBot: true });
  const behind = shootRight().tryFire(true, true);
  ok(behind.hit === null, 'a target BEHIND the muzzle is not hit');

  arena.actors.set('bot1', { id: 'bot1', x: 300, y: 600, hp: 100, alive: true, isBot: true });
  const combat = shootRight();
  combat.tryFire(true, true);
  ok(combat.tryFire(true, false).fired === false, 'the cooldown blocks an instant second shot');

  arena.actors.get('bot1').hp = 0;
  arena.actors.get('bot1').alive = false;
  ok(shootRight().tryFire(true, true).hit === null, 'a dead entity cannot be shot again');

  const near = combat.damageFor({ x: 0, y: 0 }, { x: 100, y: 0 });
  const far = combat.damageFor({ x: 0, y: 0 }, { x: 880, y: 0 });
  ok(far < near, `damage falls off with distance (${near} at close range → ${far} at max)`);
}

// ===========================================================================
section('Bot AI: takes over when the server is silent, yields when it speaks');
// ===========================================================================
{
  const socket = new FakeSocket();
  const arena = new FakeArena(socket);
  const targets = [
    { id: 'me', x: 300, y: 600, hp: 100, alive: true, isBot: false },
    { id: 'bot1', x: 500, y: 600, hp: 100, alive: true, isBot: true },
  ];
  const brain = new BotBrain({ getTargets: () => targets, selfId: 'me' });

  const intents = brain.thinkAll(10000);
  ok(intents.has('bot1'), 'the brain produces an intent for each bot');
  ok(!intents.has('me'), 'the brain NEVER produces intents for humans');
  ok(Number.isFinite(intents.get('bot1').aimAngle), 'intent carries a finite aim angle');

  const intent = intents.get('bot1');
  const expected = Math.atan2(targets[0].y - targets[1].y, targets[0].x - targets[1].x);
  ok(Math.abs(intent.aimAngle - expected) < 0.01, 'bot aims AT its target');
  ok(intent.moveX === -1, 'bot closes the distance toward its target');

  // A bot with nothing nearby should wander rather than freeze.
  targets[0].x = 5000;
  const wander = brain.thinkAll(10000 + 500).get('bot1');
  ok(wander !== undefined && (wander.moveX === 1 || wander.moveX === -1),
    'a bot with no target still walks somewhere');

  // --- The handoff -------------------------------------------------------
  let clock = 40000;
  arena.now = () => clock;
  arena.stream.seedFromRoom({ players: [], bots: [{ id: 'bot1', x: 500, y: 600, hp: 100, maxHp: 100 }] });
  ok(!arena.stream.isServerDriving(), 'with no server data the client AI owns the bots');

  clock += 16;
  socket.emit(NET_EVENTS.BOT_UPDATE, { bots: [{ botId: 'bot1', x: 520, y: 600, hp: 100 }] });
  ok(arena.stream.isServerDriving(), 'one server bot_update flips ownership to the server');

  clock += NET_TICK.serverSilentMs + 500;
  ok(!arena.stream.isServerDriving(), 'ownership returns to the client when the server goes quiet');
}

// ===========================================================================
section('Death and respawn flow');
// ===========================================================================
{
  const socket = new FakeSocket();
  const arena = new FakeArena(socket);
  let clock = 50000;
  arena.now = () => clock;
  arena.room = [{ id: 'me', x: 100, y: 600, hp: 100 }];

  socket.emit(NET_EVENTS.ENTITY_SNAPSHOT, { entities: [{ id: 'me', x: 100, y: 600, hp: 30, seq: 0 }] });
  arena.frame();

  // The real contract: `entity_death` carries BOTH the death and the killfeed
  // row (victimId / killedById / killedByName), so there is no separate `kill`
  // event. The Phase 3 client invented one and it never fired.
  socket.emit(NET_EVENTS.ENTITY_DEATH, {
    roomId: 'room_1',
    victimId: 'me',
    victimName: 'Me',
    victimIsBot: false,
    killedById: 'bot1',
    killedByName: 'Scrap Bot',
    killerIsBot: true,
    cause: 'bullet',
    x: 100,
    y: 600,
    respawnInMs: HEALTH.respawnMs,
  });
  const death = arena.events.find(([n]) => n === 'death');
  ok(death && death[1].isSelf, 'our own death is flagged as self');
  ok(death && death[1].killerName === 'Scrap Bot', 'the killer name reaches the feed');
  ok(death && death[1].respawnInMs === HEALTH.respawnMs, 'the server respawn delay is carried through');

  // Killing someone is the same event with the roles reversed.
  socket.emit(NET_EVENTS.ENTITY_DEATH, {
    victimId: 'bot1',
    victimName: 'Scrap Bot',
    killedById: 'me',
    killedByName: 'Me',
    cause: 'bullet',
  });
  const myKill = arena.events.filter(([n]) => n === 'death').at(-1)[1];
  ok(myKill.killerId === 'me' && !myKill.isSelf, 'our own kill is identifiable from the same event');
  ok(myKill.victimName === 'Scrap Bot', 'the victim name reaches the feed');

  socket.emit(NET_EVENTS.ENTITY_DEATH, { victimId: 'me', killedById: 'bot1', killedByName: 'Scrap Bot' });
  ok(arena.events.filter(([n]) => n === 'death').at(-1)[1].isSelf, 'being killed is flagged as self');

  clock += HEALTH.respawnMs;
  socket.emit(NET_EVENTS.ENTITY_RESPAWN, { id: 'me', x: 480, y: 600, hp: 100, maxHp: 100, isBot: false });
  const spawn = arena.events.find(([n, e]) => n === 'spawn' && e.isSelf);
  ok(spawn && spawn[1].x === 480, 'respawn uses the SERVER-provided position, not a local guess');
}

// ===========================================================================
section('Confirmed damage arrives as a health delta (there is no player_hit)');
// ===========================================================================
{
  const socket = new FakeSocket();
  const arena = new FakeArena(socket);
  const seen = [];
  arena.stream.on('health', (e) => seen.push(e));
  arena.stream.on('hit', (e) => seen.push({ ...e, _hit: true }));

  socket.emit(NET_EVENTS.PLAYER_HEALTH_UPDATE, { id: 'bot1', hp: 100, maxHp: 100 });
  socket.emit(NET_EVENTS.PLAYER_HEALTH_UPDATE, { id: 'bot1', hp: 84, maxHp: 100 });

  const health = seen.filter((e) => !e._hit).at(-1);
  const hit = seen.find((e) => e._hit);
  ok(health.damage === 16, `damage is derived by diffing HP (100 -> 84 = ${health.damage})`);
  ok(hit && hit.targetId === 'bot1', 'a remote HP drop is reported as a confirmed hit');
  ok(hit.damage === 16, 'the confirmed hit carries the real server damage number');

  // Healing must never read as damage.
  socket.emit(NET_EVENTS.PLAYER_HEALTH_UPDATE, { id: 'bot1', hp: 100, maxHp: 100, reason: 'respawn' });
  ok(seen.filter((e) => !e._hit).at(-1).damage === null, 'healing is never reported as damage');

  // Our own HP drop is damage TAKEN, never a hit we landed.
  const hitsBefore = seen.filter((e) => e._hit).length;
  socket.emit(NET_EVENTS.PLAYER_HEALTH_UPDATE, { id: 'me', hp: 70, maxHp: 100 });
  ok(seen.filter((e) => !e._hit).at(-1).isSelf === true, 'our own HP change is flagged as self');
  ok(seen.filter((e) => e._hit).length === hitsBefore, 'taking damage never fabricates a confirmed hit');
}

// ===========================================================================
section('Score updates and overtime use the real Phase 4 shape');
// ===========================================================================
{
  const socket = new FakeSocket();
  const arena = new FakeArena(socket);
  const scores = [];
  arena.stream.on('score', (e) => scores.push(e));

  socket.emit(NET_EVENTS.SCORE_UPDATE, {
    roomId: 'room_1',
    mode: 'tdm',
    scores: [
      { id: 'me', name: 'Me', team: 'red', kills: 3, deaths: 1, score: 3, isBot: false },
      { id: 'bot1', name: 'Scrap Bot', team: 'blue', kills: 1, deaths: 4, score: 1, isBot: true },
    ],
    teams: { red: 3, blue: 1 },
    overtime: false,
  });
  const s = scores.at(-1);
  ok(Array.isArray(s.scores) && s.scores.length === 2, 'scores is an array of per-entity rows');
  ok(s.teams.red === 3 && s.teams.blue === 1, 'team totals are read from `teams`');
  ok(s.overtime === false, 'overtime flag is present and false');

  socket.emit(NET_EVENTS.SCORE_UPDATE, { mode: 'tdm', teams: { red: 5, blue: 5 }, overtime: true });
  ok(scores.at(-1).overtime === true, 'overtime is surfaced for the sudden-death HUD');
  ok(Array.isArray(scores.at(-1).scores) && scores.at(-1).scores.length === 0,
    'a score_update with no rows yields [] (never {} that would break .map)');
}

// ===========================================================================
section('Streak / first-blood medals');
// ===========================================================================
{
  const socket = new FakeSocket();
  const arena = new FakeArena(socket);
  const streaks = [];
  arena.stream.on('streak', (e) => streaks.push(e));

  socket.emit(NET_EVENTS.STREAK_EVENT, {
    roomId: 'room_1', kind: 'first_blood', id: 'me', name: 'Me', isBot: false, streak: 1,
    text: 'First Blood — Me',
  });
  ok(streaks.at(-1).kind === 'first_blood' && streaks.at(-1).isSelf, 'first blood is flagged as self');
  ok(streaks.at(-1).text === 'First Blood — Me', 'the server medal text is used verbatim');

  socket.emit(NET_EVENTS.STREAK_EVENT, { kind: 'streak', id: 'bot1', name: 'Scrap Bot', isBot: true, streak: 5 });
  ok(streaks.at(-1).streak === 5 && !streaks.at(-1).isSelf, 'a bot streak is not flagged as self');
  ok(/Rampage/.test(streaks.at(-1).text), `a missing text falls back to the tier ("${streaks.at(-1).text}")`);
}

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
process.exit(failures ? 1 : 0);
