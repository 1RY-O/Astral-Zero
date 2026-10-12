/**
 * Astral Zero — Scrap Mimics (S14.4) rules test.
 *
 * The point of a mimic is that it is a FAIR trap. These tests pin the fairness
 * properties, not just "it moves": no arming below the player threshold, no
 * arming inside spawn protection, a visible telegraph window, no contact
 * damage during the telegraph, a slower chase than a player can run, and a
 * payout that rewards the greedy read.
 *
 * Run: node tests/mimics.test.mjs
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { initMimics, seedMimic, tickMimics, damageMimic, mimicsWire } from '../src/game/mimics.js';
import { resolveMap } from '../src/game/maps.js';

function makeRoom(mode = 'ffa', entities = []) {
  const map = resolveMap('orbital_junkyard');
  const sim = {
    entities: new Map(entities.map((e) => [e.id, {
      alive: true, disconnected: false, protectedUntil: 0, hp: 100, ...e,
    }])),
    projectiles: [],
    tokens: [],
    stats: {},
  };
  return { id: 'room_mimic', mode, map, sim };
}

const player = (id, x, y, over = {}) => ({ id, x, y, name: id, hp: 100, ...over });

/** A timestamp safely inside a mimic's life — after it seeded, before it rots. */
const bornAt = (mk) => mk.bornAt + 1;

/**
 * A stub socket handle. `applyHit` unconditionally emits the HP push, so a
 * mimic test that lands a bite needs somewhere to send it — this records the
 * emissions instead of throwing.
 */
function stubIo() {
  const sent = [];
  return {
    sent,
    to: () => ({ emit: (evt, payload) => sent.push({ evt, payload }) }),
  };
}
const EV = { PLAYER_HEALTH_UPDATE: 'player_health_update', ENTITY_DEATH: 'entity_death', STREAK_EVENT: 'streak_event' };

// ---------------------------------------------------------------------------
test('mimics are OFF unless the mode opts in', () => {
  const r = makeRoom('bot_practice', [player('a', 200, 500), player('b', 300, 500), player('c', 400, 500)]);
  assert.equal(initMimics(r), null);
  assert.equal(mimicsWire(r), null, 'no fake predator state for the client');
});

test('mimics are ON for ffa', () => {
  const r = makeRoom('ffa', [player('a', 200, 500)]);
  const m = initMimics(r);
  assert.ok(m);
  assert.equal(m.enabled, true);
  assert.deepEqual(m.list, []);
});

// ---------------------------------------------------------------------------
test('a mimic will NOT seed below the player threshold (fairness)', () => {
  const r = makeRoom('ffa', [player('a', 200, 500), player('b', 900, 500)]);
  const m = initMimics(r);
  assert.equal(seedMimic(r, m.nextSpawnAt), null, 'two players is not enough for a predator');
  assert.equal(m.list.length, 0);
});

test('a mimic WILL seed once the room is busy enough, clear of every player', () => {
  const r = makeRoom('ffa', [player('a', 200, 500), player('b', 640, 400), player('c', 1000, 500)]);
  const m = initMimics(r);
  const mk = seedMimic(r, m.nextSpawnAt);
  assert.ok(mk, 'three players clears the bar');
  assert.equal(mk.state, 'dormant');
  const b = r.map.bounds;
  assert.ok(mk.x > b.minX && mk.x < b.maxX, 'seeded inside the arena');
  // Clear of every player by more than the arm radius — you never spawn on bait.
  for (const e of r.sim.entities.values()) {
    assert.ok(Math.hypot(e.x - mk.x, e.y - mk.y) > m.cfg.armRadius,
      'a decoy must never seed on top of a player');
  }
});

test('the mimic cap is respected — the list can never grow without bound', () => {
  const r = makeRoom('ffa', [player('a', 200, 500), player('b', 640, 400), player('c', 1000, 500)]);
  const m = initMimics(r);
  for (let i = 0; i < 50; i += 1) seedMimic(r, m.nextSpawnAt);
  assert.ok(m.list.length <= m.cfg.maxActive, `capped at maxActive, got ${m.list.length}`);
});

// ---------------------------------------------------------------------------
test('walking over a dormant mimic starts a TELEGRAPH, not an instant bite', () => {
  const r = makeRoom('ffa', [player('a', 200, 500), player('b', 640, 400), player('c', 1000, 500)]);
  const m = initMimics(r);
  const mk = seedMimic(r, m.nextSpawnAt);
  // Teleport a player onto it.
  const p = r.sim.entities.get('c');
  p.x = mk.x; p.y = mk.y - 20;

  const t0 = m.nextSpawnAt;
  m.nextSpawnAt = Infinity; // isolate the arming behaviour from seeding
  const evts = tickMimics(r, 0.05, bornAt(mk));
  assert.ok(evts.some((e) => e.kind === 'arm'), 'arming is announced');
  assert.equal(mk.state, 'arming', 'it is telegraphing, not biting');
  assert.equal(evts.some((e) => e.kind === 'bite'), false, 'no damage during the telegraph');
  assert.equal(p.hp, 100, 'the telegraph is harmless');
});

test('the telegraph resolves into armed — and only then can it hurt', () => {
  const r = makeRoom('ffa', [player('a', 200, 500), player('b', 640, 400), player('c', 1000, 500)]);
  const m = initMimics(r);
  const mk = seedMimic(r, m.nextSpawnAt);
  const p = r.sim.entities.get('c');
  p.x = mk.x; p.y = mk.y - 20;
  m.nextSpawnAt = Infinity;

  tickMimics(r, 0.05, bornAt(mk), stubIo(), EV);   // arms
  const evts = tickMimics(r, 0.05, mk.armAt, stubIo(), EV); // telegraph elapses
  assert.equal(mk.state, 'armed');
  assert.ok(evts.some((e) => e.kind === 'lunge'), 'the lunge is its own readable beat');
  assert.equal(p.hp, 100, 'still harmless on the exact frame it arms');
});

test('a spawn-protected player can never be targeted', () => {
  // Three eligible players so the room clears the seed threshold, plus one who
  // is spawn-protected — a protected player must be invisible to the mimic,
  // AND must not count toward the threshold that lets it seed at all.
  const r = makeRoom('ffa', [
    player('a', 200, 500), player('b', 640, 400), player('d', 1100, 480),
    player('c', 1000, 500, { protectedUntil: 9_999_999_999_999 }),
  ]);
  const m = initMimics(r);
  const mk = seedMimic(r, m.nextSpawnAt);
  const p = r.sim.entities.get('c');
  p.x = mk.x; p.y = mk.y - 20;
  m.nextSpawnAt = Infinity;
  tickMimics(r, 0.05, bornAt(mk), stubIo(), EV);
  assert.equal(mk.state, 'dormant', 'spawn protection makes you invisible to the mimic');
});

test('contact damage is rate-limited — standing in it is not an instant kill', () => {
  const r = makeRoom('ffa', [player('a', 200, 500), player('b', 640, 400), player('c', 1000, 500)]);
  const m = initMimics(r);
  const mk = seedMimic(r, m.nextSpawnAt);
  const p = r.sim.entities.get('c');
  p.x = mk.x; p.y = mk.y - 20;
  m.nextSpawnAt = Infinity;
  tickMimics(r, 0.05, bornAt(mk));
  tickMimics(r, 0.05, mk.armAt);

  // Nudge onto the target and step repeatedly within one cooldown window.
  let t = mk.armAt;
  let bites = 0;
  const io = stubIo();
  for (let i = 0; i < 10; i += 1) {
    p.x = mk.x; p.y = mk.y;         // stay glued to it
    t += 50;
    const evts = tickMimics(r, 0.05, t, io, EV);
    bites += evts.filter((e) => e.kind === 'bite').length;
  }
  assert.ok(bites >= 1, 'it did connect');
  assert.ok(bites <= 2, `contact is rate-limited (got ${bites} bites in 500ms)`);
  assert.ok(p.hp > 0, 'a full-health player survives the cooldown window');
});

// ---------------------------------------------------------------------------
test('a mimic is always outrunnable (a trap is not a skill check)', () => {
  const r = makeRoom('ffa', [player('a', 200, 500), player('b', 640, 400), player('c', 1000, 500)]);
  const m = initMimics(r);
  assert.ok(m.cfg.speed < 260, `mimic speed ${m.cfg.speed} is below player base speed`);
});

test('a mimic can never leave the arena (no corner traps)', () => {
  const r = makeRoom('ffa', [player('a', 200, 500), player('b', 640, 400), player('c', 1000, 500)]);
  const m = initMimics(r);
  const mk = seedMimic(r, m.nextSpawnAt);
  m.nextSpawnAt = Infinity;
  tickMimics(r, 0.05, m.nextSpawnAt);
  tickMimics(r, 0.05, mk.armAt);
  let t = mk.armAt;
  for (let i = 0; i < 400; i += 1) {
    t += 50;
    tickMimics(r, 0.05, t);
    const b = r.map.bounds;
    assert.ok(mk.x >= b.minX - 0.001 && mk.x <= b.maxX + 0.001, `x escaped at step ${i}`);
    assert.ok(mk.y >= b.ceilingY - 0.001 && mk.y <= b.groundY + 0.001, `y escaped at step ${i}`);
  }
});

// ---------------------------------------------------------------------------
test('a dormant mimic is NOT shootable — the decoy must keep reading as scrap', () => {
  const r = makeRoom('ffa', [player('a', 200, 500), player('b', 640, 400), player('c', 1000, 500)]);
  const m = initMimics(r);
  const mk = seedMimic(r, m.nextSpawnAt);
  assert.equal(damageMimic(r, mk, 999, 'c', m.nextSpawnAt), false,
    'you cannot delete the decoy before it arms');
  assert.equal(mk.state, 'dormant');
  assert.equal(mk.hp, 20);
});

test('killing an ARMED mimic pays out more than the token it pretended to be', () => {
  const r = makeRoom('ffa', [player('a', 200, 500), player('b', 640, 400), player('c', 1000, 500)]);
  const m = initMimics(r);
  const mk = seedMimic(r, m.nextSpawnAt);
  mk.state = 'armed';
  const before = m.list.length;
  assert.equal(damageMimic(r, mk, 999, 'c', m.nextSpawnAt), true);
  assert.equal(mk.state, 'stunned');
  assert.equal(m.list.length, before + 1, 'the payout token is dropped');
  const payout = m.list[m.list.length - 1];
  assert.equal(payout.fromMimic, true);
  assert.ok(payout.value >= 5, `the greedy read pays (got ${payout.value})`);
});

test('a partially-damaged mimic survives a light hit', () => {
  const r = makeRoom('ffa', [player('a', 200, 500), player('b', 640, 400), player('c', 1000, 500)]);
  const m = initMimics(r);
  const mk = seedMimic(r, m.nextSpawnAt);
  mk.state = 'armed';
  assert.equal(damageMimic(r, mk, 5, 'c', m.nextSpawnAt), true);
  assert.equal(mk.state, 'armed', 'still hunting');
  assert.equal(mk.hp, 15);
});

// ---------------------------------------------------------------------------
test('an untouched decoy rots away — dead bait does not litter the arena', () => {
  const r = makeRoom('ffa', [player('a', 200, 500), player('b', 640, 400), player('c', 1000, 500)]);
  const m = initMimics(r);
  const mk = seedMimic(r, m.nextSpawnAt);
  m.nextSpawnAt = Infinity;
  tickMimics(r, 0.05, mk.ttl + 1);
  assert.equal(mk.state, 'stunned', 'it rotted');
  // …and is reaped rather than accumulating.
  let t = mk.ttl + 1;
  for (let i = 0; i < 20; i += 1) { t += 500; tickMimics(r, 0.05, t); }
  assert.ok(m.list.length < 1, 'the corpse is reaped');
});

test('the wire view hides corpses and never invents state', () => {
  const r = makeRoom('ffa', [player('a', 200, 500), player('b', 640, 400), player('c', 1000, 500)]);
  const m = initMimics(r);
  seedMimic(r, m.nextSpawnAt);
  const live = mimicsWire(r);
  assert.equal(live.enabled, true);
  assert.equal(live.list.length, 1);
  assert.ok(live.list[0].id.startsWith('mimic_'));

  const mk = m.list[0];
  mk.state = 'stunned';
  assert.equal(mimicsWire(r).list.length, 0, 'corpses are not broadcast');
});

console.log('\nscrap mimic checks done');
