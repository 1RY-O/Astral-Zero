/**
 * Astral Zero — FxPool (FRONTEND).
 * ============================================================
 * A fixed-size object pool for short-lived display objects (tracer lines, damage
 * numbers, impact sparks).
 *
 * THE PROBLEM THIS SOLVES
 * Phase 4 created a fresh Phaser object per tracer and per damage number:
 *
 *     const g = scene.add.line(...);        // new GameObject
 *     scene.tweens.add({ onComplete: () => g.destroy() });   // new tween
 *
 * A single firefight creates hundreds of these. Each is a JS object, a Phaser
 * GameObject with its own transform/entry in the display list, and a Tween. They
 * are all short-lived, which is the worst case for a garbage collector: you get
 * a burst of promoted-to-old-gen objects right in the middle of the fight, and
 * the resulting collection pause shows up as a visible hitch exactly when
 * gunfire is heaviest.
 *
 * THE FIX
 * Allocate a fixed budget ONCE, then recycle. Steady-state firing allocates
 * nothing at all. The pool is deliberately bounded rather than elastic: when it
 * runs dry we recycle the OLDEST entry rather than growing, because a runaway
 * pool would trade GC stutter for memory growth and draw-call count.
 *
 * WHAT IS *NOT* POOLED
 * The hit marker, muzzle flash and death poof are one-per-event singletons that
 * already reuse themselves, so pooling them would add bookkeeping for nothing.
 */

/**
 * @typedef {object} PoolEntry
 * @property {Phaser.GameObjects.GameObject} obj
 * @property {boolean} inUse
 * @property {number} bornAt
 */

export class FxPool {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {number} opts.size - Hard budget.
   * @param {() => Phaser.GameObjects.GameObject} opts.create - Factory, called `size` times up front.
   * @param {(obj: object, lifeMs: number) => void} opts.onSpawn - Starts the show.
   * @param {string} [opts.name] - For debug output.
   */
  constructor(scene, { size, create, onSpawn, name = 'fx' }) {
    this.scene = scene;
    this.name = name;
    this.onSpawn = onSpawn;

    /** @type {PoolEntry[]} */
    this.entries = [];
    /** Round-robin cursor: the next slot to steal when the pool is empty. */
    this._cursor = 0;
    /** Peak concurrent usage — the number to watch for a too-small pool. */
    this.peak = 0;

    for (let i = 0; i < size; i += 1) {
      const obj = create();
      obj.setVisible(false);
      this.entries.push({ obj, inUse: false, bornAt: 0 });
    }
  }

  /** How many entries are currently animating. @returns {number} */
  get activeCount() {
    let n = 0;
    for (const e of this.entries) if (e.inUse) n += 1;
    return n;
  }

  /**
   * Take an entry from the pool and start its animation.
   *
   * @param {number} lifeMs - How long the effect should run.
   * @returns {Phaser.GameObjects.GameObject} The recycled object.
   */
  acquire(lifeMs) {
    // Prefer a free entry. Linear scan rather than a free-list: with a budget in
    // the low dozens and at most a handful active, this is measurably cheaper
    // than maintaining a second index, and it keeps the code obvious.
    let entry = null;
    for (const e of this.entries) {
      if (!e.inUse) { entry = e; break; }
    }

    if (!entry) {
      // Pool exhausted: steal the oldest. Recycling an in-flight effect is far
      // better than allocating — at worst a tracer is cut a few frames short.
      entry = this.entries[this._cursor];
      this._cursor = (this._cursor + 1) % this.entries.length;
    }
    entry.inUse = true;
    entry.bornAt = this.scene.time.now;
    // ★ Must persist the requested lifetime. Without it, `update()` compares
    // `elapsed < undefined` → false and releases EVERY entry on the very next
    // frame, so effects flash for a single frame instead of living their life.
    entry.lifeMs = lifeMs;
    entry.obj.setVisible(true);
    this.peak = Math.max(this.peak, this.activeCount);
    this.onSpawn(entry.obj, lifeMs);
    return entry.obj;
  }

  /**
   * Release entries whose lifetime has elapsed.
   *
   * Driven by our own clock rather than per-object tweens, because a tween per
   * effect is a large part of the allocation we are trying to remove. One
   * per-frame scan of a small array is effectively free.
   *
   * @returns {void}
   */
  update() {
    const now = this.scene.time.now;
    for (const e of this.entries) {
      if (!e.inUse) continue;
      if (now - e.bornAt < (e.lifeMs ?? 0)) continue;
      e.inUse = false;
      e.lifeMs = 0;
      e.obj.setVisible(false);
    }
  }

  /**
   * Release everything immediately (scene teardown, match end).
   * @returns {void}
   */
  clear() {
    for (const e of this.entries) {
      e.inUse = false;
      e.bornAt = 0;
      e.obj.setVisible(false);
    }
    this._cursor = 0;
  }

  /** @returns {void} */
  destroy() {
    for (const e of this.entries) e.obj.destroy();
    this.entries = [];
  }
}

export default FxPool;
