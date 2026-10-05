/**
 * Astral Zero — Damage, death, respawn (Phase 3).
 * ============================================================
 * The ONLY place HP changes. Every projectile hit and every melee swing
 * funnels through here:
 *
 *  applyHit(room, victim, damage, killerId, cause, io, EV, now)
 *   → clamp HP → emit player_health_update (server-authoritative) →
 *   on lethal: deaths+1, credit killer (kills+1, score+1), alive=false,
 *   respawnAt=now+delay → emit entity_death (+ legacy bot_death for bots).
 *
 * RESPAWN (inside the tick loop, no timers):
 *  processRespawns(room, io, EV, now) revives due entities at a safe spawn
 *  (far from enemies), restores HP, grants brief spawn protection, emits
 *  entity_respawn + player_health_update. Corpses keep simulating as
 *  non-integrated markers (alive:false stays in snapshots).
 *
 * MELEE: instant arc test — victim within MELEE.range of the attacker's
 * torso AND within ±halfArc of the attack direction (facing, or aim when
 * the attacker aimed clearly sideways). Knockback shoves along facing.
 *
 * SUICIDES / NO-KILLER: killerId null (fell out? can't — arena is closed;
 * reserved for future hazards) or killer === victim → deaths+1, no credit.
 * TDM scoring (team points) is applied by scoring.js via recordKill's
 * return — damage returns structured kill events for the loop to forward.
 */

import config from '../server-config.js';
import { MELEE } from './weapons.js';
import { safeSpawn } from '../game/arena.js';
import { rewindArcTest } from '../lagcomp/rewind.js';

/** Killfeed glory names per streak tier (index-aligned with sim.streakTiers). */
const STREAK_NAMES = ['Killing Spree', 'Rampage', 'Unstoppable', 'Janitor Supreme'];

/**
 * Apply one damage instance. Returns a kill event or null.
 * Killer damageScale (practice bots 0.5, everyone else 1) is applied here —
 * the single funnel keeps balance tuning in exactly one place.
 * @returns {object|null} { victim, killer, cause } when lethal
 */
export function applyHit(room, victim, rawDamage, killerId, cause, io, EV, now = Date.now()) {
  if (!victim?.alive) return null;
  if (now < (victim.protectedUntil || 0)) return null; // spawn protection
  const killer = killerId ? room.sim?.entities?.get(killerId) : null;
  const scale = killer?.damageScale || 1;
  const damage = Math.max(0, Math.round(rawDamage * scale));
  if (damage <= 0) return null;

  victim.hp = Math.max(0, victim.hp - damage);
  // Phase 5 telemetry: every damaging impact credits accuracy + room totals.
  if (killer) killer.hits = (killer.hits || 0) + 1;
  if (room.sim?.stats) room.sim.stats.hits = (room.sim.stats.hits || 0) + 1;
  emitHealth(io, EV, room, victim, cause, now);

  if (victim.hp > 0) return null;
  return kill(room, victim, killerId, cause, io, EV, now);
}

/**
 * Lethal resolution shared by damage, (future) hazards, and admin kills.
 *
 * Phase 4 streaks: victim streak resets; credited killer streak++ and may
 * emit `streak_event` (first blood + tier crossings). Zero gameplay effect —
 * pure killfeed glory. First blood is once per room (room.sim.firstBlood).
 * @returns {object} kill event { victimId, killerId, cause, teamSwing }
 */
export function kill(room, victim, killerId, cause, io, EV, now = Date.now()) {
  victim.alive = false;
  victim.hp = 0;
  victim.deaths += 1;
  victim.streak = 0; // death ends the run
  victim.vx = 0;
  victim.vy = 0;
  victim.respawnAt = now + (config.sim?.respawnDelayMs || 2500);

  const entities = room.sim?.entities;
  const killer = killerId ? entities?.get(killerId) : null;
  const credited = killer && killer.id !== victim.id && killer.alive !== undefined;
  if (credited) {
    killer.kills += 1;
    killer.score += 1;
    killer.streak = (killer.streak || 0) + 1;
    // Phase 5: run-best for the rampage medal.
    killer.bestStreak = Math.max(killer.bestStreak || 0, killer.streak);
    emitStreaks(room, killer, io, EV, now);
  }
  // Phase 5: every death spills scrap (humans drop their satchel + bonus,
  // bots drop 1–2). Loop trims past the token cap; TTL expiry is in-loop.
  dropScrap(room, victim, io, EV, now);

  const respawnInMs = (config.sim?.respawnDelayMs || 2500);
  const evt = {
    roomId: room.id,
    victimId: victim.id,
    victimName: victim.name,
    victimIsBot: victim.isBot,
    victimTeam: victim.team,
    killedById: credited ? killer.id : null,
    killedByName: credited ? killer.name : null,
    killerIsBot: credited ? Boolean(killer.isBot) : false,
    cause,
    x: Math.round(victim.x),
    y: Math.round(victim.y),
    respawnInMs,
    tick: room.sim?.tick || 0,
    timestamp: now,
  };
  io.to(room.id).emit(EV.ENTITY_DEATH, evt);

  // Legacy compat: bot deaths ALSO ride the Phase 1 channel (the client's
  // server-silence watchdog + old FX listeners key on it).
  if (victim.isBot) {
    io.to(room.id).emit(EV.BOT_DEATH, {
      botId: victim.id,
      killedBy: credited ? killer.id : null,
      cause,
      x: Math.round(victim.x),
      y: Math.round(victim.y),
      timestamp: now,
    });
  }
  return { victimId: victim.id, killerId: credited ? killer.id : null, cause, victimTeam: victim.team, killerTeam: credited ? killer.team : null };
}

/**
 * Revive everyone whose respawnAt passed. Safe-spawn = far from enemies.
 * @returns {object[]} revived entities (for score/roster refresh)
 */
export function processRespawns(room, io, EV, now = Date.now()) {
  const revived = [];
  const entities = room.sim?.entities;
  if (!entities) return revived;
  for (const e of entities.values()) {
    if (e.alive || e.disconnected) continue;
    if (now < (e.respawnAt || 0)) continue;
    const enemies = [];
    const all = [];
    for (const o of entities.values()) {
      if (!o.alive || o.id === e.id) continue;
      all.push(o);
      const hostile = !e.team || !o.team ? true : e.team !== o.team;
      if (hostile) enemies.push(o);
    }
    const spot = safeSpawn(enemies, all);
    e.x = spot.x;
    e.y = spot.y;
    e.vx = 0;
    e.vy = 0;
    e.hp = e.maxHp;
    e.alive = true;
    e.protectedUntil = now + (config.sim?.spawnProtectionMs || 1000);
    e.respawnAt = 0;
    revived.push(e);
    io.to(room.id).emit(EV.ENTITY_RESPAWN, {
      roomId: room.id,
      id: e.id,
      name: e.name,
      x: e.x,
      y: e.y,
      hp: e.hp,
      maxHp: e.maxHp,
      isBot: e.isBot,
      tick: room.sim?.tick || 0,
      timestamp: now,
    });
    emitHealth(io, EV, room, e, 'respawn', now);
  }
  return revived;
}

/**
 * Instant mop-swing arc. Attack direction = aim when the attacker aims
 * clearly sideways, else facing. Returns victim ids hit (usually 0–1).
 *
 * Phase 4: grace-band misses get ONE rewound retest (attacker's latency),
 * so knife fights stay honest at 120 ms (see lagcomp/rewind.js).
 */
export function meleeSwing(room, attacker, io, EV, now = Date.now()) {
  const hits = [];
  const entities = room.sim?.entities;
  if (!entities || !attacker.alive) return hits;
  const aimDx = (attacker.lastAimX ?? attacker.x + attacker.facing * 100) - attacker.x;
  const dir = Math.abs(aimDx) > 12 ? Math.sign(aimDx) : attacker.facing;
  const ax = attacker.x;
  const ay = attacker.y - 20;
  const reach = MELEE.range + (config.sim?.entityRadius || 14);
  for (const e of entities.values()) {
    if (e.id === attacker.id || !e.alive) continue;
    if (attacker.team && e.team && attacker.team === e.team) continue;
    if (now < (e.protectedUntil || 0)) continue;
    const rw = rewindArcTest(ax, ay, dir, e, reach, MELEE.halfArc, attacker.lastLatencyMs, now);
    if (!rw.hit) continue;
    e.vx += dir * MELEE.knockback;
    const killEvt = applyHit(room, e, MELEE.damage, attacker.id, 'melee', io, EV, now);
    hits.push({ victimId: e.id, kill: killEvt, lagComp: rw.lagComp });
  }
  return hits;
}

/** Server-authoritative HP push (the ONLY writer of this event in Phase 3). */
function emitHealth(io, EV, room, victim, reason, now) {
  io.to(room.id).emit(EV.PLAYER_HEALTH_UPDATE, {
    id: victim.id,
    hp: Math.max(0, Math.round(victim.hp)),
    maxHp: victim.maxHp,
    reason,
    timestamp: now,
  });
}

/**
 * Phase 5 scrap spill. Humans drop everything they carried + a bonus token
 * (dying rich hurts); bots drop 1–2 sympathy tokens. Value is always 1 per
 * token (stack-free by design — counting beats weighing for HUDs).
 */
let scrapSeq = 0;

function dropScrap(room, victim, io, EV, now) {
  // Scrap exists ONLY in scrap_collector (other modes would leak tokens
  // nobody can pick up — the cap/expiry sweeps run in tickScrap alone).
  if (room.mode !== 'scrap_collector') {
    victim.carried = 0;
    return;
  }
  if (!room.sim || !Array.isArray(room.sim.tokens)) return;
  const cfg = config.sim?.scrap || {};
  const ttlMs = (cfg.tokenTtlSec || 30) * 1000;
  const n = victim.isBot ? 1 + (scrapSeq % 2) : (victim.carried || 0) + (cfg.humanDropBonus ?? 1);
  victim.carried = 0;
  for (let i = 0; i < Math.max(0, n); i += 1) {
    scrapSeq += 1;
    room.sim.tokens.push({
      id: `sc_${scrapSeq}`,
      x: Math.round(victim.x + (Math.random() - 0.5) * 60),
      y: Math.round(victim.y - 20 + (Math.random() - 0.5) * 30),
      value: 1,
      ttl: now + ttlMs,
    });
  }
  if (EV && EV.SCRAP_EVENT && n > 0) {
    io.to(room.id).emit(EV.SCRAP_EVENT, {
      roomId: room.id,
      kind: 'drop',
      id: victim.id,
      byId: victim.id,
      byName: victim.name,
      amount: n,
      x: Math.round(victim.x),
      y: Math.round(victim.y),
      tick: room.sim.tick || 0,
      timestamp: now,
    });
  }
}

/**
 * Phase 4 killfeed medals. First blood once per room; tier medals when the
 * killer's streak newly reaches a configured tier (3/5/8/12 default).
 * Shape: { roomId, kind, id, name, isBot, team, streak, text, tick, timestamp }
 * kinds: 'first_blood' | 'streak' (text carries the glory name).
 */
function emitStreaks(room, killer, io, EV, now) {
  if (!room.sim) return;
  if (!room.sim.firstBlood) {
    room.sim.firstBlood = { id: killer.id, name: killer.name };
    io.to(room.id).emit(EV.STREAK_EVENT, {
      roomId: room.id,
      kind: 'first_blood',
      id: killer.id,
      name: killer.name,
      isBot: killer.isBot,
      team: killer.team,
      streak: killer.streak,
      text: `FIRST BLOOD — ${killer.name}`,
      tick: room.sim.tick || 0,
      timestamp: now,
    });
  }
  const tiers = config.sim?.streakTiers || [3, 5, 8, 12];
  const tierIdx = tiers.indexOf(killer.streak);
  if (tierIdx !== -1) {
    io.to(room.id).emit(EV.STREAK_EVENT, {
      roomId: room.id,
      kind: 'streak',
      id: killer.id,
      name: killer.name,
      isBot: killer.isBot,
      team: killer.team,
      streak: killer.streak,
      text: `${STREAK_NAMES[tierIdx] || `${killer.streak} streak`} — ${killer.name} (${killer.streak})`,
      tick: room.sim.tick || 0,
      timestamp: now,
    });
  }
}
