/**
 * Astral Zero — safe practice configuration regression.
 * ============================================================
 * Covers the training overhaul without a browser or backend:
 *
 *   1. Practice tuning validation (grace clamp, passive strictness, garbage).
 *   2. Non-practice modes ignore all four tuning fields.
 *   3. Rooms carry graceMs / graceUntil / passive; graceUntil starts at LIVE
 *      (boot + countdown), not at boot.
 *   4. toPublic exposes the pacing fields for the HUD countdown.
 *   5. botPacified: passive always, grace window before/after, null-safe.
 *   6. think() strips fire + melee while pacified but keeps moving.
 *   7. Unpacified bots still attack (the gate is a gate, not a removal).
 *   8. Practice presets are sane (beginner = 1 bot + 10 s calm, etc.).
 *   9. Repeat queueJoin while seated is rejected (no duplicate rooms/bots).
 *  10. leaveRoom destroys the emptied room (timers/bots GC with it).
 *
 * Run with: npm run test:practice
 */
import assert from 'node:assert';

import config from '../src/server-config.js';
import { SOCKET_EVENTS, GAME_MODES } from '../src/sockets/events.js';
import {
  initMatchmaking,
  joinQueue,
  removeFromAllQueues,
  leaveRoom,
  validateBotPracticeTuning,
} from '../src/matchmaking/matchmakingManager.js';
import { getRoom, getRoomForSocket, toPublic } from '../src/rooms/roomManager.js';
import { upsertOnJoin } from '../src/players/playerStore.js';
import { think, botPacified } from '../src/ai/botBrain.js';
import { hazardAt, safeSpawnTable } from '../src/game/maps.js';
import { createRoom } from '../src/rooms/roomManager.js';
import { PRACTICE_PRESETS } from '../src/net/NetworkManager.js';

let pass = 0;
let failures = 0;
function ok(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  pass += 1;
  if (!cond) failures += 1;
}
function section(t) { console.log(`\n--- ${t} ---`); }

// ---- minimal Socket.io server stub (mirrors matchmaking-bots.test.mjs) ----
class FakeSocket {
  constructor(id) {
    this.id = id;
    this.rooms = new Set([id]);
    this.emitted = [];
  }
  join(roomId) { this.rooms.add(roomId); return this; }
  leave(roomId) { this.rooms.delete(roomId); return this; }
  emit(evt, payload) { this.emitted.push({ evt, payload }); return this; }
}

class FakeIo {
  constructor() {
    this.sockets = { sockets: new Map() };
    this.roomEmits = [];
  }
  add(id) {
    const s = new FakeSocket(id);
    this.sockets.sockets.set(id, s);
    return s;
  }
  to(roomId) {
    const self = this;
    return {
      emit(evt, payload) {
        self.roomEmits.push({ roomId, evt, payload });
        for (const s of self.sockets.sockets.values()) {
          if (s.rooms.has(roomId)) s.emit(evt, payload);
        }
        return this;
      },
    };
  }
}

const io = new FakeIo();
initMatchmaking(io, SOCKET_EVENTS);

function register(id, name) {
  upsertOnJoin(id, { name });
  if (!io.sockets.sockets.has(id)) io.add(id);
  return io.sockets.sockets.get(id);
}

function resetSockets() {
  for (const id of ['A', 'B', 'C', 'P']) {
    if (getRoomForSocket(id)) leaveRoom(id, { stash: false });
    removeFromAllQueues(id);
  }
}

/** Minimal bot + human sim entities for think(). */
function botEntities() {
  const bot = {
    id: 'bot_1', botId: 'bot_1', name: 'Rusty', isBot: true, botType: 'shooter',
    team: null, x: 0, y: 0, vx: 0, vy: 0, facing: 1, hp: 100, maxHp: 100,
    alive: true, grounded: true, weaponId: 'scrap-rifle', personality: null,
  };
  const human = {
    id: 'H', socketId: 'H', name: 'Janitor', isBot: false,
    team: null, x: 100, y: 0, vx: 0, vy: 0, facing: 1, hp: 100, maxHp: 100,
    alive: true, grounded: true, weaponId: 'scrap-rifle',
  };
  return { bot, human };
}
function thinkRoom(over = {}) {
  const { bot, human } = botEntities();
  const entities = new Map([[bot.id, bot], [human.id, human]]);
  return { room: { mode: 'bot_practice', sim: { entities }, ...over }, bot };
}

// ===========================================================================
section('Tuning validation: grace + passive');
// ===========================================================================
{
  const v = validateBotPracticeTuning(GAME_MODES.BOT_PRACTICE, { graceMs: 10000, passive: false });
  ok(v.graceMs === 10000 && v.passive === false, '10 s grace passes through');

  ok(validateBotPracticeTuning(GAME_MODES.BOT_PRACTICE, { graceMs: 99999 }).graceMs === 30000, 'grace clamps to 30 s');
  ok(validateBotPracticeTuning(GAME_MODES.BOT_PRACTICE, { graceMs: -500 }).graceMs === 0, 'negative grace clamps to 0');
  ok(validateBotPracticeTuning(GAME_MODES.BOT_PRACTICE, { graceMs: 'lots' }).graceMs === 0, 'non-numeric grace becomes 0 (no grace)');
  ok(validateBotPracticeTuning(GAME_MODES.BOT_PRACTICE, {}).graceMs === 0, 'omitted grace defaults to 0');

  ok(validateBotPracticeTuning(GAME_MODES.BOT_PRACTICE, { passive: true }).passive === true, 'passive true passes');
  ok(validateBotPracticeTuning(GAME_MODES.BOT_PRACTICE, { passive: 'true' }).passive === false, 'string "true" is NOT passive (strict boolean)');
  ok(validateBotPracticeTuning(GAME_MODES.BOT_PRACTICE, { passive: 1 }).passive === false, 'numeric 1 is NOT passive (strict boolean)');
  ok(validateBotPracticeTuning(GAME_MODES.BOT_PRACTICE, {}).passive === false, 'omitted passive defaults to false');

  const ffa = validateBotPracticeTuning(GAME_MODES.FFA, { botCount: 3, difficulty: 'elite', graceMs: 9000, passive: true });
  ok(ffa.botCount === null && ffa.difficulty === null && ffa.graceMs === 0 && ffa.passive === false, 'ffa ignores all four tuning fields');

  // Existing guarantees preserved.
  const cap = config.gameModes.bot_practice.maxPlayers || 4;
  ok(validateBotPracticeTuning(GAME_MODES.BOT_PRACTICE, { botCount: 999 }).botCount === cap, 'botCount still clamps to the cap');
  ok(validateBotPracticeTuning(GAME_MODES.BOT_PRACTICE, { difficulty: 'godmode' }).difficulty === null, 'unknown tier still falls back to null');
}

// ===========================================================================
section('Rooms carry pacing; grace starts at LIVE, not boot');
// ===========================================================================
{
  resetSockets();
  register('P', 'Pacer');
  const before = Date.now();
  const res = joinQueue(
    { id: 'P', socketId: 'P', name: 'Pacer' },
    GAME_MODES.BOT_PRACTICE,
    'junkyard',
    { botCount: 1, difficulty: 'beginner', graceMs: 10000, passive: false },
  );
  ok(res.ok === true, 'practice queue_join succeeds with full tuning');
  const room = getRoom(res.roomId);
  ok(room.passive === false, 'room stores passive=false');
  ok(room.graceMs === 10000, 'room stores graceMs=10000');
  const liveAt = before + (room.countdownMs || 0) + 10000;
  ok(Math.abs(room.graceUntil - liveAt) < 1500, `graceUntil ≈ boot+countdown+grace (${room.graceUntil - before}ms after boot)`);
  ok(room.graceUntil > before + (room.countdownMs || 0), 'grace extends past the countdown (loading never eats learning time)');
  ok(room.players.length === 1 && room.bots.length === 1, 'one human + one bot (beginner preset shape)');

  const pub = toPublic(room);
  ok(pub.graceMs === 10000 && pub.graceUntil === room.graceUntil && pub.passive === false, 'toPublic exposes pacing fields for the HUD');
}

// ===========================================================================
section('botPacified gate');
// ===========================================================================
{
  const now = 1_700_000_000_000;
  ok(botPacified({ passive: true }, now) === true, 'passive room always pacified');
  ok(botPacified({ passive: true, graceUntil: now - 99999 }, now) === true, 'passive stays pacified after grace');
  ok(botPacified({ passive: false, graceUntil: now + 5000 }, now) === true, 'inside grace window → pacified');
  ok(botPacified({ passive: false, graceUntil: now - 1 }, now) === false, 'after grace → live');
  ok(botPacified({ passive: false, graceMs: 0 }, now) === false, 'no grace configured → live');
  ok(botPacified(null, now) === false, 'null room is not pacified');
  ok(botPacified({}, now) === false, 'empty room is not pacified');
}

// ===========================================================================
section('think() holds fire while pacified, attacks when live');
// ===========================================================================
{
  // Live: bot 100px from a human, in range and level → fires.
  {
    const { room, bot } = thinkRoom();
    const intent = think(bot, room, 'bot_practice', 1_700_000_000_000);
    ok(intent.fire === true, 'unpacified bot in range opens fire (gate is a gate, not a removal)');
  }
  // Grace: same geometry, future graceUntil → holds fire but still moves.
  {
    const { room, bot } = thinkRoom({ graceUntil: 1_700_000_000_000 + 8000 });
    const intent = think(bot, room, 'bot_practice', 1_700_000_000_000);
    ok(intent.fire === false && intent.melee === false, 'grace strips fire + melee');
    ok(Number.isFinite(intent.moveX), 'grace keeps movement (bot still reads alive)');
  }
  // Passive: holds fire at ANY time.
  {
    const { room, bot } = thinkRoom({ passive: true });
    const intent = think(bot, room, 'bot_practice', 1_700_000_000_000 + 999_999);
    ok(intent.fire === false && intent.melee === false, 'passive bots never attack, even long after boot');
  }
}

// ===========================================================================
section('Practice presets are sane');
// ===========================================================================
{
  const p = PRACTICE_PRESETS;
  ok(p.beginner.botCount === 1 && p.beginner.graceMs === 10000 && p.beginner.passive === false, 'beginner = 1 bot + 10 s calm');
  ok(p.beginner.difficulty === 'beginner', 'beginner uses the easiest tier');
  ok(p.controls.passive === true, 'controls practice is passive');
  ok(p.controls.botCount === 1, 'controls practice starts with one bot');
  ok(p.normal.botCount > p.beginner.botCount, 'normal fields more bots than beginner');
  ok(p.advanced.botCount >= p.normal.botCount, 'advanced fields at least as many as normal');
  for (const [id, preset] of Object.entries(p)) {
    ok(['beginner', 'normal', 'advanced', 'elite'].includes(preset.difficulty), `${id} tier is server-valid (${preset.difficulty})`);
    ok(Number.isInteger(preset.botCount) && preset.botCount >= 0 && preset.botCount <= 5, `${id} bot count in cap (${preset.botCount})`);
  }
}

// ===========================================================================
section('Repeat requests + leave cleanup (no duplicate rooms/bots)');
// ===========================================================================
{
  resetSockets();
  register('A', 'RepeatRex');
  const first = joinQueue({ id: 'A', socketId: 'A', name: 'RepeatRex' }, GAME_MODES.BOT_PRACTICE, 'junkyard', { botCount: 1, difficulty: 'beginner', graceMs: 5000 });
  ok(first.ok === true, 'first practice request seats the player');
  const roomId = first.roomId;
  const second = joinQueue({ id: 'A', socketId: 'A', name: 'RepeatRex' }, GAME_MODES.BOT_PRACTICE, 'junkyard', { botCount: 1 });
  ok(second.ok === false && second.error === 'ALREADY_IN_MATCH', 'duplicate request rejected (no second room)');
  ok(getRoomForSocket('A')?.id === roomId, 'player stays in the original room');

  // Restart cycle: leave destroys the room; re-queue builds exactly one fresh room.
  leaveRoom('A', { stash: false });
  ok(!getRoom(roomId), 'leave destroys the emptied room (bots/timers GC with it)');
  const third = joinQueue({ id: 'A', socketId: 'A', name: 'RepeatRex' }, GAME_MODES.BOT_PRACTICE, 'junkyard', { botCount: 2 });
  ok(third.ok === true && third.roomId !== roomId, 're-queue after leave builds one fresh room');
  ok(getRoom(third.roomId).bots.length === 2, 'fresh room has the newly requested bot count');
  leaveRoom('A', { stash: false });
  ok(!getRoom(third.roomId), 'second leave cleans up again (repeated restarts do not accumulate)');
}

// ===========================================================================
section('Spawns never boot inside hazard volumes');
// ===========================================================================
{
  for (const mapId of ['junkyard', 'reactor_core', 'biodome']) {
    const table = safeSpawnTable(mapId);
    const allBurn = table.every((p) => hazardAt(mapId, p.x, p.y) > 0);
    ok(!allBurn, `${mapId}: safe table holds at least one burn-free slot (${table.length} slots)`);
  }
  // End-to-end across many rooms (jitter included): no human or bot boots burning.
  let burned = 0;
  let checked = 0;
  for (let i = 0; i < 20; i += 1) {
    for (const mapId of ['junkyard', 'reactor_core', 'biodome']) {
      const room = createRoom({
        mode: 'bot_practice', mapId,
        humans: [{ id: `h${i}`, socketId: `h${i}`, name: `H${i}` }],
        botCount: 4,
      });
      for (const e of [...room.players, ...room.bots]) {
        checked += 1;
        if (hazardAt(mapId, e.x, e.y) > 0) burned += 1;
      }
    }
  }
  ok(burned === 0, `0 of ${checked} spawned entities boot inside a hazard`);
}

// ===========================================================================
console.log(`\n${failures === 0 ? '✅' : '❌'} Safe practice config: ${pass} checks, ${failures} failures.`);
process.exit(failures === 0 ? 0 : 1);
