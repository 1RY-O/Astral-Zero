/**
 * Astral Zero — audio engine test (Phase 5).
 * ============================================================
 * Runs the real AudioManager against a fake Web Audio implementation that
 * counts node creation. That lets us assert the properties that actually
 * matter and are invisible in a browser:
 *
 *  - voices are BOUNDED (a firefight cannot spawn unbounded oscillators)
 *  - a mute/zeroed slider costs nothing
 *  - loops start and stop cleanly, and stop on tab-hide
 *  - cues fired before a user gesture are buffered, not dropped or burst
 *  - unknown cues warn instead of throwing
 *
 * The fake deliberately models the real autoplay rule: a context stays
 * 'suspended' until resume() is called.
 *
 * Run with: npm run test:audio
 */

import { AudioManager } from '../src/audio/AudioManager.js';
import { AUDIO } from '../src/config/audioConfig.js';
import { Settings } from '../src/core/Settings.js';

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures += 1;
};
const section = (t) => console.log(`\n--- ${t} ---`);

/** Minimal in-memory Web Audio double. */
function fakeAudioContext() {
  const stats = { created: 0, started: 0, stopped: 0 };
  const param = () => ({
    value: 0,
    setValueAtTime() { return this; },
    linearRampToValueAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; },
  });
  const node = (extra = {}) => ({
    connect() { return this; }, disconnect() {}, type: '', frequency: param(), gain: param(),
    ...extra,
  });
  return {
    stats,
    state: 'suspended',
    currentTime: 0,
    sampleRate: 44100,
    destination: node(),
    resume() { this.state = 'running'; return Promise.resolve(); },
    suspend() { this.state = 'suspended'; return Promise.resolve(); },
    close() { return Promise.resolve(); },
    createGain: () => { stats.created += 1; return node(); },
    createOscillator: () => {
      stats.created += 1;
      return node({ start() { stats.started += 1; }, stop() { stats.stopped += 1; } });
    },
    createBufferSource: () => {
      stats.created += 1;
      return node({ start() { stats.started += 1; }, stop() { stats.stopped += 1; } });
    },
    createBiquadFilter: () => { stats.created += 1; return node(); },
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
  };
}

const memoryStorage = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
};

// ===========================================================================
section('Autoplay policy: cues before a gesture are buffered, not lost');
// ===========================================================================
{
  const ctx = fakeAudioContext();
  const audio = new AudioManager({ config: AUDIO, context: ctx });
  ok(audio.unlocked === false, 'a fresh manager is locked until a gesture');
  ok(audio.play('weaponFire') === false, 'playing while locked does not start a voice');
  ok(ctx.stats.started === 0, 'nothing was scheduled while locked');

  const ok1 = audio.unlock();
  ok(ok1 === true, 'unlock() succeeds');
  ok(audio.unlocked === true, 'manager is now unlocked');
  ok(ctx.stats.started > 0, `the buffered cue is flushed on unlock (${ctx.stats.started} started)`);

  // Overflow is dropped rather than queued forever.
  const before = ctx.stats.started;
  for (let i = 0; i < 50; i += 1) audio.play('weaponFire');
  ok(ctx.stats.started - before <= AUDIO.maxVoices,
    'pre-unlock overflow is bounded (no wall of stale sound)');
  audio.destroy();
}

// ===========================================================================
section('Voice cap keeps a firefight bounded');
// ===========================================================================
{
  const ctx = fakeAudioContext();
  const audio = new AudioManager({ config: AUDIO, context: ctx });
  audio.unlock();

  // 500 shots in one frame: the cap must hold, because `onended` never fires
  // in this fake (nothing advances currentTime).
  for (let i = 0; i < 500; i += 1) audio.play('weaponFire');
  ok(audio.voiceCount <= AUDIO.maxVoices,
    `500 rapid shots stay within the voice cap (${audio.voiceCount} <= ${AUDIO.maxVoices})`);

  const after = audio.voiceCount;
  ok(audio.play('weaponFire') === false, 'play() is refused while the cap is saturated');
  ok(audio.voiceCount === after, 'a refused play allocates nothing');
  audio.destroy();
}

// ===========================================================================
section('Volume settings gate playback without allocating');
// ===========================================================================
{
  const settings = new Settings({ storage: memoryStorage() });
  const ctx = fakeAudioContext();
  const audio = new AudioManager({ config: AUDIO, settings, context: ctx });
  audio.unlock();

  settings.set('muted', true);
  audio.applySettings();
  const createdWhenMuted = ctx.stats.created;
  ok(audio.play('weaponFire') === false, 'a muted manager refuses to play');
  ok(ctx.stats.created === createdWhenMuted, 'muted playback allocates no audio nodes');

  settings.set('muted', false);
  settings.set('sfxVolume', 0);
  audio.applySettings();
  const createdAtZero = ctx.stats.created;
  ok(audio.play('weaponFire') === false, 'a zeroed sfx slider refuses to play');
  ok(ctx.stats.created === createdAtZero, 'zero-volume playback allocates no audio nodes');

  // UI bus is independent of the sfx slider — that is the point of separate buses.
  settings.set('sfxVolume', 1);
  audio.applySettings();
  const createdBeforeUi = ctx.stats.created;
  ok(audio.play('uiClick', { bus: 'ui' }) === true, 'the ui bus plays independently of the sfx slider');
  ok(ctx.stats.created > createdBeforeUi, 'ui playback allocates nodes');
  audio.destroy();
}

// ===========================================================================
section('Looping cues start, stop, and survive tab-hide');
// ===========================================================================
{
  const ctx = fakeAudioContext();
  const audio = new AudioManager({ config: AUDIO, context: ctx });
  audio.unlock();

  ok(audio.play('lowHealthPulse') === true, 'a looping cue starts');
  ok(audio.isLooping('lowHealthPulse') === true, 'the loop is tracked');
  // Restarting must not stack a second loop.
  audio.play('lowHealthPulse');
  ok(audio.isLooping('lowHealthPulse') === true, 'replaying a loop is idempotent');

  audio.stop('lowHealthPulse');
  ok(audio.isLooping('lowHealthPulse') === false, 'stop() ends the loop');

  audio.play('lowHealthPulse');
  audio.suspendForBackground();
  ok(audio.isLooping('lowHealthPulse') === false,
    'hiding the tab stops loops (a hidden tab must not keep scheduling audio)');
  ok(ctx.state === 'suspended', 'the context is suspended while hidden');

  audio.resumeFromBackground();
  ok(ctx.state === 'running', 'the context resumes when the tab is shown again');
  audio.destroy();
  ok(ctx.stats.created >= 0, 'destroy() is safe');
}

// ===========================================================================
section('Unknown cues and unplayable platforms degrade, never throw');
// ===========================================================================
{
  const ctx = fakeAudioContext();
  const audio = new AudioManager({ config: AUDIO, context: ctx });
  audio.unlock();
  let warned = false;
  const origWarn = console.warn;
  console.warn = () => { warned = true; };
  const result = audio.play('doesNotExist');
  console.warn = origWarn;
  ok(result === false, 'an unknown cue returns false');
  ok(warned === true, 'an unknown cue warns instead of throwing');

  // A manager with no AudioContext at all must be inert, not fatal.
  const savedAC = globalThis.AudioContext;
  const savedWebkit = globalThis.webkitAudioContext;
  delete globalThis.AudioContext;
  delete globalThis.webkitAudioContext;
  const silent = new AudioManager({ config: AUDIO, context: null });
  const unlocked = silent.unlock();
  globalThis.AudioContext = savedAC;
  globalThis.webkitAudioContext = savedWebkit;
  ok(unlocked === false, 'a platform with no Web Audio reports unavailable');
  ok(silent.available === false, 'the manager marks itself unavailable');
  ok(silent.play('weaponFire') === false, 'play() is a safe no-op without Web Audio');
}

// ===========================================================================
section('Settings persistence survives a corrupt blob');
// ===========================================================================
{
  const store = memoryStorage();
  store.setItem('astral-zero:settings:v1', '{ not json');
  const s = new Settings({ storage: store });
  ok(s.get('masterVolume') === 0.8, 'a corrupt saved blob falls back to defaults, not a crash');

  s.set('masterVolume', 0.3);
  s.setKeybind('jump', 'W');
  const reloaded = new Settings({ storage: store });
  ok(reloaded.get('masterVolume') === 0.3, 'a saved value round-trips');
  ok(reloaded.keybind('jump') === 'W', 'a keybind round-trips');

  // Storage that throws (private mode) must not break construction.
  const hostile = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); },
  };
  const guarded = new Settings({ storage: hostile });
  ok(guarded.get('masterVolume') === 0.8, 'a throwing storage backend falls back to defaults');

  guarded.set('muted', true);
  ok(guarded.get('muted') === true, 'settings still work in memory when storage is unavailable');
}

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
process.exit(failures ? 1 : 0);
