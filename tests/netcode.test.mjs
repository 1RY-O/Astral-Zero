/**
 * Astral Zero — netcode unit tests (Phase 3).
 * ============================================================
 * Covers the modules that make multiplayer work:
 *
 *   SnapshotBuffer — interpolation/extrapolation from a ~15 Hz stream
 *   Prediction     — the three tiers of reconciliation
 *   MatchStream    — the single ingest point for every server event
 *
 * These run in plain Node: no DOM, no WebGL, no live server. The only stand-in
 * needed is a fake socket that dispatches events synchronously.
 *
 * Run with: npm run test:net
 */

import { SnapshotBuffer } from '../src/net/SnapshotBuffer.js';
import { Prediction } from '../src/net/Prediction.js';
import { MatchStream } from '../src/net/MatchStream.js';
import { NET_EVENTS, SERVER_ONLY_EVENTS } from '../src/net/events.js';
import { Emitter } from '../src/core/Emitter.js';

let failures = 0;
function ok(condition, message) {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${message}`);
  if (!condition) failures += 1;
}
function section(title) {
  console.log(`\n--- ${title} ---`);
}

/** Fake SocketClient: dispatches synchronously and records emits. */
class FakeSocket extends Emitter {
  constructor() {
    super();
    this.sent = [];
  }

  emit(event, payload) {
    this.sent.push({ event, payload });
    super.emit(event, payload);
  }
}

// ===========================================================================
section('SnapshotBuffer — interpolation');
// ===========================================================================
{
  const buf = new SnapshotBuffer();
  for (let i = 0; i < 10; i += 1) {
    buf.push({ id: 'bot1', time: i * 66, x: i * 66, y: 100, vx: 1000, vy: 0 });
  }

  const mid = buf.sample('bot1', 66 * 2 + 33);
  ok(Math.abs(mid.x - 165) < 1, `interpolates the midpoint between samples (got ${mid.x.toFixed(1)})`);
  ok(buf.sample('bot1', -50).x === 0, 'clamps before the oldest sample');
  ok(buf.sample('bot1', 10000).frozen === true, 'freezes after the extrapolation cap');
  ok(buf.sample('bot1', 9 * 66 + 110).x > 9 * 66, 'extrapolates a short overrun');
  ok(buf.sample('ghost', 0) === null, 'unknown entity returns null');

  const before = buf.count('bot1');
  buf.push({ id: 'bot1', time: 9 * 66, x: 9 * 66, y: 100, hp: 100, alive: true });
  ok(buf.count('bot1') === before, 'ignores an exact duplicate sample');

  // Same timestamp AND position but different health must NOT be dropped.
  buf.push({ id: 'bot1', time: 9 * 66, x: 9 * 66, y: 100, hp: 55, alive: true });
  ok(buf.latest('bot1').hp === 55, 'keeps a same-position sample that carries new health');

  for (let i = 0; i < 60; i += 1) buf.push({ id: 'bot1', time: 1000 + i, x: i, y: 0 });
  ok(buf.count('bot1') <= 24, 'history stays bounded');
}

// ===========================================================================
section('Prediction — reconciliation tiers');
// ===========================================================================
{
  const p = new Prediction();
  ok(p.reconcile({ x: 100, y: 100, clientX: 101, clientY: 100 }).action === 'none',
    'tier 1: ignores sub-tolerance drift (no jitter)');
  ok(p.reconcile({ x: 400, y: 100, clientX: 100, clientY: 100 }).action === 'snap',
    'tier 3: snaps beyond the threshold (teleports must not ease)');

  const soft = new Prediction();
  const res = soft.reconcile({ x: 130, y: 100, clientX: 100, clientY: 100 });
  ok(res.action === 'decay', 'tier 2: decays a moderate error');
  ok(soft.isCorrecting, 'pending correction is reported');

  let maxStep = 0;
  let travelled = 0;
  for (let i = 0; i < 60; i += 1) {
    const step = soft.step(16.67);
    maxStep = Math.max(maxStep, Math.hypot(step.x, step.y));
    travelled += step.x;
  }
  ok(!soft.isCorrecting, 'correction fully decays within a second');
  ok(Math.abs(travelled - 30) < 2, `correction travels the full error (${travelled.toFixed(1)}/30px)`);
  ok(maxStep < 12, `no frame teleports: peak step ${maxStep.toFixed(2)}px`);

  // Frame-rate independence: 30fps and 60fps must converge identically.
  const a = new Prediction();
  a.reconcile({ x: 130, y: 100, clientX: 100, clientY: 100 });
  const b = new Prediction();
  b.reconcile({ x: 130, y: 100, clientX: 100, clientY: 100 });
  let at30 = 0;
  for (let i = 0; i < 30; i += 1) at30 += a.step(33.3).x;
  let at60 = 0;
  for (let i = 0; i < 60; i += 1) at60 += b.step(16.67).x;
  ok(Math.abs(at30 - at60) < 2, `same convergence at 30fps and 60fps (${at30.toFixed(1)} vs ${at60.toFixed(1)})`);
// ===========================================================================
section('MatchStream — single ingest point');
// ===========================================================================
{
  const socket = new FakeSocket();
  let clock = 1000;
  const stream = new MatchStream({ socket, state: { localId: 'me' } }, { now: () => clock });
  stream.start();

  const seen = {};
  for (const evt of ['snapshot', 'health', 'hit', 'death', 'spawn', 'kill', 'shot', 'score', 'time', 'entity-death']) {
    stream.on(evt, (payload) => {
      seen[evt] = seen[evt] ?? [];
      seen[evt].push(payload);
    });
  }

  socket.emit(NET_EVENTS.ENTITY_SNAPSHOT, {
    tick: 7,
    entities: [
      { id: 'bot1', x: 100, y: 200, vx: 50, vy: 0, hp: 80, facing: -1, isBot: true },
      { id: 'hum2', x: 300, y: 400, hp: 100 },
    ],
  });
  ok(seen.snapshot.length === 1, 'emits one snapshot event per tick, not per entity');
  ok(seen.snapshot[0].entities.length === 2, 'normalises every entity in the tick');
  ok(seen.snapshot[0].entities[0].facing === -1, 'preserves the facing sign');
  ok(stream.isServerDriving(), 'reports the server as driving after a snapshot');

  clock += 66;
  socket.emit(NET_EVENTS.ENTITY_SNAPSHOT, { tick: 8, entities: [{ id: 'bot1', x: 200, y: 200, vx: 1500, vy: 0, hp: 80 }] });
  // sample() takes NOW and renders 100ms in the past → 1133-100 = 1033.
  ok(Math.abs(stream.sample('bot1', 1133).x - 150) < 2, 'interpolates a remote entity at render time');

  // Payload-shape tolerance (the Phase 3 backend is still being finalised).
  socket.emit(NET_EVENTS.BOT_UPDATE, { bots: [{ botId: 'bot2', x: 5, y: 5, botType: 'sweeper' }] });
  ok(stream.snapshots.has('bot2'), 'accepts bot_update carrying a botId alias');
  socket.emit(NET_EVENTS.PLAYER_MOVE, { id: 'hum3', x: 1, y: 2, vx: 3 });
  ok(stream.snapshots.has('hum3'), 'accepts a single relayed player_move payload');
  socket.emit(NET_EVENTS.ENTITY_SNAPSHOT, { entities: [{ id: 'bad', x: NaN, y: 1 }] });
  ok(!stream.snapshots.has('bad'), 'drops a malformed entity (NaN coordinates)');

  stream.seedFromRoom({ players: [{ id: 'me', x: 5, y: 5, hp: 100, maxHp: 100 }], bots: [] });
  socket.emit(NET_EVENTS.PLAYER_HEALTH_UPDATE, { id: 'me', hp: 42, maxHp: 100 });
  ok(seen.health[0].hp === 42 && seen.health[0].isSelf, 'health flags the local player');
  ok(stream.snapshots.latest('me').hp === 42, 'health also updates the snapshot buffer');

  socket.emit(NET_EVENTS.PLAYER_HIT, { shooterId: 'me', targetId: 'bot1', damage: 17 });
  ok(seen.hit[0].isSelf && seen.hit[0].damage === 17, 'hit flags the local shooter');
  socket.emit(NET_EVENTS.PLAYER_DEATH, { id: 'me', killerId: 'hum2', killerName: 'Rival' });
  ok(seen.death[0].isSelf && seen.death[0].killerName === 'Rival', 'death flags the local victim');
  socket.emit(NET_EVENTS.KILL, { killerId: 'me', killerName: 'Me', victimId: 'bot1', victimName: 'Bot' });
  ok(seen.kill[0].isSelfKill && !seen.kill[0].isSelfDeath, 'kill feed flags a self-kill');
  socket.emit(NET_EVENTS.PLAYER_SPAWN, { id: 'me', x: 10, y: 20, hp: 100 });
  ok(seen.spawn[0].isSelf, 'spawn flags the local player');
  socket.emit(NET_EVENTS.SCORE_UPDATE, { teamScores: { red: 3, blue: 1 } });
  ok(seen.score[0].teamScores.red === 3, 'score update is forwarded');
  socket.emit(NET_EVENTS.MATCH_TIME, { remaining: 30000 });
  ok(seen.time[0].remaining === 30000, 'match clock is forwarded');
  socket.emit(NET_EVENTS.BOT_DEATH, { botId: 'bot2', killerId: 'me' });
  ok(seen['entity-death'][0].id === 'bot2', 'bot death is forwarded');

  clock += 5000;
  ok(!stream.isServerDriving(), 'falls back to client AI once the server goes silent');

  stream.stop();
  ok(stream.snapshots.ids().length === 0, 'stop() clears the buffer');
  socket.emit(NET_EVENTS.ENTITY_SNAPSHOT, { entities: [{ id: 'z', x: 0, y: 0 }] });
  ok(!stream.snapshots.has('z'), 'stop() unbinds the socket handlers');
}

// ===========================================================================
section('anti-cheat guard');
// ===========================================================================
for (const name of ['ENTITY_SNAPSHOT', 'PLAYER_HIT', 'ENTITY_HIT', 'PLAYER_DEATH', 'PLAYER_SPAWN', 'KILL', 'SCORE_UPDATE', 'MATCH_TIME']) {
  ok(SERVER_ONLY_EVENTS.includes(NET_EVENTS[name]), `${name} is server-only (client cannot spoof it)`);
}

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
process.exit(failures ? 1 : 0);

  const n = new Prediction();
  ok(n.reconcile({ x: NaN, y: 100, clientX: 100, clientY: 100 }).action === 'none',
    'a NaN server position is ignored rather than poisoning state');
  ok(n.step(16).x === 0, 'stepping with no pending correction is a no-op');
}