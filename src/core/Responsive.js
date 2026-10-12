/**
 * Astral Zero — responsive tier bus.
 * ============================================================
 * Scenes pick their layout tier from `viewportConfig.currentLayout()` exactly
 * once, inside `create()`. That is correct for a fixed window but wrong the
 * moment anything resizes: rotate a phone or drag a desktop window across a
 * breakpoint and the scene keeps rendering the tier it was built for, with
 * layout metadata that no longer matches the device — a "wide" three-column
 * body on a 390 px phone, or a single-column body on a 2560 px monitor, until
 * the scene is restarted by some unrelated event.
 *
 * This module owns ONE real listener (debounced) and republishes tier changes,
 * so nobody adds their own `resize` handler and nobody has to invent a debounce.
 *
 * Scenes opt in with `reloadOnTierChange()`, which restarts the scene so it
 * rebuilds with the correct tier. A tier-based layout cannot be patched in
 * place — the widgets are laid out from constants captured at build time — and a
 * clean rebuild is honest where a half-migrated layout is a lie.
 */

import { tierFor } from '../config/viewportConfig.js';

const listeners = new Set();
let lastTier = null;
let timer = null;
let bound = false;
const DEBOUNCE_MS = 180;

/**
 * The tier the browser is ACTUALLY showing, in CSS px.
 *
 * Deliberately reads the DOM rather than `currentLayout(scale)`: the scene-based
 * reader can only be handed a scale manager that belongs to a live scene, and
 * with no argument it falls back to the 1280 px design width — which would pin
 * this bus to the wide tier forever and make every subscriber dead code.
 *
 * @returns {string} 'wide' | 'medium' | 'compact'
 */
function viewportTier() {
  if (typeof window === 'undefined' || !window.innerWidth) return tierFor(0);
  return tierFor(window.innerWidth);
}

function publish() {
  const tier = viewportTier();
  if (tier === lastTier) return;
  const previous = lastTier;
  lastTier = tier;
  for (const cb of [...listeners]) {
    try {
      cb(tier, previous);
    } catch (err) {
      // A bad subscriber must never break the others (or the resize plumbing).
      console.error('[Responsive] tier listener threw:', err);
    }
  }
}

function onResize() {
  clearTimeout(timer);
  timer = setTimeout(publish, DEBOUNCE_MS);
}

function bind() {
  if (bound || typeof window === 'undefined') return;
  // Headless / test environments expose a window that cannot carry listeners
  // (a stub, or a node global without the EventTarget surface). Failing to bind
  // must degrade to "no listener" — silently staying on the tier read at
  // create() — rather than throwing out of scene creation.
  if (typeof window.addEventListener !== 'function') return;
  bound = true;
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
}

/**
 * Subscribe to layout-tier changes.
 * @param {(tier: string, previous: string|null) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onTierChange(cb) {
  bind();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Restart a scene whenever the tier changes, so it rebuilds for the device it is
 * actually being displayed on.
 *
 * Only safe for scenes with no in-flight match state — a menu can be rebuilt
 * freely, an arena cannot (see the guards below).
 *
 * @param {Phaser.Scene} scene
 * @returns {() => void} unsubscribe
 */
export function reloadOnTierChange(scene) {
  bind();
  // Defensive: a scene can be constructed without Phaser's full plumbing
  // (headless tests, or an instance created before the Systems boot). In that
  // case there is no scene API to restart, so the subscription is inert rather
  // than a crash inside scene creation.
  const sceneApi = scene?.scene;
  if (!sceneApi || typeof sceneApi.restart !== 'function') {
    return () => {};
  }
  const key = sceneApi.key;
  const off = onTierChange((tier, previous) => {
    if (tier === previous) return;
    if (typeof scene.game === 'undefined' || !scene.game) return;
    // Never restart a scene that is not currently active: a background scene
    // getting rebuilt would blow away its own state for no reason.
    if (!sceneApi.isActive?.()) return;
    // Opt-out hook for the arena / spectator: a match is live, so a rebuild
    // would destroy authoritative state the player is using.
    if (scene.settings && scene.settings.isPendingDestroy) return;
    if (scene._layoutLocked === true) return;
    sceneApi.restart();
  });
  return () => {
    off();
  };
}

/** Test/debug helper: the tier the viewport is currently showing. @returns {string} */
export function tierNow() {
  return viewportTier();
}

export default { onTierChange, reloadOnTierChange, tierNow };
