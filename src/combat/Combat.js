/**
 * Astral Zero — Combat (FRONTEND).
 * ============================================================
 * Firing, local hit prediction, and the feedback that makes a shot feel real.
 *
 * PREDICT, NEVER DECIDE
 * The server owns damage. This module NEVER decides that a target took 25
 * damage — it only predicts a hit so feedback is instant, then waits for the
 * server's verdict:
 *
 *   predicted hit → hollow marker + damage number immediately (0 ms)
 *   server `player_hit` → solid marker, real damage number (1 RTT later)
 *
 * If prediction and server disagree, the server wins: it sends the true HP and
 * the HUD overwrites whatever we guessed. A player therefore cannot "cheat"
 * damage into existence, because nothing here writes authoritative state — it
 * only draws.
 *
 * WHY HITSCAN IN A 2D GAME
 * At this scale a projectile crosses the screen in under a frame, so it would
 * be invisible. An instant hitscan along the aim vector (with a corridor width,
 * for fairness) is what the genre does and what players expect from a crosshair.
 */

import { COMBAT } from '../config/netConfig.js';
import { weaponFor, DEFAULT_WEAPON } from '../config/weapons.js';

/**
 * Damage model for local prediction.
 *
 * ★ This MIRRORS the server's rows in src/combat/weapons.js. If you change a
 * number here, change it there too — a mismatch shows up as predicted hits
 * that the server never confirms (too high) or shots you "missed" that landed
 * (too low). `tests/combat-model.test.mjs` asserts the two tables agree.
 */
const FALLOFF = { start: 420, minFactor: 0.55 };

/**
 * Shared "nothing happened" result.
 *
 * Returned by reference on every rejected trigger frame. Reusing one frozen
 * object means a held trigger across 60 frames/sec allocates nothing — this
 * runs every frame, so an inline literal here would be a steady stream of
 * garbage for the GC to chase during a firefight.
 */
const NO_SHOT = Object.freeze({
  fired: false,
  hit: null,
  damage: 0,
  endX: 0,
  endY: 0,
  travelMs: 0,
});

/**
 * The client's prediction model for one equipped weapon.
 *
 * Phase 4 — WHY THIS IS NO LONGER A FLAT HITSCAN
 * Phase 3 predicted every shot as an instant hitscan at a fixed 900px. The
 * Phase 3 SERVER does not do that: it spawns a real PROJECTILE with a muzzle
 * velocity and a travel range. Predicting instant hits therefore lied in two
 * ways that felt like the game was broken:
 *
 *   1. RANGE. We claimed hits out to 900px; the server's projectiles die at
 *      420-560px depending on weapon. Every long shot produced a satisfying
 *      local hit marker and damage number that the server then refused.
 *   2. TRAVEL TIME. A projectile at 760px/s needs ~0.7s to cross the screen.
 *      We reported a hit instantly, so the feedback landed long before the
 *      bullet did — and the "confirmed" marker then re-pulsed a second later,
 *      reading as two separate hits.
 *
 * We still predict (instant feedback matters more than being right), but now
 * against the SERVER's actual projectile: same range, same speed. The remaining
 * error is only the human reaction delay, which the confirmation pass absorbs.
 */
export class WeaponModel {
  /**
   * @param {object} [weapon] - Row from src/config/weapons.js.
   */
  constructor(weapon = weaponFor(DEFAULT_WEAPON)) {
    this.weapon = weapon;
  }

  /** @param {object} weapon - Switch to a different row. @returns {void} */
  setWeapon(weapon) {
    this.weapon = weapon ?? weaponFor(DEFAULT_WEAPON);
  }

  /** @returns {string} */
  get id() {
    return this.weapon.id;
  }

  /** Max px this shot can travel before the server's projectile dies. */
  get range() {
    return this.weapon.range;
  }

  /** px/s — used to convert a distance into an ETA for the tracer. */
  get speed() {
    return this.weapon.speed;
  }

  /** ms between shots the server will actually allow. */
  get cooldownMs() {
    return this.weapon.cooldownMs;
  }

  /**
   * How long the round takes to reach `distance` px.
   *
   * Used to delay the predicted hit marker by the same amount the server's
   * projectile is in flight, so feedback lands WITH the shot instead of before
   * it. Returns 0 for an instant-range weapon so melee-ish weapons stay crisp.
   *
   * @param {number} distance
   * @returns {number} ms
   */
  travelMs(distance) {
    const speed = this.weapon.speed;
    if (!Number.isFinite(speed) || speed <= 0) return 0;
    const ms = (distance / speed) * 1000;
    return Math.round(Math.max(0, Math.min(COMBAT.maxPredictedTravelMs, ms)));
  }

  /**
   * Predicted damage for a hit, with linear falloff so a distant target is not
   * deleted in a single shot.
   *
   * Uses the SERVER's damage value (not a separate client constant) so the
   * predicted number matches the number the server will report.
   *
   * @param {{x: number, y: number}} origin
   * @param {{x: number, y: number}} target
   * @returns {number} Rounded damage.
   */
  damageFor(origin, target) {
    const distance = Math.hypot(target.x - origin.x, target.y - origin.y);
    const span = Math.max(1, this.range - FALLOFF.start);
    const factor =
      distance <= FALLOFF.start
        ? 1
        : 1 - (1 - FALLOFF.minFactor) * ((distance - FALLOFF.start) / span);
    return Math.round(this.weapon.damage * Math.max(FALLOFF.minFactor, factor));
  }
}

export class Combat {
  /**
   * @param {object} opts
   * @param {() => {x: number, y: number, angle: number}} opts.getOrigin - Muzzle position + aim.
   * @param {() => Array<object>} opts.getTargets - Live entity list.
   * @param {(target: object) => boolean} [opts.canDamage] - Friendly-fire filter.
   */
  constructor({ getOrigin, getTargets, canDamage = () => true, weapon = null, now = () => performance.now() }) {
    this.getOrigin = getOrigin;
    this.getTargets = getTargets;
    this.canDamage = canDamage;

    /**
     * Injectable clock. Exists so tests can drive the fire gate deterministically
     * instead of sleeping — the cooldown is time-based and was previously
     * untestable without real delays.
     * @type {() => number}
     */
    this.now = now;

    /** Per-weapon prediction model (range, speed, damage). */
    this.model = new WeaponModel(weapon ?? undefined);

    /**
     * The weapon id the server is known to be holding. Sent on every shot so the
     * server can switch us; Phase 3 hard-coded 'mop', which the server does not
     * know and therefore silently ignored.
     * @type {string}
     */
    this.weaponId = this.model.id;

    /** @type {Array<object>} Tracers queued for the current frame. */
    this.tracers = [];

    /** now() of the last accepted shot. */
    this._lastShotAt = -Infinity;

    /**
     * Shots produced by the current trigger pull. A fast clicker dumps 3
     * rounds in one pull, which feels far better than one-per-click; a HELD
     * trigger must not auto-fire, which the cooldown handles.
     */
    this._shotsThisPull = 0;

    /** Rising counters for the debug overlay. */
    this.stats = { shots: 0, predictedHits: 0 };
  }

  /**
   * Equip a weapon row from src/config/weapons.js.
   *
   * The fire gate is re-based rather than cleared. Clearing it
   * (`_lastShotAt = -Infinity`) would let you switch weapons and instantly
   * fire, bypassing the new weapon's cooldown entirely — a free shot on every
   * swap. Instead we back-date the last shot by the NEW cooldown, so the swap
   * itself is not punished but the new cadence still has to be waited out.
   *
   * @param {object} weapon
   * @returns {void}
   */
  setWeapon(weapon) {
    this.model.setWeapon(weapon);
    this.weaponId = this.model.id;
    // Back-date by the NEW cooldown. The `- 1` matters: the fire gate rejects
    // only when `now - _lastShotAt < cooldown`, so landing exactly on the
    // boundary would let the very first shot after a swap go straight through.
    // One millisecond short keeps the swap honest without punishing it.
    this._lastShotAt = this.now() - this.model.cooldownMs + 1;
    // A weapon change is a new trigger context; the next pull must be explicit.
    this._shotsThisPull = 0;
  }

  /**
   * Try to fire. Call every frame with the current trigger state.
   *
   * @param {boolean} triggerHeld - Is the fire button down?
   * @param {boolean} [justPressed] - Did it go down THIS frame?
   * @returns {{fired: boolean, hit: object|null, damage: number, endX: number, endY: number, travelMs: number}}
   */
  tryFire(triggerHeld, justPressed = false) {
    // Gate on the SERVER's cooldown for the equipped weapon, not a client
    // constant. Phase 3 fired every 160ms while the rifle allows 320ms, so half
    // of every burst was rejected by the server as COOLDOWN — the gun felt
    // broken and half the rounds appeared to vanish.
    const cooldownMs = this.model.cooldownMs;
    const now = this.now();

    // A new pull resets the burst counter; a held trigger fires only on cooldown.
    if (justPressed || !triggerHeld) this._shotsThisPull = 0;

    const canBurst = this._shotsThisPull < COMBAT.maxShotsPerPull;
    if (!triggerHeld || (!canBurst && !justPressed)) {
      return NO_SHOT;
    }
    if (now - this._lastShotAt < cooldownMs) {
      return NO_SHOT;
    }

    this._lastShotAt = now;
    this._shotsThisPull += 1;
    this.stats.shots += 1;

    const origin = this.getOrigin();
    const { hit, endX, endY } = this._hitscan(origin.x, origin.y, origin.angle);

    const travelMs = hit ? this.model.travelMs(Math.hypot(endX - origin.x, endY - origin.y)) : 0;

    if (hit) {
      this.stats.predictedHits += 1;
      return {
        fired: true,
        hit,
        damage: this.model.damageFor(origin, hit),
        endX,
        endY,
        travelMs,
      };
    }
    return { fired: true, hit: null, damage: 0, endX, endY, travelMs: 0 };
  }

  /**
   * Cast a ray from `origin` along `angle` and find the nearest valid target.
   *
   * Uses a "corridor" test rather than pixel-perfect ray/sprite intersection:
   * the perpendicular distance from the target to the ray line is compared to
   * `hitscanWidth`. That is cheaper and, crucially, more forgiving — a tiny aim
   * error the player never noticed should not eat their shot.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} angle
   * @returns {{hit: object|null, endX: number, endY: number}}
   */
  _hitscan(x, y, angle) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    // ★ The equipped weapon's REAL range, not the old flat COMBAT.range. This is
    // the single most important correctness fix in Phase 4: predicting hits
    // beyond the server's projectile range produced guaranteed phantom
    // hitmarkers on every long shot.
    const maxRange = Math.min(this.model.range, COMBAT.range);

    let best = null;
    let bestAlong = Infinity;

    for (const target of this.getTargets()) {
      if (!target.alive || target.hp <= 0) continue;
      if (!this.canDamage(target)) continue;

      // Vector from the muzzle to the target centre.
      const toX = target.x - x;
      const toY = target.y - y;

      // Projection onto the ray; negative means the target is behind us.
      const along = toX * dx + toY * dy;
      if (along < 0 || along > maxRange) continue;

      // Perpendicular distance from the target to the ray line.
      const perp = Math.abs(toX * dy - toY * dx);
      if (perp > COMBAT.hitscanWidth) continue;

      if (along < bestAlong) {
        bestAlong = along;
        best = target;
      }
    }

    // The tracer stops at the first thing it hits, or at max range.
    // `bestAlong` stays Infinity on a miss, which correctly yields Infinity as
    // the end point — the caller clamps that to the true max range.
    const along = Number.isFinite(bestAlong) ? bestAlong : maxRange;
    return { hit: best, endX: x + dx * along, endY: y + dy * along };
  }
/**
   * Predicted damage for a hit. Delegates to the equipped weapon's model so
   * there is exactly ONE damage implementation (the old copy here used a
   * separate `DAMAGE.base = 18` constant that disagreed with the server's 16).
   * @param {{x: number, y: number}} origin
   * @param {{x: number, y: number}} target
   * @returns {number} Rounded damage.
   */
  damageFor(origin, target) {
    return this.model.damageFor(origin, target);
  }

  /**
   * Queue a tracer line to be drawn this frame.
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   * @param {number} [color]
   * @returns {void}
   */
  addTracer(x1, y1, x2, y2, color = COMBAT.tracerColor) {
    this.tracers.push({ x1, y1, x2, y2, color, bornAt: this.now() });
  }

  /**
   * Drop tracers older than `COMBAT.tracerMs`. The scene calls this every
   * frame so the buffer cannot grow without bound if the loop stalls.
   * @param {number} [nowMs]
   * @returns {void}
   */
  expireTracers(nowMs = this.now()) {
    this.tracers = this.tracers.filter((t) => nowMs - t.bornAt <= COMBAT.tracerMs);
  }

  /** Clear per-match state. @returns {void} */
  reset() {
    this.tracers = [];
    this._lastShotAt = -Infinity;
    this._shotsThisPull = 0;
    this.stats = { shots: 0, predictedHits: 0 };
  }
}

export default Combat;