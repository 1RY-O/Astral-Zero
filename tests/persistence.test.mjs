/**
 * Astral Zero — persistence tests (SERVER).
 *
 * S14.0. Ranked ratings, character unlocks and mastery are worthless if they
 * live in process memory: they die on every deploy and the "leaderboard" is
 * just whoever was online at boot. These tests cover the guarantees the store
 * claims — hydration, atomicity, corruption recovery and hostile input.
 *
 * Run: node tests/persistence.test.mjs
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ProfileStore, normaliseProfile, MAX_HISTORY } from '../src/players/persistence.js';

/** A fresh temp file per test — no shared state, no cleanup races. */
function tmpFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'az-store-'));
  return path.join(dir, `${name}.json`);
}

// ---------------------------------------------------------------------------
test('a profile round-trips through disk', () => {
  const file = tmpFile('rt');
  const a = new ProfileStore({ file, flushMs: 10 });
  a.load();
  a.get('janitor').totalXp = 4321;
  a.flushSync();

  const b = new ProfileStore({ file, flushMs: 10 });
  const res = b.load();
  assert.equal(res.ok, true);
  assert.equal(res.count, 1);
  assert.equal(b.get('janitor').totalXp, 4321, 'XP must survive a restart');
});

test('a missing file is a clean empty store, not an error', () => {
  const s = new ProfileStore({ file: tmpFile('absent'), flushMs: 10 });
  const res = s.load();
  assert.equal(res.ok, true);
  assert.equal(res.count, 0);
  assert.equal(s.size, 0);
});

test('a CORRUPT file is quarantined, and the server still boots empty', () => {
  const file = tmpFile('corrupt');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{ this is not json', 'utf8');

  const s = new ProfileStore({ file, flushMs: 10 });
  const res = s.load();
  assert.equal(res.ok, false, 'the load must report failure');
  assert.equal(res.recovered, true);
  assert.equal(s.size, 0, 'but must not be unusable');

  // The bad file is kept for forensics, not deleted.
  const quarantined = fs.readdirSync(path.dirname(file)).filter((f) => f.includes('.corrupt-'));
  assert.equal(quarantined.length, 1, 'the corrupt file must be preserved, not destroyed');
  // ...and a subsequent write must work.
  assert.equal(s.flushSync().ok, true);
});

// ---------------------------------------------------------------------------
test('hostile values in the file cannot reach gameplay maths', () => {
  // A hand-edited or partially-written file is untrusted input.
  const file = tmpFile('hostile');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({
    schema: 1,
    profiles: {
      evil: {
        key: 'evil',
        displayName: 'x'.repeat(500),
        totalXp: 'not a number',
        matchesPlayed: -99,
        completedRealMatches: 1e30,
        unlockedCharacters: [1, null, 'vera', { a: 1 }],
        mastery: { vera: 'NaN', __proto__: 'x' },
        history: [{ mode: 'ffa' }, 'garbage', null],
        ranked: { placed: 'yes', rating: -5, wins: Number.NaN },
      },
    },
  }), 'utf8');

  const s = new ProfileStore({ file, flushMs: 10 });
  s.load();
  const p = s.get('evil');

  assert.equal(typeof p.totalXp, 'number', 'NaN must not survive');
  assert.ok(p.totalXp >= 0, 'negative XP must be clamped');
  assert.ok(p.matchesPlayed >= 0);
  assert.ok(p.displayName.length <= 24, 'display name must be length-capped');
  assert.deepEqual(p.unlockedCharacters, ['vera'], 'only real strings survive');
  assert.ok(p.mastery.vera === 0 || p.mastery.vera > 0, 'mastery values are numbers');
  assert.ok(!Number.isNaN(p.mastery.vera));
  assert.ok(Array.isArray(p.history));
  assert.ok(p.history.every((h) => typeof h.mode === 'string'));
  assert.equal(p.ranked.placed, false, 'a truthy string is NOT placed — placement is earned, not coerced');
  assert.ok(p.ranked.rating >= 0, 'rating cannot be negative');
  assert.ok(!Number.isNaN(p.ranked.wins));
});

test('history is hard-capped on read so one file cannot grow unbounded', () => {
  const file = tmpFile('history');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const many = Array.from({ length: MAX_HISTORY + 200 }, (_, i) => ({
    mode: 'ffa', reason: 'time_limit', score: i, kills: i, deaths: i, banked: 0, character: 'vera', at: i,
  }));
  fs.writeFileSync(file, JSON.stringify({ schema: 1, profiles: { h: { key: 'h', history: many } } }), 'utf8');

  const s = new ProfileStore({ file, flushMs: 10 });
  s.load();
  assert.equal(s.get('h').history.length, MAX_HISTORY, 'history must be truncated to the cap');
});

// ---------------------------------------------------------------------------
test('writes are debounced, not per-mutation', () => {
  const file = tmpFile('debounce');
  const s = new ProfileStore({ file, flushMs: 40 });
  s.load();
  const p = s.get('x');
  for (let i = 0; i < 50; i += 1) { p.totalXp = i; s.markDirty(); }
  // Nothing on disk yet — the timer has not fired.
  assert.equal(fs.existsSync(file), false, 'a burst of mutations must coalesce');
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.equal(fs.existsSync(file), true, 'the write lands after the debounce');
      const after = new ProfileStore({ file, flushMs: 10 });
      after.load();
      assert.equal(after.get('x').totalXp, 49, 'the LAST value wins, not the first');
      resolve();
    }, 140);
  });
});

test('writes are atomic — a temp file is renamed over the target', () => {
  const file = tmpFile('atomic');
  const s = new ProfileStore({ file, flushMs: 5 });
  s.load();
  s.get('a').totalXp = 1;
  s.flushSync();
  s.get('a').totalXp = 2;
  s.flushSync();

  // No temp files left behind.
  const leftovers = fs.readdirSync(path.dirname(file)).filter((f) => f.includes('.tmp'));
  assert.deepEqual(leftovers, [], 'temp files must not linger');
  // And the target is always parseable (previous good copy or the new one).
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(parsed.profiles.a.totalXp, 2);
});

test('session-only fields never reach disk', () => {
  const file = tmpFile('session');
  const s = new ProfileStore({ file, flushMs: 5 });
  s.load();
  const p = s.get('sess');
  // Realistic usage: mutate, then hand it back to the store (this is exactly
  // what `saveProfile` does after a match).
  p.lastSocketId = 'socket-123';
  p.totalXp = 10;
  s.set(p);
  s.flushSync();

  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(raw.profiles.sess.lastSocketId, undefined, 'a live socket id is not persistent data');
  assert.equal(raw.profiles.sess.totalXp, 10);
});

// ---------------------------------------------------------------------------
test('leaderboard ranks placed players by rating and hides unplaced ones', () => {
  const s = new ProfileStore({ file: tmpFile('lb'), flushMs: 5 });
  s.load();
  s.set({ key: 'a', displayName: 'A', ranked: { placed: true, rating: 1500, wins: 9, losses: 2, seasonId: 's1' } });
  s.set({ key: 'b', displayName: 'B', ranked: { placed: true, rating: 1900, wins: 20, losses: 3, seasonId: 's1' } });
  s.set({ key: 'c', displayName: 'C', ranked: { placed: false, rating: 9999, wins: 0, losses: 0, seasonId: 's1' } });

  const lb = s.leaderboard({ seasonId: 's1' });
  assert.deepEqual(lb.map((e) => e.key), ['b', 'a'], 'highest rating first; unplaced excluded');
});

test('normaliseProfile refuses an unusable key rather than inventing one', () => {
  assert.equal(normaliseProfile({ key: 'x' }, ''), null);
  assert.equal(normaliseProfile(null, 'x'), null);
  assert.equal(normaliseProfile('string', 'x'), null);
  assert.ok(normaliseProfile({ key: 'x' }, 'x'));
});

console.log('\npersistence checks done');
