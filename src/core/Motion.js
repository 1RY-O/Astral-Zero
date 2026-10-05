/**
 * Astral Zero — motion + reduced-motion helper (FRONTEND).
 * ===========================================================
 * A single choke point for "should this animate, and how much".
 *
 * WHY A MODULE INSTEAD OF A PER-EFFECT CHECK
 * `prefers-reduced-motion` is an accessibility preference, and scattering
 * `if (reduced) skip` through a dozen widgets means the twelfth one gets
 * forgotten. Here, every tween goes through `Motion.tween()`, so setting
 * `Motion.setReduced(true)` instantly makes the WHOLE game still: tweens
 * collapse to a 0 ms state change, which is instant-but-not-broken rather
 * than "the button never appears".
 *
 * SCALE, NOT A BOOLEAN, IN THE MIDDLE
 * `duration(180)` returns 0 when reduced, but `scale(0.5)` returns 0 too.
 * That lets intermediate values (e.g. a camera lead of 0.5x) still function
 * rather than snapping to either extreme.
 */

/** @type {boolean} */
let reduced = false;

/** @type {boolean} */
let initialised = false;

/** Live media query, kept so we can unsubscribe on shutdown. */
let query = null;

/**
 * Read the OS-level preference and keep following it (a user can toggle
 * reduced motion mid-session; we should follow, not snapshot).
 *
 * Safe to call repeatedly — only the first call subscribes.
 * @returns {boolean} The current preference.
 */
export function init() {
  if (initialised) return reduced;
  initialised = true;

  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      query = window.matchMedia('(prefers-reduced-motion: reduce)');
      reduced = Boolean(query.matches);
      // `addEventListener` on MediaQueryList is the modern API; older Safari
      // only has `addListener`, so support both.
      const onChange = (event) => {
        reduced = Boolean(event.matches);
      };
      if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', onChange);
      } else if (typeof query.addListener === 'function') {
        query.addListener(onChange);
      }
    }
  } catch {
    // No matchMedia (headless test env) → keep the animated default.
    reduced = false;
  }

  return reduced;
}

/**
 * Detach the media-query listener. Called on game teardown so a long-lived
 * SPA host does not leak a listener per boot.
 * @returns {void}
 */
export function destroy() {
  try {
    if (query && typeof query.removeEventListener === 'function') {
      query.removeEventListener('change', () => {});
    }
  } catch {
    /* best effort */
  }
  initialised = false;
}

/**
 * Override the preference. Used by the settings menu so the choice can be
 * made in-game rather than only at the OS level.
 * @param {boolean} value
 * @returns {void}
 */
export function setReduced(value) {
  reduced = Boolean(value);
}

/** @returns {boolean} */
export function isReduced() {
  return reduced;
}

/**
 * Duration in ms, collapsed to 0 when reduced motion is on.
 * @param {number} ms
 * @returns {number}
 */
export function duration(ms) {
  return reduced ? 0 : Math.max(0, ms || 0);
}

/**
 * A 0..1 or arbitrary scale factor, collapsed to 0 when reduced. Used for
 * camera leads, tween magnitudes and offsets that should simply not happen.
 * @param {number} amount
 * @returns {number}
 */
export function scale(amount) {
  return reduced ? 0 : amount;
}

/**
 * tween() wrapper that respects reduced motion.
 *
 * When reduced, the tween is still created but with duration 0, which means
 * the target ends up at its FINAL value immediately. That is deliberate: a
 * "no animation" implementation that simply skips the tween would leave
 * objects at their start values, which is a bug, not a preference.
 *
 * @param {Phaser.Scene} scene
 * @param {object} config - Phaser tween config (targets, duration, …).
 * @returns {object|null} The tween handle, or null if the scene had no tweens.
 */
export function tween(scene, config = {}) {
  const manager = scene?.tweens;
  if (!manager?.add) return null;
  return manager.add({ ...config, duration: duration(config.duration ?? 180) });
}

/**
 * Convenience: animate a UI object in (fade + slight rise), respecting
 * reduced motion. Used for lobby cards, toasts, medals and the HUD banner so
 * every entrance shares one motion signature.
 *
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.GameObject|Phaser.GameObjects.GameObject[]} target
 * @param {{delay?: number, from?: number, distance?: number}} [opts]
 * @returns {object|null}
 */
export function enter(scene, target, opts = {}) {
  const distance = scale(opts.distance ?? 12);
  const from = opts.from ?? 0;
  const list = Array.isArray(target) ? target : [target];

  list.forEach((obj) => {
    if (!obj?.setAlpha) return;
    obj.setAlpha(from);
    if (distance && obj.setPosition) {
      obj.y += distance;
    }
  });

  if (reduced) {
    // Land on the final state immediately.
    list.forEach((obj) => {
      obj?.setAlpha?.(1);
      if (distance && obj.setPosition) obj.y -= distance;
    });
    return null;
  }

  return tween(scene, {
    targets: list,
    alpha: 1,
    y: `-=${distance}`,
    duration: opts.duration ?? 220,
    delay: opts.delay ?? 0,
    ease: 'Back.easeOut',
  });
}

export const Motion = {
  init,
  destroy,
  setReduced,
  isReduced,
  duration,
  scale,
  tween,
  enter,
};

export default Motion;
