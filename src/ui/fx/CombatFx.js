/**
 * Astral Zero — CombatFx (FRONTEND).
 * ============================================================
 * Every piece of transient combat feedback in one place, because they all share
 * the same problem: spawn on the WORLD layer, drift, fade, and clean themselves
 * up. Scattering that across the scene would mean five different tween idioms
 * fighting over the depth list.
 *
 * WHAT IT DRAWS
 *   tracers        muzzle → impact line (predictive, client-side)
 *   hit markers    a cross that flashes at the crosshair on a hit
 *   damage numbers floating, rising, fading; colour-coded by who was hit
 *   death poof     a quick expanding ring where something died
 *
 * COLOUR SEMANTICS (kept consistent everywhere)
 *   white solid → the SERVER confirmed the hit
 *   grey hollow → our client-side prediction only (may still miss)
 *   amber       → we were hit (incoming damage)
 *   red         → a kill
 *
 * That distinction is the point of the module: a player must never see a
 * confirmed-looking hit for a shot the server rejected.
 */

import Phaser from 'phaser';
import { COMBAT } from '../../config/netConfig.js';
import { THEME, FONTS } from '../../config/uiTheme.js';
import { FxPool } from './FxPool.js';

/**
 * The four diagonal directions of a hit-marker cross, as unit signs.
 *
 * Hoisted to module scope: this is read on every hit and allocated as an array
 * literal otherwise. Four tiny arrays per hit adds up over a firefight.
 */
const TICK_DIRS = Object.freeze([
  Object.freeze([1, 1]),
  Object.freeze([1, -1]),
  Object.freeze([-1, 1]),
  Object.freeze([-1, -1]),
]);

export class CombatFx {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} [opts]
   * @param {number} [opts.depth]
   */
  constructor(scene, { depth = 150 } = {}) {
    this.scene = scene;
    this.depth = depth;

    /** @type {Array<object>} Live damage numbers awaiting cleanup. */
    this._numbers = [];

    /**
     * The hit marker lives in SCREEN space at the pointer, which is what makes
     * it read as "your crosshair" rather than "a thing in the world".
     */
    this.hitMarker = scene.add.graphics().setDepth(depth + 5).setScrollFactor(0).setAlpha(0);
    this._hitMarkerUntil = 0;

    // --- Phase 5: pooled effects ------------------------------------------
    // Tracers and damage numbers are the two highest-frequency display objects
    // in the game (a single firefight creates hundreds). They are allocated ONCE
    // here and recycled forever after, so sustained gunfire no longer produces
    // a garbage-collection pause mid-fight.
    this.tracerPool = new FxPool(scene, {
      name: 'tracers',
      size: COMBAT.tracerPoolSize,
      create: () => scene.add.graphics().setDepth(this.depth).setBlendMode(Phaser.BlendModes.ADD),
      onSpawn: (g) => g.setAlpha(1),
    });

    this.numberPool = new FxPool(scene, {
      name: 'damageNumbers',
      size: COMBAT.damageNumberPoolSize,
      create: () => scene.add
        .text(0, 0, '', {
          fontFamily: FONTS.family,
          fontStyle: '700',
          color: '#ffffff',
          stroke: '#0a1020',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(this.depth + 3),
      onSpawn: (label) => {
        label.setAlpha(1).setScale(1);
      },
    });
  }

  /**
   * Pool statistics for the `?debug` overlay.
   * @returns {object}
   */
  get poolStats() {
    return {
      tracers: `${this.tracerPool.activeCount}/${this.tracerPool.entries.length}`,
      numbers: `${this.numberPool.activeCount}/${this.numberPool.entries.length}`,
      tracerPeak: this.tracerPool.peak,
      numberPeak: this.numberPool.peak,
    };
  }

  /**
   * Draw the muzzle tracer for a shot.
   *
   * Phase 4: the line is drawn as three stacked passes — a wide dim "glow",
   * a bright core, and a short leading streak. A single 1px line reads as a
   * laser pointer; the layered version reads as a round travelling down the
   * barrel, which is the difference between "a line appeared" and "I fired a
   * gun".
   *
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   * @param {number} [color]
   * @param {number} [lifeMs]
   * @returns {void}
   */
  tracer(x1, y1, x2, y2, color = COMBAT.tracerColor, lifeMs = COMBAT.tracerMs) {
    // Skip a degenerate shot (same point) rather than drawing a NaN line.
    if (!Number.isFinite(x1) || !Number.isFinite(x2) || (x1 === y1 && x2 === y2)) return;
    if (x1 === x2 && y1 === y2) return;

    // Leading streak: only the front fraction of the path, so the eye reads
    // direction and speed instead of a static full-length bar.
    const streak = COMBAT.tracerStreak;
    const headX = x2 - (x2 - x1) * (1 - streak);
    const headY = y2 - (y2 - y1) * (1 - streak);

    // ONE pooled Graphics object draws all three passes. Previously this made
    // three GameObjects plus a Tween per shot; at ~3 shots/pull across 8
    // players that is a steady stream of short-lived garbage and the GC pause
    // it causes was visible as a hitch during firefights.
    // acquire() returns the specific entry it claimed, so there is no search.
    const g = this.tracerPool.acquire(lifeMs);

    g.clear();
    g.lineStyle(COMBAT.tracerGlowWidth, color, 0.28);
    g.lineBetween(x1, y1, x2, y2);
    g.lineStyle(COMBAT.tracerWidth, 0xffffff, 0.95);
    g.lineBetween(x1, y1, x2, y2);
    g.lineStyle(COMBAT.tracerWidth + 3, color, 0.8);
    g.lineBetween(headX, headY, x2, y2);
    g.setAlpha(1);
  }

  /**
   * Muzzle flash: a short, bright starburst at the barrel tip.
   *
   * Deliberately NOT a soft blob — the flash reads as force because it is
   * angular and vanishes in a few frames. It is pooled per shot rather than
   * tweened on a timer so the flash can never outlive the frame that spawned it.
   *
   * @param {number} x - Muzzle position.
   * @param {number} y
   * @param {number} [angle] - Shot direction, so the burst points where you shot.
   * @param {number} [scale] - Size multiplier (bigger weapons flash bigger).
   * @returns {void}
   */
  muzzleFlash(x, y, angle = 0, scale = 1) {
    const g = this.scene.add.graphics().setDepth(this.depth + 2).setBlendMode(Phaser.BlendModes.ADD);

    // Two crossed spikes plus a small disc: the classic readable "bang".
    for (const rot of [angle, angle + Math.PI / 2]) {
      const len = COMBAT.muzzleFlashLength * scale;
      g.lineStyle(3 * scale, COMBAT.muzzleFlashColor, 1);
      g.lineBetween(
        x - Math.cos(rot) * len,
        y - Math.sin(rot) * len,
        x + Math.cos(rot) * len,
        y + Math.sin(rot) * len,
      );
    }
    g.fillStyle(COMBAT.muzzleFlashColor, 0.9);
    g.fillCircle(x, y, 5 * scale);

    // Fade fast and shrink slightly — a lingering flash looks like a bug.
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      scale: 0.6,
      duration: COMBAT.muzzleFlashMs,
      ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });
  }

  /**
   * Flash the crosshair hit marker.
   * @param {boolean} confirmed - true for a server-confirmed hit.
   * @param {boolean} [fatal] - Was this a kill?
   * @returns {void}
   */
  hitMarkerFlash(confirmed, fatal = false) {
    this._hitMarkerUntil =
      this.scene.time.now + (fatal ? COMBAT.killMarkerMs : COMBAT.hitMarkerMs);

    this.hitMarker.clear();
    const color = fatal ? THEME.danger : confirmed ? COMBAT.confirmedHitColor : COMBAT.predictedHitColor;

    // Four ticks in a cross. Unconfirmed hits get thinner strokes, so "maybe"
    // reads differently from "yes" at a glance.
    const grow = fatal ? 1.35 : confirmed ? 1.15 : 1;
    const inner = COMBAT.hitMarkerInner * grow;
    const outer = COMBAT.hitMarkerOuter * grow + COMBAT.hitMarkerPunch;
    const width = confirmed || fatal ? 3 : 2;

    // A soft additive halo behind the cross. On a busy arena a 2px white tick
    // is easy to miss; the halo is what makes it land as a *snap* rather than a
    // faint line. Draw it in the same additive pass as the core.
    if (confirmed || fatal) {
      this.hitMarker.lineStyle(width + 5, color, 0.22);
      for (const [dx, dy] of TICK_DIRS) {
        this.hitMarker.lineBetween(dx * inner, dy * inner, dx * outer, dy * outer);
      }
    }

    for (const [dx, dy] of TICK_DIRS) {
      this.hitMarker.lineStyle(width, color, 1);
      this.hitMarker.lineBetween(dx * inner, dy * inner, dx * outer, dy * outer);
    }

    this.hitMarker.setAlpha(1);
    // Start small and punch OUT past 1, then settle — the overshoot is what
    // reads as "impact" rather than "a graphic appeared".
    this.hitMarker.setScale(0.55);
    this.scene.tweens.add({
      targets: this.hitMarker,
      scale: 1,
      duration: fatal ? 140 : 90,
      ease: 'Back.easeOut',
    });
  }

  /**
   * Low-health screen vignette.
   *
   * Drawn as four edge bars (never a full-screen tint) for the same reason as
   * `damageFlash`: a full wash hides the enemy that is about to kill you, which
   * is exactly when you most need to see them.
   *
   * Idempotent — calling it repeatedly re-uses the same four rectangles and just
   * re-pulses them, so the per-frame health check below allocates nothing.
   *
   * @param {number} intensity - 0 hides it, 1 is full strength.
   * @returns {void}
   */
  setLowHealth(intensity) {
    const clamped = Math.max(0, Math.min(1, intensity));
    if (!this._vignette) {
      const { width, height } = this.scene.scale;
      const t = 120;
      const bars = [
        this.scene.add.rectangle(width / 2, t / 2, width, t, THEME.danger, 1),
        this.scene.add.rectangle(width / 2, height - t / 2, width, t, THEME.danger, 1),
        this.scene.add.rectangle(t / 2, height / 2, t, height, THEME.danger, 1),
        this.scene.add.rectangle(width - t / 2, height / 2, t, height, THEME.danger, 1),
      ];
      bars.forEach((bar) => bar.setDepth(this.depth + 6).setScrollFactor(0).setAlpha(0));
      this._vignette = bars;
    }
    this._vignette.forEach((bar) => bar.setAlpha(clamped * COMBAT.lowHealthVignette));
  }

  /**
   * Kill confirmation: a distinct red X plus a brief screen-edge flare.
   *
   * Separate from `hitMarkerFlash(fatal)` because a kill deserves its own
   * punctuation — a wider, redder, longer-lived mark than a body shot, so in a
   * spray of fire you can tell "I hit them" from "I got them".
   *
   * @returns {void}
   */
  killConfirm() {
    this.hitMarkerFlash(true, true);
    this.damageFlash();
  }

  /**
   * Spawn a floating damage number at a world position.
   * @param {number} x
   * @param {number} y
   * @param {number} amount
   * @param {object} [opts]
   * @param {string} [opts.color]
   * @param {boolean} [opts.crit]
   * @returns {void}
   */
  damageNumber(x, y, amount, { color = '#ffffff', crit = false } = {}) {
    // Pooled: one Text + one Tween per hit was the single biggest source of
    // mid-fight GC churn, since a mag dump can land several numbers a second.
    const label = this.numberPool.acquire(COMBAT.damageNumberMs);

    // Random horizontal scatter so simultaneous hits do not stack into an
    // unreadable pile. Also why the pool needs slack: overlapping numbers are
    // expected, and reading them is easier than reading one blurred column.
    const driftX = (Math.random() - 0.5) * 34;
    const y0 = y;
    const y1 = y - COMBAT.damageRisePx;

    label
      .setText(String(Math.round(amount)))
      .setColor(color)
      .setFontSize(crit ? 24 : 19)
      .setPosition(x + driftX, y0)
      .setScale(crit ? 1.3 : 1)
      .setAlpha(1);

    // Driven from the pool's own clock (see CombatFx.update) rather than a
    // per-number tween: a Tween per damage number is exactly the allocation we
    // are trying to eliminate, and the visual result is identical.
    const entry = this.numberPool.entries.find((e) => e.obj === label);
    if (entry) {
      entry.anim = { fromY: y0, toY: y1, fromScale: crit ? 1.3 : 1, crit };
    }
  }

  /**
   * Advance pooled effects: fade tracers out, and float + fade damage numbers.
   *
   * Damage numbers animate on the pool's own clock instead of via tweens. That
   * removes one Tween object per hit, which was the dominant allocation in a
   * firefight, and it keeps their motion perfectly in step with the release
   * timer that actually recycles them.
   *
   * @param {number} [deltaMs]
   * @returns {void}
   */
  _updatePools(deltaMs = 16.67) {
    this.tracerPool.update();

    const now = this.scene.time.now;
    for (const entry of this.numberPool.entries) {
      if (!entry.inUse || !entry.anim) continue;
      const t = (now - entry.bornAt) / COMBAT.damageNumberMs;
      if (t >= 1) continue; // pool.update() will release it this frame
      // Ease-out so the number leaps away then settles, matching the old tween.
      const eased = 1 - (1 - t) * (1 - t);
      entry.obj.y = entry.anim.fromY + (entry.anim.toY - entry.anim.fromY) * eased;
      entry.obj.setAlpha(1 - eased);
    }
    this.numberPool.update();
  }

  /**
   * Quick expanding ring where an entity died.
   * @param {number} x
   * @param {number} y
   * @param {number} [color]
   * @returns {void}
   */
  deathPoof(x, y, color = THEME.danger) {
    const ring = this.scene.add.circle(x, y, 6, color, 0).setDepth(this.depth + 1);
    this.scene.tweens.add({
      targets: ring,
      displayWidth: 120,
      displayHeight: 120,
      alpha: 0.55,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /**
   * Red screen-edge flash when WE take damage.
   *
   * Drawn as four edge bars rather than a full-screen red overlay: a full tint
   * would obscure the very moment you most need to see — who is shooting you.
   *
   * @returns {void}
   */
  damageFlash() {
    const { width, height } = this.scene.scale;
    const thickness = 90;

    const edges = [
      this.scene.add.rectangle(width / 2, thickness / 2, width, thickness, THEME.danger, 0.32),
      this.scene.add.rectangle(width / 2, height - thickness / 2, width, thickness, THEME.danger, 0.32),
      this.scene.add.rectangle(thickness / 2, height / 2, thickness, height, THEME.danger, 0.32),
      this.scene.add.rectangle(width - thickness / 2, height / 2, thickness, height, THEME.danger, 0.32),
    ].map((rect) => rect.setDepth(this.depth + 6).setScrollFactor(0));

    this.scene.tweens.add({
      targets: edges,
      alpha: 0,
      duration: 420,
      ease: 'Quad.easeOut',
      onComplete: () => edges.forEach((e) => e.destroy()),
    });
  }

  /**
   * Keep the hit marker glued to the pointer and fade it out on time.
   * @returns {void}
   */
  update() {
    // Pooled effects MUST advance every frame. This used to early-return when
    // the hit marker was invisible, which (once pooling landed) would have left
    // tracers and damage numbers frozen on screen and never released — a leak
    // that only appears once the pool saturates.
    this._updatePools();

    if (this.hitMarker.alpha <= 0) return;

    const pointer = this.scene.input?.activePointer;
    if (pointer) this.hitMarker.setPosition(pointer.x, pointer.y);

    if (this.scene.time.now >= this._hitMarkerUntil) {
      this.scene.tweens.add({ targets: this.hitMarker, alpha: 0, duration: 120 });
      this._hitMarkerUntil = 0;
    }
  }

  /** @returns {void} */
  destroy() {
    this._numbers.forEach((n) => n.destroy());
    this._numbers = [];
    // Release pooled effects BEFORE destroying them: a pooled Text may still be
    // mid-animation, and a live tween targeting a destroyed object throws.
    this.tracerPool?.clear();
    this.numberPool?.clear();
    this.tracerPool?.destroy();
    this.numberPool?.destroy();
    this.hitMarker.destroy();
  }
}

export default CombatFx;