/**
 * Debris Derby — Procedural Web Audio API sound effects.
 *
 * All sounds are synthesized with Web Audio oscillators and noise nodes.
 * No external sound files, zero bandwidth, zero loading delays.
 * Respects local mute preferences.
 */

let ctx = null;
let muted = false;

try {
  muted = typeof localStorage !== 'undefined' && localStorage.getItem('debris_muted') === 'true';
} catch {
  muted = false;
}

export function initAudio() {
  if (typeof window === 'undefined') return;
  try {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        ctx = new AudioCtx();
      }
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  } catch {
    ctx = null;
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(val) {
  muted = !!val;
  try {
    localStorage.setItem('debris_muted', String(muted));
  } catch {
    // ignore
  }
}

export function toggleMute() {
  setMuted(!muted);
  return muted;
}

function tone({ type = 'sine', from = 440, to = 220, dur = 0.15, gain = 0.2, delay = 0 }) {
  if (muted) return;
  initAudio();
  if (!ctx) return;

  try {
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);

    g.gain.setValueAtTime(0.001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(g);
    g.connect(ctx.destination);

    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch {
    // fail silently
  }
}

/** Grab sound: crisp high clack */
export function playGrab() {
  tone({ type: 'triangle', from: 600, to: 300, dur: 0.08, gain: 0.25 });
}

/** Release / whip sound: fast pitch sweep down with swoosh */
export function playWhip() {
  tone({ type: 'sine', from: 880, to: 160, dur: 0.22, gain: 0.3 });
}

/** Thrust pulse */
export function playThrust() {
  tone({ type: 'sawtooth', from: 90, to: 45, dur: 0.12, gain: 0.15 });
}

/** Destructible impact / fragmentation explosion */
export function playImpact() {
  tone({ type: 'sawtooth', from: 220, to: 40, dur: 0.28, gain: 0.35 });
  tone({ type: 'square', from: 140, to: 30, dur: 0.2, gain: 0.25, delay: 0.02 });
}

/** Clean deorbit confirmation: bright two-tone harmonic chime */
export function playDeorbit() {
  tone({ type: 'sine', from: 523.25, to: 659.25, dur: 0.25, gain: 0.3 }); // C5 -> E5
  tone({ type: 'triangle', from: 783.99, to: 1046.5, dur: 0.35, gain: 0.25, delay: 0.06 }); // G5 -> C6
}

/** Cascade chain multiplier chime */
export function playCascade(chain = 1) {
  const baseFreq = 440 * Math.pow(1.12, Math.min(chain, 8));
  tone({ type: 'triangle', from: baseFreq, to: baseFreq * 1.5, dur: 0.3, gain: 0.35 });
}
