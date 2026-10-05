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

const STEPS = Object.freeze([
  { key: 'scan', label: 'SCANNING DEBRIS FIELD', weight: 25 },
  { key: 'calibrate', label: 'CALIBRATING SUIT', weight: 25 },
  { key: 'mission', label: 'LOADING MISSION DATA', weight: 20 },
  { key: 'connect', label: 'CONNECTING TO ORBIT', weight: 25 },
  { key: 'ready', label: 'READY', weight: 5 },
]);

/** Packed CSS colours. Phaser is unavailable here, so no theme import. */
const COLORS = Object.freeze({
  text: '#f2f8ff',
  dim: '#a9bcd8',
  accent: '#5ad8ff',
  amber: '#ffc247',
  danger: '#ff6b8b',
});

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
      'background:radial-gradient(120% 90% at 50% 15%, #0e1730 0%, #070b18 55%, #04060f 100%);';
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
      'border-top-color:#5ad8ff;animation:az-spin 2.6s linear infinite;';
    // A counter-rotating inner ring gives the "orbital" read.
    const ring2 = document.createElement('div');
    ring2.style.cssText =
      'position:absolute;inset:18px;border:2px solid rgba(255,194,71,.4);border-radius:50%;' +
      'border-bottom-color:#ffc247;animation:az-spin 1.8s linear infinite reverse;';
    ring.appendChild(ring2);
    // Sweep head, echoing the in-game logo's amber cap.
    const head = document.createElement('div');
    head.style.cssText =
      'position:absolute;top:-6px;left:50%;width:14px;height:14px;margin-left:-7px;' +
      'border-radius:50%;background:#ffc247;box-shadow:0 0 14px #ffc247;';
    ring.appendChild(head);
    wrap.appendChild(ring);

    // --- Wordmark ----------------------------------------------------------
    const title = document.createElement('h1');
    title.className = 'az-boot__title';
    title.textContent = 'ASTRAL ZERO';
    title.style.cssText =
      'margin:0;font:900 clamp(34px,8vw,62px)/1 "Trebuchet MS","Segoe UI",system-ui,sans-serif;' +
      `letter-spacing:.16em;color:${COLORS.text};text-shadow:0 0 26px rgba(90,216,255,.45);`;
    wrap.appendChild(title);

    const sub = document.createElement('p');
    sub.className = 'az-boot__sub';
    sub.textContent = 'ORBITAL SWEEP INITIALIZING';
    sub.style.cssText =
      'margin:0;font:700 clamp(11px,3vw,15px)/1 "Trebuchet MS","Segoe UI",sans-serif;' +
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
      'background:linear-gradient(90deg,#1e88b0,#5ad8ff);transition:width .28s ease-out;';
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
      'font:600 clamp(9px,2.6vw,12px)/1 "Trebuchet MS","Segoe UI",sans-serif;' +
      `letter-spacing:.22em;color:${COLORS.dim};min-height:1em;`;
    wrap.appendChild(step);
    this.step = step;

    // --- Failure path (hidden until it actually fails) ---------------------
    this.error = document.createElement('div');
    this.error.setAttribute('role', 'alert');
    this.error.style.cssText = 'display:none;flex-direction:column;align-items:center;gap:12px;';
    wrap.appendChild(this.error);
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
   * Mark the boot complete and fade out. The lobby is already interactive at
   * this point, so the removal is purely cosmetic.
   * @returns {void}
   */
  finish() {
    if (this.done || !this.root) return;
    this.done = true;
    if (this.fill) this.fill.style.width = '100%';
    this.track?.setAttribute('aria-valuenow', '100');
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
    this.done = true;

    this.error.style.display = 'flex';
    if (this.step) this.step.textContent = 'CONNECTION FAILED';

    const msg = document.createElement('p');
    msg.textContent = message;
    msg.style.cssText =
      'margin:0;font:600 13px/1.5 "Trebuchet MS","Segoe UI",sans-serif;' +
      `color:${COLORS.danger};max-width:34ch;`;
    this.error.appendChild(msg);

    if (!onRetry) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'RETRY';
    btn.style.cssText =
      'appearance:none;cursor:pointer;padding:12px 26px;border-radius:14px;' +
      `border:2px solid ${COLORS.accent};background:#0f6f9e;color:#fff;` +
      'font:800 14px/1 "Trebuchet MS","Segoe UI",sans-serif;letter-spacing:.12em;' +
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

  /** Cancel any pending timers. @returns {void} */
  destroy() {
    this._timers.forEach(clearTimeout);
    this._timers = [];
  }
}

export { STEPS as BOOT_STEPS };
export default BootScreen;
