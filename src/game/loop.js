/**
 * Astral Zero — Fixed-step simulation loop (Phase 3, maps/scrap in Phase 5).
 * ============================================================
 * ONE global interval (tickHz from config, default 20 Hz → 50 ms) drives
 * every `playing` room. Per tick, per room, in order:
 *
 *   1. INPUT   humans ← inputs.js store · bots ← ai/botBrain.think()
 *   2. PHYSICS stepEntity() on the room's MAP (low-grav volumes scale gravity)
 *   3. FIRE    validated shots → projectiles + room-scoped player_shoot tracer
 *   4. MELEE   validated swings → arc hits
 *   5. SHELLS  stepProjectiles() → applyHit() → deaths → score_update on kills
 *   5b. HAZARD map hazard volumes deal DoT (cause 'hazard', uncredited)
 *   5c. SCRAP  (scrap mode) token expiry → walk-over pickup → station deposit
 *   6. RESPAWN processRespawns() (safe spawns, protection, entity_respawn)
 *   7. SCORE   checkWin() → onMatchEnd(roomId, reason) when decided
 *   8. SYNC    entity_snapshot (every tick, +tokens) + bot_update (every 2nd)
 *
 * OWNERSHIP (no cycles by construction):
 *  - loop OWNS io + EV (injected via ensureLoop) and the match-end callback
 *    (injected by matchmaking — loop never imports matchmaking).
 *  - roomManager OWNS roster + lifecycle; loop only reads/mutates room.sim.
 *  - damage/scoring are pure-ish helpers; io is always passed down, never
 *    imported, so unit tests can run the whole sim headless with io=null.
 *
 * LIFETIME: the interval is unref'd (never holds the process open for CLI
 * tests) and created lazily on first room boot. Rooms without room.sim are
 * skipped (unit-context rooms created without io never simulate).
 */

import config from '../server-config.js';
import { intentFor, consumeEdges, neutralIntent, latencyFor } from './inputs.js';
import { record as recordHistory } from '../lagcomp/history.js';
import { resolveMap as resolveRoomMap } from './maps.js';
import { hazardAt, stationAt } from './maps.js';
import { stepEntity } from './physics.js';
import { think, fireCooldownScale } from '../ai/botBrain.js';
import { ensurePersonality } from '../ai/personalities.js';
import { WEAPONS } from '../combat/weapons.js';
import { stepProjectiles } from '../combat/projectiles.js';
import { tryFire, tryMelee } from '../combat/triggers.js';
import { applyHit, processRespawns } from '../combat/damage.js';
import { initMatchClock, recordTeamKill, checkWin, scoreboard } from './scoring.js';
import { buildSnapshot, buildBotUpdate } from './snapshots.js';
import { createEntity } from './entities.js';
import { listRooms } from '../rooms/roomManager.js';

let ioRef = null;
let EV = null;
let onMatchEnd = null;
let timer = null;
let roomSource = null; // () => iterable of rooms (injected; defaults to roomManager)

export function ensureLoop(io, events, opts = {}) {
  ioRef = io;
  EV = events;
  if (typeof opts.onMatchEnd === 'function') onMatchEnd = opts.onMatchEnd;
  if (typeof opts.roomSource === 'function') roomSource = opts.roomSource;
  if (!timer) {
    const hz = config.sim?.tickHz || 20;
    timer = setInterval(tickAll, Math.round(1000 / hz));
    timer.unref?.(); // CLI smoke tests must exit with pending matches alive
  }
  return timer;
}

/** Test hook: drive one manual tick without timers. */
export function tickOnce(now = Date.now()) {
  tickAll(now);
}

function liveRooms() {
  // Default source is the room registry (overridable for headless tests).
  if (roomSource) return [...roomSource()];
  return listRooms();
}

function tickAll(now = Date.now()) {
  if (!ioRef || !EV) return;
  const t0 = Date.now();
  const dt = 1 / (config.sim?.tickHz || 20);
  let roomsTicked = 0;
  for (const room of liveRooms()) {
    try {
      if (room.phase === 'playing' && room.sim) {
        tickRoom(room, dt, now);
        roomsTicked += 1;
      }
    } catch (err) {
      console.warn(`[Astral Zero] tick failed for ${room.id}: ${err.message}`);
    }
  }
  // Phase 4 perf watchdog: the 20 Hz budget is 50 ms; warn past half of it
  // with room counts so full-room load problems are visible in plain logs.
  const took = Date.now() - t0;
  tickStats.samples += 1;
  tickStats.totalMs += took;
  if (took > 25) {
    console.warn(`[Astral Zero] slow tick: ${took}ms across ${roomsTicked} room(s)`);
  }
}

const tickStats = { samples: 0, totalMs: 0 };

/**
 * Build room.sim from the spawn roster (called once at room boot, before
 * countdown ends — entities exist but don't move until phase === 'playing').
 */
export function initSim(room) {
  const entities = new Map();
  for (const p of room.players || []) {
    const e = createEntity(p, p.socketId || p.id);
    e.cooldownScale = 1;
    e.damageScale = 1;
    e.weaponId = 'scrap-rifle';
    entities.set(e.id, e);
  }
  for (const b of room.bots || []) {
    const e = createEntity(b, null);
    // Phase 4: personality first (difficulty mix per mode), then the trigger
    // cadence compounds mode temperament × personality (easy practice bots
    // end up ~2.4× slower than aggressive ffa bots — by construction).
    const pers = ensurePersonality(e, room.mode);
    e.cooldownScale = fireCooldownScale(room.mode) * (pers.cooldownMul || 1);
    // Friendly practice stays friendly: practice bots deal half damage so a
    // first-timer gets a lesson, not a spawn-camp. (Real modes: full damage.)
    e.damageScale = room.mode === 'bot_practice' ? 0.5 : 1;
    e.weaponId = 'scrap-rifle';
    entities.set(e.id, e);
  }
  room.sim = {
    entities,
    projectiles: [],
    tokens: [], // Phase 5: live scrap tokens [{ id, x, y, value, ttl }]
    tick: 0,
    endsAt: 0,
    clockStarted: false,
    over: false,
    winInfo: null,
    teamScores: { red: 0, blue: 0 },
    stats: { shots: 0, hits: 0, lagCompHits: 0 }, // Phase 5: telemetry counters
    lastScorePush: 0,
  };
  // Phase 5: createRoom always stamps room.map (resolved def); unit-built
  // rooms that skip createRoom get the legacy arena here as a backstop.
  if (!room.map) room.map = resolveRoomMap(room.mapId);
  return room.sim;
}

function tickRoom(room, dt, now) {
  const sim = room.sim;
  sim.tick += 1;

  // Match clock starts on the first PLAYING tick (countdown doesn't count).
  if (!sim.clockStarted) {
    sim.clockStarted = true;
    initMatchClock(room, now);
    pushScores(room, now);
  }

  // -- 1+2. Input + physics -----------------------------------------------------
  for (const e of sim.entities.values()) {
    if (e.disconnected || !e.alive) continue;
    // Phase 4: refresh the shooter's-view latency (humans measured, bots 0)
    // BEFORE firing, so spawned shells carry an honest rewind budget.
    e.lastLatencyMs = e.isBot || !e.socketId ? 0 : latencyFor(e.socketId);
    // Barrel cooling runs every tick whether or not we shoot this one.
    const cool = config.sim?.heat?.coolPerTick ?? 0.06;
    if (e.heat > 0) e.heat = Math.max(0, e.heat - cool);
    let intent;
    if (e.isBot) {
      intent = think(e, room, room.mode, now);
    } else {
      intent = e.socketId ? intentFor(e.socketId) : neutralIntent();
    }
    // Remember aim for melee arcs + criminal-investigation replays.
    e.lastAimX = intent.aimX;
    e.lastAimY = intent.aimY;
    e.lastInputSeq = intent.seq || e.lastInputSeq;
    // Weapon switching (validated: unknown ids keep the current weapon).
    if (typeof intent.weaponId === 'string' && WEAPONS[intent.weaponId]) {
      e.weaponId = intent.weaponId;
    } else if (Number.isInteger(intent.weaponSlot)) {
      const ids = Object.keys(WEAPONS);
      const pick = ids[intent.weaponSlot % ids.length];
      if (pick) e.weaponId = pick;
    }
    stepEntity(e, intent, dt, now, room.map);

    // -- 3. Fire (level-based: held fire shoots at weapon cadence) ----------------
    // Shared validated path with the socket bridge (triggers.js).
    if (intent.fire) {
      tryFire(room, e, intent.aimX, intent.aimY, ioRef, EV, now);
    }

    // -- 4. Melee (edge-based) ------------------------------------------------------
    if (intent.melee) {
      tryMelee(room, e, ioRef, EV, now);
    }

    if (!e.isBot && e.socketId) consumeEdges(e.socketId);
  }

  // Phase 4: position history AFTER integrating (rewind reads post-step
  // truth). Dead entities record too — a corpse's trail is static, and one
  // uniform path beats branchy special cases.
  for (const e of sim.entities.values()) {
    if (!e.disconnected) recordHistory(e.history, e.x, e.y, now);
  }

  // Phase 4 shell cap: oldest fizzle first (full-auto rooms stay bounded).
  enforceCaps(sim);

  // -- 5. Projectiles → damage ------------------------------------------------------
  // Phase 5: shell clip bounds come from the MAP (arenas differ now).
  const B = room.map?.bounds || {};
  const hits = stepProjectiles(sim.projectiles, sim.entities, dt, now, {
    minX: B.minX ?? 40,
    maxX: B.maxX ?? 1240,
    ceilingY: B.ceilingY ?? 40,
    groundY: B.groundY ?? 650,
  });
  let killsThisTick = 0;
  const vmax = (config.sim?.maxSpeed || 260) * 1.5; // knockback may spike past run speed — cap it
  for (const h of hits) {
    // Knockback juice (applied even on lethal hits — corpses can slide).
    h.victim.vx += Math.sign(h.victim.x - h.proj.x || 1) * (h.proj.knockback || 0) * 0.4;
    h.victim.vx = Math.max(-vmax, Math.min(vmax, h.victim.vx));
    // Phase 5 telemetry: rewound hits counted separately (fairness metric).
    if (h.lagComp && sim.stats) sim.stats.lagCompHits = (sim.stats.lagCompHits || 0) + 1;
    const killEvt = applyHit(room, h.victim, h.proj.damage * h.falloff, h.proj.ownerId, 'bullet', ioRef, EV, now);
    if (killEvt) {
      killsThisTick += 1;
      if (killEvt.killerId) recordTeamKill(room, killEvt.killerTeam);
    }
  }
  if (killsThisTick > 0) pushScores(room, now);

  // -- 5b. Hazard volumes (Phase 5): fractional DoT, uncredited ------------------------
  // dps × dt accumulates until a whole HP is owed (no rounding starvation).
  // Spawn protection covers hazards too (no lava-spawn deaths, ever).
  for (const e of sim.entities.values()) {
    if (!e.alive || e.disconnected) continue;
    const dps = hazardAt(room.map, e.x, e.y);
    if (dps <= 0) continue;
    e.hazardAcc = (e.hazardAcc || 0) + dps * dt;
    if (e.hazardAcc >= 1) {
      const owed = Math.floor(e.hazardAcc);
      e.hazardAcc -= owed;
      const killEvt = applyHit(room, e, owed, null, 'hazard', ioRef, EV, now);
      if (killEvt) {
        killsThisTick += 1;
        pushScores(room, now);
      }
    }
  }

  // -- 5c. Scrap economy (Phase 5, scrap_collector only) ---------------------------------
  if (room.mode === 'scrap_collector') {
    tickScrap(room, dt, now);
  }

  // -- 6. Respawns --------------------------------------------------------------------
  processRespawns(room, ioRef, EV, now);

  // -- 7. Win check ----------------------------------------------------------------------
  const win = checkWin(room, now);
  if (win && onMatchEnd) {
    // Emit one final snapshot so clients render the deciding frame, then end.
    ioRef.to(room.id).emit(EV.ENTITY_SNAPSHOT, buildSnapshot(room, now));
    onMatchEnd(room.id, win.reason);
    return;
  }
  // Phase 4 overtime just started: push the flag NOW (scoreboard + horn
  // notice) so HUDs flip to "OVERTIME" before the next kill lands.
  if (room.sim.overtimeJustStarted) {
    room.sim.overtimeJustStarted = false;
    pushScores(room, now);
  }

  // -- 8. Sync -----------------------------------------------------------------------------
  ioRef.to(room.id).emit(EV.ENTITY_SNAPSHOT, buildSnapshot(room, now));
  if (sim.tick % 2 === 0) {
    ioRef.to(room.id).emit(EV.BOT_UPDATE, buildBotUpdate(room, now));
  }
}

/**
 * Phase 5 scrap economy tick (scrap_collector rooms only):
 *  expiry → walk-over pickup (humans AND bots) → station deposit.
 * Deposit banks carried → banked, mirrors score, and pushes the table
 * (scores visibly climb on every bank, not just on kills).
 */
export function tickScrap(room, dt, now) {
  void dt;
  const sim = room.sim;
  const cfg = config.sim?.scrap || {};
  const carryCap = cfg.carryCap || 5;
  const pickupR = cfg.pickupRadius || 34;

  // Expired tokens rot away by TTL (the hard-count cap lives in enforceCaps,
  // which runs for every room every tick — one cap, one place).
  if (sim.tokens.length > 0) {
    sim.tokens = sim.tokens.filter((t) => t.ttl > now);
  }

  let scoresDirty = false;
  for (const e of sim.entities.values()) {
    if (!e.alive || e.disconnected) continue;
    // Pickup: nearest token in radius, satchel capped (full carriers walk past).
    if ((e.carried || 0) < carryCap && sim.tokens.length > 0) {
      let best = -1;
      let bestD = pickupR;
      for (let i = 0; i < sim.tokens.length; i += 1) {
        const d = Math.hypot(sim.tokens[i].x - e.x, sim.tokens[i].y - (e.y - 20));
        if (d <= bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best !== -1) {
        const [tok] = sim.tokens.splice(best, 1);
        e.carried = (e.carried || 0) + (tok.value || 1);
        emitScrap(room, {
          kind: 'pickup', id: tok.id, byId: e.id, byName: e.name,
          amount: tok.value || 1, total: e.carried, x: tok.x, y: tok.y,
        }, now);
      }
    }
    // Deposit: inside a station dock with a non-empty satchel → bank it.
    if ((e.carried || 0) > 0) {
      const dock = stationAt(room.map, e.x, e.y);
      if (dock) {
        const amount = e.carried;
        e.carried = 0;
        e.banked = (e.banked || 0) + amount;
        e.score = e.banked; // scrap score IS banked (table sorts itself)
        scoresDirty = true;
        emitScrap(room, {
          kind: 'deposit', id: dock.id, byId: e.id, byName: e.name,
          amount, total: e.banked, stationId: dock.id, x: Math.round(e.x), y: Math.round(e.y),
        }, now);
      }
    }
  }
  if (scoresDirty) pushScores(room, now);
}

/** scrap_event fan-out (headless/unit-safe: no io, no name → silence). */
function emitScrap(room, fields, now = Date.now()) {
  if (!ioRef || !EV || !EV.SCRAP_EVENT) return;
  ioRef.to(room.id).emit(EV.SCRAP_EVENT, {
    roomId: room.id,
    tick: room.sim?.tick || 0,
    timestamp: now,
    ...fields,
  });
}

/**
 * Phase 5 memory hygiene: hard caps trim the oldest entries FIRST so a
 * full-auto 10-player room stays bounded no matter what. Called every tick;
 * exported for unit tests (pure over the sim object, no io).
 *  - projectiles → maxProjectiles (60): oldest fizzle, no event (janitorial).
 *  - tokens → scrap.tokenCap (40): oldest silently recycled (snapshot shrinks).
 * TTL expiry stays in tickScrap (scrap rooms only); this is the backstop.
 */
export function enforceCaps(sim) {
  if (!sim) return;
  const maxProj = config.sim?.maxProjectiles || 60;
  if (Array.isArray(sim.projectiles) && sim.projectiles.length > maxProj) {
    sim.projectiles.splice(0, sim.projectiles.length - maxProj);
  }
  const tokenCap = config.sim?.scrap?.tokenCap || 40;
  if (Array.isArray(sim.tokens) && sim.tokens.length > tokenCap) {
    sim.tokens.splice(0, sim.tokens.length - tokenCap);
  }
}

/** Scoreboard push (on kills + match start + overtime + deposits; event-driven). */
function pushScores(room, now = Date.now()) {
  if (!ioRef || !EV) return; // headless/unit contexts fan out nothing
  const scores = scoreboard(room);
  ioRef.to(room.id).emit(EV.SCORE_UPDATE, {
    roomId: room.id,
    mode: room.mode,
    scores,
    teams: room.mode === 'tdm' ? { ...room.sim.teamScores } : null,
    overtime: Boolean(room.sim?.overtime),
    tick: room.sim?.tick || 0,
    timestamp: now,
  });
}

/** Debug helper (now includes tick health for the 20 Hz stability watch). */
export function stats() {
  return {
    loopRunning: Boolean(timer),
    tickHz: config.sim?.tickHz || 20,
    avgTickMs:
      tickStats.samples > 0 ? Math.round((tickStats.totalMs / tickStats.samples) * 100) / 100 : 0,
    ticksMeasured: tickStats.samples,
  };
}
