/**
 * Astral Zero — socket transport regression test (Phase 4).
 * ============================================================
 * Two silent bugs made the entire authoritative sync layer dead against a real
 * server, while every existing test still passed (they all used a fake socket
 * that was ready before anyone subscribed):
 *
 *  1. `SocketClient extends Emitter` but overrode BOTH `emit()` and `on()` for
 *     network use. Internal `emit('status')` therefore sent "status" to the
 *     BACKEND and notified nobody locally — the client could never observe its
 *     own connection state.
 *  2. `SocketClient.on()` returned a no-op when the socket did not exist yet.
 *     Since MatchStream.start() runs before connect() in the real scene, every
 *     snapshot/feedback listener was discarded permanently.
 *
 * These tests pin both behaviours using a fake socket.io object.
 *
 * Run with: npm run test:transport
 */

import { SocketClient } from '../src/net/SocketClient.js';
import { NET_EVENTS } from '../src/net/events.js';

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures += 1;
};
const section = (t) => console.log(`\n--- ${t} ---`);

/** Minimal fake socket.io socket: records listeners, emits on demand. */
function fakeTransport() {
  const listeners = new Map();
  const sent = [];
  return {
    id: 'sock_abc',
    connected: true,
    sent,
    on(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt).add(fn);
      return this;
    },
    off(evt, fn) { listeners.get(evt)?.delete(fn); return this; },
    removeAllListeners() { listeners.clear(); return this; },
    emit(evt, payload) { sent.push({ evt, payload }); return this; },
    disconnect() { this.connected = false; return this; },
    fire(evt, payload) { for (const fn of listeners.get(evt) ?? []) fn(payload); },
    listenerCount(evt) { return listeners.get(evt)?.size ?? 0; },
  };
}

/**
 * Run `client.connect()` with `io()` stubbed to return `fake`, so the REAL
 * connect() path runs (transport handlers attached + pending listeners flushed).
 * Bypassing connect() by assigning `client.socket` directly would skip exactly
 * the wiring these tests are meant to check.
 */
function connectWithFakeTransport(client, fake) {
  client._testTransport = fake;
  client.connect();
  return fake;
}

// ===========================================================================
section('Internal events use the Emitter bus, not the network');
// ===========================================================================
{
  const client = new SocketClient({ autoConnect: false });
  let statuses = [];
  client.onInternal('status', (s) => statuses.push(s));

  // go through the real connect() so the transport handlers get attached.
  const fake = connectWithFakeTransport(client, fakeTransport());
  fake.fire('connect');

  ok(statuses.includes('online'), `onInternal('status') receives 'online' (got ${JSON.stringify(statuses)})`);
  ok(
    !fake.sent.some((m) => m.evt === 'status'),
    "internal 'status' is NOT sent to the backend over the wire",
  );
  ok(client.status === 'online', 'status field is updated for synchronous readers');
}

// ===========================================================================
section('on() before the socket exists is buffered, not dropped');
// ===========================================================================
{
  const client = new SocketClient({ autoConnect: false });
  // No socket yet — this is the real scene order (MatchStream.start() then connect()).
  let hits = 0;
  const off = client.on(NET_EVENTS.ENTITY_SNAPSHOT, () => { hits += 1; });

  const fake = fakeTransport();
  client.socket = fake;
  client._flushPendingOn();

  ok(fake.listenerCount(NET_EVENTS.ENTITY_SNAPSHOT) === 1,
    'a listener registered before connect() is attached once the socket exists');

  fake.fire(NET_EVENTS.ENTITY_SNAPSHOT, { entities: [{ id: 'a', x: 1, y: 2 }] });
  fake.fire(NET_EVENTS.ENTITY_SNAPSHOT, { entities: [{ id: 'a', x: 3, y: 4 }] });
  ok(hits === 2, `buffered listener receives snapshots after connect (got ${hits})`);

  // Unsubscribing BEFORE the socket exists must still remove it.
  const client2 = new SocketClient({ autoConnect: false });
  let n = 0;
  const off2 = client2.on('room_joined', () => { n += 1; });
  off2();
  const fake2 = connectWithFakeTransport(client2, fakeTransport());
  fake2.fire('room_joined', {});
  ok(n === 0, 'unsubscribing before connect() prevents the listener from ever attaching');

  // And a post-connect unsubscribe must detach.
  off();
  fake.fire(NET_EVENTS.ENTITY_SNAPSHOT, { entities: [{ id: 'a', x: 5, y: 6 }] });
  ok(hits === 2, 'unsubscribing after connect() detaches the live listener');
}

// ===========================================================================
section('emit() still sends to the server and refuses server-only events');
// ===========================================================================
{
  const client = new SocketClient({ autoConnect: false });
  const fake = connectWithFakeTransport(client, fakeTransport());

  ok(client.emit('player_move', { moveX: 1 }) === true, 'emit() sends a client event to the server');
  ok(fake.sent.some((m) => m.evt === 'player_move'), 'the payload reached the transport');

  const before = fake.sent.length;
  ok(client.emit(NET_EVENTS.ENTITY_SNAPSHOT, {}) === false, 'emit() refuses a server-only event');
  ok(fake.sent.length === before, 'a refused event is never sent');

  // A disconnected socket must not throw or send.
  fake.connected = false;
  ok(client.emit('player_move', {}) === false, 'emit() is a safe no-op while offline');
}

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
process.exit(failures ? 1 : 0);
