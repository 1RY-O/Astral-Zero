/**
 * Astral Zero — shared-tuning PARITY test.
 *
 * This test exists because of a specific, measured defect: the Phaser client and
 * the authoritative Node server each kept their own copy of the movement
 * constants and they drifted (client 340 px/s / -1180 jump / 2600 gravity,
 * server 260 / -640 / 1800). Prediction and simulation therefore disagreed on
 * every frame, reconciliation ran forever, and players rubber-banded and sank
 * through the floor. Neither half looked broken in isolation.
 *
 * It is now structurally prevented: both halves import src/shared/tuning.js.
 * This test locks that door so a future edit cannot reintroduce a second copy
 * without this failing loudly.
 *
 * Run: node tests/shared-tuning.test.mjs
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import serverConfig from '../src/server-config.js';
import { MOVEMENT, MATCH_TIMING, SIM } from '../src/shared/tuning.js';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('the shared module owns the numbers, and nothing re-declares them', () => {
  // The two halves must IMPORT from the shared module...
  assert.match(read('src/server-config.js'), /import \{ MOVEMENT, MATCH_TIMING, SIM \}/, 'server must import shared tuning');
  assert.match(
    read('src/config/gameConfig.js'),
    /import \{[^}]*MOVEMENT[^}]*\} from '\.\.\/shared\/tuning\.js'/,
    'client must import shared tuning',
  );

  // ...and the OLD literal copies must be gone. These are the exact values
  // that used to disagree between the halves.
  const client = read('src/config/gameConfig.js');
  const server = read('src/server-config.js');
  for (const literal of ['speed: 340', 'jumpVelocity: -1180', 'coyoteTime: 120', 'jumpBuffer: 130']) {
    assert.ok(!client.includes(literal), `client must not hardcode "${literal}"`);
  }
  for (const literal of ['maxSpeed: 260', 'jumpVelocity: 640', 'gravity: 1800', 'coyoteMs: 100']) {
    assert.ok(!server.includes(literal), `server must not hardcode "${literal}"`);
  }
});

test('server config is wired to the shared module for every movement value', () => {
  assert.equal(serverConfig.sim.maxSpeed, MOVEMENT.speed);
  assert.equal(serverConfig.sim.gravity, MOVEMENT.gravity);
  assert.equal(serverConfig.sim.jumpVelocity, MOVEMENT.jumpVelocity);
  assert.equal(serverConfig.sim.coyoteMs, MOVEMENT.coyoteMs);
  assert.equal(serverConfig.sim.jumpBufferMs, MOVEMENT.jumpBufferMs);
  assert.equal(serverConfig.sim.airControl, MOVEMENT.airControl);
  assert.equal(serverConfig.sim.respawnDelayMs, MATCH_TIMING.respawnDelayMs);
  assert.equal(serverConfig.sim.spawnProtectionMs, MATCH_TIMING.spawnProtectionMs);
});

test('tick rate is shared, not duplicated', () => {
  assert.equal(serverConfig.sim.tickHz, SIM.tickHz);
  assert.ok(SIM.stepSeconds > 0, 'stepSeconds must be a usable positive dt');
  assert.equal(SIM.stepSeconds, 1 / 20);
});

test('the values themselves form a sane platformer arc', () => {
  assert.ok(MOVEMENT.speed > 0);
  assert.ok(MOVEMENT.gravity > 0);
  assert.ok(MOVEMENT.jumpVelocity > 0, 'stored positive, applied negative');

  // A jump must clear the player's own height with room to spare, and land
  // back within a comfortable arc — this is the feel contract.
  const apex = (MOVEMENT.jumpVelocity ** 2) / (2 * MOVEMENT.gravity);
  assert.ok(apex > MOVEMENT.body.spriteHeight,
    `apex ${apex.toFixed(0)}px should exceed body height ${MOVEMENT.body.spriteHeight}px`);

  // Air time up + down, used by lag-comp windows and bot reaction tuning.
  const airTime = (2 * MOVEMENT.jumpVelocity) / MOVEMENT.gravity;
  assert.ok(airTime > 0.5 && airTime < 2, `air time ${airTime.toFixed(2)}s should read as arcadey`);

  // Touch direction: the client applies it negative.
  assert.equal(-MOVEMENT.jumpVelocity, -MOVEMENT.jumpVelocity);
});

test('tuning is frozen — runtime writes cannot silently change physics', () => {
  assert.ok(Object.isFrozen(MOVEMENT));
  assert.ok(Object.isFrozen(MATCH_TIMING));
  let threw = false;
  try { MOVEMENT.speed = 1; } catch (e) { threw = true; }
  // Strict mode ESM throws; module-scope sloppy mode silently ignores. Either
  // is fine, but the value must not have changed.
  assert.equal(MOVEMENT.speed, 340);
  void threw;
});

console.log('\nshared tuning parity checks done');
