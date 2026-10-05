/**
 * Astral Zero — lobby atmosphere (FRONTEND).
 * ===========================================================
 * Replaces the old flat starfield with a layered orbital scene so the lobby
 * reads as a place rather than a screen. Everything is procedural Graphics /
 * Rectangles, so the repo still ships zero art.
 *
 * LAYERS, BACK TO FRONT
 *   0  deep space gradient        3 static tiles
 *   1  nebula clouds              4 big soft ellipses, ~4% alpha
 *   2  FAR starfield              slow parallax (0.4x), tiny dim stars
 *   3  Earth limb (bottom-left)   a large arc + atmospheric rim glow
 *   4  NEAR starfield             faster parallax (1.0x), brighter stars
 *   5  orbital debris             tumbling shards, the "cleanup" motif
 *   6  satellites                 a couple of tiny craft on slow arcs
 *   7  orbital guide lines        thin ellipses, the brand's orbit motif
 *
 * PERFORMANCE (the brief calls this out explicitly)
 *  - Created ONCE, then only their x/y/rotation are mutated. Zero per-frame
 *    allocation, zero `fillRoundedRect` churn.
 *  - Parallax is driven by a SINGLE `setScrollFactor` per layer, not by
 *    per-object maths, so the cost is two scroll updates per frame.
 *  - `?noLobbyFx` freezes all motion for low-end devices and for anyone
 *    using reduced motion.
 *  - The whole thing is skipped entirely if the scene has no `add` (tests).
 *
 * READABILITY GUARANTEE
 * Panels sit on top and are drawn at ~90% opacity, and a vignette darkens the
 * edges. The brief asks for an atmospheric background that never makes text
 * hard to read; that is achieved structurally (dark vignette + opaque
 * panels), not by hoping the colours cooperate.
 */

import Phaser from 'phaser';
import { THEME } from '../../config/uiTheme.js';
import { DESIGN } from '../../config/viewportConfig.js';
import * as Motion from '../../core/Motion.js';

export class OrbitalBackdrop {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} [opts]
   * @param {number} [opts.width]  - Design width (defaults to 1280).
   * @param {number} [opts.height] - Design height (defaults to 720).
   * @param {number} [opts.depth]  - Keep behind all UI.
   * @param {string} [opts.seed]   - Deterministic RNG seed.
   */
  constructor(scene, { width = DESIGN.width, height = DESIGN.height, depth = -20, seed = 'astral-zero-lobby' } = {}) {
    this.scene = scene;
    this.w = width;
    this.h = height;
    this.baseDepth = depth;
    this.active = true;

    /** Parallax layers, keyed for the two scroll factors we use. */
    this.farLayer = null;
    this.nearLayer = null;

    /** Everything created, so destroy() is exhaustive. */
    this._objects = [];
    /** @type {Array<{obj: object, speed: number, spin: number, phase: number, drift: number}>} */
    this._debris = [];
    /** @type {Array<{obj: object, cx: number, cy: number, r: number, speed: number, phase: number}>} */
    this._sats = [];

    if (typeof scene?.add?.graphics !== 'function') return; // headless guard

    this.rand = new Phaser.Math.RandomDataGenerator([seed]);
    this._build();
  }

  /** Build every layer, in order. @returns {void} */
  _build() {
    this._deepSpace();
    this._nebula();
    this._starfield();
    this._earthLimb();
    this._debrisField();
    this._satellites();
    this._orbitLines();
    this._vignette();
  }

  // ---------------------------------------------------------------------------
  // Layer 0 — deep space
  // ---------------------------------------------------------------------------
  _deepSpace() {
    // Three stacked bands fake a vertical gradient without a texture. Phaser
    // has no gradient fill on Graphics, so bands are the cheapest honest option.
    const bands = [
      { y: 0, h: this.h * 0.42, color: 0x050810, alpha: 1 },
      { y: this.h * 0.42, h: this.h * 0.33, color: 0x070b18, alpha: 1 },
      { y: this.h * 0.75, h: this.h * 0.25, color: 0x0a1024, alpha: 1 },
    ];
    bands.forEach((b) => {
      const rect = this.scene.add
        .rectangle(this.w / 2, b.y + b.h / 2, this.w, b.h, b.color, b.alpha)
        .setDepth(this.baseDepth)
        .setScrollFactor(0);
      this._objects.push(rect);
    });
  }

  // ---------------------------------------------------------------------------
  // Layer 1 — nebula
  // ---------------------------------------------------------------------------
  _nebula() {
    const hues = [0x2a1a5e, 0x0d3a5c, 0x501a44, 0x123f52];
    for (let i = 0; i < 4; i += 1) {
      const r = 200 + this.rand.between(0, 180);
      const blob = this.scene.add
        .ellipse(
          this.rand.between(0, this.w),
          this.rand.between(-40, this.h),
          r,
          r * 0.62,
          hues[i % hues.length],
          0.16,
        )
        .setDepth(this.baseDepth + 1)
        .setScrollFactor(0);
      // Nebula drifts almost imperceptibly; on reduced motion it is static.
      this._objects.push(blob);
      if (!Motion.isReduced()) {
        Motion.tween(this.scene, {
          targets: blob,
          x: blob.x + this.rand.between(-40, 40),
          y: blob.y + this.rand.between(-20, 20),
          duration: 14000 + i * 3000,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Layer 2 + 4 — two starfields at different parallax rates
  // ---------------------------------------------------------------------------
  _starfield() {
    this.farLayer = this.scene.add.container(0, 0).setDepth(this.baseDepth + 2).setScrollFactor(0);
    this.nearLayer = this.scene.add.container(0, 0).setDepth(this.baseDepth + 4).setScrollFactor(0);
    this._objects.push(this.farLayer, this.nearLayer);

    // Far: many, tiny, dim.
    for (let i = 0; i < 90; i += 1) {
      const s = this.rand.between(1, 2);
      const star = this.scene.add.rectangle(
        this.rand.between(0, this.w),
        this.rand.between(0, this.h),
        s,
        s,
        0xcfe6ff,
        this.rand.realInRange(0.1, 0.34),
      );
      this.farLayer.add(star);
    }

    // Near: fewer, brighter, plus four twinkling "beacons" that pulse.
    for (let i = 0; i < 34; i += 1) {
      const s = this.rand.between(2, 3);
      const star = this.scene.add.rectangle(
        this.rand.between(0, this.w),
        this.rand.between(0, this.h),
        s,
        s,
        0xffffff,
        this.rand.realInRange(0.35, 0.75),
      );
      this.nearLayer.add(star);
    }

    for (let i = 0; i < 4; i += 1) {
      const beacon = this.scene.add.star
        ? null
        : this.scene.add.rectangle(
            this.rand.between(0, this.w),
            this.rand.between(0, this.h),
            4,
            4,
            0x9fe8ff,
            0.9,
          );
      this.nearLayer.add(beacon);
      if (!Motion.isReduced()) {
        Motion.tween(this.scene, {
          targets: beacon,
          alpha: 0.25,
          duration: 900 + i * 400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Layer 3 — Earth limb
  // ---------------------------------------------------------------------------
  _earthLimb() {
    const r = this.w * 1.15;
    const cx = this.w * 0.16;
    const cy = this.h + r - 60;

    // Body of the planet: a huge circle whose top edge cuts across the
    // bottom-left corner. Only the visible crescent needs to be drawn.
    const planet = this.scene.add
      .circle(cx, cy, r, 0x0d2a4a, 1)
      .setDepth(this.baseDepth + 3)
      .setScrollFactor(0);

    // Atmosphere rim: a slightly larger, brighter circle behind it, which
    // leaves a glowing crescent along the limb.
    const glow = this.scene.add
      .circle(cx, cy, r + 16, 0x2f7fbf, 0.5)
      .setDepth(this.baseDepth + 2)
      .setScrollFactor(0);
    glow.setScale(1.0);

    // A brighter thin arc right on the horizon line reads as atmospheric
    // scattering, which is the single detail that sells "this is Earth".
    const rim = this.scene.add.graphics().setDepth(this.baseDepth + 3).setScrollFactor(0);
    rim.lineStyle(5, 0x7fe7ff, 0.55);
    rim.beginPath();
    rim.arc(cx, cy, r + 4, Math.PI * 1.18, Math.PI * 1.82, false);
    rim.strokePath();

    this.earth = planet;
    this._objects.push(planet, glow, rim);
  }

  // ---------------------------------------------------------------------------
  // Layer 5 — orbital debris (the cleanup motif, made literal)
  // ---------------------------------------------------------------------------
  _debrisField() {
    for (let i = 0; i < 16; i += 1) {
      const w = 6 + this.rand.between(0, 18);
      const shard = this.scene.add
        .rectangle(
          this.rand.between(0, this.w),
          this.rand.between(-20, this.h * 0.8),
          w,
          3 + this.rand.between(0, 5),
          this.rand.pick([0x4a5f86, 0x6b4f2a, 0x3d5a72, 0x7a6a4a]),
          0.75,
        )
        .setDepth(this.baseDepth + 5)
        .setScrollFactor(0);

      this._debris.push({
        obj: shard,
        speed: 4 + this.rand.realInRange(0, 12),
        spin: this.rand.realInRange(-0.0008, 0.0008),
        phase: this.rand.realInRange(0, Math.PI * 2),
        drift: 8 + this.rand.between(0, 22),
      });
    }
    this._debris.forEach((d) => this._objects.push(d.obj));
  }

  // ---------------------------------------------------------------------------
  // Layer 6 — satellites on slow arcs
  // ---------------------------------------------------------------------------
  _satellites() {
    for (let i = 0; i < 3; i += 1) {
      const g = this.scene.add.graphics().setDepth(this.baseDepth + 6).setScrollFactor(0);
      // A body + two solar panels. Tiny, so a couple of rects is enough.
      g.fillStyle(0xb8c6dd, 1);
      g.fillRoundedRect(-5, -4, 10, 8, 2);
      g.fillStyle(0x3f6ea8, 1);
      g.fillRect(-14, -3, 8, 6);
      g.fillRect(6, -3, 8, 6);
      g.lineStyle(1, 0x8fd8ff, 0.8);
      g.strokeRoundedRect(-5, -4, 10, 8, 2);

      const cx = this.rand.between(this.w * 0.3, this.w * 0.95);
      const cy = this.rand.between(40, this.h * 0.45);
      g.setPosition(cx, cy);

      this._sats.push({
        obj: g,
        cx,
        cy,
        r: 40 + this.rand.between(0, 90),
        speed: this.rand.realInRange(0.00012, 0.0004),
        phase: this.rand.realInRange(0, Math.PI * 2),
      });
      this._objects.push(g);
    }
  }

  // ---------------------------------------------------------------------------
  // Layer 7 — orbital guide lines (the brand motif, ambient)
  // ---------------------------------------------------------------------------
  _orbitLines() {
    const g = this.scene.add.graphics().setDepth(this.baseDepth + 7).setScrollFactor(0);
    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    // Two very faint tilted ellipses. `arc` gives a circle; scaling the
    // container afterwards would scale the line width too, so we draw
    // partial arcs and accept the near-circle look at these alphas.
    g.lineStyle(1.5, THEME.accent, 0.07);
    g.beginPath();
    g.arc(cx, cy, this.w * 0.46, 0, Math.PI * 2, false);
    g.strokePath();
    g.lineStyle(1.5, THEME.amber, 0.05);
    g.beginPath();
    g.arc(cx, cy, this.w * 0.34, 0, Math.PI * 2, false);
    g.strokePath();
    this._orbit = g;
    this._objects.push(g);
  }

  // ---------------------------------------------------------------------------
  // Layer 8 — vignette, so panels and text always sit on a calm field
  // ---------------------------------------------------------------------------
  _vignette() {
    // Four edge gradients approximated with stacked low-alpha bars. Cheap,
    // and a real radial gradient would need a texture we do not have.
    const g = this.scene.add.graphics().setDepth(this.baseDepth + 8).setScrollFactor(0);
    const steps = 14;
    for (let i = 0; i < steps; i += 1) {
      const t = i / steps;
      const alpha = 0.05 * (1 - t);
      const inset = t * 90;
      g.lineStyle(90 / steps + 1, 0x03050c, alpha);
      g.strokeRect(-inset / 2, -inset / 2, this.w + inset, this.h + inset);
    }
    // Darken the bottom where the HUD/footer will sit.
    g.fillStyle(0x03050c, 0.22);
    g.fillRect(0, this.h - 150, this.w, 150);
    this._vignetteGfx = g;
    this._objects.push(g);
  }

  // ---------------------------------------------------------------------------
  // Per-frame
  // ---------------------------------------------------------------------------

  /**
   * Advance the ambient layers. Called once per frame by LobbyScene.
   *
   * Parallax is driven by the two layer containers' scroll factor rather than
   * by moving every star, so this is O(debris + satellites), not O(stars).
   *
   * @param {number} delta - Frame delta in ms.
   * @param {number} [pointerX] - Pointer X in design space, for parallax.
   * @param {number} [pointerY]
   * @returns {void}
   */
  update(delta, pointerX, pointerY) {
    if (!this.active || Motion.isReduced()) return;

    const dt = Math.min(delta, 50);

    // --- Parallax: nudge the containers' scroll by a fraction of the pointer
    // offset from centre. Layer depths differ, so they separate.
    if (typeof pointerX === 'number' && this.farLayer) {
      const ox = (pointerX - this.w / 2) / this.w;
      const oy = ((pointerY ?? this.h / 2) - this.h / 2) / this.h;
      this.farLayer.setScrollFactor(1 + ox * 0.012, 1 + oy * 0.012);
      this.nearLayer?.setScrollFactor(1 + ox * 0.03, 1 + oy * 0.03);
    }

    // --- Debris: slow fall + tumble, wrapping at the bottom.
    for (const d of this._debris) {
      d.obj.y += d.speed * (dt / 16.67);
      d.obj.rotation += d.spin * dt;
      d.obj.x += Math.sin(d.phase + performance.now() * 0.0004) * (d.drift / 100) * (dt / 16.67);
      if (d.obj.y > this.h + 20) d.obj.y = -20;
    }

    // --- Satellites: travel their little orbit.
    const now = performance.now();
    for (const s of this._sats) {
      const a = s.phase + now * s.speed;
      s.obj.x = s.cx + Math.cos(a) * s.r;
      s.obj.y = s.cy + Math.sin(a) * s.r * 0.35;
      s.obj.rotation = Math.sin(a) * 0.3;
    }
  }

  /**
   * Freeze/resume (tab hidden, or `?noLobbyFx`).
   * @param {boolean} active
   * @returns {void}
   */
  setActive(active) {
    this.active = active;
  }

  /** @returns {void} */
  destroy() {
    this._objects.forEach((o) => o?.destroy?.());
    this._objects.length = 0;
    this._debris.length = 0;
    this._sats.length = 0;
    this.active = false;
  }
}

export default OrbitalBackdrop;
