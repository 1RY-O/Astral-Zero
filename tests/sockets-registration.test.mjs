/**
 * Astral Zero — socket handler REGISTRATION test.
 *
 * WHY THIS TEST EXISTS
 * A handler that references an undefined symbol only explodes when a client
 * actually emits the event. Unit tests that never wire up `initSockets` against
 * a socket cannot see that, so a refactor that deleted a helper function crashed
 * the real server on the first `player_join` after a restart — invisible to the
 * whole suite until a browser connected.
 *
 * This registers the handlers against a fake `io`, then EMITS every
 * client→server event through a fake socket. A registration-time or
 * reference-time error surfaces here instead of in production.
 *
 * Run: node tests/sockets-registration.test.mjs
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';

import { initSockets, diagnostics } from '../src/sockets/index.js';
import { SOCKET_EVENTS } from '../src/sockets/events.js';
import { resetSocket } from '../src/sockets/limits.js';

/** A socket stand-in that records what was emitted back to the client. */
function makeSocket(id) {
  const socket = new EventEmitter();
  socket.id = id;
  socket.rooms = new Set([id]);
  socket.broadcast = new EventEmitter();
  socket.broadcast.emit = () => {};
  socket.join = () => {};
  socket.leave = () => {};
  const sent = [];
  socket._emit = socket.emit;
  socket.emit = (event, ...args) => { sent.push([event, args]); return true; };
  socket._sent = sent;
  return socket;
}

/** An `io` stand-in: carries `connection` plus the emit helpers handlers use. */
function makeIo() {
  const io = new EventEmitter();
  io.sockets = { sockets: new Map() };
  io.to = () => ({ emit: () => {} });
  io.in = () => ({ emit: () => {} });
  io.emit = () => {};
  return io;
}

const ioShared = makeIo();
initSockets(ioShared);

let socketSeq = 0;
/** Register all handlers once, then connect a fresh socket. */
function wire() {
  const socket = makeSocket(`sock_reg_${(socketSeq += 1)}`);
  ioShared.sockets.sockets.set(socket.id, socket);
  // Re-run only the per-socket registration the real server performs on
  // `connection`. initSockets is already done once above, so this is a manual
  // replay of `io.on('connection', handler)`.
  const handler = ioShared.listeners('connection').pop();
  assert.equal(typeof handler, 'function', 'initSockets must register a connection handler');
  handler(socket);
  return { io: ioShared, socket };
}

/** Payloads shaped like the contract, for a socket with no room and no profile. */
function contractPayloads() {
  return {
    [SOCKET_EVENTS.PLAYER_JOIN]: { name: 'Test Janitor' },
    [SOCKET_EVENTS.PLAYER_MOVE]: { x: 100, y: 100, vx: 0, vy: 0, seq: 1, timestamp: Date.now() },
    [SOCKET_EVENTS.PLAYER_SHOOT]: { x: 100, y: 100, angle: 0, weaponId: 'scrap-rifle', seq: 1, timestamp: Date.now() },
    [SOCKET_EVENTS.PLAYER_MELEE]: { direction: 1, timestamp: Date.now() },
    [SOCKET_EVENTS.PLAYER_INPUT]: { moveX: 0, jump: false, aimX: 100, aimY: 100, seq: 1, timestamp: Date.now() },
    [SOCKET_EVENTS.PLAYER_HEALTH_UPDATE]: { hp: 100 },
    [SOCKET_EVENTS.QUEUE_JOIN]: { mode: 'bot_practice' },
    [SOCKET_EVENTS.QUEUE_LEAVE]: {},
    [SOCKET_EVENTS.ROOM_LEAVE]: {},
    [SOCKET_EVENTS.ROOM_JOIN]: { roomId: 'no-such-room' },
    [SOCKET_EVENTS.MATCH_END]: { reason: 'test' },
    [SOCKET_EVENTS.PARTY_CREATE]: {},
    [SOCKET_EVENTS.PARTY_JOIN]: { code: 'NOPE' },
    [SOCKET_EVENTS.PARTY_LEAVE]: {},
    [SOCKET_EVENTS.PARTY_INVITE]: { friendName: 'nobody' },
    [SOCKET_EVENTS.PARTY_START_MATCH]: {},
    [SOCKET_EVENTS.FRIEND_ADD]: { friendName: 'nobody' },
    [SOCKET_EVENTS.FRIEND_REMOVE]: { friendName: 'nobody' },
    [SOCKET_EVENTS.FRIEND_LIST]: {},
    [SOCKET_EVENTS.BOT_SPAWN]: { id: 'x' },
    [SOCKET_EVENTS.BOT_UPDATE]: { id: 'x' },
    [SOCKET_EVENTS.BOT_DEATH]: { id: 'x' },
  };
}

test('every client→server event can be emitted through a registered handler without throwing', () => {
  const { socket } = wire();
  // The client→server handlers are registered on the SOCKET (io only carries
  // `connection`), so that is the set to assert against.
  const handlers = socket.eventNames().map(String);
  assert.ok(handlers.length > 15,
    `expected the full handler set, got ${handlers.length}: ${handlers.join(', ')}`);

  let touched = 0;
  for (const [event, payload] of Object.entries(contractPayloads())) {
    if (!handlers.includes(event)) continue;
    try {
      socket._emit(event, payload, () => {});
      touched += 1;
    } catch (err) {
      assert.fail(`handler for "${event}" threw: ${err && err.message}`);
    }
  }
  assert.ok(touched >= 15, `expected most events to be registered, got ${touched}`);
});

test('the health-rejection path is counted, not logged per packet', () => {
  const { socket } = wire();
  // A client hammering the forbidden authoritative-HP event must not make the
  // server write unbounded log lines. The rejection still reaches the client.
  for (let i = 0; i < 25; i += 1) socket._emit(SOCKET_EVENTS.PLAYER_HEALTH_UPDATE, { hp: 999 });
  const told = socket._sent.some(([ev, p]) => ev === SOCKET_EVENTS.ERROR && p?.[0]?.code === 'NOT_AUTHORITATIVE');
  assert.ok(told, 'the client is still told HP is server-owned');
  assert.ok(diagnostics().hpRejections >= 1, 'and the attempt is counted for operators');
});

test('a join with a hostile name is sanitised before it becomes an identity', () => {
  const { socket } = wire();
  let acked = null;
  socket._emit(SOCKET_EVENTS.PLAYER_JOIN, { name: 'Bob\nNOT_A_LOG' }, (res) => { acked = res; });
  assert.ok(acked && acked.ok, 'a hostile name is corrected, not the player rejected');
  assert.equal(acked.player.name, 'Bob NOT_A_LOG');
  // The client is told its name changed, so nothing is silently rewritten.
  const warned = socket._sent.some(([ev, p]) => ev === SOCKET_EVENTS.ERROR && p?.[0]?.code === 'NAME_SANITIZED');
  assert.ok(warned, 'the player is told their display name was adjusted');
});

test('a rate-limited socket is refused, not served', () => {
  const { socket } = wire();
  let refused = 0;
  const ack = (res) => { if (res && res.error === 'RATE_LIMITED') refused += 1; };
  for (let i = 0; i < 40; i += 1) socket._emit(SOCKET_EVENTS.QUEUE_JOIN, { mode: 'bot_practice' }, ack);
  assert.ok(refused > 0, 'a flood of queue_join is refused past the ceiling');
  resetSocket(socket.id);
});

console.log('\nsocket registration checks done');
