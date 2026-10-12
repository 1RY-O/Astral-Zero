/**
 * Astral Zero — coordinate boundary test (feet-space ⇄ sprite-centre).
 *
 * The authoritative simulation is FEET-SPACE (entity.y is where the feet are,
 * so `groundY` is the surface they stand on). The Phaser client renders a
 * CENTRE-origin sprite with a physics body hanging below that centre.
 *
 * For a while nothing converted between the two, so:
 *   - the server's feet-space y was written straight onto the local player's
 *     sprite centre on every reconciliation snap, and
 *   - every remote player and bot was drawn `FEET_OFFSET_PX` too low, with
 *     their nametag and health bar following them.
 * The result was a constant vertical disagreement that reconciliation could
 * never converge on.
 *
 * Run: node tests/coords.test.mjs
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { MOVEMENT } from '../src/shared/tuning.js';
import {
  FEET_OFFSET_PX,
  feetToCentre,
  centreToFeet,
  authoritativeToSprite,
  spriteToAuthoritative,
} from '../src/shared/coords.js';

test('the offset is derived from the real body, not a magic number', () => {
  const { spriteHeight, height } = MOVEMENT.body;
  // body top  = centre - spriteHeight/2 + (spriteHeight - height)/2
  // body bottom = body top + height
  const bodyTop = -spriteHeight / 2 + (spriteHeight - height) / 2;
  const bodyBottom = bodyTop + height;
  assert.equal(FEET_OFFSET_PX, bodyBottom, 'the offset must be the body bottom, not a guess');
  assert.equal(FEET_OFFSET_PX, MOVEMENT.body.feetOffsetPx);
  assert.ok(FEET_OFFSET_PX > 0, 'the feet are below the sprite centre');
  assert.equal(FEET_OFFSET_PX, 25, 'a 40x56 sprite with a 32x50 body hangs 25 px');
});

test('the round trip is lossless', () => {
  for (const y of [0, 40, 650, 1234.5, 720]) {
    assert.equal(centreToFeet(feetToCentre(y)), y);
    assert.equal(feetToCentre(centreToFeet(y)), y);
  }
});

test('a body resting on the floor has its sprite centre above groundY', () => {
  // Server: feet at groundY. Client: the sprite centre must sit above it.
  const centre = feetToCentre(650);
  assert.equal(centre, 625);
  assert.ok(centre < 650, 'centre must be above the floor, not on it');
});

test('object conversion is symmetric and pure', () => {
  const auth = { x: 300, y: 650 };
  const sprite = authoritativeToSprite(auth);
  assert.deepEqual(sprite, { x: 300, y: 625 });
  assert.deepEqual(spriteToAuthoritative(sprite), auth, 'round trip must recover the original');
  // Pure: the input must not be mutated (it is usually a frozen snapshot).
  assert.deepEqual(auth, { x: 300, y: 650 });
});

test('the conversion never diverges by a rounding drift over many samples', () => {
  let y = 650;
  for (let i = 0; i < 100000; i += 1) {
    y = centreToFeet(feetToCentre(y));
  }
  assert.equal(y, 650, 'round trip must be exact, not accumulating error');
});

console.log('\ncoords boundary checks done');
