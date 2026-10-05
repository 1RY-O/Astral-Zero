/**
 * Astral Zero — persisted settings (FRONTEND).
 * ============================================================
 * localStorage-backed preferences: audio volumes, screen-shake toggle, and
 * keybinds. Deliberately dependency-free and defensive — localStorage throws in
 * private-browsing modes, when a quota is exceeded, and in sandboxed iframes.
 * A settings layer that can throw on read would break the boot sequence, so
 * every access here is wrapped and falls back to defaults in memory.
 *
 * WHY localStorage AND NOT THE SERVER
 * Preferences are per-device, not per-account: two people sharing a machine
 * should each get their own shake tolerance, and nobody wants a server round
 * trip before the main menu appears. Nothing here is gameplay state, so it is
 * safe for the client to own it entirely.
 */

const STORAGE_KEY = 'astral-zero:settings:v1';

/** Defaults are the single source of truth for shape AND values. */
const DEFAULTS = Object.freeze({
  // Audio
  masterVolume: 0.8,
  sfxVolume: 1.0,
  uiVolume: 0.6,
  muted: false,

  // Feedback
  screenShake: true,
  damageNumbers: true,
  hitMarkers: true,
  showFps: false,

  // Progression (cosmetic, local-only)
  totalXp: 0,
  rankIndex: 0,
  matchesPlayed: 0,
});

/** Keybinds are stored as a name → Phaser key-code map, not a baked-in default. */
const DEFAULT_KEYBINDS = Object.freeze({
  left: 'LEFT',
  right: 'RIGHT',
  jump: 'SPACE',
  fire: 'MOUSE0',
  weaponSwitch: 'Q',
  scoreboard: 'TAB',
  scoreboardAlt: 'F',
});

export class Settings {
  /**
   * @param {object} [opts]
   * @param {Storage|null} [opts.storage] - Injectable for tests.
   * @param {Record<string, Function>} [opts.onChange] - Per-key subscribers.
   */
  constructor({ storage = globalThis.localStorage ?? null, onChange = {} } = {}) {
    // Probe once: if localStorage is unavailable we keep an in-memory mirror so
    // the rest of the game can read/write settings without null checks.
    this._store = this._probe(storage);
    this._onChange = onChange;
    this._values = { ...DEFAULTS, keybinds: { ...DEFAULT_KEYBINDS } };
    this.load();
  }

  /**
   * Verify the storage backend actually works. Safari private mode historically
   * exposed `localStorage` but threw on `setItem`, so a truthy check is not enough.
   * @param {Storage|null} storage
   * @returns {Storage|null}
   */
  _probe(storage) {
    if (!storage) return null;
    try {
      const probe = '__az_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return storage;
    } catch {
      console.warn('[Settings] localStorage unavailable — settings will not persist.');
      return null;
    }
  }

  /**
   * Read one value.
   * @param {string} key
   * @returns {*}
   */
  get(key) {
    return this._values[key];
  }

  /**
   * Write one value and persist. Unknown keys are ignored so a typo cannot
   * silently bloat the saved blob.
   *
   * @param {string} key
   * @param {*} value
   * @returns {void}
   */
  set(key, value) {
    if (!(key in DEFAULTS)) {
      console.warn(`[Settings] ignoring unknown setting "${key}".`);
      return;
    }
    if (this._values[key] === value) return;
    this._values[key] = value;
    this.save();
    this._onChange[key]?.(value, key);
  }

  /**
   * Adjust a numeric value, clamped to 0..1.
   * @param {string} key
   * @param {number} value
   * @returns {void}
   */
  setVolume(key, value) {
    const clamped = Math.max(0, Math.min(1, Number(value) || 0));
    this.set(key, clamped);
  }

  /**
   * Read a keybind.
   * @param {string} action
   * @returns {string} Phaser key code.
   */
  keybind(action) {
    return this._values.keybinds[action] ?? DEFAULT_KEYBINDS[action];
  }

  /**
   * Rebind an action.
   * @param {string} action
   * @param {string} keyCode
   * @returns {void}
   */
  setKeybind(action, keyCode) {
    this._values.keybinds[action] = keyCode;
    this.save();
  }

  /** Reset everything back to factory defaults. @returns {void} */
  reset() {
    this._values = { ...DEFAULTS, keybinds: { ...DEFAULT_KEYBINDS } };
    this.save();
  }

  /** A plain snapshot, safe to log or diff. @returns {object} */
  snapshot() {
    return JSON.parse(JSON.stringify(this._values));
  }

  /**
   * Merge stored values over the defaults.
   *
   * Merging rather than trusting the blob is what makes an old saved payload
   * from a previous build safe: a missing key falls back to its default instead
   * of being `undefined`, and a non-object blob is discarded outright.
   *
   * @returns {void}
   */
  load() {
    if (!this._store) return;
    try {
      const raw = this._store.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;

      for (const key of Object.keys(DEFAULTS)) {
        if (parsed[key] === undefined) continue;
        this._values[key] = typeof DEFAULTS[key] === typeof parsed[key] ? parsed[key] : DEFAULTS[key];
      }
      if (parsed.keybinds && typeof parsed.keybinds === 'object') {
        this._values.keybinds = { ...DEFAULT_KEYBINDS, ...parsed.keybinds };
      }
    } catch (err) {
      // A corrupt blob must never block boot — fall back to defaults silently.
      console.warn('[Settings] could not parse saved settings; using defaults.', err);
    }
  }

  /** Persist the current values. @returns {void} */
  save() {
    if (!this._store) return;
    try {
      this._store.setItem(STORAGE_KEY, JSON.stringify(this._values));
    } catch (err) {
      // Quota exceeded, or storage revoked mid-session. Settings stay in memory.
      console.warn('[Settings] could not persist settings.', err);
    }
  }
}

/** Shared singleton, so every module reads the same instance. */
export const settings = new Settings();
export { DEFAULTS as DEFAULT_SETTINGS, DEFAULT_KEYBINDS };
export default settings;
