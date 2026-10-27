/**
 * Solar Sentinel — Frontend Entry Point (Vanilla JS, no Phaser)
 * ==============================================================
 * GAME FLOW
 *   1. Landing → "START MISSION" → command center mounts, Mission
 *      Briefing typewriter plays ("CLASSIFIED"), relay connects behind it.
 *   2. "ACCEPT MISSION" → loading overlay (if telemetry is not in yet),
 *      then the live console. Cleanup energy + collision checks start.
 *   3. AUTHORIZE CLEANUP costs 15% energy, freezes the screen with a 50 ms
 *      white impact frame, traces an orbital laser onto the target, and the
 *      server call lands 500 ms later. The dot detonates into cyan/white
 *      squares and banks a cleared-debris point.
 *   4. Every 10 s the highest-risk object is checked: Risk 7+ triggers a
 *      COLLISION — solid red impact frame, deep harsh rumble, a violent
 *      400 ms screen shake with cracked-glass overlay, and 3 new high-risk
 *      cascade objects spawned from the impact site.
 *   5. 3 collisions → MISSION FAILED / ORBIT LOST (canvas frozen + grey).
 *
 * Socket contract (see src/game/loop.js + src/sockets/events.js):
 *   orbital_snapshot → { timestamp, tick, objects: [{ id, name, x, y,
 *                         riskLevel (1-10), altitude, velocity, ... }] }
 * Coordinates are pixels in the 800x600 equirectangular map space;
 * src/orbitalMap.js normalises out-of-range values defensively.
 *
 * REST contract:
 *   GET /api/stats → { trackedObjects, globalThreatLevel, uptime, ... }
 *
 * If the relay stays silent for SNAPSHOT_TIMEOUT_MS (e.g. NASA TLE fetch
 * warming up, or fully offline demo), a synthetic feed takes over so the
 * UI is always demonstrable — badged as SIM FEED, never faked as live.
 */

import './styles.css';
import { io } from 'socket.io-client';
import { OrbitalMap, riskTier, normalizePoint, MAP_W, MAP_H, ACQUIRE_MS } from './orbitalMap.js';
import { startDemoFeed } from './demoFeed.js';
import {
  initAudio,
  playBeep,
  playCleanup,
  playCollision,
  playLevelUp,
  playFailure,
  setLowEnergyWarning,
} from './audio.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEV_SERVER_URL = 'http://localhost:3000';
const STATS_POLL_MS = 15000;
const SNAPSHOT_TIMEOUT_MS = 10000;
const CLEAR_ANIM_MS = 420;
const TAU = Math.PI * 2;

const ENERGY_MAX = 100;
// Server-authoritative economy (src/game/loop.js): −15% per cleanup,
// +2% regenerated every 5 s, cleanup rejected below 15%.
const ENERGY_COST = 15;
const ENERGY_REGEN_MS = 5000;
const ENERGY_REGEN_AMOUNT = 2;

const COLLISION_CHECK_MS = 10000;
const MAX_COLLISIONS = 3;
// Parity with the backend KESSLER_RISK_THRESHOLD (src/game/loop.js) — risk 7+.
const HIGH_RISK = 7;
// Orbital laser travel time: the strike lands 500 ms after authorization.
const ORBITAL_STRIKE_MS = 500;

const RECONNECT_OPTIONS = {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,
  timeout: 8000,
};

/** Resolve the backend origin (dev: :3000, prod: same origin). */
function resolveServerUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const override = params.get('server') || params.get('backend');
    if (override) return override.replace(/\/+$/, '');
  } catch {
    /* ignore */
  }
  if (import.meta.env?.VITE_SERVER_URL) return String(import.meta.env.VITE_SERVER_URL).replace(/\/+$/, '');
  if (import.meta.env?.DEV) return DEV_SERVER_URL;
  return undefined; // production: same origin
}

function resolveApiUrl(path) {
  const base = resolveServerUrl();
  return base ? `${base}${path}` : path;
}

const wrapX = (x) => ((x % MAP_W) + MAP_W) % MAP_W;
const clampY = (y) => Math.min(MAP_H - 14, Math.max(14, y));

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------

const el = {
  landing: document.getElementById('landing'),
  startBtn: document.getElementById('start-btn'),
  command: document.getElementById('command-center'),
  howto: document.getElementById('how-to'),
  howtoStart: document.getElementById('howto-start'),
  typewriter: document.getElementById('typewriter'),
  typewriterHint: document.getElementById('typewriter-hint'),
  overlay: document.getElementById('loading-overlay'),
  loadingText: document.getElementById('loading-text'),
  loadingSub: document.getElementById('loading-sub'),
  linkPill: document.getElementById('link-pill'),
  clock: document.getElementById('feed-clock'),
  waveValue: document.getElementById('wave-value'),
  scoreValue: document.getElementById('score-value'),
  threatValue: document.getElementById('threat-value'),
  threatBar: document.getElementById('threat-bar'),
  threatMeter: document.getElementById('threat-meter'),
  threatMeterFill: document.getElementById('threat-meter-fill'),
  energyValue: document.getElementById('energy-value'),
  energyBar: document.getElementById('energy-bar'),
  collisionValue: document.getElementById('collision-value'),
  integrityLeds: document.getElementById('integrity-leds'),
  trackedValue: document.getElementById('tracked-value'),
  trackedSub: document.getElementById('tracked-sub'),
  uptimeValue: document.getElementById('uptime-value'),
  statsSource: document.getElementById('stats-source'),
  clearedValue: document.getElementById('cleared-value'),
  targetList: document.getElementById('target-list'),
  targetCount: document.getElementById('target-count'),
  mapMode: document.getElementById('map-mode'),
  canvasWrap: document.getElementById('canvas-wrap'),
  canvas: document.getElementById('orbital-map'),
  impactFlash: document.getElementById('impact-flash'),
  cleanupFlash: document.getElementById('cleanup-flash'),
  screenCracks: document.getElementById('screen-cracks'),
  gameOver: document.getElementById('game-over'),
  finalScore: document.getElementById('final-score'),
  restartBtn: document.getElementById('restart-btn'),
};

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

const map = new OrbitalMap(el.canvas);

/** @type {Map<string, HTMLElement>} track id → <li> */
const listItems = new Map();
/** Ids removed from orbit — filtered from every future snapshot so the
 *  2 Hz feed never resurrects cleared or collided debris. */
const clearedIds = new Set();
/** Locally spawned Kessler cascade debris ({ id, name, x, y, vx, vy, ... }). */
const cascadeObjects = [];
/** Cleanups waiting for the server's cleanup_success / cleanup_failed reply. */
const pendingCleanup = new Set();
const gameTimers = [];

let selectedId = null;
let socket = null;
let demoStop = null;
let snapshotTimer = 0;
let booted = false;
let threatReady = false;
let gameOver = false;
let gameLoopStarted = false;
let typingDone = false;
let typingStarted = false;

let lastServerObjects = [];
let lastObjects = [];
let lastApply = 0;

let armingId = null;
let armTimer = 0;
let uiShakeTimer = 0;
let impactTimer = 0;

let energy = ENERGY_MAX;
let clearedCount = 0;
let score = 0;
let wave = 1;
let collisions = 0;
let cascadeSeq = 0;

let uptimeSeconds = null;
let uptimeAnchor = 0;

// ---------------------------------------------------------------------------
// Boot briefing — typewriter with skip
// ---------------------------------------------------------------------------

function typeBootSequence() {
  if (typingStarted) return;
  typingStarted = true;

  const lines = [...el.typewriter.querySelectorAll('[data-line]')];
  lines.forEach((line) => {
    line.dataset.full = line.textContent;
    line.textContent = '';
  });

  const cursor = document.createElement('span');
  cursor.className = 'typing-cursor';
  cursor.setAttribute('aria-hidden', 'true');

  let lineIdx = 0;
  let charIdx = 0;
  let timer = 0;

  const typeChar = () => {
    if (lineIdx >= lines.length) {
      finishTyping();
      return;
    }
    const line = lines[lineIdx];
    const full = line.dataset.full;
    charIdx += 1;
    line.textContent = full.slice(0, charIdx);
    line.appendChild(cursor);

    if (charIdx >= full.length) {
      lineIdx += 1;
      charIdx = 0;
      timer = window.setTimeout(typeChar, 340);
    } else {
      timer = window.setTimeout(typeChar, 20);
    }
  };

  function finishTyping() {
    window.clearTimeout(timer);
    lines.forEach((line) => {
      if (line.dataset.full != null) line.textContent = line.dataset.full;
    });
    cursor.remove();
    typingDone = true;
    el.howtoStart.hidden = false;
    el.typewriterHint.hidden = true;
  }

  // Click the briefing to skip the decryption.
  el.howto.querySelector('.modal-card, .howto__card')?.addEventListener('click', () => {
    if (!typingDone) finishTyping();
  });

  typeChar();
}

// ---------------------------------------------------------------------------
// Selection + audio
// ---------------------------------------------------------------------------

function clearArming() {
  armingId = null;
  if (armTimer) {
    window.clearTimeout(armTimer);
    armTimer = 0;
  }
  updateCleanupButtons();
}

function armTarget(id) {
  armingId = String(id);
  if (armTimer) window.clearTimeout(armTimer);
  armTimer = window.setTimeout(() => {
    armTimer = 0;
    if (armingId === String(id)) {
      armingId = null;
      updateCleanupButtons();
    }
  }, ACQUIRE_MS);
  updateCleanupButtons();
}

function selectTrack(id, { scroll = false, acquire = false } = {}) {
  if (gameOver && id) return;
  selectedId = id;
  map.select(id, { acquire });
  if (!id) {
    armingId = null;
    if (armTimer) {
      window.clearTimeout(armTimer);
      armTimer = 0;
    }
  }
  for (const [itemId, li] of listItems) {
    li.classList.toggle('is-selected', itemId === id);
  }
  if (scroll && id) {
    const li = listItems.get(id);
    if (li) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

map.onPick = (id) => {
  if (gameOver) return;
  if (!id) {
    clearArming();
    selectTrack(null);
    return;
  }
  playBeep();
  selectTrack(id, { scroll: true, acquire: true });
  armTarget(id);
};

map.onLock = (id) => {
  if (armingId !== String(id)) return;
  armingId = null;
  if (armTimer) {
    window.clearTimeout(armTimer);
    armTimer = 0;
  }
  updateCleanupButtons();
};

// ---------------------------------------------------------------------------
// Wave + score HUD
// ---------------------------------------------------------------------------

function setWave(value) {
  const next = Math.max(1, Math.floor(Number(value) || wave));
  if (next === wave) return;
  wave = next;
  el.waveValue.textContent = String(wave);
  el.waveValue.classList.remove('is-flashing');
  void el.waveValue.offsetWidth;
  el.waveValue.classList.add('is-flashing');
}

function setScore(value) {
  const next = Math.max(0, Math.floor(Number(value) || 0));
  if (next === score) return;
  score = next;
  el.scoreValue.textContent = String(score);
}

// ---------------------------------------------------------------------------
// Cleanup energy
// ---------------------------------------------------------------------------

function setEnergy(value) {
  energy = Math.min(ENERGY_MAX, Math.max(0, value));
  const rounded = Math.round(energy);
  el.energyValue.textContent = `${rounded}%`;

  const low = energy < ENERGY_COST;
  el.energyBar.style.width = `${energy}%`;
  el.energyBar.classList.toggle('is-critical', low);
  el.energyValue.classList.toggle('is-critical', low);
  el.energyBar.parentElement?.setAttribute('aria-valuenow', String(rounded));

  setLowEnergyWarning(!gameOver && energy < 20);
  updateCleanupButtons();
}

function updateCleanupButtons() {
  const disabled = gameOver || energy < ENERGY_COST;
  for (const [id, li] of listItems) {
    const btn = li.querySelector('.btn-cleanup');
    if (!btn) continue;
    btn.disabled = disabled || (armingId !== null && armingId === id);
  }
}

// ---------------------------------------------------------------------------
// Cleanup authorization (Target List → canvas detonation → score)
// ---------------------------------------------------------------------------

function removeCascade(id) {
  const i = cascadeObjects.findIndex((c) => String(c.id) === id);
  if (i >= 0) cascadeObjects.splice(i, 1);
}

/**
 * Resolve a successful cleanup exactly once. Called by the server's
 * cleanup_success reply, or locally when the relay is offline / sim-only.
 */
function completeCleanup(id, result = {}) {
  const key = String(id);
  pendingCleanup.delete(key);

  if (Number.isFinite(result.energy)) setEnergy(result.energy);
  if (Number.isFinite(result.score)) setScore(result.score);

  if (clearedIds.has(key)) return false;
  clearedIds.add(key);
  removeCascade(key);

  if (!Number.isFinite(result.energy)) setEnergy(energy - ENERGY_COST);
  if (!Number.isFinite(result.score)) setScore(score + 100);

  clearedCount += 1;
  el.clearedValue.textContent = String(clearedCount);

  // Server-confirmed hit: 8-bit zap, canvas + console shake, detonation.
  playCleanup();
  map.screenShake(200, 11);
  shakeConsole();
  map.explode(key);
  if (armingId === key) clearArming();

  const li = listItems.get(key);
  if (li) {
    li.classList.add('target--clearing');
    const btn = li.querySelector('.btn-cleanup');
    if (btn) btn.disabled = true;
    window.setTimeout(() => {
      li.remove();
      listItems.delete(key);
    }, CLEAR_ANIM_MS);
  }
  if (selectedId === key) selectTrack(null);

  // Immediate threat refresh (don't wait for the next 2 Hz snapshot).
  lastObjects = lastObjects.filter((o) => !clearedIds.has(String(o.id)));
  const { label, pct } = computeThreat(lastObjects);
  renderThreat(label, pct);
  updateCleanupButtons();
  return true;
}

// ---------------------------------------------------------------------------
// Impact-frame flash + cracked glass (game juice overlays)
// ---------------------------------------------------------------------------

let cleanupFlashTimer = 0;
let cracksTimer = 0;

/**
 * Impact frame on cleanup authorization: 50 ms solid white, then a short
 * fade so the beam reads through the whole laser travel time.
 */
function triggerCleanupFlash() {
  if (!el.cleanupFlash) return;
  el.cleanupFlash.hidden = false;
  el.cleanupFlash.classList.remove('is-active');
  void el.cleanupFlash.offsetWidth;
  el.cleanupFlash.classList.add('is-active');

  if (cleanupFlashTimer) window.clearTimeout(cleanupFlashTimer);
  cleanupFlashTimer = window.setTimeout(() => {
    el.cleanupFlash?.classList.remove('is-active');
    el.cleanupFlash.hidden = true;
    cleanupFlashTimer = 0;
  }, 400);
}

/** Violent collision shake (DOM-visible) — exactly 400 ms, high intensity. */
/** Red siren border when any high-risk (7+) debris is present. */
function updateRedAlert(active) {
  document.body.classList.toggle('red-alert', Boolean(active));
}


function violentShake() {
  if (uiShakeTimer) window.clearTimeout(uiShakeTimer);

  // The task spec calls for a 400 ms shake on <body>. Transform the whole
  // document, not just a panel, so the collision reads as a physical hit.
  document.body.classList.remove('screen-shake--violent');
  void document.body.offsetWidth;
  document.body.classList.add('screen-shake--violent');

  if (el.command) {
    el.command.classList.remove('screen-shake', 'screen-shake--violent');
    void el.command.offsetWidth;
    el.command.classList.add('screen-shake--violent');
  }
  el.canvasWrap?.classList.add('is-shaking');
  uiShakeTimer = window.setTimeout(() => {
    document.body.classList.remove('screen-shake--violent');
    el.command?.classList.remove('screen-shake--violent');
    el.canvasWrap?.classList.remove('is-shaking');
    uiShakeTimer = 0;
  }, 400);
}

/**
 * Shattered-glass overlay: slams to opacity 1 at the impact instant, then
 * fades out 1.5 s later (the CSS transition drives the actual fade).
 */
function showScreenCracks() {
  if (!el.screenCracks) return;
  if (cracksTimer) window.clearTimeout(cracksTimer);

  // Hard-set inline opacity so the overlay appears even if a stylesheet is
  // still loading; the CSS transition supplies the actual glass fade.
  el.screenCracks.classList.remove('is-fading', 'is-shattered');
  el.screenCracks.style.transition = 'none';
  el.screenCracks.style.opacity = '1';
  void el.screenCracks.offsetWidth;
  el.screenCracks.style.transition = '';
  el.screenCracks.classList.add('is-shattered');

  cracksTimer = window.setTimeout(() => {
    el.screenCracks.classList.add('is-fading');
    el.screenCracks.style.opacity = '0';
    window.setTimeout(() => {
      el.screenCracks?.classList.remove('is-shattered', 'is-fading');
    }, 600);
    cracksTimer = 0;
  }, 1500);
}

/**
 * AUTHORIZE CLEANUP → ORBITAL LASER STRIKE (Genshin-style impact frame).
 *
 *   1. Freeze the screen with a 50 ms solid white flash.
 *   2. Trace a glowing cyan beam from orbit down onto the target.
 *   3. 500 ms later (laser travel time) emit player_cleanup @ server.
 *
 * The local sim fallback resolves immediately only when the relay is not
 * connected.
 */
function authorizeCleanup(id) {
  const key = String(id);
  if (gameOver || energy < ENERGY_COST || clearedIds.has(key) || pendingCleanup.has(key)) {
    return false;
  }

  // Keep the target locked so the crosshair reticle stays on screen.
  selectTrack(key);
  pendingCleanup.add(key);

  // 🚀 1. IMPACT FRAME — solid white, rips through the next ~50 ms.
  triggerCleanupFlash();

  // 🛰 2. LASER BEAM — thick glowing cyan/white column from the top of the
  //       map down to the target, shockwave on arrival.
  const track = map.tracks.get(key) ?? null;
  map.drawOrbitalLaser(
    track?.x ?? MAP_W / 2,
    track?.y ?? MAP_H / 2,
  );

  // ☄ 3. TRAVEL TIME — the strike arrives 500 ms after the trigger pull.
  window.setTimeout(() => {
    if (gameOver || clearedIds.has(key) || !pendingCleanup.has(key)) return;

    const isLocalObject = Boolean(demoStop) || key.startsWith('CASCADE-');
    if (socket?.connected && !isLocalObject) {
      socket.emit('player_cleanup', { id: key });
      // Safety net for a dead/silent relay — never leave the operator hanging.
      window.setTimeout(() => {
        if (pendingCleanup.has(key) && !clearedIds.has(key) && !gameOver) {
          completeCleanup(key);
        }
      }, 2200);
    } else {
      completeCleanup(key);
    }
  }, ORBITAL_STRIKE_MS);

  return true;
}

function handleCleanupSuccess(payload) {
  const rawId = payload?.id ?? payload?.objectId;
  if (rawId === undefined || rawId === null) return;
  const energyValue = Number(payload?.energy);
  const scoreValue = Number(payload?.score);
  completeCleanup(String(rawId), {
    energy: Number.isFinite(energyValue) ? energyValue : undefined,
    score: Number.isFinite(scoreValue) ? scoreValue : undefined,
  });
}

function handleCleanupFailed(payload) {
  const rawId = payload?.id ?? payload?.objectId;
  if (rawId !== undefined && rawId !== null) pendingCleanup.delete(String(rawId));
  updateCleanupButtons();
}

// ---------------------------------------------------------------------------
// Target list
// ---------------------------------------------------------------------------

function tierClass(tier) {
  return `target--${tier}`;
}

function riskWord(riskLevel) {
  const tier = riskTier(riskLevel);
  return tier === 'high' ? 'HIGH' : tier === 'elev' ? 'ELEV' : 'LOW';
}

function formatMeta(obj) {
  const alt = Number.isFinite(obj.altitude) ? `${Math.round(obj.altitude)} km` : 'ALT —';
  const vel = Number.isFinite(obj.velocity) ? `${obj.velocity.toFixed(1)} km/s` : 'VEL —';
  return `${alt} · ${vel} · RISK ${obj.riskLevel}/10`;
}

function renderTargetList(objects) {
  const seen = new Set();

  for (const obj of objects) {
    const id = String(obj.id ?? obj.name);
    seen.add(id);
    const tier = riskTier(obj.riskLevel);
    let li = listItems.get(id);

    if (!li) {
      li = document.createElement('li');
      li.className = `target ${tierClass(tier)} target--enter`;
      li.dataset.id = id;
      li.innerHTML =
        `<span class="target__dot" aria-hidden="true"></span>` +
        `<div class="target__body">` +
        `<span class="target__name"></span>` +
        `<span class="target__meta"></span>` +
        `</div>` +
        `<span class="target__risk"></span>` +
        `<div class="target__actions">` +
        `<button class="btn-cleanup" type="button">AUTHORIZE CLEANUP</button>` +
        `</div>`;
      li.addEventListener('animationend', () => li.classList.remove('target--enter'), { once: true });
      li.addEventListener('click', () => {
        if (gameOver) return;
        playBeep();
        clearArming();
        selectTrack(id);
      });
      li.querySelector('.btn-cleanup').addEventListener('click', (ev) => {
        ev.stopPropagation();
        authorizeCleanup(id);
      });
      listItems.set(id, li);
      el.targetList.appendChild(li);
    } else if (!li.className.includes(tierClass(tier))) {
      li.className = `target ${tierClass(tier)}${id === selectedId ? ' is-selected' : ''}`;
    }

    li.querySelector('.target__name').textContent = String(obj.name ?? id).toUpperCase();
    li.querySelector('.target__meta').textContent = formatMeta(obj);
    li.querySelector('.target__risk').textContent = riskWord(obj.riskLevel);
  }

  for (const [id, li] of listItems) {
    if (!seen.has(id) && !li.classList.contains('target--clearing')) {
      li.remove();
      listItems.delete(id);
    }
  }

  // Keep highest-risk objects at the top without rebuilding the DOM.
  const sorted = [...objects].sort((a, b) => (b.riskLevel ?? 0) - (a.riskLevel ?? 0));
  sorted.forEach((obj, i) => {
    const li = listItems.get(String(obj.id ?? obj.name));
    if (li && li.parentElement) {
      const cur = [...el.targetList.children].indexOf(li);
      if (cur !== i) el.targetList.insertBefore(li, el.targetList.children[i] || null);
    }
  });

  el.targetCount.textContent = String(objects.length);

  if (objects.length === 0) {
    if (!el.targetList.querySelector('.target-list__empty')) {
      const empty = document.createElement('li');
      empty.className = 'target-list__empty';
      empty.textContent = 'No objects tracked yet.';
      el.targetList.appendChild(empty);
    }
  } else {
    el.targetList.querySelector('.target-list__empty')?.remove();
  }

  updateCleanupButtons();
}

// ---------------------------------------------------------------------------
// Mission stats
// ---------------------------------------------------------------------------

/** Mirror of the backend's global threat heuristic (orbital-calc.js). */
function computeThreat(objects) {
  if (!objects.length) return { label: 'LOW', pct: 0 };
  let sum = 0;
  let max = 0;
  for (const o of objects) {
    const r = o.riskLevel ?? 1;
    sum += r;
    if (r > max) max = r;
  }
  const avg = sum / objects.length;
  const label = max >= 8 || avg >= 6 ? 'HIGH' : max >= 5 || avg >= 3 ? 'MEDIUM' : 'LOW';
  const pct = Math.max(4, Math.round((avg / 10) * 100));
  return { label, pct };
}

function renderThreat(label, pct) {
  const tier = label === 'HIGH' ? 'high' : label === 'MEDIUM' ? 'medium' : 'low';
  el.threatValue.textContent = label;
  el.threatValue.className = `stat-value stat-value--threat ${tier}`;
  el.threatBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  el.threatBar.className = `meter-fill meter-fill--threat ${tier}`;
}

/** Pre-snapshot state: no color, no bar fill, no fake numbers. */
function renderThreatStandby() {
  el.threatValue.textContent = 'STANDBY';
  el.threatValue.className = 'stat-value stat-value--threat standby';
  el.threatBar.style.width = '0%';
  el.threatBar.className = 'meter-fill meter-fill--threat';
}

/**
 * Frontend tactical assessment.
 *
 * The backend risk heuristic only scores altitude/velocity (its proximity
 * term is always Infinity), so it never reaches Risk 8+. To keep the
 * Kessler mechanic alive on real telemetry, we enrich the displayed risk
 * with local geometry: very low perigee and close approaches to the ISS.
 */
function enhanceThreats(objects) {
  const iss = objects.find((o) => /ISS|ZARYA/i.test(o.name ?? ''));
  for (const o of objects) {
    let risk = Number(o.riskLevel) || 1;
    if (Number.isFinite(o.altitude) && o.altitude > 0 && o.altitude < 250) {
      risk = Math.max(risk, 8);
    }
    if (iss && o !== iss && Number.isFinite(o.x) && Number.isFinite(o.y)) {
      const d = Math.hypot(o.x - iss.x, o.y - iss.y);
      if (d < 16) risk = Math.max(risk, 9);
      else if (d < 34) risk = Math.max(risk, 8);
      else if (d < 60) risk = Math.max(risk, 6);
    }
    o.riskLevel = risk;
  }
  return objects;
}

function formatUptime(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function setUptime(seconds) {
  uptimeSeconds = seconds;
  uptimeAnchor = Date.now();
  if (seconds != null) el.uptimeValue.textContent = formatUptime(seconds);
}

/** Poll /api/stats for uptime; threat/tracked come from the live feed. */
async function pollStats() {
  try {
    const res = await fetch(resolveApiUrl('/api/stats'), { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      const up = data.uptime ?? data.systemUptime ?? data.uptimeSeconds;
      if (typeof up === 'number') setUptime(up);
      el.statsSource.textContent = 'Source: /api/stats · live feed';
      return;
    }
  } catch {
    /* endpoint absent — keep snapshot-derived values */
  }
  if (threatReady) el.statsSource.textContent = 'Source: orbital_snapshot (live)';
}

// ---------------------------------------------------------------------------
// Loading overlay / link status
// ---------------------------------------------------------------------------

function setOverlay(text, sub) {
  el.loadingText.childNodes[0].textContent = text;
  el.loadingSub.textContent = sub;
}

function hideOverlay() {
  el.overlay.classList.add('overlay--out');
  setTimeout(() => {
    el.overlay.hidden = true;
  }, 550);
}

function setLink(state) {
  const mapStates = {
    connecting: ['pill--pending', 'LINK · CONNECTING'],
    online: ['pill--online', 'LINK · ONLINE'],
    sim: ['pill--sim', 'LINK · SIM FEED'],
    offline: ['pill--offline', 'LINK · OFFLINE'],
  };
  const [cls, text] = mapStates[state] ?? mapStates.connecting;
  el.linkPill.className = `pill ${cls}`;
  el.linkPill.textContent = text;
  el.mapMode.textContent =
    state === 'sim' ? 'SIM · 800×600 · EQUIRECTANGULAR' : '800×600 · EQUIRECTANGULAR';
}

// ---------------------------------------------------------------------------
// Kessler cascade — collisions, spawns, game over
// ---------------------------------------------------------------------------

function spawnCascade(baseX, baseY) {
  const angle = Math.random() * TAU;
  const radius = 14 + Math.random() * 24;
  cascadeSeq += 1;
  cascadeObjects.push({
    id: `CASCADE-${cascadeSeq}`,
    name: `CASCADE DEBRIS ${String(cascadeSeq).padStart(2, '0')}`,
    x: wrapX(baseX + Math.cos(angle) * radius),
    y: clampY(baseY + Math.sin(angle) * radius),
    vx: (Math.random() * 2 - 1) * 16,
    vy: (Math.random() * 2 - 1) * 16,
    riskLevel: 9,
    altitude: 140 + Math.random() * 160,
    velocity: 11 + Math.random() * 3,
  });
}

function shakeConsole() {
  if (!el.command) return;
  el.command.classList.remove('screen-shake');
  void el.command.offsetWidth;
  el.command.classList.add('screen-shake');
  if (uiShakeTimer) window.clearTimeout(uiShakeTimer);
  uiShakeTimer = window.setTimeout(() => {
    el.command.classList.remove('screen-shake');
    uiShakeTimer = 0;
  }, 200);
}

/** Solid red at 0.8 for exactly 50 ms, then fade out. */
function flashImpact() {
  if (!el.impactFlash) return;
  el.impactFlash.hidden = false;
  el.impactFlash.classList.remove('is-active');
  void el.impactFlash.offsetWidth;
  el.impactFlash.classList.add('is-active');

  if (impactTimer) window.clearTimeout(impactTimer);
  impactTimer = window.setTimeout(() => {
    el.impactFlash.classList.remove('is-active');
    el.impactFlash.hidden = true;
    impactTimer = 0;
  }, 240);
}

function updateIntegrityUI() {
  el.collisionValue.textContent = `${collisions}/${MAX_COLLISIONS}`;

  const pct = Math.min(100, (collisions / MAX_COLLISIONS) * 100);
  if (el.threatMeterFill) {
    el.threatMeterFill.style.width = `${pct}%`;
    el.threatMeterFill.className =
      'meter-fill meter-fill--collision' +
      (collisions >= MAX_COLLISIONS ? ' is-critical' : collisions >= 1 ? ' is-warning' : '');
  }
  el.threatMeter?.setAttribute('aria-valuenow', String(collisions));

  const leds = el.integrityLeds.querySelectorAll('.led');
  leds.forEach((led, i) => {
    led.className = i < MAX_COLLISIONS - collisions ? 'led led--alive' : 'led led--dead';
  });
  el.collisionValue.classList.toggle('is-critical', collisions >= MAX_COLLISIONS - 1);
}

/** The threat meter only ever ratchets upward (server + local sim agree). */
function setCollisionCount(value) {
  const next = Math.max(0, Math.min(MAX_COLLISIONS, Math.floor(Number(value) || 0)));
  if (next > collisions) collisions = next;
  updateIntegrityUI();
  return collisions;
}

function destroyObject(id) {
  clearedIds.add(id);
  removeCascade(id);
}

function triggerCollision(obj) {
  const id = String(obj.id ?? obj.name);
  const track = map.tracks.get(id);
  const pt = normalizePoint(obj);
  const x = track?.x ?? pt?.x ?? MAP_W / 2;
  const y = track?.y ?? pt?.y ?? MAP_H / 2;

  setCollisionCount(collisions + 1);

  // Juice: red impact frame, deep harsh rumble, violent 400 ms shake,
  // cracked-glass overlay, red burst at the impact site.
  flashImpact();
  violentShake();
  showScreenCracks();
  playCollision();
  map.screenShake(400, 22);
  map.collisionBurst(x, y);

  destroyObject(id);
  for (let i = 0; i < 3; i++) spawnCascade(x, y);

  // Reflect the new cascade immediately, then check the fail state.
  applyObjects();

  if (collisions >= MAX_COLLISIONS) endGame();
}

function endGame() {
  if (gameOver) return;
  gameOver = true;

  for (const t of gameTimers) clearInterval(t);
  gameTimers.length = 0;
  if (demoStop) {
    demoStop();
    demoStop = null;
  }

  map.stop();
  el.canvasWrap.classList.add('is-dead');
  setLowEnergyWarning(false);
  clearArming();
  updateCleanupButtons();
  selectTrack(null);

  el.finalScore.textContent = String(score);
  el.gameOver.hidden = false;
  playFailure();

  el.finalScore.scrollIntoView?.({ block: 'nearest' });
}

function checkCollisions() {
  if (gameOver) return;
  let highest = null;
  for (const o of lastObjects) {
    if (!highest || (o.riskLevel ?? 1) > (highest.riskLevel ?? 1)) highest = o;
  }
  if (!highest || (highest.riskLevel ?? 1) < HIGH_RISK) return;
  triggerCollision(highest);
}

/** Server collision events drive the same threat meter as the local sim. */
function handleCollisionAlert(alert) {
  if (gameOver) return;
  const count = Number(alert?.collisionCount);
  if (!Number.isFinite(count) || count <= collisions) return;

  setCollisionCount(count);

  // Juice: solid red impact frame, deep harsh rumble, violent 400 ms body
  // shake, and shattered-glass overlay — these fire for every server alert,
  // even if the payload omits impact coordinates.
  flashImpact();
  violentShake();
  showScreenCracks();
  playCollision();

  const x = Number(alert?.x);
  const y = Number(alert?.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    map.screenShake(400, 22);
    map.collisionBurst(x, y);
  }

  if (collisions >= MAX_COLLISIONS) endGame();
}

function handleGameOver(payload) {
  const finalScore = Number(payload?.finalScore);
  if (Number.isFinite(finalScore)) setScore(finalScore);

  const count = Number(payload?.collisionCount);
  if (Number.isFinite(count)) setCollisionCount(count);

  if (gameOver) {
    el.finalScore.textContent = String(score);
    return;
  }
  endGame();
}

// ---------------------------------------------------------------------------
// Snapshot pipeline (shared by live socket + demo feed)
// ---------------------------------------------------------------------------

function applyObjects() {
  const now = performance.now();
  const dt = Math.min((now - lastApply) / 1000 || 0.5, 2);
  lastApply = now;

  // Drift local cascade debris and bounce it off the map edges.
  for (const c of cascadeObjects) {
    c.x = wrapX(c.x + c.vx * dt);
    c.y += c.vy * dt;
    if (c.y < 14 || c.y > MAP_H - 14) {
      c.vy *= -1;
      c.y = clampY(c.y);
    }
  }

  const merged = enhanceThreats(
    [...lastServerObjects, ...cascadeObjects]
      .filter((o) => !clearedIds.has(String(o.id)))
      .map((o) => ({ ...o })),
  );
  lastObjects = merged;

  map.setObjects(merged);
  renderTargetList(merged);

  if (selectedId && !map.tracks.has(selectedId)) selectTrack(null);

  // First fully processed snapshot → dismiss loading + retire STANDBY.
  if (!booted) {
    booted = true;
    hideOverlay();
  }

  const threat = computeThreat(merged);
  renderThreat(threat.label, threat.pct);
  threatReady = true;

  el.trackedValue.textContent = String(merged.length);
  const highCount = merged.filter((o) => (o.riskLevel ?? 1) >= HIGH_RISK).length;
  el.trackedSub.textContent = highCount
    ? `${merged.length} objects · 2 Hz · ${highCount} HIGH RISK`
    : `${merged.length} objects · 2 Hz telemetry`;
}

function onSnapshot(snapshot) {
  if (gameOver) return;

  // Server-authoritative HUD values (wave / score / threat meter).
  const serverScore = Number(snapshot?.globalScore ?? snapshot?.score);
  if (Number.isFinite(serverScore)) setScore(serverScore);

  const serverWave = Number(snapshot?.level ?? snapshot?.wave);
  if (Number.isFinite(serverWave) && serverWave >= 1) setWave(serverWave);

  const serverCollisions = Number(snapshot?.collisionCount);
  if (Number.isFinite(serverCollisions)) {
    setCollisionCount(serverCollisions);
    if (collisions >= MAX_COLLISIONS) {
      endGame();
      return;
    }
  }

  const serverEnergy = Number(snapshot?.globalEnergy);
  if (Number.isFinite(serverEnergy)) setEnergy(serverEnergy);

  const raw = Array.isArray(snapshot?.objects) ? snapshot.objects : [];
  lastServerObjects = raw;

  // Real data wins: retire the sim feed if it was running.
  if (snapshot.sim !== true && demoStop) {
    demoStop();
    demoStop = null;
    if (el.linkPill.className.includes('sim')) setLink('online');
  }

  applyObjects();

  const highRiskCount = raw.filter((o) => (o.riskLevel ?? 0) >= 7).length;
  updateRedAlert(highRiskCount > 0);
}

function ensureBootedFallback() {
  // The relay is up but the NASA TLE fetch may still be warming: give it a
  // moment, then keep the console alive with a clearly-labeled sim feed.
  snapshotTimer = window.setTimeout(() => {
    if (booted) return;
    setOverlay('Live feed delayed', 'ENGAGING OFFLINE SIMULATION');
    setLink('sim');
    demoStop = startDemoFeed(onSnapshot);
    el.trackedSub.textContent = 'Simulated feed — awaiting live NASA data';
    el.statsSource.textContent = 'Source: offline simulation';
  }, SNAPSHOT_TIMEOUT_MS);
}

// ---------------------------------------------------------------------------
// Boot / connection
// ---------------------------------------------------------------------------

function connect() {
  setLink('connecting');
  setOverlay('Connecting to NASA Data Streams', 'OPENING SOCKET.IO RELAY');

  socket = io(resolveServerUrl(), RECONNECT_OPTIONS);


  socket.on('connect', () => {
    setLink('online');
    if (!booted) setOverlay('Receiving telemetry', `RELAY ${socket.id?.slice(0, 8).toUpperCase() ?? 'ONLINE'}`);
  });

  socket.on('orbital_snapshot', (snapshot) => {
    if (snapshotTimer) {
      clearTimeout(snapshotTimer);
      snapshotTimer = 0;
    }
    if (el.linkPill.className.includes('sim') && snapshot.sim !== true) setLink('online');
    onSnapshot(snapshot);
  });

  socket.on('level_up', (payload) => {
    const raw =
      payload !== null && typeof payload === 'object'
        ? payload.level ?? payload.wave ?? payload.levelUp
        : payload;
    const next = Number(raw);
    setWave(Number.isFinite(next) ? next : wave + 1);
    playLevelUp();
  });

  socket.on('cleanup_success', handleCleanupSuccess);
  socket.on('cleanup_failed', handleCleanupFailed);
  socket.on('collision_alert', handleCollisionAlert);
  socket.on('game_over', handleGameOver);

  socket.on('disconnect', () => {
    if (!demoStop) setLink('offline');
  });

  socket.on('connect_error', () => {
    if (!booted && !demoStop) setLink('offline');
  });

  ensureBootedFallback();
}

function tickClock() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  el.clock.textContent = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} UTC`;

  if (uptimeSeconds != null) {
    el.uptimeValue.textContent = formatUptime(uptimeSeconds + (Date.now() - uptimeAnchor) / 1000);
  }
}

/** Step 1 — leave the landing page, show the briefing, warm up the relay. */
function startMission() {
  initAudio();

  el.landing.classList.add('landing--out');
  el.command.hidden = false;
  el.howto.hidden = false;

  setTimeout(() => {
    el.landing.hidden = true;
  }, 600);

  renderThreatStandby();
  setEnergy(ENERGY_MAX);
  updateIntegrityUI();
  typeBootSequence();

  map.start();
  connect();
  pollStats();
  setInterval(pollStats, STATS_POLL_MS);
  tickClock();
  setInterval(tickClock, 1000);
}

/** Step 2 — briefing accepted: start the game loop and drop in. */
function initiateCommand() {
  initAudio();
  el.howto.hidden = true;

  // Data may already be in (streamed behind the modal). If not, show the
  // loading overlay until the first orbital snapshot lands.
  if (!booted) el.overlay.hidden = false;

  if (!gameLoopStarted) {
    gameLoopStarted = true;
    gameTimers.push(
      setInterval(() => {
        // Live relay? The backend regenerates +2%/5 s and snapshot-syncs it.
        if (!gameOver && !socket?.connected) setEnergy(energy + ENERGY_REGEN_AMOUNT);
      }, ENERGY_REGEN_MS),
    );
    gameTimers.push(
      setInterval(() => {
        // Local Kessler check is an offline-sim fallback only — when the
        // relay is connected the server's collision_alert is authoritative
        // and double-counting here would drain the threat meter twice.
        if (!gameOver && !socket?.connected) checkCollisions();
      }, COLLISION_CHECK_MS),
    );
  }
}

// First user click anywhere unlocks the Web Audio context (autoplay policy).
window.addEventListener('pointerdown', initAudio, { once: true, capture: true });

el.startBtn.addEventListener('click', startMission);
el.howtoStart.addEventListener('click', initiateCommand);
el.restartBtn.addEventListener('click', () => window.location.reload());

// Debug seam (no secrets exposed).
window.__solarSentinel = {
  map,
  selectTrack,
  onSnapshot,
  authorizeCleanup,
  handleCleanupSuccess,
  handleCleanupFailed,
  handleCollisionAlert,
  handleGameOver,
  setWave,
  setScore,
  triggerCollision,
  clearedIds,
  cascadeObjects,
  getState: () => ({
    energy,
    collisions,
    clearedCount,
    score,
    wave,
    gameOver,
    objects: lastObjects.length,
  }),
};

/** Boot the full command center: telemetry feed, socket relay, HUD, canvas. */
function initApp() {
  // Wiring is attached above; mission starts on user gesture (startMission).
}

initApp();
