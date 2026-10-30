/**
 * HELIOS PROTOCOL: Space Weather Superhero Tycoon — Web Audio Engine
 * Procedural Cash Inc / Roblox Tycoon feedback sounds & corrupted AI alarms.
 * Built for the NASA International Space Apps Challenge 2026.
 */

let ctx = null;
let muted = false;

try {
  muted = typeof localStorage !== 'undefined' && localStorage.getItem('helios_muted') === 'true';
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
    localStorage.setItem('helios_muted', String(muted));
  } catch {
    // ignore
  }
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

// Cash Inc. / Roblox Tycoon Payout Chime (+Credits!)
export function playCashChime() {
  if (muted) return;
  initAudio();
  // Arpeggiated high crystalline chime
  tone({ type: 'triangle', from: 880, to: 880, dur: 0.08, gain: 0.18, delay: 0 });
  tone({ type: 'triangle', from: 1174.66, to: 1174.66, dur: 0.08, gain: 0.2, delay: 0.06 });
  tone({ type: 'triangle', from: 1479.98, to: 1479.98, dur: 0.12, gain: 0.22, delay: 0.12 });
  tone({ type: 'sine', from: 1760, to: 1760, dur: 0.2, gain: 0.25, delay: 0.18 });
}

// Hero Launch: tactile hyperdrive launch sound
export function playHeroLaunch() {
  if (muted) return;
  tone({ type: 'sawtooth', from: 180, to: 720, dur: 0.18, gain: 0.2 });
  tone({ type: 'sine', from: 220, to: 880, dur: 0.15, gain: 0.15, delay: 0.02 });
}

// Solar Flare Absorption: deep plasma containment pulse
export function playFlareAbsorption() {
  if (muted) return;
  tone({ type: 'sawtooth', from: 320, to: 60, dur: 0.28, gain: 0.3 });
  tone({ type: 'sine', from: 540, to: 120, dur: 0.22, gain: 0.2, delay: 0.04 });
}

// Department Upgrade Ding
export function playUpgradeDing() {
  if (muted) return;
  tone({ type: 'sine', from: 523.25, to: 659.25, dur: 0.1, gain: 0.2 });
  tone({ type: 'sine', from: 659.25, to: 1046.5, dur: 0.18, gain: 0.25, delay: 0.08 });
}

// Emergency Shield Overcharge
export function playShieldOvercharge() {
  if (muted) return;
  tone({ type: 'sawtooth', from: 100, to: 600, dur: 0.35, gain: 0.35 });
  tone({ type: 'square', from: 440, to: 880, dur: 0.25, gain: 0.2, delay: 0.1 });
}

// Corrupted AI Hostile Rage Alarm
export function playRageAlarm() {
  if (muted) return;
  tone({ type: 'sawtooth', from: 300, to: 900, dur: 0.15, gain: 0.3 });
  tone({ type: 'square', from: 800, to: 200, dur: 0.2, gain: 0.25, delay: 0.08 });
}

export function playGrab() {
  tone({ type: 'triangle', from: 600, to: 300, dur: 0.08, gain: 0.25 });
}

export function playWhip() {
  tone({ type: 'sine', from: 880, to: 160, dur: 0.22, gain: 0.3 });
}

export function playThrust() {
  tone({ type: 'sawtooth', from: 90, to: 45, dur: 0.12, gain: 0.15 });
}

export function playImpact() {
  tone({ type: 'sawtooth', from: 220, to: 40, dur: 0.28, gain: 0.35 });
}

export function playDeorbit() {
  tone({ type: 'sine', from: 523.25, to: 659.25, dur: 0.18, gain: 0.22 });
}
