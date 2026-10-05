/**
 * Astral Zero — SpectatorCam (FRONTEND).
 * ============================================================
 * Drives the camera while the local player is dead. Two modes, because they
 * answer different questions:
 *
 *   FOLLOW  — watch a living teammate. The useful one in a team match: you can
 *             still help by spotting the enemy, and it keeps you oriented.
 *   ORBIT   — circle the spot you died. The fallback when there is nobody left
 *             to watch, and the one that makes a death feel like a place rather
 *             than a pause.
 *
 * WHY A SEPARATE RIG INSTEAD OF A CAMERA MODE FLAG
 * ThirdPersonCamera's entire job is framing a PLAYER: it reads a body, leads
 * toward the pointer, and guarantees the owner stays on screen. None of that
 * applies when the thing being followed is a spectator target that may not
 * exist. Bolting a `mode` flag onto it would mean every existing frame had to
 * branch on "am I spectating", which is exactly the kind of conditional that
 * silently rots. This rig is small and owns its own framing.
 *
 * IT DOES NOT FIGHT THE MAIN CAMERA
 * Only one rig writes `cam.setScroll` per frame; ArenaScene guarantees that by
 * skipping `_updateRemotes`/camera-rig updates while spectating.
 */

import { SPECTATOR } from '../config/netConfig.js';

export class SpectatorCam {
  /**
   * @param {Phaser.Cameras.Scene2D.Camera} cam
   * @param {object} [opts]
   * @param {() => number} [opts.now]
   */
  constructor(cam, { now = () => performance.now() } = {}) {
    this.cam = cam;
    this.now = now;

    /** 'orbit' | 'follow' | null (null = inactive, main rig takes over). */
    this.mode = null;

    /** @type {object|null} The entity we are following, if any. */
    this.target = null;
    /** Where we died — the orbit centre. */
    this._deathPoint = { x: 0, y: 0 };
    /** Accumulated orbit angle (radians). */
    this._angle = 0;
    /** Smoothed scroll, so both modes ease rather than snap. */
    this._scrollX = 0;
    this._scrollY = 0;
    /** True once `_scroll*` has been seeded, avoiding a first-frame jump. */
    this._primed = false;
  }

  /**
   * Enter orbit around the death location.
   * @param {{x:number,y:number}} point
   * @returns {void}
   */
  enterOrbit(point) {
    this.mode = 'orbit';
    this.target = null;
    this._deathPoint = { x: point?.x ?? 0, y: point?.y ?? 0 };
    // Seed the angle from the current camera so the transition from the death
    // view into the orbit is a continuation, not a cut.
    this._angle = Math.atan2(this._scrollY + this.cam.height / 2 - point?.y, 0);
    this._primed = false;
  }

  /**
   * Follow a living teammate.
   * @param {object} entity - Needs at least { id, x, y }.
   * @returns {void}
   */
  enterFollow(entity) {
    this.mode = 'follow';
    this.target = entity;
    this._primed = false;
  }

  /**
   * Choose follow when a live teammate exists, otherwise orbit the corpse.
   *
   * @param {{x:number,y:number}} deathPoint
   * @param {object[]} candidates - Living teammates (already filtered).
   * @returns {void}
   */
  enter(deathPoint, candidates = []) {
    if (candidates.length > 0) this.enterFollow(candidates[0]);
    else this.enterOrbit(deathPoint);
  }

  /**
   * Switch to the next available teammate.
   *
   * @param {object[]} candidates - Living teammates, freshly filtered.
   * @param {object} deathPoint
   * @returns {boolean} Whether a new target was acquired.
   */
  cycle(candidates = [], deathPoint = this._deathPoint) {
    if (!candidates.length) {
      // Nobody to watch: fall back to orbiting rather than leaving the camera
      // pointed at a dead body with no motion at all.
      this.enterOrbit(deathPoint);
      return false;
    }
    const currentId = this.target?.id;
    const next = candidates.find((c) => c.id !== currentId) ?? candidates[0];
    this.enterFollow(next);
    return true;
  }

  /** Hand the camera back to the main rig. @returns {void} */
  exit() {
    this.mode = null;
    this.target = null;
  }

  /**
   * Advance one frame.
   * @param {number} delta - Frame delta in ms.
   * @returns {void}
   */
  update(delta) {
    if (!this.mode) return;

    const centre = this._desiredCentre();
    if (!centre) return;

    // Frame-rate independent lerp, matching ThirdPersonCamera's feel.
    const lerp = 1 - Math.pow(1 - SPECTATOR.smoothing, Math.min(Math.max(delta, 1), 100) / 16.667);

    if (!this._primed) {
      this._scrollX = centre.x - this.cam.width / 2;
      this._scrollY = centre.y - this.cam.height / 2;
      this._primed = true;
    } else {
      this._scrollX += (centre.x - this.cam.width / 2 - this._scrollX) * lerp;
      this._scrollY += (centre.y - this.cam.height / 2 - this._scrollY) * lerp;
    }

    this.cam.setScroll(this._scrollX, this._scrollY);

    // A touch of zoom-out while spectating reads as "you are not in the fight".
    const zoom = this.mode === 'orbit' ? SPECTATOR.orbitZoom : SPECTATOR.followZoom;
    this.cam.setZoom(zoom);
  }

  /**
   * Where the camera should be centred this frame.
   * @returns {{x:number,y:number}|null}
   */
  _desiredCentre() {
    if (this.mode === 'follow') {
      // The target may have died or left between frames; fall back to orbit
      // rather than freezing on a stale coordinate.
      if (!this.target) return null;
      return { x: this.target.x, y: this.target.y };
    }
    // Orbit: a slow circle around the death point.
    this._angle += (this._orbitStepMs() / 1000) * SPECTATOR.orbitSpeed;
    return {
      x: this._deathPoint.x + Math.cos(this._angle) * SPECTATOR.orbitRadius,
      y: this._deathPoint.y + Math.sin(this._angle) * SPECTATOR.orbitRadiusY,
    };
  }

  /**
   * Angle step for this frame. Advances with real time so the orbit runs at the
   * same speed regardless of frame rate.
   * @returns {number} ms elapsed this frame.
   */
  _orbitStepMs() {
    const now = this.now();
    const delta = this._lastNow ? now - this._lastNow : 16.67;
    this._lastNow = now;
    return Math.min(Math.max(delta, 1), 100);
  }
}

export default SpectatorCam;
