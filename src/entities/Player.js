import Phaser from 'phaser';
import { PLAYER, AIM } from '../config/gameConfig.js';

/**
 * Astral Zero - Player entity.
 *
 * Responsibilities:
 *  1. Horizontal movement with snappy accel/drag (Raze-style feel).
 *  2. Jumping with two forgiveness windows: coyote time and jump buffering.
 *  3. Always facing the mouse cursor (body flips, muzzle marker rotates 360).
 *
 * NOTE ON ARCHITECTURE: this class is driven by a plain `InputIntent` object
 * rather than reading the keyboard itself. That keeps the exact same code path
 * usable for the local player, (future) remote players replayed from the
 * server, and (future) bots - see src/input/InputManager.js.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  /**
   * @param {Phaser.Scene} scene - Owning scene.
   * @param {number} x - Spawn X (world).
   * @param {number} y - Spawn Y (world).
   */
  constructor(scene, x, y) {
    super(scene, x, y, 'player');

    // Add to the display list AND the Arcade physics system.
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Draw in front of the gray-box arena.
    this.setDepth(PLAYER.depth);

    // --- Collision body -----------------------------------------------------
    // Inset the body slightly so the player can squeeze through gaps and
    // doesn't appear to clip platform corners.
    this.body.setSize(PLAYER.body.width, PLAYER.body.height);
    // setSize() anchors the body at the top-left; re-centre it manually.
    this.body.setOffset(
      (PLAYER.width - PLAYER.body.width) / 2,
      (PLAYER.height - PLAYER.body.height) / 2,
    );

    // Don't leave the arena bounds.
    this.setCollideWorldBounds(true);

    // Cap only the FALLING speed so long drops don't stretch the sprite into a
    // smear. The X axis is left unlimited on purpose: Arcade's maxVelocity is
    // symmetric, and capping Y at maxFallSpeed would also cap the upward jump
    // impulse (clipping it to -1100 and flattening the arc). Downward speed is
    // clamped explicitly in _updateJump instead.
    this.body.setMaxVelocity(PLAYER.speed * 2, PLAYER.maxFallSpeed);

    // --- State --------------------------------------------------------------
    /** True while resting on a platform (used for HUD/animations later). */
    this.isGrounded = false;
    /** Ms of coyote time left (jump grace after walking off a ledge). */
    this._coyoteTimer = 0;
    /** Ms of buffered jump left (input grace before landing). */
    this._jumpBufferTimer = 0;
    /** Current aim angle in radians; 0 = pointing right. */
    this._aimAngle = AIM.initialAngle;
    /** Aim indicator sprite (owned by the scene, positioned each frame). */
    this.muzzle = null;
    /**
     * Server-authoritative health. The client NEVER decrements this itself —
     * only a `player_health_update` / snapshot from the server changes it, so a
     * modified client cannot grant itself health.
     */
    this.hp = 100;
    /** True between a death and the next respawn. */
    this.dead = false;
  }

  /**
   * Enables collision against the arena platforms. Called by ArenaScene once
   * the platforms exist.
   * @param {Phaser.GameObjects.GameObject[]} platforms - Static bodies.
   * @param {Phaser.Physics.Arcade.ArcadePhysics} physics
   * @returns {void}
   */
  registerCollisions(platforms, physics) {
    physics.add.collider(this, platforms);
  }

  /**
   * Per-frame update.
   * @param {number} _time - Total elapsed ms (reserved for animation timing).
   * @param {number} delta - Frame delta in ms.
   * @param {import('../input/InputManager.js').InputIntent} intent - Input intent.
   * @returns {void}
   */
  update(_time, delta, intent) {
    this._updateHorizontal(intent);
    this._updateJump(delta, intent);
    this._updateAim(intent);
    this._updateJuice(delta);
  }

  /**
   * Horizontal movement: accelerate toward the target speed, and apply drag
   * when the input is released so the player coasts to a stop.
   * @param {import('../input/InputManager.js').InputIntent} intent
   */
  _updateHorizontal(intent) {
    this.body.setAccelerationX(intent.moveX * PLAYER.acceleration);

    // Drag only when no horizontal input (release to slide/stop).
    this.setDragX(intent.moveX === 0 ? PLAYER.dragX : 0);

    // Hard-cap horizontal speed so acceleration can't overshoot the target.
    if (Math.abs(this.body.velocity.x) > PLAYER.speed) {
      this.body.velocity.x = Math.sign(this.body.velocity.x) * PLAYER.speed;
    }

    // Flip the body sprite to face the direction of travel. The muzzle marker
    // (below) is what tracks the cursor for true 360-degree aiming.
    if (intent.moveX !== 0) {
      this.setFlipX(intent.moveX < 0);
    }
  }

  /**
   * Jump logic with coyote time + jump buffering for a forgiving feel.
   *
   * Coyote time: you may still jump for a few ms after walking off a ledge.
   * Jump buffer: a jump pressed a few ms before landing still fires on touchdown.
   * Both are what make a platformer feel "responsive" rather than strict.
   *
   * @param {number} delta - Frame delta in ms.
   * @param {import('../input/InputManager.js').InputIntent} intent
   */
  _updateJump(delta, intent) {
    // --- Grounded detection -------------------------------------------------
    // Arcade sets blocked.down while resting on a platform; touching.down is
    // true on the impact frame. Either one means "we can jump".
    const onGround = this.body.blocked.down || this.body.touching.down;
    this.isGrounded = onGround;

    if (onGround) {
      // Refresh the full grace window while actually standing on ground.
      this._coyoteTimer = PLAYER.coyoteTime;
    } else {
      this._coyoteTimer = Math.max(0, this._coyoteTimer - delta);

      // Terminal velocity: Arcade's maxVelocity is symmetric and would also
      // cap the upward jump impulse, so clamp the falling speed by hand here.
      if (this.body.velocity.y > PLAYER.maxFallSpeed) {
        this.body.velocity.y = PLAYER.maxFallSpeed;
      }
    }

    // --- Jump buffer --------------------------------------------------------
    if (intent.jumpPressed) {
      this._jumpBufferTimer = PLAYER.jumpBuffer;
    } else {
      this._jumpBufferTimer = Math.max(0, this._jumpBufferTimer - delta);
    }

    // --- Execute the jump ---------------------------------------------------
    // Allowed while grounded OR inside the coyote grace window.
    const canJump = onGround || this._coyoteTimer > 0;
    if (canJump && this._jumpBufferTimer > 0) {
      this.body.setVelocityY(PLAYER.jumpVelocity);

      // Consume both timers so a single press can't double-jump.
      this._jumpBufferTimer = 0;
      this._coyoteTimer = 0;
      this.isGrounded = false;

      // Compression squash on takeoff: reads as the player coiling to jump.
      this._scaleSquashX = 1.12;
      this._scaleSquashY = 0.86;
    }
  }

  /**
   * Aim toward the cursor. The body stays upright (flipping only for
   * readability) while the muzzle marker rotates a full 360 degrees to show
   * the exact aim direction toward the pointer.
   * @param {import('../input/InputManager.js').InputIntent} intent
   */
  _updateAim(intent) {
    // Vector from the player's centre to the world-space cursor.
    const dx = intent.aimX - this.x;
    const dy = intent.aimY - this.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 1) {
      // Ease toward the cursor angle; RotateTo always takes the short way
      // around the circle, avoiding a spin the long way at +/-PI.
      this._aimAngle = Phaser.Math.Angle.RotateTo(
        this._aimAngle,
        Math.atan2(dy, dx),
        AIM.smoothing,
      );

      // Flip the body so the visor "looks" toward the cursor side.
      this.setFlipX(dx < 0);
    }

    // Park the aim indicator just outside the player, pointing along the angle.
    if (this.muzzle) {
      this.muzzle.setPosition(
        this.x + Math.cos(this._aimAngle) * AIM.muzzleLength,
        this.y + Math.sin(this._aimAngle) * AIM.muzzleLength,
      );
      this.muzzle.setRotation(this._aimAngle);
      // Keep the indicator level with the player even while jumping fast.
      this.muzzle.setDepth(this.depth + 1);
    }
  }

  /**
   * Squash-and-stretch: eases the takeoff squash back to neutral so landings
   * and jumps read as springy rather than snappy-hard.
   * @param {number} delta - Frame delta in ms.
   */
  _updateJuice(delta) {
    // Convert the per-frame delta into a frame-rate independent lerp factor.
    const lerp = 1 - Math.pow(1 - AIM.smoothing, delta / 16.67);

    this._scaleSquashX = Phaser.Math.Linear(this._scaleSquashX, 1, lerp);
    this._scaleSquashY = Phaser.Math.Linear(this._scaleSquashY, 1, lerp);

    // A small vertical lean in the direction of travel adds momentum feel.
    if (this.isGrounded) {
      const lean = Phaser.Math.Clamp(this.body.velocity.x / PLAYER.speed, -1, 1) * 0.12;
      this.setScale(this._scaleSquashX, this._scaleSquashY);
      this.setRotation(lean);
    } else {
      // Airborne: tilt slightly toward the aim for a "floating in space" pose.
      this.setScale(this._scaleSquashX, this._scaleSquashY);
      this.setRotation(Phaser.Math.Linear(this.rotation, 0, lerp));
    }
  }

  /**
   * Attach the aim indicator sprite used to visualise aim direction.
   *
   * The indicator is owned by the scene (not created here) so the scene keeps
   * full control over its depth sorting and z-order relative to other objects.
   * In Phase 2 this same object becomes the actual weapon/muzzle.
   *
   * @param {Phaser.GameObjects.GameObject} muzzle
   * @returns {void}
   */
  attachMuzzle(muzzle) {
    this.muzzle = muzzle;
  }

  /**
   * Current aim angle in radians (0 = pointing right).
   *
   * Exposed for combat, which needs the same angle the muzzle marker uses —
   * reading the private `_aimAngle` directly would couple the two, and firing
   * along a slightly different angle than the visible barrel is exactly the
   * kind of "my shot went somewhere else" bug players hate.
   *
   * @returns {number} Radians.
   */
  getAimAngle() {
    return this._aimAngle;
  }

  /**
   * Enter or leave the dead state.
   *
   * While dead the sprite is hidden and input is ignored, but the body is NOT
   * destroyed or disabled — the camera keeps following the position so the
   * death overlay has a stable frame, and respawning is then just a teleport
   * plus a fade rather than a reconstruction.
   *
   * @param {boolean} isDead
   * @returns {void}
   */
  setDead(isDead) {
    this.dead = isDead;
    this.setVisible(!isDead);
    if (isDead) {
      // Stop the corpse from drifting: zero the velocity and release the keys.
      this.body.setVelocity(0, 0);
      this.body.setAllowGravity(false);
    } else {
      this.body.setAllowGravity(true);
    }
  }

  /**
   * Neutral squash values used before the first jump. Declared as class
   * fields (rather than assigned in the constructor body) so they are
   * guaranteed to exist before the first frame's juice math runs.
   */
  _scaleSquashX = 1;
  _scaleSquashY = 1;
}