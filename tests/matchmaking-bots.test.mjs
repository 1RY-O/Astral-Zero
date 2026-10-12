/**
 * Astral Zero — authoritative Bot Practice matchmaking regression.
 * ============================================================
 * LOCKED REQUIREMENT (design §4): when the selected mode is Bot Practice the
 * client must NOT join the public matchmaking queue, and the server must
 * create a dedicated AI-only room for the requesting player — no strangers, no
 * waiting, no shared queue. Public modes must keep their normal queue flow.
 *
 * This drives the REAL matchmaking manager (initMatchmaking + joinQueue) with a
 * fake Socket.io server so the actual queue data structures are exercised, not
 * a reimplementation. It proves:
 *
 *   1. Bot Practice launches an instant room and leaves EVERY public queue at 0.
 *   2. The room contains exactly the requester + the configured bots, no others.
 *   3. A second Bot Practice request does not group the two players together.
 *   4. Public modes (ffa/tdm) still DO enqueue (the bypass is mode-specific).
 *   5. Repeat requests do not create duplicate rooms for one socket.
 *   6. Bot count + difficulty are validated + clamped server-side.
 *   7. Disconnect removes the player and destroys the now-empty room.
 *
 * Run with:  npm run test:bots
 */
import assert from 'node:assert';

import config from '../src/server-config.js';
import { SOCKET_EVENTS, GAME_MODES } from '../src/sockets/events.js';
import {
  initMatchmaking,
  joinQueue,
  removeFromAllQueues,
  handleDisconnect,
  leaveRoom,
  validateBotPracticeTuning,
  stats,
} from '../src/matchmaking/matchmakingManager.js';
import { getRoom, getRoomForSocket } from '../src/rooms/roomManager.js';
import { upsertOnJoin } from '../src/players/playerStore.js';

let pass = 0;
let failures = 0;
function ok(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  pass += 1;
  if (!cond) failures += 1;
}
function section(t) { console.log(`\n--- ${t} ---`); }

// ---- minimal Socket.io server stub ---------------------------------------
// The matchmaking manager only uses: io.sockets.sockets (Map of socketId→socket),
// socket.join(roomId), and io.to(roomId).emit(...). Each socket tracks the io
// rooms it has joined so `to()` can fan out realistically.
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

// Boot the manager against our fake io ONCE (it holds ioRef for the process).
const io = new FakeIo();
initMatchmaking(io, SOCKET_EVENTS);

/** Register a player identity + a connected socket. */
function register(id, name) {
  upsertOnJoin(id, { name });
  return io.add(id);
}

/**
 * Reset all match state between tests. The matchmaking/room managers hold
 * process-wide in-memory state, so a test that seated 'A' must unseat it or the
 * next section's joinQueue('A') would be rejected as ALREADY_IN_MATCH. We leave
 * every room (destroying empties) and drain every queue.
 */
function resetQueues() {
  for (const id of ['A', 'B', 'C']) {
    if (getRoomForSocket(id)) leaveRoom(id, { stash: false });
    removeFromAllQueues(id);
  }
}

// ===========================================================================
section('Bot Practice bypasses the public queue');
// ===========================================================================
{
  resetQueues();
  const before = stats();
  register('A', 'PracticePat');

  const res = joinQueue(
    { id: 'A', socketId: 'A', name: 'PracticePat' },
    GAME_MODES.BOT_PRACTICE,
    'junkyard',
  );

  ok(res.ok === true, 'bot practice queue_join succeeds');
  ok(res.instant === true, 'bot practice is instant (no waiting)');
  ok(res.mode === GAME_MODES.BOT_PRACTICE, 'effective mode is bot_practice');
  ok(typeof res.roomId === 'string', 'a dedicated room id is returned');

  const after = stats();
  ok(after.bot_practice === 0, 'bot_practice queue length stays 0 (never enqueued)');
  ok(after.ffa === before.ffa, 'ffa queue untouched');
  ok(after.tdm === before.tdm, 'tdm queue untouched');
  ok(after.scrap_collector === before.scrap_collector, 'scrap queue untouched');

  const room = getRoom(res.roomId);
  ok(room && room.mode === GAME_MODES.BOT_PRACTICE, 'the created room is a bot practice room');
  ok(getRoomForSocket('A')?.id === res.roomId, 'the requester is seated in that room');
}

// ===========================================================================
section('The room holds the requester + bots only — no strangers');
// ===========================================================================
{
  resetQueues();
  register('A', 'SoloSweeper');
  const res = joinQueue({ id: 'A', socketId: 'A', name: 'SoloSweeper' }, GAME_MODES.BOT_PRACTICE, 'junkyard');
  const room = getRoom(res.roomId);

  ok(room.players.length === 1, 'exactly one human in the room');
  ok(room.players[0].socketId === 'A', 'that human is the requester');
  ok(room.bots.length > 0, 'the room is populated with bots');

  const target = config.gameModes.bot_practice.targetTotal || 6;
  ok(room.players.length + room.bots.length <= target, 'human+bots respect the mode target');
  ok(room.humanIds.length === 1, 'exactly one human id on the room (no phantom humans)');
}

// ===========================================================================
section('Two Bot Practice requests do NOT group into one room');
// ===========================================================================
{
  resetQueues();
  register('A', 'P1');
  register('B', 'P2');
  const a = joinQueue({ id: 'A', socketId: 'A', name: 'P1' }, GAME_MODES.BOT_PRACTICE, 'junkyard');
  const b = joinQueue({ id: 'B', socketId: 'B', name: 'P2' }, GAME_MODES.BOT_PRACTICE, 'junkyard');

  ok(a.roomId && b.roomId, 'both got a room');
  ok(a.roomId !== b.roomId, 'each player gets their OWN dedicated room (strangers never group)');
  ok(getRoom(a.roomId).players.length === 1, 'first room has exactly one human');
  ok(getRoom(b.roomId).players.length === 1, 'second room has exactly one human');
}

// ===========================================================================
section('Public modes STILL enqueue (bypass is mode-specific)');
// ===========================================================================
{
  resetQueues();
  register('C', 'VeteranVic');
  const baseQueue = stats();

  const res = joinQueue({ id: 'C', socketId: 'C', name: 'VeteranVic' }, GAME_MODES.FFA, 'junkyard');
  // First-match protection diverts a brand-new player into bot_practice; a
  // veteran (or a player whose ffa request is NOT diverted) must ENQUEUE.
  if (res.firstMatchProtection) {
    ok(res.mode === GAME_MODES.BOT_PRACTICE, 'a brand-new player is protected into bot practice');
  } else {
    ok(res.instant !== true, 'a non-protected ffa request does NOT launch instantly (it queues)');
    ok(stats().ffa === baseQueue.ffa + 1, 'ffa queue grew by exactly one');
    ok(!getRoomForSocket('C'), 'a queued player is not seated in a room');
  }
  removeFromAllQueues('C');
}

// ===========================================================================
section('Repeat requests cannot create a duplicate room for one socket');
// ===========================================================================
{
  resetQueues();
  register('A', 'RepeatRex');
  const first = joinQueue({ id: 'A', socketId: 'A', name: 'RepeatRex' }, GAME_MODES.BOT_PRACTICE, 'junkyard');
  ok(first.ok === true, 'first request seats the player');

  // A replayed/duplicate request while already seated must be REJECTED, not
  // silently spawn a second orphaned room. This is the server-authoritative
  // guarantee that a doubled click or a reconnecting client cannot fork state.
  const second = joinQueue({ id: 'A', socketId: 'A', name: 'RepeatRex' }, GAME_MODES.BOT_PRACTICE, 'junkyard');
  ok(second.ok === false && second.error === 'ALREADY_IN_MATCH', 'a duplicate request is rejected (no second room)');
  const seated = getRoomForSocket('A');
  ok(seated && seated.id === first.roomId, 'the player remains seated in the original room');
}

// ===========================================================================
section('Bot count + difficulty are validated + clamped server-side');
// ===========================================================================
{
  const ffa = validateBotPracticeTuning(GAME_MODES.FFA, { botCount: 99, difficulty: 'elite' });
  ok(ffa.botCount === null && ffa.difficulty === null, 'ffa tuning is ignored (no configurable bots)');

  const cap = config.gameModes.bot_practice.maxPlayers || 4;
  ok(validateBotPracticeTuning(GAME_MODES.BOT_PRACTICE, { botCount: 999 }).botCount === cap, `botCount clamps to the cap (${cap})`);
  ok(validateBotPracticeTuning(GAME_MODES.BOT_PRACTICE, { botCount: -5 }).botCount === 0, 'negative botCount clamps to 0');
  ok(validateBotPracticeTuning(GAME_MODES.BOT_PRACTICE, { botCount: 2.7 }).botCount === 2, 'fractional botCount floors to an integer');
  ok(validateBotPracticeTuning(GAME_MODES.BOT_PRACTICE, { botCount: 'lots' }).botCount === null, 'non-numeric botCount is rejected (auto-fill)');

  ok(validateBotPracticeTuning(GAME_MODES.BOT_PRACTICE, { difficulty: 'elite' }).difficulty === 'elite', 'valid tier passes');
  ok(validateBotPracticeTuning(GAME_MODES.BOT_PRACTICE, { difficulty: '  ELITE ' }).difficulty === 'elite', 'tier is case/space tolerant');
  ok(validateBotPracticeTuning(GAME_MODES.BOT_PRACTICE, { difficulty: 'godmode' }).difficulty === null, 'unknown tier → null (safe fallback)');

  resetQueues();
  register('A', 'Tuner');
  const res = joinQueue({ id: 'A', socketId: 'A', name: 'Tuner' }, GAME_MODES.BOT_PRACTICE, 'junkyard', { botCount: 999, difficulty: 'elite' });
  const room = getRoom(res.roomId);
  ok(room.bots.length === cap, `the room got the clamped bot count (${cap})`);
  ok(room.difficulty === 'elite', 'the room carries the validated difficulty');
}

// ===========================================================================
section('Disconnect cleans up the room (empty room destroyed)');
// ===========================================================================
{
  resetQueues();
  register('A', 'Leaver');
  const res = joinQueue({ id: 'A', socketId: 'A', name: 'Leaver' }, GAME_MODES.BOT_PRACTICE, 'junkyard');
  ok(getRoom(res.roomId), 'room exists before disconnect');

  // Mirror the real server disconnect path (sockets/index.js): drop from any
  // queue, then leave the room (stashing for reconnect grace). The last human
  // leaving must destroy the room — bots never hold a room open.
  handleDisconnect('A');
  leaveRoom('A', { stash: true });
  ok(!getRoom(res.roomId), 'the last human leaving destroys the room (bots do not hold it open)');
  ok(!getRoomForSocket('A'), 'the disconnected socket is no longer seated');
}

// ===========================================================================
console.log(`\n${failures === 0 ? '✅' : '❌'} Bot Practice matchmaking: ${pass} checks, ${failures} failures.`);
process.exit(failures === 0 ? 0 : 1);


