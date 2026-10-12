/**
 * Astral Zero — identity + rate-limit regression tests (SERVER).
 *
 * Both halves of this file guard against specific defects that existed in the
 * live server before the hardening pass:
 *
 *  A) `player_join` accepted any name. `String(payload.name).slice(0, 24)` with
 *     no charset and no control-character filter. Because friends, first-match
 *     protection and progression are ALL keyed on the normalised name and there
 *     is no authentication, a second client could claim another player's name
 *     and inherit their identity. Names were also echoed straight into
 *     console.log, so newlines in a name rewrote the server log.
 *
 *  B) Only `player_input` had a flood cap. `queue_join`, `room_leave`, `party_*`,
 *     `friend_*`, `match_end` and the lobby relays had none at all.
 *
 * Run: node tests/security.test.mjs
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeName, normalizeKey, safeString, logSafe, DEFAULT_NAME } from '../src/players/identity.js';
import { allow, resetSocket, limitsNow } from '../src/sockets/limits.js';

// ---------------------------------------------------------------------------
test('names are stripped of control characters (no log injection)', () => {
  const dirty = 'Bob\nNOT_A_LOG_LINE\r';
  const clean = sanitizeName(dirty);
  assert.equal(clean, 'Bob NOT_A_LOG_LINE');
  assert.equal(clean.split('\n').length, 1, 'a name can never contain a newline');
  assert.ok(!/[\n\r\t]/.test(clean), 'no control characters survive');
  // logSafe makes a value SAFE to log; it does not normalise it (it is used on
  // arbitrary client payloads, where normalising would destroy evidence).
  assert.equal(logSafe('Bob\nNOT_A_LOG_LINE'), 'Bob NOT_A_LOG_LINE');
  assert.equal(logSafe(dirty), 'Bob NOT_A_LOG_LINE ');
  assert.equal(logSafe(dirty).split('\n').length, 1, 'the log line cannot be forged');
});

test('ANSI escape sequences cannot reach the terminal through a name', () => {
  const dirty = `\u001b[31mRED\u001b[0m`;
  const clean = sanitizeName(dirty);
  assert.ok(!clean.includes('\u001b'), 'ANSI escapes are removed');
});

test('direction-override + zero-width characters are stripped', () => {
  // ‮RTL OVERRIDE is the classic way to spoof one name as another in a rendered
  // list; ​ zero-width space splits a name into two different identity keys.
  const dirty = '‮Bob‮ ​Bob';
  const clean = sanitizeName(dirty);
  assert.ok(!clean.includes('‮'), 'RTL/LTR overrides are removed');
  assert.ok(!clean.includes('​'), 'zero-width characters are removed');
});

test('whitespace is collapsed so two spellings cannot make two identities', () => {
  assert.equal(sanitizeName('Bob     Smith'), 'Bob Smith');
  assert.equal(
    normalizeKey(sanitizeName('  Bob   Smith  ')),
    normalizeKey('Bob Smith'),
    'the whitespace variants must collapse to the same identity key',
  );
});

test('length is capped in CODE POINTS, not UTF-16 units', () => {
  // A 30-astral-plane nickname is 60 UTF-16 units: a .slice(0,24) on units would
  // cut a surrogate pair in half and produce a lone surrogate (U+D800) on the
  // wire, which breaks rendering and can break JSON consumers.
  const long = '🛰️'.repeat(40);
  const clean = sanitizeName(long);
  assert.equal([...clean].length <= 24, true, 'capped at 24 code points');
  for (const ch of clean) {
    const cp = ch.codePointAt(0);
    assert.ok(cp < 0xd800 || cp > 0xdfff, `no lone surrogate (U+${cp.toString(16)})`);
  }
});

test('non-string and empty input falls back to the default name', () => {
  assert.equal(sanitizeName(undefined), DEFAULT_NAME);
  assert.equal(sanitizeName(null), DEFAULT_NAME);
  assert.equal(sanitizeName(42), DEFAULT_NAME);
  assert.equal(sanitizeName({}), DEFAULT_NAME);
  assert.equal(sanitizeName([1, 2]), DEFAULT_NAME);
  assert.equal(sanitizeName('   '), DEFAULT_NAME);
});

test('a sanitised name always round-trips (sanitise is idempotent)', () => {
  for (const raw of ['Bob', 'Bob \n Smith', '🛰️🛰️🛰️', DEFAULT_NAME]) {
    const once = sanitizeName(raw);
    assert.equal(sanitizeName(once), once, `"${raw}" -> "${once}" must be stable`);
  }
});

test('safeString never throws and never returns a non-string', () => {
  for (const v of [null, undefined, 5, {}, [], Symbol('x'), 'ok']) {
    const out = safeString(v, 8);
    assert.equal(typeof out, 'string');
    assert.ok(out.length <= 8);
  }
});

// ---------------------------------------------------------------------------
test('every high-traffic / state-creating event has a ceiling', () => {
  const limits = limitsNow();
  const required = [
    'player_move', 'player_shoot', 'player_melee', 'player_input',
    'player_join', 'queue_join', 'queue_leave', 'room_join', 'room_leave',
    'match_end',
    'party_create', 'party_join', 'party_leave', 'party_start_match',
    'friend_add', 'friend_remove', 'friend_list',
  ];
  for (const event of required) {
    assert.ok(Number.isFinite(limits[event]),
      `"${event}" must be rate limited — an unbounded event can allocate rooms or fan out to every client`);
  }
});

test('the lobby relay events are ceilinged below the broadcast path they drive', () => {
  // These are re-broadcast to every other client, so one socket sending fast
  // multiplies outbound traffic for everyone. Their ceilings must be tight
  // enough to bound that.
  const limits = limitsNow();
  assert.ok(limits.player_move <= 120, 'player_move ceiling must bound the lobby relay');
  assert.ok(limits.player_shoot <= 60);
  assert.ok(limits.player_melee <= 40);
});

test('the client at 60 Hz is never limited in normal play', () => {
  const socket = 'sock-perf';
  resetSocket(socket);
  // The Phaser client emits intent at ~60/s for a full second. A limiter that
  // rejected this would be a gameplay regression, not a security measure.
  let allowed = 0;
  for (let i = 0; i < 60; i += 1) {
    if (allow('player_move', socket, 1000)) allowed += 1;
  }
  assert.equal(allowed, 60, 'a full 60 Hz second must pass untouched');
  resetSocket(socket);
});

test('a flood is rejected, and the counter resets per window', () => {
  const socket = 'sock-flood';
  resetSocket(socket);
  let allowed = 0;
  for (let i = 0; i < 500; i += 1) {
    if (allow('queue_join', socket, 5000)) allowed += 1;
  }
  assert.ok(allowed <= limitsNow().queue_join, `flood is capped (allowed ${allowed})`);

  // A new window starts fresh: the same socket is not punished forever.
  allowed = 0;
  for (let i = 0; i < 8; i += 1) {
    if (allow('queue_join', socket, 6000)) allowed += 1;
  }
  assert.equal(allowed, limitsNow().queue_join, 'a fresh window resets the count');
  resetSocket(socket);
});

test('sockets are independent — one flood cannot throttle another', () => {
  resetSocket('a');
  resetSocket('b');
  for (let i = 0; i < 100; i += 1) allow('queue_join', 'a', 7000);
  assert.equal(allow('queue_join', 'b', 7000), true, 'socket b is unaffected by a');
  resetSocket('a');
  resetSocket('b');
});

test('resetSocket clears a socket', () => {
  resetSocket('c');
  for (let i = 0; i < 200; i += 1) allow('queue_join', 'c', 8000);
  assert.equal(allow('queue_join', 'c', 8000), false, 'still throttled before reset');
  resetSocket('c');
  assert.equal(allow('queue_join', 'c', 8000), true, 'allowed after reset');
  resetSocket('c');
});

test('unknown events are not throttled (a typo must not disable a feature)', () => {
  assert.equal(allow('some_event_that_has_no_rule', 'x', 9000), true);
});

console.log('\nsecurity checks done');
