/**
 * Astral Zero — AudioManager (FRONTEND).
 * ============================================================
 * One place that owns every sound in the game. Gameplay code asks for a named
 * cue (`audio.play('hitMarker')`) and never touches Web Audio directly.
 *
 * THE THREE PROBLEMS THIS SOLVES
 *
 * 1. THE AUTOPLAY POLICY.
 *    Browsers refuse to start an AudioContext until a real user gesture. Naively
 *    constructing one on page load leaves it permanently `suspended`, and the
 *    game is then silently mute for the whole session with no way to fix it. We
 *    create the context lazily, keep it suspended until a gesture unlocks it,
 *    and queue at most a few cues fired before that — dropping the rest rather
 *    than playing a burst of stale sound two seconds late.
 *
 * 2. VOICE CHURN.
 *    Every gunshot is a new oscillator + gain node. Firing at 3 shots per pull
 *    with 8 players alive would create hundreds of nodes a second, and node
 *    creation is exactly the kind of short-lived garbage that shows up as a GC
 *    stutter mid-fight. We cap concurrent voices and hard-stop any that outlive
 *    `voiceTimeoutMs`, so the count is bounded no matter what.
 *
 * 3. THE TAB-BLUR HAZARD.
 *    A looping low-health alarm left running while the tab is hidden keeps
 *    scheduling audio on a throttled timer. `onVisibilityChange` suspends the
 *    context and kills loops when hidden, and resumes when visible.
 *
 * NO PHASER DEPENDENCY. This uses the raw Web Audio API on purpose: Phaser's
 * sound system assumes a decoded sample per key, and we have no samples. Keeping
 * it standalone also makes it unit-testable in plain Node.
 */

export class AudioManager {
  /**
   * @param {object} opts
   * @param {import('../config/audioConfig.js').AUDIO} opts.config
   * @param {import('../core/Settings.js').Settings} [opts.settings]
   * @param {AudioContext} [opts.context] - Injectable for tests.
   */
  constructor({ config, settings = null, context = null } = {}) {
    this.config = config;
    this.settings = settings;

    /** @type {AudioContext|null} */
    this.ctx = context;
    /** @type {GainNode|null} */
    this.master = null;
    /** @type {Record<string, GainNode>} */
    this.buses = {};
    /** Active one-shot voices, so the concurrency cap is trustworthy. */
    this._voices = new Set();
    /** Currently playing looping cues, keyed by cue name. */
    this._loops = new Map();
    /** Cues fired before the context was unlocked. */
    this._pending = [];
    /** Shared white-noise buffer, built once. */
    this._noise = null;

    /** True once a user gesture has unlocked playback. */
    this.unlocked = false;
    /** False when the platform has no Web Audio (or creation failed). */
    this.available = true;

    this._unlockHandler = null;
    this._visibilityHandler = null;

    if (context) this._buildGraph();
    this._attachLifecycleHooks();
  }

  /**
   * Wire the master gain and per-bus gains. Safe to call again.
   * @returns {void}
   */
  _buildGraph() {
    if (!this.ctx) return;
    this.master = this.ctx.createGain();
    this.master.gain.value = this._masterVolume();
    this.master.connect(this.ctx.destination);

    for (const [name, gain] of Object.entries(this.config.busGains)) {
      const node = this.ctx.createGain();
      node.gain.value = gain;
      node.connect(this.master);
      this.buses[name] = node;
    }
  }

  /**
   * Effective master volume, folding in the mute setting.
   * @returns {number}
   */
  _masterVolume() {
    if (!this.settings) return this.config.masterGain;
    const muted = this.settings.get('muted') ? 0 : 1;
    return this.config.masterGain * (this.settings.get('masterVolume') ?? 1) * muted;
  }

  /**
   * Listen for the first user gesture to unlock audio, and for tab visibility
   * so backgrounded tabs do not keep scheduling sound.
   * @returns {void}
   */
  _attachLifecycleHooks() {
    if (typeof window !== 'undefined' && !this._unlockHandler) {
      this._unlockHandler = () => this.unlock();
      for (const evt of ['pointerdown', 'keydown', 'touchstart']) {
        window.addEventListener(evt, this._unlockHandler, { once: true });
      }
    }
    if (typeof document !== 'undefined' && !this._visibilityHandler) {
      this._visibilityHandler = () => {
        if (document.hidden) this.suspendForBackground();
        else this.resumeFromBackground();
      };
      document.addEventListener('visibilitychange', this._visibilityHandler);
    }
  }

  /**
   * Create the context if needed and resume it. Safe to call repeatedly.
   *
   * @returns {boolean} Whether audio is now usable.
   */
  unlock() {
    if (!this.unlocked) {
      // An injected context is already a usable transport, so the platform
      // constructor check must NOT gate it. Gating on the global ctor here made
      // an injected context (tests, or a context created elsewhere) permanently
      // locked: `available` went false and every play() was refused forever.
      if (!this.ctx) {
        const Ctor =
          typeof globalThis.AudioContext !== 'undefined'
            ? globalThis.AudioContext
            : globalThis.webkitAudioContext;
        if (!Ctor) {
          this.available = false;
          return false;
        }
        try {
          this.ctx = new Ctor();
        } catch (err) {
          console.warn('[Audio] could not create an AudioContext; running silent.', err);
          this.available = false;
          return false;
        }
        this._buildGraph();
      }
      this.unlocked = true;
      this._flushPending();
    }
    // `resume()` rejects if the gesture was not considered valid; swallow it
    // because the next gesture will try again.
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
    return true;
  }

  /**
   * Play any cues requested before unlock, then drop the rest.
   * Bounded so a burst of pre-unlock input cannot produce a wall of stale sound.
   * @returns {void}
   */
  _flushPending() {
    if (!this._pending.length) return;
    for (const name of this._pending.splice(0, 4)) this._synthCue(name, {}, {});
  }

  /**
   * Play a one-shot cue.
   *
   * @param {string} name - Key in `AUDIO.cues`.
   * @param {object} [opts]
   * @param {number} [opts.gain] - Per-call multiplier (e.g. distance falloff).
   * @param {number} [opts.rate] - Pitch multiplier.
   * @param {string} [opts.bus] - 'sfx' | 'ui'.
   * @returns {boolean} True if a voice was actually started.
   */
  play(name, { gain = 1, rate = 1, bus = 'sfx' } = {}) {
    const cue = this.config.cues[name];
    if (!cue) {
      console.warn(`[Audio] unknown cue "${name}"`);
      return false;
    }
    if (cue.loop) return this._startLoop(name, cue, gain, rate, bus);

    if (!this.unlocked) {
      // Buffer a few, so the click that unlocks audio can also make a sound.
      if (this._pending.length < 4) this._pending.push(name);
      return false;
    }
    if (!this.ctx || this.ctx.state === 'closed') return false;
    if (this._voices.size >= this.config.maxVoices) return false;
    // Check the EFFECTIVE level, i.e. master x bus. Checking only the bus would
    // mean a muted game (or master volume at 0) still built every oscillator
    // and gain node for a sound that is then discarded at the master — pure
    // garbage-collector pressure for something nobody can hear.
    if (this._effectiveLevel(bus) * gain <= 0.001) return false;

    this._synthCue(name, { gain, rate }, { bus });
    return true;
  }

  /**
   * Combined master x bus volume.
   *
   * Includes the mute flag, so `muted` short-circuits before any node is built.
   * @param {string} bus
   * @returns {number}
   */
  _effectiveLevel(bus) {
    if (this.settings?.get('muted')) return 0;
    const master = this.settings ? (this.settings.get('masterVolume') ?? 1) : 1;
    return master * this._busVolume(bus);
  }

  /**
   * Resolve a bus's effective volume from settings.
   * @param {string} bus
   * @returns {number}
   */
  _busVolume(bus) {
    const base = this.buses[bus] ? this.buses[bus].gain.value : 1;
    if (!this.settings) return base;
    const slider = bus === 'ui' ? this.settings.get('uiVolume') : this.settings.get('sfxVolume');
    return base * (slider ?? 1);
  }

  /**
   * Build and schedule the nodes for one cue.
   *
   * Every voice adds itself to `_voices` and removes itself on `onended`, so
   * that set is an accurate count of what is currently sounding — which is what
   * makes the concurrency cap meaningful rather than decorative.
   *
   * @param {string} name
   * @param {{gain?:number, rate?:number}} opts
   * @param {{bus?:string}} busOpts
   * @returns {void}
   */
  _synthCue(name, { gain = 1, rate = 1 }, { bus = 'sfx' } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const cue = this.config.cues[name];
    const dest = this.buses[bus] ?? this.master;
    const now = ctx.currentTime;
    const dur = cue.durationMs / 1000;
    const level = this._effectiveLevel(bus) * gain;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    // Fast attack then exponential decay. A linear ramp to zero audibly clicks.
    env.gain.linearRampToValueAtTime(level, now + Math.min(0.008, dur * 0.2));
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    env.connect(dest);

    let source;
    const cleanup = [env];

    if (cue.type === 'noiseBurst') {
      source = ctx.createBufferSource();
      source.buffer = this._noiseBuffer();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(cue.filterHz * rate, now);
      filter.frequency.exponentialRampToValueAtTime(cue.sweepToHz, now + dur);
      source.connect(filter);
      filter.connect(env);
      cleanup.push(filter);
    } else {
      source = ctx.createOscillator();
      source.type = cue.wave ?? 'sine';
      if (cue.type === 'arp') {
        // Arpeggio: each note gets its own attack/decay on one shared osc.
        const noteSec = (cue.noteMs ?? 90) / 1000;
        cue.notes.forEach((hz, i) => {
          const t0 = now + i * noteSec;
          source.frequency.setValueAtTime(hz * rate, t0);
          env.gain.setValueAtTime(0, t0);
          env.gain.linearRampToValueAtTime(level, t0 + 0.008);
          env.gain.exponentialRampToValueAtTime(0.0001, t0 + noteSec);
        });
      } else {
        const from = cue.startHz * rate;
        const to = (cue.endHz ?? cue.startHz) * rate;
        source.frequency.setValueAtTime(from, now);
        if (to !== from) source.frequency.exponentialRampToValueAtTime(to, now + dur);
      }
      source.connect(env);
    }

    this._voices.add(source);
    source.onended = () => {
      this._voices.delete(source);
      for (const node of [source, ...cleanup]) {
        try { node.disconnect(); } catch { /* already torn down */ }
      }
    };
    source.start(now);
    source.stop(now + dur + 0.02);

    // Backstop: a voice that never fires `onended` must still be released, or
    // the cap would eventually refuse every sound.
    this._scheduleTimeout(source, cue);
  }

  /**
   * Force-release a voice that outlives its budget.
   * @param {AudioScheduledSourceNode} source
   * @param {object} cue
   * @returns {void}
   */
  _scheduleTimeout(source, cue) {
    if (typeof setTimeout !== 'function') return;
    setTimeout(() => {
      if (!this._voices.has(source)) return;
      try { source.stop(); } catch { /* already stopped */ }
      this._voices.delete(source);
    }, cue.durationMs + this.config.voiceTimeoutMs);
  }

  /**
   * Lazily create the shared white-noise buffer.
   *
   * Cached deliberately: regenerating 0.5s of noise per shot would be exactly
   * the allocation churn this class exists to prevent.
   *
   * @returns {AudioBuffer}
   */
  _noiseBuffer() {
    if (this._noise) return this._noise;
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * 0.5));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    this._noise = buf;
    return buf;
  }

  /**
   * Start (or restart) a looping cue.
   *
   * Loops re-arm on a timer rather than using a single infinite oscillator, so
   * the `suspended` tab case and the voice cap behave the same for loops as for
   * one-shots, and `stop()` is immediate rather than dependent on an
   * `onended` that may never arrive.
   *
   * @param {string} name
   * @param {object} cue
   * @param {number} gain
   * @param {number} rate
   * @param {string} bus
   * @returns {boolean}
   */
  _startLoop(name, cue, gain, rate, bus) {
    if (!this.unlocked) {
      if (this._pending.length < 4) this._pending.push(name);
      return false;
    }
    // Restart rather than layer: two overlapping alarms would double the
    // perceived volume and beat against each other.
    this.stop(name);
    this._scheduleLoopCycle(name, cue, bus, gain, rate);

    const handle = setInterval(() => {
      if (!this._loops.has(name)) { clearInterval(handle); return; }
      this._scheduleLoopCycle(name, cue, bus, gain, rate);
    }, Math.max(60, cue.durationMs));
    this._loops.set(name, { handle, cue, bus, gain, rate });
    return true;
  }

  /**
   * Schedule exactly one cycle of a running loop.
   * @param {string} name
   * @param {object} cue
   * @param {string} bus
   * @param {number} gain
   * @param {number} rate
   * @returns {void}
   */
  _scheduleLoopCycle(name, cue, bus, gain, rate) {
    if (!this.ctx || this.ctx.state === 'closed') return;
    const ctx = this.ctx;
    const dest = this.buses[bus] ?? this.master;
    const now = ctx.currentTime;
    const dur = cue.durationMs / 1000;
    const level = this._effectiveLevel(bus) * gain;
    if (level <= 0.001) return;

    const osc = ctx.createOscillator();
    osc.type = cue.wave ?? 'sine';
    osc.frequency.setValueAtTime(cue.startHz * rate, now);
    if (cue.endHz && cue.endHz !== cue.startHz) {
      osc.frequency.linearRampToValueAtTime(cue.endHz * rate, now + dur);
    }

    const env = ctx.createGain();
    // Ramp in and out within each cycle so the loop has no click at the seam.
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(level, now + dur * 0.3);
    env.gain.linearRampToValueAtTime(0, now + dur * 0.95);

    osc.connect(env);
    env.connect(dest);
    osc.start(now);
    osc.stop(now + dur);
    osc.onended = () => {
      try { env.disconnect(); osc.disconnect(); } catch { /* torn down */ }
    };
  }

  /**
   * Stop a looping cue.
   * @param {string} name
   * @returns {void}
   */
  stop(name) {
    const loop = this._loops.get(name);
    if (!loop) return;
    clearInterval(loop.handle);
    this._loops.delete(name);
  }

  /** Stop every loop. Used on death, match end and teardown. @returns {void} */
  stopAll() {
    for (const name of [...this._loops.keys()]) this.stop(name);
  }

  /**
   * Is a loop currently playing?
   * @param {string} name
   * @returns {boolean}
   */
  isLooping(name) {
    return this._loops.has(name);
  }

  /** How many one-shot voices are currently sounding. @returns {number} */
  get voiceCount() {
    return this._voices.size;
  }

  /**
   * Re-read volumes from settings. Call after a slider changes.
   * @returns {void}
   */
  applySettings() {
    if (this.master) this.master.gain.value = this._masterVolume();
  }

  /**
   * Tab hidden: stop loops and suspend the context. A backgrounded tab must not
   * keep scheduling audio on a throttled timer.
   * @returns {void}
   */
  suspendForBackground() {
    this.stopAll();
    if (this.ctx?.state === 'running') this.ctx.suspend().catch(() => {});
  }

  /**
   * Tab visible again: resume if we had been unlocked before.
   * @returns {void}
   */
  resumeFromBackground() {
    if (this.unlocked && this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  /** Release everything. Call on scene shutdown. @returns {void} */
  destroy() {
    this.stopAll();
    this._voices.clear();
    this._pending = [];
    this._noise = null;
    if (typeof window !== 'undefined' && this._unlockHandler) {
      for (const evt of ['pointerdown', 'keydown', 'touchstart']) {
        window.removeEventListener(evt, this._unlockHandler);
      }
      this._unlockHandler = null;
    }
    if (typeof document !== 'undefined' && this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
    this.ctx?.close?.().catch?.(() => {});
    this.ctx = null;
    this.unlocked = false;
  }
}

export default AudioManager;
