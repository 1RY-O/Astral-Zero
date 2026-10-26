/**
 * Solar Sentinel — SHARED tuning (client + server).
 * ============================================================
 * ONE importable, dependency-free module that owns every number the client
 * predicts with AND the authoritative server simulates with. It is imported by
 * both halves of the project (the Phaser client through src/config/gameConfig.js
 * and the Node server through src/server-config.js), which is possible because
 * both are ESM and this file imports nothing.
 *
 * WHY THIS EXISTS (the defect it removes)
 * The two halves used to keep their OWN copies of the movement constants:
 *
 *                    client (gameConfig)   server (server-config)
 *   run speed          340 px/s               260 px/s     (+31%)
 *   jump impulse     -1180 px/s              -640 px/s     (+84%)
 *   gravity           2600 px/s²             1800 px/s²    (+44%)
 *   coyote             120 ms                 100 ms
 *   jump buffer        130 ms                 120 ms
 *
 * A client predicts "I am at x, rising at 1180 px/s" and an authoritative server
 * three frames later says "you are on the floor, you have never been in the air".
 * Nothing in either half was broken in isolation, yet every single snapshot
 * disagreed with every prediction, so reconciliation ran forever — players
 * rubber-banded, sank into the floor, and bounced on landing (measured at
 * ±150 px of position change per frame) while the room was perfectly stable.
 *
 * RULE: a movement value lives here, and nowhere else. If client and server need
 * a different number, that difference must be an explicit, documented decision
 * about PREDICTION vs AUTHORITY (e.g. simulation cadence), never an accidental
 * copy that drifted apart.
 */

/**
 * The raw body box, before the derived anchor constant is attached.
 * (Computed separately so `feetOffsetPx` can be part of the single frozen
 * literal — reassigning a frozen object's property throws in strict ESM.)
 */
const BODY = {
  spriteWidth: 40,
  spriteHeight: 56,
  width: 32,
  height: 50,
};

/**
 * How far the player's sprite CENTRE sits above their FEET.
 *
 * THE COORDINATE MODEL (kept explicit so nobody has to re-derive it)
 * The authoritative simulation is FEET-SPACE: an entity's `y` is where its
 * feet are, so `groundY` is the surface the feet rest on.
 * The Phaser client renders a CENTER-origin sprite whose physics body hangs
 * below that centre, so the sprite centre is `feetOffsetPx` above the feet.
 *
 * This used to be an implicit, undocumented difference. Reconciliation applied
 * the server's feet-space y straight onto a sprite centre, so every player was
 * permanently 25 px off in y — a constant, non-decaying error that the
 * reconciliation loop corrected forever, and every remote player (who has no
 * world-bounds constraint to hide the mistake) stood 25 px too low with their
 * nametag and health bar following.
 *
 * bod = sprite centre → body top → body bottom:
 *   top = -spriteHeight/2 + (spriteHeight - height)/2
 *   bottom = top + height
 */
const FEET_OFFSET_PX =
  BODY.height - BODY.spriteHeight / 2 + (BODY.spriteHeight - BODY.height) / 2;

/**
 * Movement + body tuning. Frozen: mutating tuning at runtime is not a feature
 * this project supports, and freezing makes accidental writes loud.
 */
export const MOVEMENT = Object.freeze({
  /** Horizontal run speed, px/s. Janitor boots are quick: arena crossed in ~2 s. */
  speed: 340,

  /** Downward acceleration, px/s². Heavy but snappy — jumps land fast. */
  gravity: 2600,

  /** Upward impulse on jump, px/s. apex = v² / 2g ≈ 268 px. */
  jumpVelocity: 1180,

  /**
   * Variable jump height: releasing the key early cuts the remaining rise.
   * 0.5 = half impulse on early release, the standard platformer feel.
   */
  jumpReleaseFactor: 0.5,

  /** Jump grace AFTER leaving a ledge (ms). */
  coyoteMs: 120,

  /** Jump buffered when pressed BEFORE landing (ms). */
  jumpBufferMs: 130,

  /** Horizontal control authority while airborne, 0..1 of ground control. */
  airControl: 0.7,

  /** Terminal falling speed, px/s (prevents smear on long drops). */
  maxFallSpeed: 1100,

  /** Body geometry + the centre→feet anchor, shared by both halves. */
  body: Object.freeze({ ...BODY, feetOffsetPx: FEET_OFFSET_PX }),
});

/**
 * Respawn / spawn protection. Both halves must agree to the millisecond or the
 * client's respawn countdown and the server's actual revival disagree, and
 * spawn protection is only real if the client's own prediction honours it.
 */
export const MATCH_TIMING = Object.freeze({
  /** Dead → alive, ms. */
  respawnDelayMs: 2500,
  /** Fresh spawns are immune to damage for this long, ms (anti spawn-kill). */
  spawnProtectionMs: 1500,
});

/**
 * Simulation cadence. The only place where a client/server asymmetry is
 * deliberate: the client renders at display refresh (typically 60 Hz) and
 * interpolates, while the server runs one fixed-step tick. These two numbers
 * MUST match each other (the client uses tickHz to know how to interpolate
 * between snapshots), but neither must equal the render rate.
 */
export const SIM = Object.freeze({
  /** Authoritative fixed step, Hz. */
  tickHz: 20,
  /** One fixed-step delta in seconds — the dt the physics integrator consumes. */
  get stepSeconds() {
    return 1 / this.tickHz;
  },
});

/**
 * Weapon geometry shared by the client's visuals and the server's simulation.
 *
 * The authoritative projectile spawns at the torso plus `muzzleReachPx` along
 * the (spread-adjusted) aim vector; the client's muzzle marker and tracer used
 * a length of 26, so the drawn tracer and the shell the server actually resolves
 * started 6 px and one build apart. Sharing the number makes the visible muzzle
 * where the round really leaves from.
 */
export const WEAPON = Object.freeze({
  /** px from the torso centre to the muzzle (server: entityRadius + 6). */
  muzzleReachPx: 20,
});

export default MOVEMENT;
