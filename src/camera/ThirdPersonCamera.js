/**
 * Astral Zero — ThirdPersonCamera (Arsenal / Roblox style over-the-shoulder).
 * ============================================================
 * A self-contained camera controller that ArenaScene drives once per frame:
 *
 *     cameraRig.update(delta, player, inputIntent);
 *
 * It owns framing, aim lead, zoom response and visibility guarantees, so
 * ArenaScene stays a thin wiring layer and Player.js / InputManager.js are
 * completely untouched.
 *
 * THE 2D INTERPRETATION OF OVER-THE-SHOULDER
 * ------------------------------------------
 * Arsenal's camera orbits behind a 3D model on mouse movement. Astral Zero is
 * a 2D side-view arena, so the equivalent feel is produced by FRAMING rather
 * than by orbiting a pivot:
 *
 *  - the player is anchored OFF-CENTRE (left third), so the screen shows the
 *    space ahead of the aim instead of wasted space behind the player;
 *  - mouse movement LEADS the framing toward the cursor;
 *  - a constant SHOULDER BIAS pushes the framing opposite the aim, which is
 *    what actually sells "the camera is behind your shoulder";
 *  - ZOOM tightens when aiming and pulls back at speed;
 *  - a small camera TILT reacts to vertical aim, adding depth on a flat plane.
 *
 * GUARANTEES
 *  - The player is ALWAYS on screen (a post-update safety pass snaps the
 *    camera if smoothing would have pushed the player into an edge).
 *  - It never becomes first person: no zoom level or code path hides the
 *    player, and `maxZoom` is clamped well below "inside the head".
 *
 * All numbers live in src/config/cameraConfig.js.
 */

import Phaser from 'phaser';
import { CAMERA } from '../config/cameraConfig.js';
import { PLAYER } from '../config/gameConfig.js';

export class ThirdPersonCamera {
  /**
   * @param {Phaser.Scene} scene - Owning scene (for camera + units).
   * @param {object} [options]
   * @param {Phaser.Cameras.Scene2D.Camera} [options.camera] - Camera to drive.
   * @param {object} [options.worldBounds] - `{x,y,width,height}` of the arena.
   */
  constructor(scene, { camera = null, worldBounds = null } = {}) {
    this.scene = scene;
    this.cam = camera ?? scene.cameras.main;

    /** Arena rectangle used to clamp panning. */
    this.worldBounds = worldBounds;

    // --- Smoothed state (targets are recomputed every frame) ---------------
    this.currentZoom = CAMERA.baseZoom;
    this.currentScrollX = 0;
    this.currentScrollY = 0;

    // --- Aim smoothing (mouse-look inertia) --------------------------------
    this._leadX = 0;
    this._leadY = 0;
    this._tilt = 0;

    // --- Recoil accumulator, decayed every frame ---------------------------
    this._kickX = 0;
    this._kickY = 0;

    /** Consecutive frames the player was too close to an edge. */
    this._breachFrames = 0;

    this.enabled = true;

    this._applyInitialFraming();
  }

  /**
   * One-time camera setup: zoom, pixel rounding and world bounds.
   * @returns {void}
   */
  _applyInitialFraming() {
    this.cam.setRoundPixels(true);
    this.cam.setZoom(CAMERA.baseZoom);
    if (this.worldBounds) this._applyBounds(this.worldBounds);
  }

  /**
   * Push the arena rect to the camera as bounds, grown by `CAMERA.boundsPadding`
   * on every side.
   *
   * WHY THE PADDING MATTERS: the gray-box arena is exactly the size of the
   * viewport, so with hard bounds the camera can barely pan at all — Phaser
   * clamps the scroll and the off-centre anchor silently becomes a dead-centre
   * one. The overscan is empty headroom that gives the shoulder bias and aim
   * lead room to move without the framing snapping when the player nears an
   * edge. Nothing is drawn in the overscan region.
   *
   * @param {{x:number,y:number,width:number,height:number}} bounds
   * @returns {void}
   */
  _applyBounds(bounds) {
    const pad = CAMERA.boundsPadding;
    this.cam.setBounds(
      bounds.x - pad,
      bounds.y - pad,
      bounds.width + pad * 2,
      bounds.height + pad * 2,
    );
  }

  /**
   * Per-frame update. Call once, AFTER the player has moved.
   *
   * @param {number} delta - Frame delta in ms.
   * @param {Phaser.GameObjects.GameObject & {body?: Phaser.Physics.Arcade.Body}} player
   * @param {{moveX: number, jumpHeld: boolean, aimX: number, aimY: number}} intent
   * @returns {void}
   */
  update(delta, player, intent) {
    if (!this.enabled || !player) return;

    const lerpPos = this._smoothing(CAMERA.positionLerp, delta);
    const lerpZoom = this._smoothing(CAMERA.zoomLerp, delta);

    // -- 1. AIM LEAD (mouse-look) -------------------------------------------
    // Normalise the cursor offset from the player into a -1..1 deflection,
    // then convert that into pixels of camera lead.
    const aimDx = intent.aimX - player.x;
    const aimDy = intent.aimY - player.y;

    // A deadzone kills micro-jitter when the cursor rests on the player.
    const rawDeflectionX = Math.abs(aimDx) < CAMERA.deadzone ? 0 : aimDx / CAMERA.aimLeadRange;
    const rawDeflectionY =
      Math.abs(aimDy) < CAMERA.deadzone ? 0 : aimDy / (CAMERA.aimLeadRange * CAMERA.aimLeadYRatio);

    const targetLeadX = Phaser.Math.Clamp(rawDeflectionX, -1, 1) * CAMERA.aimLeadPixels;
    const targetLeadY = Phaser.Math.Clamp(rawDeflectionY, -1, 1) * CAMERA.aimLeadPixels * 0.5;

    this._leadX = Phaser.Math.Linear(this._leadX, targetLeadX, lerpPos);
    this._leadY = Phaser.Math.Linear(this._leadY, targetLeadY, lerpPos);

    // -- 2. SHOULDER BIAS ----------------------------------------------------
    // Push the framing OPPOSITE the aim: the camera sits behind the shoulder
    // we are NOT looking through. Reduced while idle so a standing player is
    // not permanently offset.
    const aimSign = aimDx >= 0 ? 1 : -1;
    const shoulderX = aimSign * CAMERA.shoulderBias * (Math.abs(intent.moveX) > 0 ? 1 : CAMERA.idleDriftRatio);

    // -- 3. JUMP / FALL LEAD -------------------------------------------------
    // Airborne, lead the arc so jumps read as powerful rather than flat.
    const body = player.body;
    const isAirborne = Boolean(body) && !body.blocked.down;
    const jumpLead = isAirborne
      ? Phaser.Math.Clamp(body.velocity.y * CAMERA.jumpLeadRatio, -CAMERA.jumpLeadMax, CAMERA.jumpLeadMax)
      : 0;

    // -- 4. TARGET POSITION --------------------------------------------------
    // Anchor maths: to place the player at `anchorXRatio` of the visible
    // width, the scroll must be `player.x - visibleWidth * anchorXRatio`,
    // where visibleWidth = viewportWidth / zoom.
    const targetZoom = Phaser.Math.Clamp(this._targetZoom(intent, body), CAMERA.minZoom, CAMERA.maxZoom);
    const visibleW = this.cam.width / targetZoom;
    const visibleH = this.cam.height / targetZoom;

    const desiredScrollX = player.x - visibleW * CAMERA.anchorXRatio + this._leadX + shoulderX + this._kickX;
    const desiredScrollY =
      player.y - visibleH * CAMERA.anchorYRatio + this._leadY + CAMERA.shoulderBiasY + jumpLead + this._kickY;

    // -- 5. SMOOTHED APPLICATION ---------------------------------------------
    this.currentScrollX = Phaser.Math.Linear(this.currentScrollX, desiredScrollX, lerpPos);
    this.currentScrollY = Phaser.Math.Linear(this.currentScrollY, desiredScrollY, lerpPos);
    this.currentZoom = Phaser.Math.Linear(this.currentZoom, targetZoom, lerpZoom);

    this.cam.setZoom(this.currentZoom);
    this.cam.setScroll(this.currentScrollX, this.currentScrollY);

    // -- 6. TILT -------------------------------------------------------------
    // A tiny rotation reacting to vertical aim: the cheapest convincing 3D
    // depth cue available on a flat 2D plane.
    const targetTilt = Phaser.Math.Clamp(-aimDy / 1400, -1, 1) * 0.021; // ≈1.2°
    this._tilt = Phaser.Math.Linear(this._tilt, targetTilt, lerpPos);
    this.cam.setRotation(this._tilt);

    // -- 7. DECAY RECOIL -----------------------------------------------------
    this._kickX = Phaser.Math.Linear(this._kickX, 0, lerpPos);
    this._kickY = Phaser.Math.Linear(this._kickY, 0, lerpPos);

    // -- 8. VISIBILITY GUARANTEE ---------------------------------------------
    this._ensurePlayerVisible(player);
  }

  /**
   * Target zoom: tighten when settling/aiming, pull back at running speed.
   * @param {{moveX: number}} intent
   * @param {Phaser.Physics.Arcade.Body|null} body
   * @returns {number}
   */
  _targetZoom(intent, body) {
    const speed = body ? Math.abs(body.velocity.x) : 0;
    const speedRatio = Phaser.Math.Clamp(speed / PLAYER.speed, 0, 1);

    // Zooming slightly IN while stationary reads as "settling into the
    // shoulder cam"; the aim bonus grows as the player starts to move.
    const settleBonus = speedRatio < 0.05 ? CAMERA.aimZoomBonus * 0.35 : 0;
    const aimBonus = CAMERA.aimZoomBonus * speedRatio * 0.5;

    return CAMERA.baseZoom + settleBonus + aimBonus - CAMERA.sprintZoomOut * speedRatio;
  }

  /**
   * Frame-rate independent lerp factor.
   *
   * A raw `alpha = 0.1` per frame feels different at 30 fps vs 144 fps. This
   * converts the authored per-60fps alpha into the equivalent for the current
   * delta, which keeps the camera feeling identical on any machine.
   *
   * @param {number} alpha - Authored smoothing factor (0..1).
   * @param {number} delta - Frame delta in ms.
   * @returns {number}
   */
  _smoothing(alpha, delta) {
    const clamped = Math.max(1, Math.min(delta, 100)); // ignore tab-switch spikes
    return 1 - Math.pow(1 - alpha, clamped / 16.667);
  }

  /**
   * Hard guarantee that the player never leaves the frame.
   *
   * Smoothing can lag behind a very fast flick. If the player's sprite comes
   * within `margin` px of a screen edge we snap the camera to the nearest
   * framing that keeps them comfortably inside.
   *
   * @param {Phaser.GameObjects.GameObject} player
   * @returns {void}
   */
  _ensurePlayerVisible(player) {
    const margin = 40; // px of guaranteed empty space around the player
    const halfW = this.cam.width / this.cam.zoom / 2;
    const halfH = this.cam.height / this.cam.zoom / 2;

    const centreX = this.currentScrollX + halfW;
    const centreY = this.currentScrollY + halfH;

    const breached =
      Math.abs(player.x - centreX) > halfW - margin || Math.abs(player.y - centreY) > halfH - margin;

    if (!breached) {
      this._breachFrames = 0;
      return;
    }

    // Require 2 consecutive frames before snapping so a single-frame
    // overshoot never causes a visible "pop".
    this._breachFrames += 1;
    if (this._breachFrames < 2) return;
    this._breachFrames = 0;

    const visibleW = this.cam.width / this.cam.zoom;
    const visibleH = this.cam.height / this.cam.zoom;

    this.currentScrollX = player.x - visibleW * CAMERA.anchorXRatio;
    this.currentScrollY = player.y - visibleH * CAMERA.anchorYRatio;
    this.cam.setScroll(this.currentScrollX, this.currentScrollY);
  }

  /**
   * Recoil kick — call on every shot. Pushes the camera briefly opposite the
   * shot direction, which is a large part of why Arsenal's shooting feels
   * punchy rather than floaty.
   *
   * @param {number} angle - Shot angle in radians (Phaser convention).
   * @param {number} [strength] - Pixels of kick.
   * @returns {void}
   */
  applyRecoil(angle, strength = 7) {
    this._kickX -= Math.cos(angle) * strength;
    this._kickY -= Math.sin(angle) * strength;
  }

  /**
   * One-shot camera shake (hits, explosions, jumpscares).
   * @param {number} [intensity] - Duration in ms.
   * @param {number} [amount] - Magnitude as a fraction of the viewport.
   * @returns {void}
   */
  shake(intensity = 180, amount = 0.006) {
    this.cam.shake(intensity, amount, true);
  }

  /**
   * Snap the camera onto the player immediately (scene start / respawn), so
   * the first frame of the arena is already correctly framed.
   * @param {Phaser.GameObjects.GameObject} player
   * @returns {void}
   */
  snapTo(player) {
    const visibleW = this.cam.width / CAMERA.baseZoom;
    const visibleH = this.cam.height / CAMERA.baseZoom;
    this.currentScrollX = player.x - visibleW * CAMERA.anchorXRatio;
    this.currentScrollY = player.y - visibleH * CAMERA.anchorYRatio;
    this.currentZoom = CAMERA.baseZoom;
    this.cam.setZoom(this.currentZoom);
    this.cam.setScroll(this.currentScrollX, this.currentScrollY);
  }

  /**
   * Re-apply arena bounds after a map change.
   * @param {{x:number,y:number,width:number,height:number}} bounds
   * @returns {void}
   */
  setWorldBounds(bounds) {
    this.worldBounds = bounds;
    this._applyBounds(bounds);
  }

  /**
   * Draw a one-frame debug overlay: the anchor point the player should occupy,
   * the visible viewport rect, and the lead vector between them. Used while
   * tuning CAMERA values (`CAMERA_DEBUG`, enabled by `?debug`).
   *
   * Drawn into world space (graphics at depth 9999) so it rotates and pans
   * with the camera it is describing.
   *
   * @param {Phaser.Scene} scene
   * @param {Phaser.GameObjects.GameObject} player
   * @returns {void}
   */
  drawDebug(scene, player) {
    const visibleW = this.cam.width / this.cam.zoom;
    const visibleH = this.cam.height / this.cam.zoom;

    const anchorX = this.currentScrollX + visibleW * CAMERA.anchorXRatio;
    const anchorY = this.currentScrollY + visibleH * CAMERA.anchorYRatio;

    const g = scene.add.graphics().setDepth(9999);
    g.lineStyle(1, 0xffd166, 0.5).strokeRect(this.currentScrollX, this.currentScrollY, visibleW, visibleH);
    g.lineStyle(2, 0xffd166, 0.9).strokeCircle(anchorX, anchorY, 16);
    g.lineStyle(2, 0x7fe7ff, 0.9).lineBetween(player.x, player.y, anchorX, anchorY);
    g.fillStyle(0x7fe7ff, 0.9).fillCircle(player.x, player.y, 4);
    g.destroy();
  }
}

export default ThirdPersonCamera;
