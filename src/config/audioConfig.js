/**
 * Astral Zero — audio configuration (FRONTEND).
 * ============================================================
 * Timing, gains and synthesis parameters for every sound effect.
 *
 * WHY SOUNDS ARE SYNTHESIZED, NOT SAMPLED
 * `public/assets/audio/` is empty and the repo deliberately ships no binary art
 * or audio. Rather than stub out the whole audio layer pending real samples,
 * each SFX is generated with the Web Audio API (an oscillator + envelope). That
 * keeps the repo binary-free, makes every sound tunable as a number rather than
 * an asset swap, and means the audio layer works today instead of waiting on an
 * art pass.
 *
 * Swapping in real samples later means replacing ONE method (`_playBuffer`) and
 * changing the registry to point at audio keys — the trigger call sites, the
 * volume buses and the pooling logic all stay exactly as they are.
 *
 * DELIBERATE MIXING CHOICES
 *  - Gunfire is the loudest thing in the mix; it is the primary feedback channel.
 *  - The low-health pulse ducks the master bus so the alarm is felt as well as
 *    heard, and it is the only looping sound (hence the only one that needs an
 *    explicit stop path).
 *  - Hitmarkers are short and high-pitched so they cut through gunfire without
 *    being confused for it.
 */

export const AUDIO = Object.freeze({
  /**
   * Voice budget. Web Audio nodes are cheap but not free; a hard cap means a
   * pathological firefight (many simultaneous impacts) can never spawn an
   * unbounded number of oscillators.
   */
  maxVoices: 24,

  /** Master gain applied before the per-bus gains. */
  masterGain: 0.9,

  /**
   * Per-bus gains, multiplied into the master. `sfx` is combat, `ui` is menus
   * and HUD blips — separate buses are what let the settings sliders work
   * independently instead of everything moving together.
   */
  busGains: Object.freeze({ sfx: 1.0, ui: 0.7 }),

  /**
   * How long a synthesised voice may live. A runaway oscillator that never
   * releases would pin a CPU core; this is the backstop.
   */
  voiceTimeoutMs: 1200,

  /** SFX definitions. `type` is the synth recipe; see AudioManager._synth. */
  cues: Object.freeze({
    weaponFire: Object.freeze({
      type: 'noiseBurst', gain: 0.5, durationMs: 90,
      // Low-passed noise reads as "punch"; a pure tone reads as a beep.
      filterHz: 1400, sweepToHz: 320,
    }),
    hitMarker: Object.freeze({
      type: 'blip', gain: 0.34, durationMs: 55,
      startHz: 1500, endHz: 1900, wave: 'square',
    }),
    hitMarkerPredicted: Object.freeze({
      // Lower + softer than a confirmed hit, so "maybe" and "yes" are
      // distinguishable by ear alone with your eyes off the screen.
      type: 'blip', gain: 0.16, durationMs: 40,
      startHz: 900, endHz: 1050, wave: 'triangle',
    }),
    killConfirm: Object.freeze({
      // A rising two-note figure — unmistakably a reward, not a hit.
      type: 'arp', gain: 0.42, durationMs: 260,
      notes: [660, 990], wave: 'square', noteMs: 90,
    }),
    death: Object.freeze({
      // Falling sweep. Long enough to register as "you died", short enough not
      // to sit under the respawn countdown.
      type: 'sweep', gain: 0.45, durationMs: 620,
      startHz: 420, endHz: 60, wave: 'sawtooth',
    }),
    countdownBeep: Object.freeze({
      type: 'blip', gain: 0.4, durationMs: 120,
      startHz: 880, endHz: 880, wave: 'square',
    }),
    countdownGo: Object.freeze({
      type: 'arp', gain: 0.5, durationMs: 340,
      notes: [660, 880, 1320], wave: 'square', noteMs: 100,
    }),
    lowHealthPulse: Object.freeze({
      // Looping alarm. `loop: true` is the reason this is the only cue with a
      // required stop() — leaving it running after death is an obvious bug.
      type: 'blip', gain: 0.3, durationMs: 260,
      startHz: 300, endHz: 220, wave: 'sine', loop: true,
    }),
    uiClick: Object.freeze({
      type: 'blip', gain: 0.22, durationMs: 40,
      startHz: 1200, endHz: 1400, wave: 'triangle',
    }),
    uiHover: Object.freeze({
      type: 'blip', gain: 0.1, durationMs: 28,
      startHz: 800, endHz: 800, wave: 'sine',
    }),
    medal: Object.freeze({
      // Bright major arpeggio; the "something good happened" chord.
      type: 'arp', gain: 0.46, durationMs: 520,
      notes: [784, 988, 1175, 1568], wave: 'triangle', noteMs: 110,
    }),
    respawn: Object.freeze({
      type: 'sweep', gain: 0.34, durationMs: 340,
      startHz: 300, endHz: 900, wave: 'sine',
    }),
  }),
});

export default AUDIO;
