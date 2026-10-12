/**
 * Astral Zero — boot / loading screen (FRONTEND).
 * =========================================================
 * A real loading screen, not a spinner. It lives in plain DOM (not Phaser)
 * for two reasons:
 *
 *  1. It must render BEFORE the Phaser bundle has executed, so it cannot
 *     depend on Phaser at all.
 *  2. It must be responsive and accessible at 320px, which a canvas is not.
 *
 * NO FAKE PROGRESS (explicit requirement)
 * Progress is driven by REAL milestones emitted by the boot sequence:
 *
 *   SCANNING DEBRIS FIELD   → textures are being generated (BootScene)
 *   CALIBRATING SUIT        → the Phaser engine is up (Phaser.Core.Events.READY)
 *   LOADING MISSION DATA    → the lobby scene has started
 *   CONNECTING TO ORBIT     → the socket has reported a status
 *   READY                   → the lobby is interactive
 *
 * Each step advances the bar by a FIXED amount when it actually happens — we
 * never tick a fake timer upward. If the socket is slow, the bar genuinely
 * sits at 80% and says "CONNECTING TO ORBIT", which is the honest state. If
 * everything is instant, the bar simply completes fast; no artificial delay is
 * inserted, because a loading screen that lies about duration is worse than
 * one that flashes.
 *
 * ACCESSIBILITY
 *  - `role="progressbar"` with aria-valuenow/min/max, so a screen reader
 *    announces real progress.
 *  - `aria-live="polite"` on the step label, so each step is announced.
 *  - The step text is always visible, so status never depends on colour.
 *  - `prefers-reduced-motion` disables the scan line and the ring spin.
 *  - The offline path renders a real message plus a RETRY button.
 */

import { Motion } from '../../core/Motion.js';
import { SEMANTIC_CSS, CSS_FONTS } from '../../config/uiTheme.js';

const STEPS = Object.freeze([
  { key: 'scan', label: 'SCANNING DEBRIS FIELD', weight: 25 },
  { key: 'calibrate', label: 'CALIBRATING SUIT', weight: 25 },
  { key: 'mission', label: 'LOADING MISSION DATA', weight: 20 },
  { key: 'connect', label: 'CONNECTING TO ORBIT', weight: 25 },
  { key: 'ready', label: 'READY', weight: 5 },
]);

/**
 * CSS-side colours.
 *
 * Imported from the theme rather than re-typed here. This module CANNOT import
 * Phaser (it has to paint before the Phaser bundle parses) but uiTheme.js
 * imports nothing at all, so it is safe — and it is the same file the Phaser
 * widgets read, which is the entire point: two layers, one palette.
 */
const COLORS = Object.freeze({
  text: SEMANTIC_CSS.textPrimary,
  dim: SEMANTIC_CSS.textDim,
  accent: SEMANTIC_CSS.cyan,
  amber: SEMANTIC_CSS.amber,
  danger: SEMANTIC_CSS.danger,
  amberDeep: SEMANTIC_CSS.cyanDeep2,
  cyanDeep: SEMANTIC_CSS.cyanDeep5,
  white: SEMANTIC_CSS.white,
});

/**
 * Rotating gameplay tips, drawn from mechanics that actually EXIST in the
 * simulation. Every line is verifiable in code:
 *   - jump aliases, aim snapping and one-way platforms: input + camera + arena
 *   - mop swing: NBridging melee on F / RMB (src/scenes/ArenaScene.js)
 *   - weapon cycle: Q (ArenaScene._bindWeaponSwitch)
 *   - hazard zones + low-gravity volumes: src/game/maps.js
 *   - spawn protection: server-config.js sim.spawnProtectionMs
 *   - projectiles are real: src/combat/projectiles.js (never hitscan)
 *
 * NEVER add a tip for a mechanic that is not implemented — a tip that lies
 * about the controls is worse than no tip at all.
 */
export const BOOT_TIPS = Object.freeze([
  'HOLD JUMP LONGER TO JUMP HIGHER — RELEASE EARLY TO CUT THE ARC',
  'PLATFORMS ARE ONE-WAY: JUMP UP THROUGH THEM, LAND ON TOP',
  'SPACE, W AND ARROW-UP ALL JUMP — NO MATTER WHICH ONE YOUR HAND LIKES',
  'THE MOP SWINGS ON F OR THE RIGHT MOUSE BUTTON — CLOSE RANGE, BIG KNOCKBACK',
  'Q CYCLES WEAPONS. THE DOCKED CARD SHOWS DAMAGE AND COOLDOWN',
  'ROUNDS ARE REAL SHELLS WITH TRAVEL TIME — LEAD A MOVING TARGET',
  'HAZARD ZONES BURN. LOW-GRAVITY VOLUMES MAKE YOU FLOAT. BOTH ARE MARKED',
  'YOU FLASH BRIEFLY AFTER RESPAWNING — THAT WINDOW IS INVULNERABLE',
  'THE AIMING RAY SHOWS DIRECTION, NOT DAMAGE. WALLS STOP IT',
  'LET GO OF A LEDGE AND YOU STILL HAVE A MOMENT TO JUMP',
]);

const TIP_ROTATE_MS = 2600;

/** Exact startup screen duration (ms) — the single source of truth. */
export const BOOT_DWELL_MS = 4000;

export class BootScreen {
  /**
   * @param {HTMLElement} [root] - Defaults to `#boot-status`.
   */
  constructor(root) {
    this.root = root ?? document.getElementById('boot-status');
    if (!this.root) return;

    this.index = -1;
    this.progress = 0;
    this.done = false;
    this._timers = [];

    // --- Managed 4 s dwell -------------------------------------------------
    // The loading screen stays up for exactly BOOT_DWELL_MS from startDwell().
    // The timer is owned here so destroy()/fail() can always cancel it, and
    // the callback fires at most once (duplicate-transition guard).
    this._dwellTimer = null;
    this._dwellDone = false;
    this._onDwellDone = null;
    this._finishDeferred = false;
    this._removed = false;
    this.failed = false;

    this._injectStyles();
    this._buildDom();
  }

  /**
   * Inject the boot screen's CSS once. Kept in JS (rather than in index.html)
   * so the whole screen is one reviewable unit and can be re-skinned.
   * @returns {void}
   */
  _injectStyles() {
    if (document.getElementById('az-boot-style')) return;
    const style = document.createElement('style');
    style.id = 'az-boot-style';
    style.textContent = `
      @keyframes az-spin { to { transform: rotate(360deg); } }
      @keyframes az-scan { 0% { transform: translateY(-100%); } 100% { transform: translateY(320%); } }
      @media (prefers-reduced-motion: reduce) {
        .az-boot__scan { animation: none !important; display: none; }
        .az-boot__ring, .az-boot__ring > div { animation: none !important; }
      }
      @media (max-width: 640px) {
        .az-boot__title { font-size: clamp(28px, 11vw, 54px) !important; }
        .az-boot__sub { font-size: clamp(10px, 3.4vw, 14px) !important; }
        .az-boot__ring { width: 104px !important; height: 104px !important; }
      }
    `;
    document.head.appendChild(style);
  }

  /** Build the DOM tree. @returns {void} */
  _buildDom() {
    this.root.className = 'az-boot';
    this.root.innerHTML = '';

    // Full-bleed background so the letterboxed canvas cannot peek through.
    const bg = document.createElement('div');
    bg.setAttribute('aria-hidden', 'true');
    bg.style.cssText =
      'position:fixed;inset:0;pointer-events:none;' +
      `background:radial-gradient(120% 90% at 50% 15%, ${SEMANTIC_CSS.nav} 0%, ` +
      `${SEMANTIC_CSS.bg} 55%, ${SEMANTIC_CSS.bgDeep} 100%)`;
    this.root.appendChild(bg);

    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'gap:clamp(10px,2.4vh,20px);width:100%;padding:24px;text-align:center;';
    this.root.appendChild(wrap);

    // --- Orbital ring mark (pure CSS, matches the in-game brand language) ---
    const ring = document.createElement('div');
    ring.className = 'az-boot__ring';
    ring.setAttribute('aria-hidden', 'true');
    ring.style.cssText =
      'position:relative;width:132px;height:132px;flex:0 0 auto;' +
      'border:3px solid rgba(90,216,255,.28);border-radius:50%;' +
      `border-top-color:${COLORS.accent};animation:az-spin 2.6s linear infinite;`;
    // A counter-rotating inner ring gives the "orbital" read.
    const ring2 = document.createElement('div');
    ring2.style.cssText =
      'position:absolute;inset:18px;border:2px solid rgba(255,194,71,.4);border-radius:50%;' +
      `border-bottom-color:${COLORS.amber};animation:az-spin 1.8s linear infinite reverse;`;
    ring.appendChild(ring2);
    // Sweep head, echoing the in-game logo's amber cap.
    const head = document.createElement('div');
    head.style.cssText =
      'position:absolute;top:-6px;left:50%;width:14px;height:14px;margin-left:-7px;' +
      `border-radius:50%;background:${COLORS.amber};box-shadow:0 0 14px ${COLORS.amber};`;
    ring.appendChild(head);
    wrap.appendChild(ring);

    // --- Wordmark ----------------------------------------------------------
    const title = document.createElement('h1');
    title.className = 'az-boot__title';
    title.textContent = 'ASTRAL ZERO';
    title.style.cssText =
      'margin:0;font:900 clamp(34px,8vw,62px)/1 ${CSS_FONTS.body};' +
      `letter-spacing:.16em;color:${COLORS.text};text-shadow:0 0 26px rgba(90,216,255,.45);`;
    wrap.appendChild(title);

    const sub = document.createElement('p');
    sub.className = 'az-boot__sub';
    sub.textContent = 'ORBITAL SWEEP INITIALIZING';
    sub.style.cssText =
      'margin:0;font:700 clamp(11px,3vw,15px)/1 ${CSS_FONTS.display};' +
      `letter-spacing:.34em;color:${COLORS.accent};`;
    wrap.appendChild(sub);

    // --- Progress bar ------------------------------------------------------
    const track = document.createElement('div');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', '0');
    track.setAttribute('aria-label', 'Astral Zero loading progress');
    track.style.cssText =
      'position:relative;width:min(440px,82vw);height:10px;border-radius:999px;' +
      'background:rgba(255,255,255,.07);border:1px solid rgba(90,216,255,.3);overflow:hidden;';

    const fill = document.createElement('div');
    fill.style.cssText =
      'height:100%;width:0%;border-radius:999px;' +
      `background:linear-gradient(90deg,${COLORS.amberDeep},${COLORS.accent});transition:width .28s ease-out;`;
    track.appendChild(fill);

    // Scan line: decorative only, disabled under reduced motion.
    const scan = document.createElement('div');
    scan.className = 'az-boot__scan';
    scan.setAttribute('aria-hidden', 'true');
    scan.style.cssText =
      'position:absolute;left:0;top:0;right:0;height:30%;pointer-events:none;' +
      'background:linear-gradient(180deg,transparent,rgba(255,255,255,.22),transparent);' +
      'animation:az-scan 1.9s linear infinite;';
    track.appendChild(scan);
    wrap.appendChild(track);
    this.fill = fill;
    this.track = track;

    // --- Step label --------------------------------------------------------
    const step = document.createElement('div');
    step.className = 'az-boot__step';
    step.setAttribute('aria-live', 'polite');
    step.setAttribute('role', 'status');
    step.textContent = STEPS[0].label;
    step.style.cssText =
      'font:600 clamp(9px,2.6vw,12px)/1 ${CSS_FONTS.display};' +
      `letter-spacing:.22em;color:${COLORS.dim};min-height:1em;`;
    wrap.appendChild(step);
    this.step = step;

    // --- Rotating tip -----------------------------------------------------
    // Purely additive and inert under reduced motion: the tip is a static line
    // that changes text, so nothing animates and nothing flashes.
    const tip = document.createElement('div');
    tip.className = 'az-boot__tip';
    tip.style.cssText =
      'margin-top:4px;font:500 clamp(10px,2.8vw,13px)/1.35 ${CSS_FONTS.body};' +
      `color:${COLORS.text};opacity:.82;min-height:2.7em;max-width:min(92vw,34rem);` +
      'text-align:center;transition:opacity .3s ease-out;';
    tip.textContent = BOOT_TIPS[0];
    wrap.appendChild(tip);
    this.tip = tip;
    this._tipIndex = 0;

    // --- Failure path (hidden until it actually fails) ---------------------
    this.error = document.createElement('div');
    this.error.setAttribute('role', 'alert');
    this.error.style.cssText = 'display:none;flex-direction:column;align-items:center;gap:12px;';
    wrap.appendChild(this.error);
  }

  /**
   * Start the rotating tip. Frozen when the player prefers reduced motion.
   * Deterministic (round-robin from the first tip) so the tip a given boot
   * shows is reproducible rather than random-per-open.
   * @returns {void}
   */
  startTips() {
    if (!this.tip || this._tipTimer) return;
    if (Motion.isReduced()) {
      this.tip.textContent = BOOT_TIPS[0];
      return;
    }
    this._tipTimer = setInterval(() => this._rotateTip(), TIP_ROTATE_MS);
    this._timers.push(this._tipTimer);
  }

  /** @returns {void} */
  _rotateTip() {
    if (!this.tip || this.done) return;
    this._tipIndex = (this._tipIndex + 1) % BOOT_TIPS.length;
    // Cross-fade instead of a hard swap, so the line does not pop.
    this.tip.style.opacity = '0.35';
    const show = () => {
      this.tip.textContent = BOOT_TIPS[this._tipIndex];
      this.tip.style.opacity = '0.82';
    };
    setTimeout(show, 160);
  }

  /**
   * Advance to a named step. Called by the real boot sequence; an unknown key
   * is ignored so a typo cannot corrupt the display.
   *
   * @param {'scan'|'calibrate'|'mission'|'connect'|'ready'} key
   * @returns {void}
   */
  advance(key) {
    if (this.done) return;
    const idx = STEPS.findIndex((s) => s.key === key);
    // Monotonic: a late or duplicate event never rewinds the bar.
    if (idx < 0 || idx <= this.index) return;
    this.index = idx;

    // Progress is the cumulative weight of every step that actually completed.
    const target = STEPS.slice(0, idx + 1).reduce((sum, s) => sum + s.weight, 0);
    this.progress = target;

    if (this.fill) {
      this.fill.style.width = `${target}%`;
      this.track?.setAttribute('aria-valuenow', String(target));
    }
    if (this.step) this.step.textContent = STEPS[idx].label;

    if (key === 'ready') this.finish();
  }

  /**
   * Start the managed startup dwell. After exactly BOOT_DWELL_MS the stored
   * callback fires once. Safe to call once — a second call is a no-op so two
   * boot paths can never double-transition.
   * @param {() => void} [onDone]
   * @param {number} [ms] - Defaults to BOOT_DWELL_MS.
   * @returns {void}
   */
  startDwell(onDone = null, ms = BOOT_DWELL_MS) {
    if (this._dwellTimer || this._dwellDone) return;
    this._onDwellDone = typeof onDone === 'function' ? onDone : null;
    const delay = Number.isFinite(ms) && ms > 0 ? ms : BOOT_DWELL_MS;
    this._dwellTimer = setTimeout(() => {
      this._dwellTimer = null;
      if (this._dwellDone) return;
      this._dwellDone = true;
      const cb = this._onDwellDone;
      this._onDwellDone = null;
      cb?.();
    }, delay);
    this._timers.push(this._dwellTimer);
  }

  /** Cancel the pending dwell without firing. @returns {void} */
  cancelDwell() {
    if (this._dwellTimer) {
      clearTimeout(this._dwellTimer);
      this._timers = this._timers.filter((t) => t !== this._dwellTimer);
      this._dwellTimer = null;
    }
    this._onDwellDone = null;
  }

  /**
   * Mark the boot complete and fade out. When a startup dwell is pending the
   * bar still completes honestly, but the overlay stays until the dwell
   * elapses — the 4 s startup duration is gated by the dwell, never cut
   * short by a fast socket. Without a dwell (unit tests) removal is
   * immediate, preserving the historical `advance('ready') → done` contract.
   * @returns {void}
   */
  finish() {
    if (this.done || !this.root) return;
    this.done = true;
    if (this.fill) this.fill.style.width = '100%';
    this.track?.setAttribute('aria-valuenow', '100');
    if (this.step) this.step.textContent = 'READY';
    if (this._dwellTimer && !this._dwellDone) {
      this._finishDeferred = true;
      return;
    }
    this._remove();
  }

  /**
   * Settle the overlay at dwell completion: run the deferred removal (if any)
   * so the handoff never has to reason about bar-vs-DOM state.
   * @returns {void}
   */
  settle() {
    if (!this.root || this._removed) return;
    this.done = true;
    this._finishDeferred = false;
    this._remove();
  }

  /**
   * Show a real failure with a working retry. Only called when the socket
   * genuinely could not connect, so the player is never left watching a
   * progress bar that will never finish.
   *
   * @param {string} message
   * @param {() => void} [onRetry]
   * @returns {void}
   */
  fail(message, onRetry) {
    if (!this.root) return;
    this.cancelDwell();
    this.done = true;
    this.failed = true;
    this._finishDeferred = false;

    this.error.style.display = 'flex';
    if (this.step) this.step.textContent = 'CONNECTION FAILED';

    const msg = document.createElement('p');
    msg.textContent = message;
    msg.style.cssText =
      'margin:0;font:600 13px/1.5 ${CSS_FONTS.display};' +
      `color:${COLORS.danger};max-width:34ch;`;
    this.error.appendChild(msg);

    if (!onRetry) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'RETRY';
    btn.style.cssText =
      'appearance:none;cursor:pointer;padding:12px 26px;border-radius:14px;' +
      `border:2px solid ${COLORS.accent};background:${COLORS.cyanDeep};color:${COLORS.white};` +
      'font:800 14px/1 ${CSS_FONTS.display};letter-spacing:.12em;' +
      'box-shadow:0 0 18px rgba(90,216,255,.35);';
    btn.addEventListener('click', onRetry);
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onRetry();
      }
    });
    this.error.appendChild(btn);
    btn.focus();
  }

  /** Fade out and remove the overlay. Idempotent. @returns {void} */
  _remove() {
    if (!this.root || this._removed) return;
    this._removed = true;
    this.root.style.transition = 'opacity .32s ease-out';
    this.root.style.opacity = '0';

    const remove = () => this.root?.remove();
    let reduced = false;
    try {
      reduced = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    } catch {
      reduced = false;
    }
    if (reduced) remove();
    else this._timers.push(setTimeout(remove, 340));
  }

  /** Cancel any pending timers. @returns {void} */
  destroy() {
    this.cancelDwell();
    this._timers.forEach(clearTimeout);
    this._timers = [];
  }
}

export { STEPS as BOOT_STEPS };
export default BootScreen;
