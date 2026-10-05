/**
 * Astral Zero — Simulation entities (Phase 3).
 * ============================================================
 * ONE object shape for every simulated body, human or bot:
 *
 *   entity = {
 *     // -- identity (immutable for the life of the room) --
 *     id,            // wire id: socket.id for humans, bot_* for bots
 *     socketId,      // live socket for humans, null for bots
 *     name, botType, team, isBot,
 *     // -- physics state (server OWNS these; clients only predict) --
 *     x, y, vx, vy, facing, grounded,
 *     // -- combat state --
 *     hp, maxHp, alive, respawnAt, protectedUntil,
 *     fireCooldownUntil, meleeCooldownUntil,
 *     jumpBufferUntil, coyoteUntil,
 *     // -- scoring --
 *     kills, deaths, score,
 *     // -- bookkeeping --
 *     lastInputSeq, disconnected,
 *   }
 *
 * Roster arrays (room.players / room.bots) stay as the SPAWN manifest for
 * `room_joined`; the sim Map (room.sim.entities) is the LIVE truth used by
 * the tick loop, snapshots, and combat. `liveRoster()` merges the two so
 * `toPublic()` keeps serving fresh HP/positions on `room_update`.
 */

import config from '../server-config.js';

/**
 * Build a live sim entity from a roster entry (human or bot row).
 * Roster rows already carry { id, name, team, x, y, hp, maxHp, isBot }.
 * @param {object} row roster entry
 * @param {string|null} socketId live socket for humans (null for bots)
 * @returns {object} sim entity
 */
export function createEntity(row = {}, socketId = null) {
  const maxHp = Number.isFinite(row.maxHp) ? row.maxHp : 100;
  return {
    id: String(row.id ?? row.socketId ?? `entity_${Date.now().toString(36)}`),
    socketId: socketId || row.socketId || null,
    name: String(row.name || (row.isBot ? 'Scrap Bot' : 'Janitor')).slice(0, 24),
    botType: row.botType || null,
    team: row.team || null,
    isBot: Boolean(row.isBot),

    x: Number.isFinite(row.x) ? row.x : 640,
    y: Number.isFinite(row.y) ? row.y : 300,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: false,

    hp: Number.isFinite(row.hp) ? row.hp : maxHp,
    maxHp,
    alive: true,
    respawnAt: 0,
    protectedUntil: Date.now() + (config.sim?.spawnProtectionMs || 1000),
    fireCooldownUntil: 0,
    meleeCooldownUntil: 0,
    jumpBufferUntil: 0,
    coyoteUntil: 0,

    kills: 0,
    deaths: 0,
    score: 0,
    streak: 0, // consecutive kills without dying (streak_event tiers)
    bestStreak: 0, // Phase 5: run best (rampage medal + telemetry)

    // -- Phase 5: scrap economy + shot telemetry --
    carried: 0, // scrap tokens held (bank at a station)
    banked: 0, // scrap banked lifetime (scrap_collector score mirrors this)
    shots: 0, // accepted trigger pulls (accuracy denominator)
    hits: 0, // damaging impacts credited (accuracy numerator)
    hazardAcc: 0, // fractional hazard-DoT accumulator (dps × dt)

    // -- Phase 4: lag comp + weapon feel + bot personality --
    history: [], // position ring [{ t, x, y }] for rewind hit tests
    lastLatencyMs: 0, // one-way latency estimate (humans; bots stay 0)
    heat: 0, // barrel heat 0..1 (bloom; sustained fire spreads shots)
    damageScale: 1, // practice bots 0.5 (set at sim init)
    cooldownScale: 1, // practice bots slower trigger (set at sim init)
    personality: null, // bot difficulty profile (ai/personalities.js)

    lastInputSeq: 0,
    disconnected: false,
  };
}

/**
 * Wire shape for ONE entity inside `entity_snapshot` / roster refreshes.
 * Field contract (must satisfy frontend SnapshotBuffer + normaliseEntity):
 *   id, time, x, y, vx, vy, hp, maxHp, facing, alive, seq
 * plus lobby-friendly extras: name, team, isBot, socketId/botId, score.
 * Values are rounded to 1 decimal to keep JSON small and deterministic.
 * @param {object} e sim entity
 * @param {number} now server ms (becomes `time`)
 * @returns {object}
 */
export function toWire(e, now = Date.now()) {
  const r1 = (n) => Math.round(Number(n) * 10) / 10;
  return {
    id: e.id,
    socketId: e.socketId || e.id,
    botId: e.isBot ? e.id : null,
    name: e.name,
    botType: e.botType,
    team: e.team,
    isBot: e.isBot,
    x: r1(e.x),
    y: r1(e.y),
    vx: r1(e.vx),
    vy: r1(e.vy),
    facing: e.facing,
    hp: Math.max(0, Math.round(e.hp)),
    maxHp: e.maxHp,
    alive: e.alive,
    seq: e.lastInputSeq,
    score: e.score,
    kills: e.kills,
    deaths: e.deaths,
    carried: e.carried || 0, // Phase 5: HUD satchel counts ride the snapshot
    time: now,
  };
}

/**
 * Merge live sim state back onto a roster row (for room_update / match_end).
 * Falls back to the raw row when no sim entity exists (e.g. pre-play).
 */
export function liveRosterRow(row, simEntities, now = Date.now()) {
  const live = simEntities?.get(row.id || row.socketId);
  if (!live) return { ...row };
  return {
    ...row,
    x: Math.round(live.x * 10) / 10,
    y: Math.round(live.y * 10) / 10,
    hp: Math.max(0, Math.round(live.hp)),
    maxHp: live.maxHp,
    alive: live.alive,
    kills: live.kills,
    deaths: live.deaths,
    score: live.score,
    time: now,
  };
}
