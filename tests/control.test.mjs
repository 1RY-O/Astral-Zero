/**
 * Astral Zero — Control Point (S14.5) rules test.
 *
 * The mode's entire premise is that it is NOT a numbers check. These tests pin
 * that premise and the two anti-farm rules:
 *   - a CONTESTED point freezes solid (no drift toward either team),
 *   - an unattended point BLEEDS back to neutral (camping is worthless),
 *   - a team that just lost the point is LOCKED OUT until it is cleared (the
 *     see-saw guard).
 *
 * Run: node tests/control.test.mjs
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { initControlPoint, tickControlPoint, checkControlWin, controlWire, pointCentre } from '../src/game/control.js';
import { resolveMap } from '../src/game/maps.js';

const EV = { OBJECTIVE_EVENT: 'objective_event' };
const DT = 0.05; // 20 Hz tick

function stubIo() {
  const sent = [];
  return { sent, to: () => ({ emit: (e, p) => sent.push({ e, p }) }) };
}

function makeRoom(mode = 'control_point', bodies = []) {
  const sim = {
    entities: new Map(bodies.map((b) => [b.id, { alive: true, disconnected: false, hp: 100, ...b }])),
    projectiles: [], tokens: [], stats: {},
  };
  return { id: 'room_cp', mode, map: resolveMap('orbital_junkyard'), sim };
}

/** Put a body standing on the point. */
function stand(room, cp, team, count = 1, offset = 0) {
  for (let i = 0; i < count; i += 1) {
    room.sim.entities.set(`${team}${i}`, {
      id: `${team}${i}`, alive: true, disconnected: false, hp: 100,
      team, x: cp.x + offset + i * 4, y: cp.y,
    });
  }
}

/**
 * Step the objective forward by `ms`, on a clock that only ever moves FORWARD.
 *
 * A monotonic clock is not a detail here: the lockout is an absolute deadline,
 * so a helper that restarted at zero between phases would quietly rewind past
 * it and hide real bugs.
 *
 * @param {object} room
 * @param {number} ms
 * @param {object} [io]
 * @returns {object[]} every transition emitted during the window
 */
function run(room, ms, io) {
  room._t = room._t || 0;
  const steps = Math.max(1, Math.round(ms / (DT * 1000)));
  const events = [];
  for (let i = 0; i < steps; i += 1) {
    room._t += DT * 1000;
    const e = tickControlPoint(room, DT, room._t, io, EV);
    if (e) events.push(e);
  }
  return events;
}

// ---------------------------------------------------------------------------
test('the point is off unless the mode opts in', () => {
  const r = makeRoom('ffa');
  assert.equal(initControlPoint(r), null);
  assert.equal(controlWire(r), null, 'no fake objective state for the client');
});

test('control_point creates a point at the arena centre', () => {
  const r = makeRoom();
  const cp = initControlPoint(r);
  assert.ok(cp);
  const b = r.map.bounds;
  const c = pointCentre(r);
  assert.equal(cp.x, Math.round((b.minX + b.maxX) / 2));
  assert.equal(cp.y, c.y);
  assert.equal(cp.owner, 'neutral');
});

test('bodies outside the radius do not hold the point', () => {
  const r = makeRoom();
  const cp = initControlPoint(r);
  r.sim.entities.set('red0', { id: 'red0', alive: true, team: 'red', x: cp.x + cp.cfg.radius + 80, y: cp.y });
  run(r, 3000);
  assert.equal(cp.progress, 0, 'standing "near" it is not standing on it');
});

// ---------------------------------------------------------------------------
test('an unopposed team captures the neutral point', () => {
  const r = makeRoom();
  const cp = initControlPoint(r);
  stand(r, cp, 'red');
  const io = stubIo();
  const events = run(r, 4000, io);
  assert.equal(cp.owner, 'red', 'red took it');
  assert.equal(cp.progress, 100);
  const cap = events.find((e) => e.kind === 'capture');
  assert.ok(cap, 'a capture is a readable beat');
  assert.equal(cap.team, 'red');
  assert.equal(cap.from, 'neutral');
  assert.ok(io.sent.some((m) => m.e === 'objective_event'), 'the capture is broadcast');
});

test('a team without bodies never captures — the point cannot tick itself', () => {
  const r = makeRoom();
  const cp = initControlPoint(r);
  stand(r, cp, 'blue');
  run(r, 4000);
  assert.equal(cp.owner, 'blue');
  r.sim.entities.clear(); // everyone leaves
  const scoresAt = cp.scores.blue;
  run(r, 2000);
  assert.ok(cp.scores.blue <= scoresAt + 0.01, 'no score accrues on an empty point');
});

// ---------------------------------------------------------------------------
test('a CONTESTED point FREEZES — no drift toward either team (the core rule)', () => {
  const r = makeRoom();
  const cp = initControlPoint(r);
  stand(r, cp, 'red', 1, -20);
  run(r, 4000);
  assert.equal(cp.owner, 'red');
  const frozen = cp.progress;
  const redScore = cp.scores.red;

  stand(r, cp, 'blue', 1, 20); // contest it
  run(r, 3000);
  assert.equal(cp.owner, 'red', 'the larger presence does NOT take it');
  assert.equal(cp.progress, frozen, 'the bar does not drift while contested');
  assert.ok(cp.scores.red <= redScore + 0.01, 'the owner scores nothing while contested');
  assert.equal(cp.lastEvent, 'contested');
});

test('contesting from neutral also freezes — it cannot be won by numbers', () => {
  const r = makeRoom();
  const cp = initControlPoint(r);
  // Blue fields five bodies, red fields one: the point must still not flip.
  stand(r, cp, 'blue', 5, 60);
  stand(r, cp, 'red', 1, -60);
  run(r, 5000);
  assert.equal(cp.owner, 'neutral', 'a 5v1 does not capture the point');
  assert.equal(cp.progress, 0);
});

// ---------------------------------------------------------------------------
test('anti-farm 1: an unattended owned point BLEEDS back toward neutral', () => {
  const r = makeRoom();
  const cp = initControlPoint(r);
  stand(r, cp, 'red');
  run(r, 4000);
  assert.equal(cp.owner, 'red');

  r.sim.entities.clear(); // the camp leaves
  run(r, 12000);
  assert.equal(cp.owner, 'neutral', 'parking a body on it is not a strategy');
});

test('anti-farm 2: a team that LOST the point is locked out until it is cleared', () => {
  const r = makeRoom();
  const cp = initControlPoint(r);
  stand(r, cp, 'red');
  run(r, 4000);
  assert.equal(cp.owner, 'red');

  // Blue takes it legitimately.
  r.sim.entities.clear();
  stand(r, cp, 'blue');
  run(r, 4000);
  assert.equal(cp.owner, 'blue', 'blue took it');
  assert.ok(cp.locked.red > 0, 'red is locked out of the point it just lost');

  // Red rushes straight back in — the see-saw must not happen. Assert INSIDE
  // the lockout window: a claim like "still blue after 3s" is only meaningful
  // while the lockout is actually in force, so the deadline is checked too.
  r.sim.entities.clear();
  stand(r, cp, 'red');
  // Run only the time actually REMAINING on the lockout (minus a margin), so
  // the assertion is about the lockout and not about arithmetic drift.
  const remaining = cp.locked.red - r._t - 500;
  assert.ok(remaining > 500, `a real lockout window remains (got ${remaining}ms)`);
  run(r, remaining);
  assert.ok(cp.locked.red > r._t, `still locked out at t=${r._t} (until ${cp.locked.red})`);
  assert.equal(cp.owner, 'blue', 'red cannot instantly re-take it');
  assert.equal(cp.progress, 100, 'the bar is untouched while they are locked out');
  assert.equal(cp.lastEvent, 'locked');

  // And once the window closes, the point is takeable again — a lockout is a
  // delay, not a permanent veto.
  run(r, Math.max(0, cp.locked.red - r._t) + 200);
  assert.equal(cp.locked.red, 0, 'the lockout expired');
  run(r, 4000);
  assert.equal(cp.owner, 'red', 'and the point can be retaken afterwards');
});

test('the lockout expires on its own — it is a timer, not a veto', () => {
  const r = makeRoom();
  const cp = initControlPoint(r);
  stand(r, cp, 'red');
  run(r, 4000);
  r.sim.entities.clear();
  stand(r, cp, 'blue');
  run(r, 4000);
  assert.equal(cp.owner, 'blue');

  // Wait out the contest window with nobody on the point.
  r.sim.entities.clear();
  r._t = 20000; // forward past any lockout already in flight
  run(r, cp.cfg.contestLockMs + 2000);
  assert.equal(cp.locked.red, 0, 'the lockout expired');

  stand(r, cp, 'red');
  run(r, 4000);
  assert.equal(cp.owner, 'red', 'and the point can be retaken afterwards');
});

// ---------------------------------------------------------------------------
test('the point produces real score and a real win at the limit', () => {
  const r = makeRoom();
  const cp = initControlPoint(r);
  stand(r, cp, 'red');
  // Capture first, THEN hold for the full score — the budget needs both.
  run(r, 4000);
  run(r, (cp.cfg.scoreLimit / cp.cfg.tickRate + 2000) * 1000);
  assert.ok(cp.scores.red >= cp.cfg.scoreLimit, 'red accrued the score to win');
  const win = checkControlWin(r);
  assert.ok(win, 'the win check fires');
  assert.equal(win.team, 'red');
});

test('checkControlWin is null on a mode without the objective', () => {
  const r = makeRoom('ffa');
  initControlPoint(r);
  assert.equal(checkControlWin(r), null);
});

// ---------------------------------------------------------------------------
test('the wire view exposes the whole objective and invents nothing', () => {
  const r = makeRoom();
  const cp = initControlPoint(r);
  stand(r, cp, 'red');
  run(r, 4000);
  const w = controlWire(r);
  assert.equal(w.enabled, true);
  assert.equal(w.owner, 'red');
  assert.equal(w.progress, 100);
  assert.equal(w.contender, 'red');
  assert.equal(w.scoreLimit, cp.cfg.scoreLimit);
  assert.equal(w.radius, cp.cfg.radius);
  assert.equal(typeof w.scores.red, 'number');
});

test('a FFA room never serialises an objective', () => {
  const r = makeRoom('ffa');
  initControlPoint(r);
  assert.equal(controlWire(r), null);
});

console.log('\ncontrol point checks done');
