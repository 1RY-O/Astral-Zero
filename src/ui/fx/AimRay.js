/**
 * Astral Zero — AimRay (FRONTEND).
 * ============================================================
 * A thin laser-sight guide from the weapon muzzle along the player's current
 * aim vector, so "where am I pointing?" is answerable at a glance instead of
 * only after a round is in flight.
 *
 * WHY A GUIDE, NOT A HIT LINE
 * Every ranged weapon in the sim fires a PHYSICAL projectile with travel time,
 * a max range and spread (see src/combat/weapons.js). The server owns the hit.
 * Turning this into a hitscan beam that stops on a target would (a) lie about
 * where the projectile will actually be and (b) imply the client decides hits.
 * So the ray shows only the muzzle DIRECTION out to the equipped weapon's real
 * range, stopping at the first solid platform. It is deliberately a different
 * colour (cyan) from the amber projectile tracer, and it is dashed-thin and
 * faded, so it reads as a sight rather than a shot.
 *
 * DIRECTION CONTRACT
 * The origin and angle are supplied by the scene from exactly the same values
 * the weapon uses to fire: `player.getAimAngle()` and
 * `player.{x,y} + cos/sin(angle) * AIM.muzzleLength`. That is the whole point —
 * if the ray used a different angle than the barrel, it would reproduce the
 * "my shot went somewhere else" bug the combat code takes pains to avoid.
 *
 * PERFORMANCE
 * ONE reused Phaser Graphics object, redrawn each frame and never tweened. No
 * allocation per frame, no tween per segment, and no network traffic — the ray
 * is purely local rendering. The distance fade is drawn as `segments` short
 * pieces with a decaying alpha (no gradient shader needed).
 */

import Phaser from 'phaser';
import { AIM_RAY } from '../../config/gameConfig.js';

/**
 * Nearest distance at which a ray from (x,y) along unit (dx,dy) enters the
 * axis-aligned box [left,top,right,bottom], or Infinity if it misses.
 *
 * Standard slab test, inlined here to avoid a Phaser call per platform per
 * frame. Handles the parallel case (dx or dy == 0) without dividing by zero.
 *
 * @param {number} x @param {number} y
 * @param {number} dx @param {number} dy
 * @param {number} left @param {number} top @param {number} right @param {number} bottom
 * @param {number} max - Ignore hits beyond this distance.
 * @returns {number} Distance to entry (>= 0), or Infinity.
 */
export function rayAabb(x, y, dx, dy, left, top, right, bottom, max) {
  let tMin = 0;
  let tMax = max;

  if (dx !== 0) {
    const inv = 1 / dx;
    let t1 = (left - x) * inv;
    let t2 = (right - x) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
  } else if (x < left || x > right) {
    return Infinity;
  }

  if (dy !== 0) {
    const inv = 1 / dy;
    let t1 = (top - y) * inv;
    let t2 = (bottom - y) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
  } else if (y < top || y > bottom) {
    return Infinity;
  }

  if (tMin > tMax) return Infinity;
  return tMin;
}

export class AimRay {
  /**
   * @param {Phaser.Scene} scene - Owning arena scene (reads `scene.platforms`).
   * @param {object} [opts]
   * @param {number} [opts.depth]
   * @param {number} [opts.color]
   * @param {number} [opts.segments]
   */
  constructor(scene, { depth = AIM_RAY.depth, color = AIM_RAY.color, segments = AIM_RAY.segments } = {}) {
    this.scene = scene;
    this.color = color;
    this.segments = Math.max(1, segments | 0);

    this.g = scene.add
      .graphics()
      .setDepth(depth)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);

    /** Lazily created terminus dot; reused, never per-frame allocated. */
    this._tip = null;
  }

  /**
   * Redraw the ray. Call once per frame while in an active match.
   *
   * @param {object} o
   * @param {number} o.x - Muzzle X (world).
   * @param {number} o.y - Muzzle Y (world).
   * @param {number} o.angle - Aim angle in radians (same value the weapon fires).
   * @param {number} o.range - Max guide length in px (equipped weapon range).
   * @param {boolean} [o.visible] - Force-hide when dead/spectating/etc.
   * @returns {void}
   */
  update({ x, y, angle, range, visible = true }) {
    const finite =
      Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(angle) && range > 0;
    if (!visible || !finite) {
      if (this.g.visible) this.g.setVisible(false);
      return;
    }

    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const length = this._clipDistance(x, y, dx, dy, range);
    if (!(length > 6)) {
      // Muzzle is buried in/looking at a wall — nothing useful to draw.
      if (this.g.visible) this.g.setVisible(false);
      return;
    }

    if (!this.g.visible) this.g.setVisible(true);
    const g = this.g;
    g.clear();

    // Distance fade via short segments of decaying alpha. Drawn as ONE
    // begin/end path per segment (cheap, and additive so overlaps glow softly).
    const n = this.segments;
    const step = length / n;
    for (let i = 0; i < n; i += 1) {
      const t = i / n;
      const alpha = AIM_RAY.nearAlpha * (1 - t) + AIM_RAY.farAlpha * t;
      const x0 = x + dx * step * i;
      const y0 = y + dy * step * i;
      g.lineStyle(AIM_RAY.width, this.color, alpha);
      g.lineBetween(x0, y0, x0 + dx * step, y0 + dy * step);
    }

    // Terminus dot so the guide has a readable end (and clearly is NOT the
    // projectile, which is a fast travelling tracer).
    if (!this._tip) {
      this._tip = this.scene.add
        .circle(0, 0, AIM_RAY.tipRadius, this.color, AIM_RAY.tipAlpha)
        .setDepth(g.depth)
        .setBlendMode(Phaser.BlendModes.ADD);
    }
    this._tip
      .setPosition(x + dx * length, y + dy * length)
      .setVisible(true)
      .setFillStyle(this.color, AIM_RAY.tipAlpha);
  }

  /**
   * Distance until the ray leaves the arena or hits the first solid surface.
   *
   * Uses the WorldRenderer's full solid-geometry set (platforms AND the walls /
   * floor) rather than only the platform bodies. The walls and floor have no
   * Arcade body — collision there comes from the world bounds — so a ray
   * clipped against platform bodies alone sailed straight through the floor and
   * out of the arena, telling the player they were shooting into a void that
   * actually stops their shots.
   * @returns {number}
   */
  _clipDistance(x, y, dx, dy, range) {
    let best = range;
    const rects = this.scene?.worldRenderer?.solidRects?.();
    if (rects && rects.length) {
      for (const r of rects) {
        const t = rayAabb(x, y, dx, dy, r.x, r.y, r.x + r.w, r.y + r.h, best);
        if (t < best) best = t;
      }
      return best;
    }
    // Fallback (no world built yet): the platform bodies alone.
    const platforms = this.scene?.platforms;
    if (platforms) {
      for (const p of platforms) {
        const b = p.body;
        if (!b) continue;
        const t = rayAabb(x, y, dx, dy, b.left, b.top, b.right, b.bottom, best);
        if (t < best) best = t;
      }
    }
    return best;
  }

  /** Hard-hide (also hides the terminus dot). @returns {void} */
  setVisible(visible) {
    this.g.setVisible(Boolean(visible));
    this._tip?.setVisible(Boolean(visible));
  }

  /** @returns {void} */
  destroy() {
    this.g.destroy();
    this._tip?.destroy();
    this._tip = null;
  }
}

export default AimRay;
