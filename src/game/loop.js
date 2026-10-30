/**
 * Solar Sentinel — Orbital Debris Monitoring + Game Loop
 * ===========================================================
 * ONE global interval (2 Hz → 500 ms) that updates the (x, y) positions of
 * tracked orbital objects from live TLE data and broadcasts the authoritative
 * game snapshot.
 *
 * Game mechanics:
 * - Opening wave: 5 simulated debris.
 * - Waves: when fewer than 2 simulated debris remain, a new wave spawns with
 *   currentWave * 3 objects and level_up is broadcast with the new wave.
 * - Energy: starts at 100, cleanup costs 15, +2 regenerates every 5 s.
 * - Cleanup: +100 score, removes the object, emits via sockets/index.js.
 * - Kessler cascade: every 10 s the highest-risk object is checked. Risk >= 7
 *   collides, spawns 3 simulated debris at the exact impact point, and emits
 *   collision_alert. Three collisions end the run with game_over.
 *
 * orbital_snapshot carries globalEnergy, globalScore, currentWave and
 * collisionCount alongside the active debris array.
 */

import '../server-config.js';
import { fetchOrbitalData } from './nasa-api.js';
import { processOrbitalData } from './orbital-calc.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAP_WIDTH = 800;
const MAP_HEIGHT = 600;

const ORBITAL_UPDATE_INTERVAL = 500; // 2 Hz
const DATA_FETCH_INTERVAL = 30000; // NASA TLE refresh every 30 s

const MAX_ENERGY = 100;
const CLEANUP_ENERGY_COST = 15;
const ENERGY_REGEN_INTERVAL = 5000;
const ENERGY_REGEN_AMOUNT = 2;
const ENERGY_LOW_THRESHOLD = 15;

const CLEANUP_SCORE_REWARD = 100;

const KESSLER_CHECK_INTERVAL = 4000;
// Tuned for hackathon difficulty: risk 7+ now collides (was 8+).
const KESSLER_RISK_THRESHOLD = 7;
const KESSLER_DEBRIS_COUNT = 3;
const GAME_OVER_COLLISION_COUNT = 3;

const STARTING_DEBRIS_COUNT = 5;
const WAVE_SPAWN_THRESHOLD = 2; // spawn a new wave below 2 active debris

const SIMULATED_DEBRIS_NAMES = [
  'Cosmos Frag',
  'Fengyun Debris',
  'SL-16 Fragment',
  'Iridium Debris',
  'Rocket Body',
  'Solar Panel Shard',
  'Antenna Fragment',
  'Adapter Ring',
];

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let ioRef = null;
let EV = null;

let timer = null;
let energyRegenTimer = null;
let kesslerTimer = null;

let cachedOrbitalData = null;
let lastProcessedObjects = [];
let lastDataFetch = 0;
let isFetching = false;

let globalEnergy = MAX_ENERGY;
let globalScore = 0;
let currentWave = 1;
let collisionCount = 0;
let cleanupActions = 0;
let gameActive = true;

/** Proximity timers: Map<debrisId, { startTime, durationMs, deadlineMs }> */
const proximityTimers = new Map();
const PROXIMITY_DURATION_MS = 5000; // 5-second countdown

/** Simulated gameplay debris (waves + cascade fragments). */
let simulatedDebris = [];

/** Removed ids never resurrect after a TLE refresh or wave spawn. */
const removedDebrisIds = new Set();

// ---------------------------------------------------------------------------
// Boot / timers
// ---------------------------------------------------------------------------

export function ensureLoop(io, events) {
  ioRef = io;
  EV = events;

  if (!timer) {
    timer = setInterval(orbitalTick, ORBITAL_UPDATE_INTERVAL);
    timer.unref?.();
  }
  startGameTimers();

  if (simulatedDebris.length === 0) {
    spawnSimulatedDebris(STARTING_DEBRIS_COUNT);
  }
  return timer;
}

export function tickOnce(now = Date.now()) {
  return orbitalTick(now);
}

function startGameTimers() {
  if (!energyRegenTimer) {
    energyRegenTimer = setInterval(regenEnergy, ENERGY_REGEN_INTERVAL);
    energyRegenTimer.unref?.();
  }
  if (!kesslerTimer) {
    kesslerTimer = setInterval(() => checkKesslerCascade(Date.now()), KESSLER_CHECK_INTERVAL);
    kesslerTimer.unref?.();
  }
}

function stopGameTimers() {
  if (energyRegenTimer) {
    clearInterval(energyRegenTimer);
    energyRegenTimer = null;
  }
  if (kesslerTimer) {
    clearInterval(kesslerTimer);
    kesslerTimer = null;
  }
}

function regenEnergy() {
  if (!gameActive) return;
  if (globalEnergy < MAX_ENERGY) {
    globalEnergy = Math.min(globalEnergy + ENERGY_REGEN_AMOUNT, MAX_ENERGY);
    console.log(`[Solar Sentinel] ⚡ Energy regenerated → ${globalEnergy}/${MAX_ENERGY}`);
  }
}

// ---------------------------------------------------------------------------
// Debris bookkeeping
// ---------------------------------------------------------------------------

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Generate simulated gameplay debris.
 * @param {number} count
 * @param {{x?:number,y?:number,wave?:number}} [opts] fixed impact coordinates
 * @returns {Array<object>} spawned objects
 */
export function spawnSimulatedDebris(count, opts = {}) {
  const total = Math.max(0, Math.floor(Number(count) || 0));
  const fixedX = Number.isFinite(opts.x) ? clamp(opts.x, 0, MAP_WIDTH) : null;
  const fixedY = Number.isFinite(opts.y) ? clamp(opts.y, 0, MAP_HEIGHT) : null;
  const wave = Number.isFinite(opts.wave) ? opts.wave : currentWave;
  const reservedIds = new Set(simulatedDebris.map((d) => String(d.id)));
  const born = [];

  for (let i = 0; i < total; i++) {
    let id = '';
    do {
      id = `SIM-${Math.floor(Math.random() * 900000) + 100000}`;
    } while (removedDebrisIds.has(id) || reservedIds.has(id));
    reservedIds.add(id);

    born.push({
      id,
      name: SIMULATED_DEBRIS_NAMES[Math.floor(Math.random() * SIMULATED_DEBRIS_NAMES.length)],
      x: fixedX ?? Math.floor(Math.random() * MAP_WIDTH),
      y: fixedY ?? Math.floor(Math.random() * MAP_HEIGHT),
      riskLevel: 6 + Math.floor(Math.random() * 5), // 6–10
      altitude: 250 + Math.random() * 500,
      velocity: 5 + Math.random() * 15,
      isSimulated: true,
      wave,
    });
  }

  simulatedDebris.push(...born);

  const isImpact =
    born.length > 0 && born.every((d) => d.x === fixedX && d.y === fixedY);
  if (isImpact) {
    console.log(
      `[Solar Sentinel] ☄️ ${born.length} cascade fragments spawned at ` +
        `(${fixedX.toFixed(1)}, ${fixedY.toFixed(1)})`
    );
  } else {
    console.log(`[Solar Sentinel] 🌊 Wave ${wave} — spawned ${born.length} simulated debris`);
  }
  return born;
}

function activeSimulatedDebris() {
  return simulatedDebris.filter((d) => !removedDebrisIds.has(String(d.id)));
}

function getActiveObjects() {
  const active = [];
  for (const obj of lastProcessedObjects) {
    if (!removedDebrisIds.has(String(obj.id))) active.push(obj);
  }
  for (const obj of activeSimulatedDebris()) active.push(obj);
  return active;
}

function isObjectActive(id) {
  const idStr = String(id);
  return getActiveObjects().some((obj) => String(obj.id) === idStr);
}

function removeDebrisObject(id) {
  const idStr = String(id);

  const numericId = Number(idStr);
  if (Number.isFinite(numericId)) removeTrackedObject(numericId);

  removedDebrisIds.add(idStr);
  simulatedDebris = simulatedDebris.filter((d) => String(d.id) !== idStr);

  // Clear the proximity timer when debris is cleaned up (race against clock won)
  proximityTimers.delete(idStr);
}

/**
 * Advance to the next wave when fewer than two simulated debris remain.
 * New wave size is the new wave number × 3.
 */
function maybeAdvanceWave() {
  if (!gameActive) return false;
  if (activeSimulatedDebris().length >= WAVE_SPAWN_THRESHOLD) return false;

  currentWave += 1;
  const count = currentWave * 3;
  spawnSimulatedDebris(count);

  if (ioRef && EV) {
    ioRef.emit(EV.LEVEL_UP, {
      level: currentWave,
      wave: currentWave,
      currentWave,
      count,
      energy: globalEnergy,
      score: globalScore,
    });
  }

  console.log(
    `[Solar Sentinel] ⬆️ LEVEL UP → wave ${currentWave} ` +
      `(${count} simulated debris, energy=${globalEnergy})`
  );
  return true;
}

// ---------------------------------------------------------------------------
// Cleanup + scoring
// ---------------------------------------------------------------------------

/**
 * Handle a client AUTHORIZE CLEANUP request.
 * @param {number|string} id
 * @returns {Object} result consumed by sockets/index.js
 */
export function handlePlayerCleanup(id) {
  if (!gameActive) {
    return { success: false, reason: 'Game over — cleanup disabled' };
  }
  if (id === undefined || id === null) {
    return { success: false, reason: 'Missing object id' };
  }

  const idStr = String(id);
  if (!isObjectActive(idStr)) {
    return { success: false, reason: 'Object not in active debris list' };
  }

  if (globalEnergy < ENERGY_LOW_THRESHOLD) {
    return {
      success: false,
      reason: 'INSUFFICIENT ENERGY',
      energy: globalEnergy,
      cost: CLEANUP_ENERGY_COST,
    };
  }

  globalEnergy = Math.max(0, globalEnergy - CLEANUP_ENERGY_COST);
  globalScore += CLEANUP_SCORE_REWARD;
  cleanupActions += 1;
  removeDebrisObject(idStr);

  console.log(
    `[Solar Sentinel] ✅ Cleanup authorized: object ${idStr} removed, ` +
      `-${CLEANUP_ENERGY_COST}% energy, +${CLEANUP_SCORE_REWARD} score ` +
      `(energy=${globalEnergy}, score=${globalScore}, wave=${currentWave})`
  );

  maybeAdvanceWave();

  return {
    success: true,
    id: idStr,
    energy: globalEnergy,
    score: globalScore,
    cost: CLEANUP_ENERGY_COST,
    level: currentWave,
    wave: currentWave,
    currentWave,
  };
}

// ---------------------------------------------------------------------------
// Kessler cascade
// ---------------------------------------------------------------------------

function findHighestRisk(activeObjects) {
  let highest = null;
  for (const obj of activeObjects) {
    if (!highest || (obj.riskLevel ?? 0) > (highest.riskLevel ?? 0)) {
      highest = obj;
    }
  }
  return highest;
}

function checkKesslerCascade(now = Date.now()) {
  if (!gameActive) return;
  const activeObjects = getActiveObjects();
  if (activeObjects.length === 0) return;

  const highRisk = activeObjects.filter((o) => (o.riskLevel ?? 0) >= KESSLER_RISK_THRESHOLD);
  if (highRisk.length === 0) {
    // No high-risk objects — clear any lingering timers
    proximityTimers.clear();
    return;
  }

  // Start or update proximity timers for each high-risk object
  for (const obj of highRisk) {
    const idStr = String(obj.id);
    if (!proximityTimers.has(idStr)) {
      proximityTimers.set(idStr, {
        startTime: now,
        durationMs: PROXIMITY_DURATION_MS,
        deadlineMs: now + PROXIMITY_DURATION_MS,
      });
    }
  }

  // Check if any timer has expired
  const expired = [];
  for (const [idStr, timer] of proximityTimers) {
    if (now >= timer.deadlineMs) {
      expired.push(idStr);
    }
  }

  if (expired.length > 0) {
    // Collide with the highest-risk expired object
    const expiredObjs = expired.map((id) => {
      const o = activeObjects.find((obj) => String(obj.id) === id);
      return o;
    }).filter(Boolean);

    if (expiredObjs.length > 0) {
      const highest = expiredObjs.reduce((a, b) =>
        (b.riskLevel ?? 0) > (a.riskLevel ?? 0) ? b : a,
      );
      if (highest) {
        // Clear all proximity timers since a collision is happening
        proximityTimers.clear();
        triggerCollisionEvent(highest, now);
      }
    }
    return;
  }

  // Emit proximity timer data for the frontend to show countdowns
  const timerData = {};
  for (const [idStr, timer] of proximityTimers) {
    const remaining = Math.max(0, timer.deadlineMs - now);
    timerData[idStr] = { remainingMs: remaining, riskLevel: highRisk.find((o) => String(o.id) === idStr)?.riskLevel ?? 0 };
  }

  // Broadcast proximity timers via socket for frontend countdown UI
  if (ioRef && EV && gameActive) {
    ioRef.emit(EV.PROXIMITY_TIMER, { timers: timerData, timestamp: now });
  }
}



// ============================================================
//MAXIMUM JUICE — collision effects
//============================================================

/** GLITCH effect: shift UI left/right and turn background red */
/** Show high-res cracked glass image overlay */
/** Spawn debris with physics-style velocity */
function spawnPhysicsDebris(x, y, objects) {
  // 3 new debris objects flying out from impact site
  const angles = [0, Math.PI / 2, Math.PI];
  const speeds = [3, 4, 5];
  for (let i = 0; i < 3; i++) {
    const angle = angles[i];
    const speed = speeds[i];
    const id = "SIM-" + Math.floor(Math.random() * 900000) + 100000;
    objects.push({
      id,
      name: "Debris-",
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      riskLevel: 6 + Math.floor(Math.random() * 5),
      isSimulated: true,
      life: 1,
    });
  }
}
function triggerCollisionEvent(collided, now = Date.now) {
  if (!gameActive) return;

  // Strict contract: EVERY collision increments exactly once, unconditionally,
  // and the new count is carried on both collision_alert and the next snapshot.
  collisionCount += 1;
  removeDebrisObject(collided.id);

  const x = Number.isFinite(collided.x) ? collided.x : MAP_WIDTH / 2;
  const y = Number.isFinite(collided.y) ? collided.y : MAP_HEIGHT / 2;

  ioRef?.emit(EV.COLLISION_ALERT, {
    type: 'COLLISION_EVENT',
    objectId: String(collided.id),
    objectName: collided.name,
    x,
    y,
    riskLevel: collided.riskLevel,
    collisionCount,
    currentWave,
    timestamp: now,
  });

  // Three fragments spawn at the exact impact coordinates.
  const spawned = spawnSimulatedDebris(KESSLER_DEBRIS_COUNT, { x, y, wave: currentWave });

  // Maximum Juice: apply all visual effects
  spawnPhysicsDebris(x, y, simulatedDebris);

  console.log(
    `[Solar Sentinel] 💥 CASCADE COLLISION: ${collided.name ?? collided.id} ` +
      `(risk ${collided.riskLevel}) → ${spawned.length} fragments at ` +
      `(${x.toFixed(1)}, ${y.toFixed(1)}) — collision ${collisionCount}/` +
      `${GAME_OVER_COLLISION_COUNT}`
  );

  if (collisionCount >= GAME_OVER_COLLISION_COUNT) {
    triggerGameOver(now, 'CASCADE_UNSTOPPABLE');
    return;
  }

  emitSnapshot(now);
}

function triggerGameOver(now = Date.now(), reason = 'CASCADE_UNSTOPPABLE') {
  if (!gameActive) return;
  gameActive = false;
  stopGameTimers();

  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  ioRef?.emit(EV.GAME_OVER, {
    reason,
    finalScore: globalScore,
    globalEnergy,
    collisionCount,
    currentWave,
    wave: currentWave,
    level: currentWave,
    timestamp: now,
    finalStats: {
      wave: currentWave,
      totalCleanups: cleanupActions,
      totalScore: globalScore,
      finalEnergy: globalEnergy,
      totalObjectsSpawned: simulatedDebris.length,
    },
  });

  console.log(
    `[Solar Sentinel] 🏁 GAME OVER (${reason}): score ${globalScore}, ` +
      `collisions=${collisionCount}, energy=${globalEnergy}, wave=${currentWave}`
  );
}

// ---------------------------------------------------------------------------
// Snapshot + orbital tick
// ---------------------------------------------------------------------------

function kickOffDataFetch(now) {
  if (isFetching || now - lastDataFetch <= DATA_FETCH_INTERVAL) return;
  isFetching = true;

  fetchOrbitalData()
    .then((freshData) => {
      if (Array.isArray(freshData) && freshData.length > 0) {
        cachedOrbitalData = freshData;
      }
    })
    .catch((error) => {
      console.error('[Solar Sentinel] Orbital data fetch failed:', error.message);
    })
    .finally(() => {
      isFetching = false;
      lastDataFetch = now;
    });
}

async function emitSnapshot(now = Date.now()) {
  if (!ioRef || !EV || !gameActive) return;

  try {
    // The simulated wave must never wait on (or be blocked by) NASA I/O.
    kickOffDataFetch(now);

    if (cachedOrbitalData && cachedOrbitalData.length > 0) {
      lastProcessedObjects = (await processOrbitalData(cachedOrbitalData, 0)) || [];
    }

    const activeObjects = getActiveObjects();


    ioRef.emit(EV.ORBITAL_SNAPSHOT, {
      timestamp: now,
      tick: Math.floor(now / ORBITAL_UPDATE_INTERVAL),
      objects: activeObjects,
      // currentWave is the canonical name; level/wave stay for the frontend.
      currentWave,
      level: currentWave,
      wave: currentWave,
      globalEnergy,
      globalScore,
      collisionCount,
      gameActive,
      cleanupCost: CLEANUP_ENERGY_COST,
      energyThreshold: ENERGY_LOW_THRESHOLD,
    });
  } catch (error) {
    console.error('[Solar Sentinel] Snapshot emission failed:', error.message);
  }
}

async function orbitalTick(now = Date.now()) {
  if (!ioRef || !EV || !gameActive) return;
  maybeAdvanceWave();
  await emitSnapshot(now);
}

// ---------------------------------------------------------------------------
// Public state / test seams
// ---------------------------------------------------------------------------

export function resetGameState() {
  gameActive = true;
  globalEnergy = MAX_ENERGY;
  globalScore = 0;
  currentWave = 1;
  collisionCount = 0;
  cleanupActions = 0;

  proximityTimers.clear();
  removedDebrisIds.clear();
  simulatedDebris = [];

  stopGameTimers();
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  spawnSimulatedDebris(STARTING_DEBRIS_COUNT);
  startGameTimers();

  if (!timer) {
    timer = setInterval(orbitalTick, ORBITAL_UPDATE_INTERVAL);
    timer.unref?.();
  }

  if (ioRef && EV) {
    ioRef.emit(EV.LEVEL_UP, {
      level: 1,
      wave: 1,
      currentWave: 1,
      count: STARTING_DEBRIS_COUNT,
      energy: globalEnergy,
      score: globalScore,
    });
  }

  console.log('[Solar Sentinel] 🔄 Game state reset for a new run');
}

/**
 * Test hook: force one authoritative Kessler cascade check immediately.
 */
export function triggerKesslerCascadeNow() {
  if (!gameActive) {
    return { success: false, reason: 'Game over — cannot cascade' };
  }

  const active = getActiveObjects();
  const highest = findHighestRisk(active);
  if (!highest || (highest.riskLevel ?? 0) < KESSLER_RISK_THRESHOLD) {
    return { success: false, reason: 'No high-risk debris to cascade' };
  }

  triggerCollisionEvent(highest, Date.now());
  return {
    success: true,
    collisionCount,
    currentWave,
    gameActive,
  };
}

export function stopGameLoop() {
  gameActive = false;
  stopGameTimers();
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function getGameState() {
  return {
    globalEnergy,
    globalScore,
    currentWave,
    collisionCount,
    gameActive,
    activeDebrisCount: getActiveObjects().length,
  };
}

export function stats() {
  return {
    loopRunning: Boolean(timer),
    updateIntervalMs: ORBITAL_UPDATE_INTERVAL,
    dataFetchIntervalMs: DATA_FETCH_INTERVAL,
    objectsTracked: cachedOrbitalData ? cachedOrbitalData.length : 0,
    lastDataFetchAge: cachedOrbitalData ? Date.now() - lastDataFetch : 0,
    globalEnergy,
    globalScore,
    currentWave,
    collisionCount,
    gameActive,
    activeDebrisCount: getActiveObjects().length,
  };
}

export function getTrackedObjects() {
  return cachedOrbitalData || [];
}

export function removeTrackedObject(id) {
  if (!cachedOrbitalData) return false;
  const beforeLength = cachedOrbitalData.length;
  cachedOrbitalData = cachedOrbitalData.filter((obj) => obj.id !== id);
  if (cachedOrbitalData.length < beforeLength) {
    console.log(`[Solar Sentinel] 🗑️ Removed tracked object ${id} from orbital data`);
    return true;
  }
  return false;
}

export async function refreshData() {
  try {
    const freshData = await fetchOrbitalData();
    if (freshData && freshData.length > 0) {
      cachedOrbitalData = freshData;
      lastDataFetch = Date.now();
      console.log('[Solar Sentinel] Orbital data refreshed successfully');
      return true;
    }
    return false;
  } catch (error) {
    console.error('[Solar Sentinel] Failed to refresh orbital data:', error);
    return false;
  }
}
