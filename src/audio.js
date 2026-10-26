/**
 * Solar Sentinel — Retro 8-bit Audio (Web Audio API)
 * ==================================================
 * Every sound is synthesized from oscillator nodes; there are no external
 * audio assets. The AudioContext is created lazily on the first user
 * gesture (browser autoplay policy) and every call fails silently when
 * audio is unavailable, so gameplay is never blocked by sound.
 *
 * Cues:
 *   playBeep        UI target click
 *   playCleanup     square-wave 800→200 Hz "pew" (cleanup authorized)
 *   playCollision   150 Hz sawtooth + filtered noise rumble
 *   playLevelUp     C–E–G sine arpeggio
 *   playFailure     descending mission-failed sting
 */

let ctx = null;
let noiseBuffer = null;
let heartbeatTimer = 0;
let heartbeatActive = false;

/** Must be called from a user gesture (e.g. the first document click). */
export function initAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
}

function ensure() {
  if (!ctx) initAudio();
  return ctx;
}

/**
 * Low-level oscillator envelope.
 * @param {object} opts
 * @param {string} opts.type - oscillator waveform
 * @param {number} opts.from - start frequency (Hz)
 * @param {number} opts.to - end frequency (Hz)
 * @param {number} opts.dur - duration (s)
 * @param {number} opts.gain - peak gain (0–1)
 * @param {number} [opts.delay] - start offset (s)
 * @param {boolean} [opts.harsh] - add a detuned second oscillator
 */
function tone({ type, from, to, dur, gain, delay = 0, harsh = false }) {
  const c = ensure();
  if (!c) return;
  try {
    const t0 = c.currentTime + delay;
    const master = c.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t0 + 0.012);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    master.connect(c.destination);

    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur);
    osc.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);

    if (harsh) {
      const detune = c.createOscillator();
      detune.type = type;
      detune.frequency.setValueAtTime(from * 0.72, t0);
      detune.frequency.exponentialRampToValueAtTime(Math.max(to * 0.72, 1), t0 + dur);
      const g2 = c.createGain();
      g2.gain.value = 0.6;
      detune.connect(g2);
      g2.connect(master);
      detune.start(t0);
      detune.stop(t0 + dur + 0.02);
    }
  } catch {
    /* audio is non-critical */
  }
}

/** Deterministic deep-noise buffer, generated once. */
function getNoiseBuffer(c) {
  if (noiseBuffer) return noiseBuffer;
  const length = Math.floor(c.sampleRate * 0.8);
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    data[i] = (b0 + b1 + white * 1.0526913) * 0.22;
  }
  noiseBuffer = buffer;
  return buffer;
}

/** UI blip when a target dot is selected. */
export function playBeep() {
  tone({ type: 'square', from: 880, to: 1560, dur: 0.07, gain: 0.08 });
}

/** Punchy 8-bit "pew": square wave dropping 800 Hz → 200 Hz. */
export function playCleanup() {
  tone({ type: 'square', from: 800, to: 200, dur: 0.13, gain: 0.1 });
  tone({ type: 'square', from: 1600, to: 400, dur: 0.06, gain: 0.035, delay: 0.005 });
}

/** Back-compat alias. */
export function playZap() {
  playCleanup();
}

/** Harsh collision rumble: 150 Hz sawtooth + low-passed noise. */
export function playCollision() {
  const c = ensure();
  if (!c) return;
  try {
    const t0 = c.currentTime;

    const master = c.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
    master.connect(c.destination);

    const saw = c.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.setValueAtTime(150, t0);
    saw.frequency.exponentialRampToValueAtTime(42, t0 + 0.6);
    saw.connect(master);
    saw.start(t0);
    saw.stop(t0 + 0.72);

    const detune = c.createOscillator();
    detune.type = 'sawtooth';
    detune.frequency.setValueAtTime(151.7, t0);
    detune.frequency.exponentialRampToValueAtTime(39, t0 + 0.6);
    const detuneGain = c.createGain();
    detuneGain.gain.value = 0.45;
    detune.connect(detuneGain);
    detuneGain.connect(master);
    detune.start(t0);
    detune.stop(t0 + 0.72);

    const noise = c.createBufferSource();
    noise.buffer = getNoiseBuffer(c);
    noise.loop = true;

    const lowpass = c.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(420, t0);
    lowpass.frequency.exponentialRampToValueAtTime(90, t0 + 0.5);
    lowpass.Q.value = 0.7;

    const noiseGain = c.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t0);
    noiseGain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.015);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);

    noise.connect(lowpass);
    lowpass.connect(noiseGain);
    noiseGain.connect(c.destination);
    noise.start(t0);
    noise.stop(t0 + 0.6);
  } catch {
    /* audio is non-critical */
  }
}

/** Back-compat alias. */
export function playBuzz() {
  playCollision();
}

/** Three-note C–E–G sine arpeggio on level up. */
export function playLevelUp() {
  const notes = [523.25, 659.25, 783.99];
  notes.forEach((freq, i) => {
    tone({ type: 'sine', from: freq, to: freq, dur: 0.22, gain: 0.09, delay: i * 0.12 });
  });
}

/** Two low thumps every 2 s while cleanup energy is critical. */
function heartbeat() {
  tone({ type: 'sine', from: 74, to: 48, dur: 0.1, gain: 0.055 });
  tone({ type: 'sine', from: 60, to: 40, dur: 0.14, gain: 0.04, delay: 0.17 });
}

/** Toggle the low-energy heartbeat (idempotent, safe to call every frame). */
export function setLowEnergyWarning(active) {
  const next = Boolean(active);
  if (next === heartbeatActive) return;
  heartbeatActive = next;

  if (next) {
    heartbeat();
    heartbeatTimer = window.setInterval(heartbeat, 2000);
  } else {
    if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    heartbeatTimer = 0;
  }
}

/** Descending failure sting for MISSION FAILED. */
export function playFailure() {
  tone({ type: 'sawtooth', from: 220, to: 38, dur: 1.4, gain: 0.2, harsh: true });
  tone({ type: 'square', from: 110, to: 28, dur: 1.2, gain: 0.12, delay: 0.15 });
}
