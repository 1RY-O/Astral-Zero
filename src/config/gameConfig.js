import Phaser from 'phaser';
// Movement constants are SHARED with the authoritative server. Importing rather
// than re-declaring them is what keeps client prediction and server simulation
// in step — see src/shared/tuning.js for the bug that duplicated copies caused.
import { MOVEMENT, MATCH_TIMING, SIM, WEAPON } from '../shared/tuning.js';
import { PALETTE } from './uiTheme.js';

/**
 * Astral Zero - central game configuration.
 *
 * Everything that defines the *feel* of Astral Zero lives here so that game
 * code stays declarative and can be tuned in a single place. Values are chosen
 * to match the snappy, heavy, slightly exaggerated movement of Raze 3:
 * strong gravity, instant acceleration, and a floaty-but-controlled jump arc.
 */

/**
 * Core Phaser + renderer configuration.
 *
 * `type: Phaser.AUTO` lets Phaser pick WebGL with a Canvas fallback.
 * `pixelArt` is off because the art direction is smooth/bright rather than
 * chunky-pixel, but `roundPixels` is on to avoid shimmering sprites.
 *
 * @type {Phaser.Types.Core.GameConfig}
 */
export const GAME_CONFIG = {
  type: Phaser.AUTO,
  parent: 'game-root',

  // Logical resolution. Phaser scales the canvas to fit while preserving the
  // 16:9 aspect ratio, so gameplay maths stays resolution-independent.
  width: 1280,
  height: 720,

  // Bright cartoonish space palette, used by the procedural gray-box textures
  // and the starfield background.
  backgroundColor: PALETTE.void2Css,

  // Arcade physics tuned for fast platformer-shooter action.
  physics: {
    default: 'arcade',
    arcade: {
      // Strong downward pull: ~2600 px/s^2 makes jumps land quickly and
      // gives the "heavy but snappy" Raze-style arc. Shared with the server.
      gravity: { y: MOVEMENT.gravity },

      // Fixed 60 FPS simulation step keeps physics deterministic, which is
      // essential for a future multiplayer/netcode layer (and for replay).
      fps: 60,

      // Render debug bodies when toggled with the DEBUG_PHYSICS flag below.
      debug: false,
    },
  },

  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },

  render: {
    antialias: true,
    roundPixels: true,
    pixelArt: false,
  },

  // No arcade/other loader banners needed.
  banner: false,
};

/**
 * Scene key constants - avoids string typos across scene transitions.
 */
export const SCENES = {
  BOOT: 'BootScene',
  PRELOAD: 'PreloadScene',
  LOBBY: 'LobbyScene',
  ARENA: 'ArenaScene',
  HOME: 'HomeScene',
};

/**
 * Player tuning. These numbers are the heart of the movement "feel".
 *
 * They are NOT literals: every movement value is re-exported from
 * src/shared/tuning.js, which the authoritative server imports from the same
 * module. Keeping one copy is what stops the local prediction from fighting
 * the server's simulation (see that file's header for the bug that caused).
 */
export const PLAYER = {
  // Visual size of the placeholder janitor sprite.
  width: MOVEMENT.body.spriteWidth,
  height: MOVEMENT.body.spriteHeight,

  // The Arcade physics body is deliberately narrower and shorter than the
  // sprite (classic platformer practice) so the player can squeeze under
  // tight gaps without looking like they are clipping into geometry.
  body: {
    width: MOVEMENT.body.width,
    height: MOVEMENT.body.height,
  },

  // Horizontal speed in px/s. Raze-flavoured: fast enough to cross the arena
  // in ~2 seconds.
  speed: MOVEMENT.speed,

  // Jump impulse applied on the Y axis. Combined with the gravity this
  // gives an apex of roughly (v^2 / 2g) px — a little over half a screen.
  jumpVelocity: -MOVEMENT.jumpVelocity,

  // Acceleration / friction. Arcade physics uses these when you *set* velocity
  // manually, so instead of hard-setting speed we ramp toward it for that
  // snappy, "instant but not robotic" control feel.
  acceleration: 4200,
  dragX: 4600,

  // Maximum fall speed (terminal velocity) - stops the player from stretching
  // into a smear when dropping off a tall platform.
  maxFallSpeed: MOVEMENT.maxFallSpeed,

  // Forgiveness windows, both crucial for good platformer feel.
  // Coyote time: you can still jump this many ms after walking off a ledge.
  coyoteTime: MOVEMENT.coyoteMs,
  // Jump buffer: a jump pressed this many ms before landing still fires.
  jumpBuffer: MOVEMENT.jumpBufferMs,

  // Releasing jump early cuts the remaining rise (variable jump height).
  jumpReleaseFactor: MOVEMENT.jumpReleaseFactor,

  // Respawn + spawn protection: shared with the server so the countdown the
  // client shows is the delay the server actually applies.
  respawnDelayMs: MATCH_TIMING.respawnDelayMs,
  spawnProtectionMs: MATCH_TIMING.spawnProtectionMs,

  // Depth value drawn last so the player renders in front of the gray-box.
  depth: 10,
};

/** Server tick cadence this client predicts against (Hz). */
export const SIM_HZ = SIM.tickHz;

/**
 * Aiming configuration.
 *
 * The player always faces the mouse cursor. The angle is computed manually
 * rather than with Phaser's built-in `rotation` on the whole sprite, because a
 * rotating upright character looks wrong - instead the body stays upright and
 * flips horizontally while a separate "muzzle"/weapon marker rotates freely.
 */
export const AIM = {
  // Length of the barrel/muzzle stub drawn from the player centre. Shared with
  // the authoritative projectile spawn so the visible muzzle is where the round
  // the server resolves actually leaves from.
  muzzleLength: WEAPON.muzzleReachPx,
  // Easing factor for cosmetic squash-and-stretch recovery ONLY. Aim itself
  // snaps to the canonical target every frame (see Player._updateAim): an
  // eased aim lagged the cursor, so laser, barrel and round disagreed.
  smoothing: 0.35,
  // Start angle in radians; 0 rad points right. Only cosmetic until a sprite
  // is assigned in Player.js.
  initialAngle: 0,
};

/**
 * Aiming ray / laser sight (Phase 5).
 *
 * A thin guide drawn from the weapon muzzle along the CURRENT aim vector, so
 * the player can read where they are pointing without waiting for a tracer.
 * It is a GUIDE, never a hit line: the weapons fire physical projectiles with
 * travel time and spread (see src/combat/weapons.js), so the ray only shows the
 * muzzle direction out to the weapon's range. It stops at the first solid
 * platform so it never reads as "shooting through walls".
 *
 * Rendering is a SINGLE reused Graphics object redrawn each frame (no tween, no
 * per-frame allocation, no network traffic). The distance fade is faked by
 * drawing the ray in `segments` short pieces with a decaying alpha, which needs
 * no gradient support.
 */
export const AIM_RAY = {
  /** Tint — cyan so it contrasts with the amber projectile tracer + dark arena. */
  color: PALETTE.cyanLight,
  /** Core line width in px (thin: a sight, not a bar). */
  width: 2,
  /** Alpha at the muzzle end (restrained — must not obscure enemies). */
  nearAlpha: 0.42,
  /** Alpha at the far end (nearly gone, so the fade reads with distance). */
  farAlpha: 0.04,
  /** Number of segments the fade is drawn in (more = smoother, still cheap). */
  segments: 14,
  /** Radius of the small terminus dot (px). */
  tipRadius: 2.5,
  /** Alpha of the terminus dot. */
  tipAlpha: 0.5,
  /**
   * Depth. Above the backdrop/platforms (-9) but BELOW actors (9), so a bot
   * crossing the ray is drawn on top and never obscured by the sight.
   */
  depth: 5,
};


/**
 * Gray-box arena layout (Phase 1 test arena).
 *
 * Positions are defined in a data-only structure so that converting this into
 * real, tilemap-driven level data later is a drop-in change.
 */
export const ARENA = {
  // Ground platform: x/y is the CENTRE of the body, matching Arcade physics.
  ground: { x: 640, y: 680, width: 1280, height: 80 },

  /**
   * Four floating platforms, positioned to create interesting jump routing:
   * two low, two high, alternating sides to practise both directions.
   *
   * IMPORTANT for the jump arc: the player must be able to rise ~270px from
   * the floor. Nothing may sit directly above the spawn column, or the first
   * jump would bonk the player's head on the way up.
   */
  platforms: [
    { x: 260, y: 540, width: 240, height: 28 },
    { x: 640, y: 450, width: 200, height: 28 },
    { x: 1020, y: 540, width: 240, height: 28 },
    { x: 860, y: 300, width: 180, height: 28 },
  ],

  /**
   * Where the player spawns (feet on the ground, so y sits just above it).
   *
   * x = 480 sits in the gap between the first platform's right edge (x = 380)
   * and the middle platform's left edge (x = 540), leaving the full jump arc
   * unobstructed. Spawning at x = 320 would put a platform directly overhead,
   * clipping the player's head on the very first jump.
   */
  spawn: { x: 480, y: 600 },
};