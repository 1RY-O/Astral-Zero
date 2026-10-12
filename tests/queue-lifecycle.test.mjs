/**
 * Astral Zero — queue/leave lifecycle regression (stuck "Loading" CTA).
 * ============================================================
 * After leaving a match and returning to the Lobby, the matchmaking button
 * read "Loading" instead of "Find Match" until a page refresh. The CTA shows
 * LOADING exactly when `net.state.room` is non-null, so the contract is:
 *
 *   leave confirmed  →  room + queue cleared, busy idle  →  CTA FIND MATCH
 *   leave FAILED     →  room KEPT (retry in place, never a phantom lobby)
 *
 * Part A drives the REAL server managers (fake io): leave → re-queue cycles
 * must yield fresh rooms with the requested bot counts, never ALREADY_IN_MATCH.
 * Part B drives the REAL NetworkManager (fake socket): two complete Bot
 * Practice sessions on one connection, asserting the CTA state at each step
 * and that duplicate queue attempts cannot stack.
 *
 * Run with: npm run test:lifecycle
 */
import { NetworkManager } from '../src/net/NetworkManager.js';
import { NET_EVENTS } from '../src/net/events.js';
import { CTA_STATES } from '../src/config/uiTheme.js';
import { resolveCta } from '../src/ui/brand/ConnectionState.js';

import config from '../src/server-config.js';
import { SOCKET_EVENTS, GAME_MODES } from '../src/sockets/events.js';
import {
  initMatchmaking, joinQueue, leaveRoom, removeFromAllQueues,
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

// ---- fake Socket.io server (mirrors matchmaking-bots.test.mjs) -------------
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
  constructor() { this.sockets = { sockets: new Map() }; this.roomEmits = []; }
  add(id) { const s = new FakeSocket(id); this.sockets.sockets.set(id, s); return s; }
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
}

// ===========================================================================
section('A: server allows leave → re-queue cycles with fresh rooms (1/3/5 bots)');
// ===========================================================================
{
  for (const id of ['L']) {
    if (getRoomForSocket(id)) leaveRoom(id, { stash: false });
    removeFromAllQueues(id);
  }
  register('L', 'Looper');
  let prevRoomId = null;
  for (const [cycle, count] of [[1, 1], [2, 3], [3, 5]]) {
    const res = joinQueue(
      { id: 'L', socketId: 'L', name: 'Looper' },
      GAME_MODES.BOT_PRACTICE, 'junkyard',
      { botCount: count, difficulty: 'beginner', graceMs: 0 },
    );
    ok(res.ok === true, `cycle ${cycle}: re-queue accepted (botCount ${count})`);
    ok(res.roomId !== prevRoomId, `cycle ${cycle}: fresh room id`);
    const room = getRoom(res.roomId);
    ok(room?.bots.length === count, `cycle ${cycle}: spawned bots == requested (${room?.bots.length})`);
    const seen = new Set(room.bots.map((b) => b.id));
    ok(seen.size === room.bots.length, `cycle ${cycle}: no duplicate bot ids`);
    const left = leaveRoom('L', { stash: false });
    ok(left.ok === true && left.empty === true, `cycle ${cycle}: leave destroys the emptied room`);
    ok(!getRoom(res.roomId), `cycle ${cycle}: room gone after leave (no accumulation)`);
    prevRoomId = res.roomId;
  }
  ok(!getRoomForSocket('L'), 'socket seated nowhere after 3 cycles');
}

// ===========================================================================
section('B: client CTA returns to FIND MATCH after leave (no stuck LOADING)');
// ===========================================================================

/** Minimal scripted socket for the REAL NetworkManager. */
class FakeClientSocket {
  constructor() {
    this.handlers = new Map();
    this.internal = new Map();
    this.requests = [];
    this.acks = new Map();
    this.id = 'sock-1';
    this.isConnected = true;
  }
  connect() {}
  announcePlayer() {}
  emit() { return true; }
  on(evt, handler) {
    if (!this.handlers.has(evt)) this.handlers.set(evt, new Set());
    this.handlers.get(evt).add(handler);
    return () => this.handlers.get(evt)?.delete(handler);
  }
  onInternal(evt, handler) {
    if (!this.internal.has(evt)) this.internal.set(evt, new Set());
    this.internal.get(evt).add(handler);
    return () => this.internal.get(evt)?.delete(handler);
  }
  request(evt, payload) {
    this.requests.push({ evt, payload });
    const fn = this.acks.get(evt);
    return Promise.resolve(fn ? fn(payload) : { ok: true });
  }
  when(evt, fn) { this.acks.set(evt, fn); }
  push(evt, payload) { for (const h of this.handlers.get(evt) ?? []) h(payload); }
  count(evt) { return this.requests.filter((r) => r.evt === evt).length; }
}

const roomPayload = (roomId, bots) => ({
  room: {
    roomId, mode: 'bot_practice', mapId: 'junkyard', phase: 'countdown', countdownMs: 3000,
    players: [{ id: 'sock-1', socketId: 'sock-1', name: 'Looper', x: 480, y: 600, hp: 100, maxHp: 100, isBot: false }],
    bots: bots.map((i) => ({ id: `bot_${i}`, name: `Bot${i}`, x: 100 * i, y: 600, hp: 50, maxHp: 50, isBot: true })),
  },
});

{
  const sock = new FakeClientSocket();
  const net = new NetworkManager({ socket: sock });
  net.setPlayerName('Looper');
  net.setMode('bot_practice');
  // The CTA honesty checks need a genuinely online socket (offline always
  // reads OFFLINE by design — see the uiux connection-honesty suite).
  net.state.connection = 'online';
  net.state.contractOk = true;
  sock.when(NET_EVENTS.QUEUE_JOIN, () => ({ ok: true, mode: 'bot_practice', instant: true, roomId: 'r-x' }));
  sock.when(NET_EVENTS.ROOM_LEAVE, () => ({ ok: true, left: true, empty: true }));

  let readyCount = 0;
  net.on('match-ready', () => { readyCount += 1; });
  const cta = () => resolveCta(net.state, CTA_STATES);

  for (const cycle of [1, 2]) {
    const q = await net.queueJoin();
    ok(q.ok === true, `cycle ${cycle}: queueJoin ok`);
    sock.push(NET_EVENTS.ROOM_JOINED, roomPayload(`room_${cycle}`, [1]));
    ok(net.state.room?.roomId === `room_${cycle}`, `cycle ${cycle}: room adopted`);
    ok(cta().label === 'LOADING' && cta().enabled === false, `cycle ${cycle}: CTA honestly LOADING while seated`);

    const l = await net.leaveRoom();
    ok(l.ok === true, `cycle ${cycle}: leaveRoom ok`);
    ok(net.state.room === null && net.state.queue === null, `cycle ${cycle}: stale room+queue cleared`);
    ok(net.state.busy === null, `cycle ${cycle}: no stuck busy flag`);
    const after = cta();
    ok(after.label === 'FIND MATCH' && after.enabled === true, `cycle ${cycle}: CTA back to FIND MATCH (got ${after.label})`);
  }
  ok(readyCount === 2, `exactly one match-ready per session (got ${readyCount}, no duplicate listeners)`);
  ok(sock.count(NET_EVENTS.QUEUE_JOIN) === 2 && sock.count(NET_EVENTS.ROOM_LEAVE) === 2, 'server saw 2 queue_joins + 2 room_leaves (no dupes)');
}

{
  // Failed leave keeps the room (retry in place) instead of a phantom lobby.
  const sock = new FakeClientSocket();
  const net = new NetworkManager({ socket: sock });
  net.setPlayerName('Looper');
  net.setMode('bot_practice');
  net.state.connection = 'online';
  net.state.contractOk = true;
  sock.when(NET_EVENTS.QUEUE_JOIN, () => ({ ok: true }));
  sock.when(NET_EVENTS.ROOM_LEAVE, () => ({ ok: false, error: 'TIMEOUT' }));
  await net.queueJoin();
  sock.push(NET_EVENTS.ROOM_JOINED, roomPayload('room_f', [1]));
  const l = await net.leaveRoom();
  ok(l.ok === false, 'failed leave reports failure');
  ok(net.state.room?.roomId === 'room_f', 'failed leave KEEPS the room (CTA stays honestly LOADING)');
  ok(resolveCta(net.state, CTA_STATES).label === 'LOADING', 'CTA reflects the still-live match');
}

{
  // Concurrent double-queue: exactly one request leaves the client.
  const sock = new FakeClientSocket();
  const net = new NetworkManager({ socket: sock });
  net.setPlayerName('Looper');
  net.setMode('bot_practice');
  sock.when(NET_EVENTS.QUEUE_JOIN, () => new Promise((r) => setTimeout(() => r({ ok: true }), 30)));
  const [a, b] = await Promise.all([net.queueJoin(), net.queueJoin()]);
  ok(a.ok === true && b.ok === false, 'second concurrent queueJoin is refused (BUSY)');
  ok(sock.count(NET_EVENTS.QUEUE_JOIN) === 1, 'only one queue_join reached the server');
}

// ===========================================================================
console.log(`\n${failures === 0 ? '✅' : '❌'} Queue lifecycle: ${pass} checks, ${failures} failures.`);
process.exit(failures === 0 ? 0 : 1);
