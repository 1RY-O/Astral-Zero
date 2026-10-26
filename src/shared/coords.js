/**
 * Solar Sentinel — the coordinate boundary (client ⇄ server).
 * ============================================================
 * The authoritative simulation and the Phaser client use different vertical
 * origins for the SAME body, and this module is the ONLY place that is allowed
 * to know it:
 *
 *   server: entity.y is FEET-SPACE  — `groundY` is the surface they stand on.
 *   client: sprite.origin is CENTER — the sprite centre, with a physics body
 *           hanging `feetOffsetPx` below it.
 *
 * Before this module existed the conversion was done nowhere. The server's
 * feet-space y was written directly onto a sprite centre (and onto remote
 * actors' sprites, and into the reconciliation error), so every player in the
 * game was 25 px adrift in y for as long as they lived. See
 * src/shared/tuning.js for the full story.
 *
 * Convert ONCE, at the boundary. Never let a feet-space number reach a sprite
 * setPosition, and never let a centre-space number reach the server.
 */

import { MOVEMENT } from './tuning.js';

/** Pixels between a body's feet and the client sprite's centre. */
export const FEET_OFFSET_PX = MOVEMENT.body.feetOffsetPx;

/**
 * Server feet-space y → client sprite centre y.
 * @param {number} feetY
 * @returns {number}
 */
export function feetToCentre(feetY) {
  return feetY - FEET_OFFSET_PX;
}

/**
 * Client sprite centre y → server feet-space y.
 * @param {number} centreY
 * @returns {number}
 */
export function centreToFeet(centreY) {
  return centreY + FEET_OFFSET_PX;
}

/**
 * Convert an authoritative {x, y} snapshot/position pair into the client's
 * sprite-space pair. Pure — used by reconciliation, remote actors and spawns so
 * they cannot each invent a slightly different conversion.
 * @param {{x: number, y: number}} authoritative
 * @returns {{x: number, y: number}}
 */
export function authoritativeToSprite(authoritative) {
  return { x: authoritative.x, y: feetToCentre(authoritative.y) };
}

/**
 * Inverse of authoritativeToSprite: client sprite space → the server's feet
 * space. Used when reporting our own predicted position back for comparison.
 * @param {{x: number, y: number}} sprite
 * @returns {{x: number, y: number}}
 */
export function spriteToAuthoritative(sprite) {
  return { x: sprite.x, y: centreToFeet(sprite.y) };
}

export default { FEET_OFFSET_PX, feetToCentre, centreToFeet, authoritativeToSprite, spriteToAuthoritative };
