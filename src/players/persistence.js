/**
 * Astral Zero — durable profile store (SERVER).
 * ============================================================
 * WHY THIS EXISTS
 * Every player record in Astral Zero lived in an in-process `Map`
 * (`src/players/playerStore.js`). XP, level, friend edges, first-match
 * protection and (once added) unlock state all died with the process. That is
 * survivable while the only persistent-ish thing is a lifetime XP counter; it
 * is NOT survivable for anything competitive:
 *
 *  - A ranked rating that resets on every deploy is not a rating.
 *  - Character unlocks that evaporate on restart are not unlocks.
 *  - A season leaderboard served from process memory is a leaderboard of
 *    whoever happened to be online at boot.
 *
 * So ranked, unlocks and mastery all need somewhere real to live. This module
 * is that place: a small, append-safe, human-readable JSON file store.
 *
 * WHY NOT A DEPENDENCY
 * A database (or even `lowdb`) would add an install step, a migration story and
 * a service requirement to a project whose whole premise is "clone and run".
 * The dataset is small — a few hundred bytes per player, thousands of players
 * at most — so a single JSON document is genuinely the right size of tool. The
 * cost is that writes are synchronous and whole-file; `flush()` debounces them
 * so a busy match does not thrash the disk, and `flushSync()` is available for
 * shutdown.
 *
 * THE RULES THAT MAKE THIS SAFE
 *  1. A profile is keyed by NORMALISED NAME, matching the in-memory store.
 *     No auth means the name is the identity; that is a known, documented
 *     limitation, not something this module can fix.
 *  2. Reads never touch the disk: the whole file is parsed once at startup and
 *     held in memory. Writes are debounced.
 *  3. Writes are ATOMIC: the new document is written to a sibling temp file and
 *     then `rename`d over the target, so a crash mid-write leaves the previous
 *     good file intact rather than a truncated one.
 *  4. A CORRUPT file is quarantined, not deleted, and the server starts empty.
 *     Losing a save is bad; refusing to boot is worse.
 *  5. Every read is schema-normalised through `normaliseProfile`, so a
 *     hand-edited or partially-written file cannot inject NaN/undefined into
 *     gameplay maths.
 */

import fs from 'node:fs';
import path from 'node:path';
import config from '../server-config.js';

/** Current on-disk schema. Bump when the shape changes; see `migrate`. */
export const PROFILE_SCHEMA = 1;

const emptyDoc = () => ({ schema: PROFILE_SCHEMA, profiles: {}, updatedAt: 0 });

/** Absolute path of the store; created lazily on first write. */
function storePath() {
  const dir = config.persistence?.dir || './data';
  return path.resolve(dir, 'profiles.json');
}

function tempPathFor(target) {
  return `${target}.${process.pid}.tmp`;
}

/**
 * Coerce anything into a valid profile. Untrusted on purpose: the file may be
 * hand-edited, truncated by a crash, or written by an older build.
 *
 * @param {unknown} raw
 * @param {string} key normalised identity key
 * @returns {object|null} a complete profile, or null when the key is unusable
 */
export function normaliseProfile(raw, key) {
  if (!raw || typeof raw !== 'object') return null;
  const k = typeof key === 'string' ? key : String(raw.key ?? '');
  if (!k) return null;

  const num = (v, min, max, fallback) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  const str = (v, max, fallback) =>
    (typeof v === 'string' && v.length ? v : fallback).slice(0, max);

  // NOTE: `lastSocketId` is deliberately ABSENT. It is session state (this
  // process, this connection) and must never be written to disk: a stale
  // socket id in a profile file is a correctness bug the moment anything reads
  // it, and it has no meaning after a restart.
  return {
    key: k,
    displayName: str(raw.displayName, 24, k),
    completedRealMatches: num(raw.completedRealMatches, 0, 1e9, 0),
    totalXp: num(raw.totalXp, 0, 1e12, 0),
    matchesPlayed: num(raw.matchesPlayed, 0, 1e9, 0),
    firstSeenAt: num(raw.firstSeenAt, 0, 1e15, Date.now()),
    // --- progression (S14.1+) — absent on old files, so defaults apply ---
    /** Character ids the player has earned. The starter is always implicit. */
    unlockedCharacters: Array.isArray(raw.unlockedCharacters)
      ? [...new Set(raw.unlockedCharacters.filter((c) => typeof c === 'string').slice(0, 32))]
      : [],
    /** Per-character mastery XP. */
    mastery: raw.mastery && typeof raw.mastery === 'object' && !Array.isArray(raw.mastery)
      ? Object.fromEntries(
        Object.entries(raw.mastery)
          .filter(([k2]) => typeof k2 === 'string')
          .slice(0, 32)
          .map(([k2, v]) => [k2, num(v, 0, 1e9, 0)]),
      )
      : {},
    /** Cosmetic ids owned. Cosmetic only — never affects combat. */
    unlockedCosmetics: Array.isArray(raw.unlockedCosmetics)
      ? [...new Set(raw.unlockedCosmetics.filter((c) => typeof c === 'string').slice(0, 64))]
      : [],
    /** Selected character id (validated against the roster on use). */
    activeCharacter: str(raw.activeCharacter, 32, ''),
    /** Selected loadout variant per character, e.g. `{ vera: 'scout' }`. */
    loadouts: raw.loadouts && typeof raw.loadouts === 'object' && !Array.isArray(raw.loadouts)
      ? Object.fromEntries(
        Object.entries(raw.loadouts)
          .filter(([, v]) => typeof v === 'string')
          .slice(0, 32)
          .map(([k2, v]) => [k2, v.slice(0, 32)]),
      )
      : {},
    /** Ranked state (S14.6). `rating` is the league rating, `placed` a bool. */
    ranked: (() => {
      const r = raw.ranked && typeof raw.ranked === 'object' && !Array.isArray(raw.ranked) ? raw.ranked : {};
      return {
        placed: r.placed === true,
        rating: num(r.rating, 0, 5000, 0),
        peak: num(r.peak, 0, 5000, 0),
        seasonId: str(r.seasonId, 24, ''),
        wins: num(r.wins, 0, 1e9, 0),
        losses: num(r.losses, 0, 1e9, 0),
        placements: num(r.placements, 0, 1e9, 0),
        // Placement-ladder running total; unused once `placed` is true.
        scoreSoFar: num(r.scoreSoFar, 0, 5000, 0),
      };
    })(),
    /** Match history, newest last. Bounded hard — see `MAX_HISTORY`. */
    history: Array.isArray(raw.history)
      ? raw.history
        .filter((h) => h && typeof h === 'object')
        .slice(-MAX_HISTORY)
        .map((h) => ({
          mode: str(h.mode, 24, ''),
          reason: str(h.reason, 24, ''),
          score: num(h.score, 0, 1e9, 0),
          kills: num(h.kills, 0, 1e6, 0),
          deaths: num(h.deaths, 0, 1e6, 0),
          banked: num(h.banked, 0, 1e6, 0),
          character: str(h.character, 32, ''),
          at: num(h.at, 0, 1e15, 0),
        }))
      : [],
  };
}

/** Hard cap on stored match history, enforced on read AND on write. */
export const MAX_HISTORY = 25;

/**
 * Disk-backed profile store.
 *
 * Constructed once by `initPersistence()`; every other module talks to the
 * instance, never to the file, so there is exactly one reader.
 */
export class ProfileStore {
  /**
   * @param {{ file?: string, flushMs?: number }} [opts]
   */
  constructor(opts = {}) {
    this.file = opts.file || storePath();
    this.flushMs = Number.isFinite(opts.flushMs) ? opts.flushMs : 400;
    /** @type {Map<string, object>} normalised key → profile */
    this.profiles = new Map();
    this.loaded = false;
    this.recoveredFromCorruption = false;
    this._timer = null;
    this._dirty = false;
  }

  /**
   * Parse the store from disk. Safe to call more than once; the last call wins.
   * @returns {{ ok: boolean, count: number, recovered: boolean }}
   */
  load() {
    let raw;
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`[persistence] could not read ${this.file}: ${err.message}`);
      }
      this.profiles = new Map();
      this.loaded = true;
      return { ok: true, count: 0, recovered: false };
    }

    let doc = null;
    try {
      doc = JSON.parse(raw);
    } catch (err) {
      // Rule 4: quarantine, never delete. A bad save must not stop the boot.
      const quarantine = `${this.file}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(this.file, quarantine);
        console.error(
          `[persistence] ${this.file} is not valid JSON (${err.message}); `
          + `moved to ${quarantine} and starting with an empty store`,
        );
      } catch {
        console.error(`[persistence] ${this.file} is corrupt and could not be quarantined`);
      }
      this.profiles = new Map();
      this.loaded = true;
      this.recoveredFromCorruption = true;
      return { ok: false, count: 0, recovered: true };
    }

    const profiles = (doc && typeof doc === 'object' && doc.profiles && typeof doc.profiles === 'object')
      ? doc.profiles
      : {};
    this.profiles = new Map();
    for (const [key, value] of Object.entries(profiles)) {
      const profile = normaliseProfile(value, key);
      if (profile) this.profiles.set(profile.key, profile);
    }
    this.loaded = true;
    return { ok: true, count: this.profiles.size, recovered: false };
  }

  /**
   * Read a profile (never null for a valid key — creates a blank one).
   * @param {string} key normalised identity key
   * @returns {object|null}
   */
  get(key) {
    const k = String(key || '');
    if (!k) return null;
    let p = this.profiles.get(k);
    if (!p) {
      p = normaliseProfile({ key: k, displayName: k, firstSeenAt: Date.now() }, k);
      this.profiles.set(k, p);
      this.markDirty();
    }
    return p;
  }

  /**
   * Write a profile. The object is normalised on the way in, so callers cannot
   * smuggle undefined/NaN into the store by mutating the object they got back.
   * @param {object} profile
   * @returns {object|null} the stored (normalised) profile
   */
  set(profile) {
    const p = normaliseProfile(profile, profile?.key);
    if (!p) return null;
    this.profiles.set(p.key, p);
    this.markDirty();
    return p;
  }

  /** @param {string} key */
  delete(key) {
    if (this.profiles.delete(String(key))) this.markDirty();
  }

  /** @returns {number} */
  get size() {
    return this.profiles.size;
  }

  /**
   * Top-rated players across every season (used by the leaderboard).
   * @param {{ seasonId?: string, limit?: number }} [opts]
   * @returns {Array<{key, displayName, rating, wins, losses, placed}>}
   */
  leaderboard({ seasonId = '', limit = 25 } = {}) {
    const out = [];
    for (const p of this.profiles.values()) {
      if (!p.ranked.placed) continue;
      if (seasonId && p.ranked.seasonId && p.ranked.seasonId !== seasonId) continue;
      out.push({
        key: p.key,
        displayName: p.displayName,
        rating: p.ranked.rating,
        wins: p.ranked.wins,
        losses: p.ranked.losses,
        placed: true,
      });
    }
    out.sort((a, b) => b.rating - a.rating || a.displayName.localeCompare(b.displayName));
    return out.slice(0, Math.max(1, Math.min(limit, 200)));
  }

  // --- write path ---------------------------------------------------------

  /** Schedule a debounced write. Cheap enough to call on every mutation. */
  markDirty() {
    this._dirty = true;
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      if (this._dirty) this.flushSync();
    }, this.flushMs);
    this._timer.unref?.();
  }

  /**
   * Write now, synchronously and atomically.
   * @returns {{ ok: boolean, count?: number, error?: string }}
   */
  flushSync() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._dirty = false;

    const doc = {
      schema: PROFILE_SCHEMA,
      profiles: Object.fromEntries(this.profiles.entries()),
      updatedAt: Date.now(),
    };
    const tmp = tempPathFor(this.file);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      // Atomic-ish: write a sibling then rename over the target.
      fs.writeFileSync(tmp, JSON.stringify(doc, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
      return { ok: true, count: this.profiles.size };
    } catch (err) {
      console.error(`[persistence] write failed: ${err.message}`);
      try { fs.existsSync(tmp) && fs.unlinkSync(tmp); } catch { /* best effort */ }
      return { ok: false, error: err.message };
    }
  }

  /**
   * Flush pending writes and stop timers. Call on SIGTERM/SIGINT.
   * @returns {void}
   */
  close() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._dirty) this.flushSync();
  }
}

/** The single store instance used by the server. */
let store = null;

/**
 * Create (or replace) the process-wide store.
 * @param {{ file?: string, flushMs?: number }} [opts]
 * @returns {ProfileStore}
 */
export function initPersistence(opts = {}) {
  store = new ProfileStore(opts);
  store.load();
  const info = { ok: true, count: store.size, recovered: store.recoveredFromCorruption };
  console.log(
    `[Astral Zero] persistence: ${info.count} profile(s) from ${store.file}`
    + (info.recovered ? ' (recovered from a corrupt file)' : ''),
  );
  return store;
}

/**
 * @returns {ProfileStore|null} the active store, or null before initialisation.
 */
export function persistence() {
  return store;
}

/** Flush + release. @returns {void} */
export function closePersistence() {
  store?.close();
  store = null;
}

export default ProfileStore;
