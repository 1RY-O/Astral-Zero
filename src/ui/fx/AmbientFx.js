/**
 * Astral Zero — AmbientFx (FRONTEND).
 * ============================================================
 * Per-map atmosphere: drifting space dust, glowing reactor vents, and tumbling
 * debris. Purely cosmetic — none of it has a physics body, so it can never
 * affect movement or combat.
 *
 * WHY THIS IS DRAW-OBJECT BASED, NOT A PARTICLE EMITTER
 * A Phaser particle emitter allocates and recycles particles internally, which
 * is ideal, but the per-map "vent" and "debris" elements are individually
 * animated objects that want their own phase and motion. Both are cheap at our
 * counts (< 60 objects total), and drawing them directly keeps the whole effect
 * deterministic and inspectable — which matters more here than the marginal
 * per-frame cost.
 *
 * PERFORMANCE NOTES
 *  - Every element is created ONCE in `create()` and moved in `update()`.
 *    Nothing is spawned or destroyed per frame, so there is no GC churn.
 *  - `update()` is skipped entirely when the map has no ambience, and the
 *    dust count scales with the map's recipe rather than the viewport, so a
 *    4K screen does not quietly get 4x the objects.
 *
 * REDUCED MOTION
 *  `update()` returns immediately when the player has asked for reduced
 *  motion, so the atmosphere is still drawn (the map should not look broken)
 *  but nothing drifts. The decorative pulse tweens are never created either.
 */

import * as Motion from '../../core/Motion.js';

export class AmbientFx {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} [opts]
   * @param {number} [opts.depth] - Below gameplay sprites.
   * @param {number} [opts.boundsWidth]
   * @param {number} [opts.boundsHeight]
   */
  constructor(scene, { depth = -8, boundsWidth = 1280, boundsHeight = 720 } = {}) {
    this.scene = scene;
    this.depth = depth;
    this.width = boundsWidth;
    this.height = boundsHeight;

    /** @type {Phaser.GameObjects.GameObject[]} */
    this._dust = [];
    /** @type {Phaser.GameObjects.GameObject[]} */
    this._debris = [];
    /** @type {Phaser.GameObjects.GameObject[]} */
    this._vents = [];
    /** Live tween handles, so destroy() can stop them all. */
    this._tweens = [];
    /** Set false to freeze all ambience (used when the tab is hidden). */
    this.active = true;
  }

  /**
   * Build the ambience for a map definition.
   *
   * Idempotent: calling twice tears the old effect down first, so switching maps
   * mid-session cannot leave two overlapping dust fields behind.
   *
   * @param {object} mapDef - A row from src/config/maps.js.
   * @returns {void}
   */
  create(mapDef) {
    this.destroy(false);
    if (!mapDef?.ambience) return;

    const { dust, vents, debris, tint, starAlpha } = mapDef.ambience;

    // --- Space dust: slow diagonal drift, wrapping at the edges -------------
    for (let i = 0; i < dust; i += 1) {
      const mote = this.scene.add
        .rectangle(
          Math.random() * this.width,
          Math.random() * this.height,
          2,
          2,
          0x9fd4ff,
          0.12 + Math.random() * 0.22,
        )
        .setDepth(this.depth);
      this._dust.push({
        obj: mote,
        vx: -4 - Math.random() * 10,
        vy: 3 + Math.random() * 7,
      });
    }

    // --- Reactor vents: glowing rectangles on the floor line ---------------
    // Placed on a fixed spread so they never sit under the spawn column.
    for (let i = 0; i < vents; i += 1) {
      const x = ((i + 1) / (vents + 1)) * this.width;
      const y = this.height - 92;
      const vent = this.scene.add
        .rectangle(x, y, 54, 8, 0x7fe7ff, 0.5)
        .setDepth(this.depth + 1);
      this._vents.push(vent);

      // Independent pulse phase per vent so they do not flash in unison.
      // A constant alpha is used under reduced motion: the vents still read as
      // glowing, they simply stop pulsing.
      if (Motion.isReduced()) {
        vent.setAlpha(0.6);
        continue;
      }

      const tween = this.scene.tweens.add({
        targets: vent,
        alpha: { from: 0.28, to: 0.85 },
        scaleX: { from: 0.8, to: 1.15 },
        duration: 1400 + i * 260,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this._tweens.push(tween);
    }

    // --- Floating debris: slow vertical bob + horizontal tumble ------------
    for (let i = 0; i < debris; i += 1) {
      const w = 6 + Math.random() * 16;
      const shard = this.scene.add
        .rectangle(
          Math.random() * this.width,
          80 + Math.random() * (this.height - 200),
          w,
          3 + Math.random() * 4,
          tint,
          0.85,
        )
        .setDepth(this.depth + 1);
      this._debris.push({
        obj: shard,
        // Each shard gets its own speed and phase: uniform motion would read
        // as a scrolling background rather than objects adrift in space.
        speed: 6 + Math.random() * 14,
        phase: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.0006,
        vy: 4 + Math.random() * 9,
      });
    }
  }

  /**
   * Advance the ambience. Called once per frame from the scene.
   * @param {number} delta - Frame delta in ms.
   * @returns {void}
   */
  update(delta) {
    if (!this.active || Motion.isReduced()) return;
    // Cap dt so an alt-tab (or a debug pause) cannot teleport everything
    // across the screen on the first frame back.
    const dt = Math.min(delta, 50) / 16.67;

    for (const d of this._dust) {
      d.obj.x += d.vx * dt;
      d.obj.y += d.vy * dt;
      // Wrap rather than respawn: no allocation, no pop.
      if (d.obj.x < -4) d.obj.x = this.width + 4;
      if (d.obj.y > this.height + 4) d.obj.y = -4;
    }

    for (const s of this._debris) {
      s.obj.y += s.vy * dt;
      s.obj.rotation += s.spin * delta;
      s.obj.x += Math.sin(s.phase + performance.now() * 0.0004) * 0.25 * dt;
      if (s.obj.y > this.height + 20) s.obj.y = -20;
    }
  }

  /**
   * Freeze/resume. The scene calls this on tab visibility so a backgrounded tab
   * is not animating objects nobody can see.
   * @param {boolean} active
   * @returns {void}
   */
  setActive(active) {
    this.active = active;
  }

  /**
   * Remove every ambient object.
   * @param {boolean} [clearRefs] - Reset internal arrays.
   * @returns {void}
   */
  destroy(clearRefs = true) {
    this._tweens.forEach((t) => t.stop());
    this._tweens = [];
    for (const list of [this._dust, this._debris, this._vents]) {
      for (const item of list) (item.obj ?? item)?.destroy?.();
      list.length = 0;
    }
    if (clearRefs) this.active = false;
  }
}

export default AmbientFx;
