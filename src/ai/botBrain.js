/**
 * Astral Zero — Bot brain (Phase 3).
 * ============================================================
 * Bots steer through the SAME intent channel as humans
 * ({ moveX, jump, aimX, aimY, fire, melee }) so one physics path, one
 * weapon path, and one snapshot path serve both. The brain is a tiny
 * state machine per bot, evaluated every tick:
 *
 *   chase  → close distance to preferred range (jump over gaps/on platforms)
 *   strafe → hold range, drift left/right, keep crosshair on target
 *   attack → in range: stand-ish ground, fire when roughly aimed
 *   flee   → hp < 30%: back off while still shooting (cowardly but alive)
 *
 * TARGETING (team-aware):
 *  - tdm: nearest LIVING enemy-team entity. Teammates are never targeted
 *    (and friendly fire is off server-side anyway — belt and suspenders).
 *  - ffa: nearest living entity that isn't me.
 *  - bot_practice: nearest living HUMAN (the janitor is the lesson); falls
 *    back to nearest bot when no human is alive.
 *
 * PER-MODE TEMPERAMENT (tuning inline, documented):
 *  - ffa: aggressive — short preferred range, fast reactions, quick trigger.
 *  - tdm: disciplined — holds mid range, strafes more, same trigger as ffa.
 *  - bot_practice: gentle — long cooldowns (1.6×), wider miss spread, so a
 *    first-timer learns instead of being spawn-camped by Rusty McScrapface.
 *
 * "LINE OF SIGHT" is a distance + height check (locked spec allows this):
 * platforms don't block shots in Phase 3 — projectiles fly over geometry
 * and only test entity circles. A raycast LOS is Phase 4.
 *
 * Memory lives on `entity.ai` (created lazily), so brains survive across
 * ticks without a parallel store that could desync from the entity list.
 */

import { WEAPONS } from '../combat/weapons.js';
import { profileFor } from './personalities.js';
import { safeSpawn } from '../game/arena.js';
import config from '../server-config.js';

const MODE_TEMPERAMENT = {
  ffa: { cooldownScale: 0.85, preferMul: 0.8, strafeMs: [600, 1300], missSpread: 0.05, jumpChance: 0.02 },
  tdm: { cooldownScale: 0.95, preferMul: 1.0, strafeMs: [800, 1700], missSpread: 0.06, jumpChance: 0.015 },
  bot_practice: { cooldownScale: 1.6, preferMul: 1.2, strafeMs: [900, 2000], missSpread: 0.14, jumpChance: 0.008 },
};

// Preferred engagement range per chassis (px).
const RANGE_BY_TYPE = { chaser: 150, shooter: 340, brute: 180, kamikaze: 70 };

function temperament(mode) {
  return MODE_TEMPERAMENT[mode] || MODE_TEMPERAMENT.ffa;
}

/**
 * Effective fire-cadence multiplier for a bot in a mode (loop consumes this
 * at sim init; practice bots shoot ~1.6× slower = gentle by construction).
 */
export function fireCooldownScale(mode) {
  return temperament(mode).cooldownScale || 1;
}

function ensureMemory(bot) {
  if (!bot.ai) {
    bot.ai = {
      state: 'chase',
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      strafeUntil: 0,
      jumpAt: 0,
      targetId: null,
      acquiredAt: 0, // first acquisition never hesitates (spawn protection covers fairness)
      lastX: bot.x,
      stuckCheckAt: 0,
    };
  }
  return bot.ai;
}

function isEnemy(bot, other) {
  if (!other.alive || other.id === bot.id) return false;
  // Same non-null team = friend (tdm). Null team (ffa/practice) = everyone hostile.
  if (bot.team && other.team && bot.team === other.team) return false;
  return true;
}

/**
 * Pick a target id. Practice bots hunt humans first (it's a lesson, not a war).
 * @returns {object|null} sim entity
 */
export function pickTarget(bot, entities, mode) {
  let best = null;
  let bestScore = Infinity;
  let bestHuman = null;
  let bestHumanScore = Infinity;
  for (const e of entities.values()) {
    if (!isEnemy(bot, e)) continue;
    const d = Math.hypot(e.x - bot.x, e.y - bot.y);
    if (d < bestScore) {
      bestScore = d;
      best = e;
    }
    if (!e.isBot && d < bestHumanScore) {
      bestHumanScore = d;
      bestHuman = e;
    }
  }
  if (mode === 'bot_practice' && bestHuman) return bestHuman;
  return best;
}

/**
 * Think one tick. Pure-ish: reads room state, writes NOTHING except the
 * returned intent (memory mutation on bot.ai is the only side effect).
 *
 * Phase 4 upgrades (all inside this one function, same intent contract):
 *  - personalities: reaction gating (new targets tracked before firing),
 *    aim error × missMul, strafe speed, flee threshold per difficulty.
 *    Absent personality = normal (Phase 3 numbers — unit-safe default).
 *  - practice kamikaze-lite: kamikazes retrained to chasers (no bum-rush),
 *    melee only at 60 px (a rarity, not a routine).
 *  - cover retreat: fleeing bots path toward the safest spawn point
 *    (arena.safeSpawn), not blindly backwards into a wall.
 *  - tdm cohesion: drift toward the nearest teammate when isolated (>250 px),
 *    so teams stop trickling in 1-by-1.
 *  - stuck-hop: pushing a wall for ~2 s with no progress → jump.
 * @param {object} bot sim entity (bot)
 * @param {object} room internal room (room.sim.entities)
 * @param {string} mode room mode
 * @param {number} now server ms
 * @returns {object} intent { moveX, jump, jumpHeld, aimX, aimY, fire, melee }
 */
export function think(bot, room, mode, now = Date.now()) {
  const mem = ensureMemory(bot);
  const p = bot.personality || profileFor('normal');
  const entities = room.sim?.entities;
  const intent = {
    moveX: 0,
    jump: false,
    jumpHeld: false,
    aimX: bot.x + bot.facing * 200,
    aimY: bot.y - 40,
    fire: false,
    melee: false,
  };
  if (!entities) return intent;

  const target = pickTarget(bot, entities, mode);
  if (!target) {
    // Nobody to fight: drift to mid-arena and idle (looks alive on camera).
    mem.state = 'idle';
    intent.moveX = bot.x < 640 ? 0.4 : -0.4;
    if (Math.abs(bot.x - 640) < 60) intent.moveX = 0;
    return intent;
  }
  // Reaction gating: a NEW target must be tracked reactionMs before the
  // trigger is allowed (easy bots visibly hesitate; aggressive barely do).
  // The FIRST acquisition never hesitates (spawn protection covers fairness).
  if (!mem.targetId) {
    mem.targetId = target.id;
  } else if (mem.targetId !== target.id) {
    mem.targetId = target.id;
    mem.acquiredAt = now;
  }

  const dx = target.x - bot.x;
  const dy = target.y - bot.y;
  const dist = Math.hypot(dx, dy) || 1;
  const temp = temperament(mode);
  // Aggression shrinks the pocket a little (1.3 → ~0.96×, 0.7 → ~1.05×).
  const prefer =
    (RANGE_BY_TYPE[effectiveType(bot, mode)] || 220) *
    temp.preferMul *
    (1.15 - 0.15 * (p.aggression || 1));
  const weapon = WEAPONS[bot.weaponId || 'scrap-rifle'] || WEAPONS['scrap-rifle'];

  // Aim WITH error: difficulty scales the stormtrooper factor.
  const err = temp.missSpread * (p.missMul || 1) * dist;
  intent.aimX = target.x + (Math.random() - 0.5) * 2 * err;
  intent.aimY = target.y - 30 + (Math.random() - 0.5) * 2 * err;

  // Enemy/teammate position lists (built once; flee + cohesion share them).
  const enemies = [];
  const mates = [];
  for (const e of entities.values()) {
    if (!e.alive || e.id === bot.id) continue;
    const friendly = bot.team && e.team && bot.team === e.team;
    (friendly ? mates : enemies).push(e);
  }

  // -- Flee when soft → retreat to COVER (safest spawn), still shooting ---------
  // Kamikazes never retreat (their whole job is the run-in) — except the
  // retrained practice kind, which flees like everyone else.
  const kamiLite = mode === 'bot_practice' && bot.botType === 'kamikaze';
  if (bot.hp < bot.maxHp * (p.fleeAt ?? 0.3) && (bot.botType !== 'kamikaze' || kamiLite)) {
    mem.state = 'flee';
    const cover = safeSpawn(enemies, [...enemies, ...mates]);
    const cx = cover.x - bot.x;
    intent.moveX = Math.abs(cx) > 20 ? Math.sign(cx) : dx > 0 ? -1 : 1;
    if (bot.grounded && (cover.y < bot.y - 60 || Math.random() < temp.jumpChance)) {
      intent.jump = true;
      intent.jumpHeld = true;
    }
    intent.fire = reacted(mem, p, now) && dist < weapon.range && Math.abs(dy) < 200;
    return intent;
  }

  // -- Kamikaze: run in, mop-swing at point blank (real modes only) ---------------
  if (bot.botType === 'kamikaze' && !kamiLite) {
    mem.state = 'chase';
    intent.moveX = dx > 0 ? 1 : -1;
    if (Math.abs(dy) > 90 && bot.grounded) intent.jump = true;
    if (dist < 75) intent.melee = true;
    return intent;
  }

  // -- Range management ----------------------------------------------------------
  // Phase 5: scrap steering overrides COMBAT movement (trigger below still
  // fires — bots fight over tokens, which is the entire point of the mode).
  const scrap = mode === 'scrap_collector' ? scrapSteer(bot, room) : null;
  if (scrap) {
    mem.state = 'collect';
    intent.moveX = scrap.moveX;
    if (scrap.jump && bot.grounded) {
      intent.jump = true;
      intent.jumpHeld = true;
    }
  } else if (dist > prefer + 70) {
    mem.state = 'chase';
    intent.moveX = dx > 0 ? 1 : -1;
    // Hop when the target is above us, or randomly while chasing (platforms!).
    if (bot.grounded && (dy < -90 || Math.random() < temp.jumpChance)) {
      intent.jump = true;
      intent.jumpHeld = true;
    }
  } else if (dist < prefer - 70) {
    mem.state = 'strafe';
    intent.moveX = dx > 0 ? -1 : 1; // back off, keep facing the target
  } else {
    // In the pocket: strafe-drift, flip direction on a timer.
    mem.state = dist < weapon.range ? 'attack' : 'strafe';
    if (now >= mem.strafeUntil) {
      mem.strafeDir = Math.random() < 0.5 ? -1 : 1;
      const [lo, hi] = temp.strafeMs;
      mem.strafeUntil = now + lo + Math.random() * (hi - lo);
    }
    intent.moveX = mem.strafeDir * (p.strafeSpeed ?? 0.8);
    if (bot.grounded && Math.random() < temp.jumpChance * 0.6) intent.jump = true;
  }

  // -- tdm cohesion: don't trickle in alone; drift to the nearest mate ---------
  if (mode === 'tdm' && mates.length > 0) {
    let nm = mates[0];
    let nd = Math.hypot(nm.x - bot.x, nm.y - bot.y);
    for (const m of mates) {
      const d = Math.hypot(m.x - bot.x, m.y - bot.y);
      if (d < nd) {
        nd = d;
        nm = m;
      }
    }
    if (nd > 250) {
      const pull = nm.x > bot.x ? 1 : -1;
      intent.moveX = intent.moveX * 0.7 + pull * 0.3;
    }
  }

  // -- Stuck-hop: pushing with no progress for ~2 s → jump -------------------------
  if (now >= (mem.stuckCheckAt || 0)) {
    const moved = Math.abs(bot.x - (mem.lastX ?? bot.x));
    if (moved < 15 && Math.abs(intent.moveX) > 0.3 && bot.grounded) intent.jump = true;
    mem.lastX = bot.x;
    mem.stuckCheckAt = now + 2000;
  }

  // -- Trigger: reacted + in range + roughly level (cooldown by combat) ------------
  intent.fire = reacted(mem, p, now) && dist < weapon.range && Math.abs(dy) < 220;
  // Practice-lite kamikazes melee only on top of the target (a rarity).
  if (kamiLite && dist < 60) intent.melee = true;
  return intent;
}

/** Has this target been tracked long enough to open fire? */
function reacted(mem, p, now) {
  return now - (mem.acquiredAt || 0) >= (p.reactionMs ?? 250);
}

/**
 * Phase 5 scrap steering: full satchel → nearest deposit dock; otherwise the
 * nearest token within 600 px. Returns { moveX, jump } or null (no errand —
 * fall back to combat movement). Docks sit on the floor, tokens drift near
 * where kills happened; both are chased horizontally with platform hops.
 */
function scrapSteer(bot, room) {
  const cap = config.sim?.scrap?.carryCap || 5;
  if ((bot.carried || 0) >= cap) {
    const stations = room.map?.stations || [];
    if (stations.length === 0) return null;
    let ns = stations[0];
    let nd = Math.hypot(ns.x - bot.x, ns.y - bot.y);
    for (const s of stations) {
      const d = Math.hypot(s.x - bot.x, s.y - bot.y);
      if (d < nd) {
        nd = d;
        ns = s;
      }
    }
    const dx = ns.x - bot.x;
    return { moveX: Math.abs(dx) > 24 ? Math.sign(dx) : 0, jump: ns.y < bot.y - 80 };
  }
  const tokens = room.sim?.tokens || [];
  let nt = null;
  let nd = 600;
  for (const t of tokens) {
    const d = Math.hypot(t.x - bot.x, t.y - bot.y);
    if (d < nd) {
      nd = d;
      nt = t;
    }
  }
  if (!nt) return null;
  const dx = nt.x - bot.x;
  return { moveX: Math.abs(dx) > 16 ? Math.sign(dx) : 0, jump: nt.y < bot.y - 90 };
}

/** Practice retrains kamikazes into chasers (no bum-rushing newbies). */
function effectiveType(bot, mode) {
  if (mode === 'bot_practice' && bot.botType === 'kamikaze') return 'chaser';
  return bot.botType;
}
