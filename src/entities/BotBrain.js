/**
 * Astral Zero — BotBrain (FRONTEND fallback AI).
 * ============================================================
 * Bots used to stand still because the Phase 2 backend fills the roster but
 * ships no AI tick. This module keeps Bot Practice playable in the meantime by
 * driving bots LOCALLY — and, crucially, disables itself the instant the server
 * starts sending real bot positions.
 *
 * THE HANDOFF (why this is not dead code until the server catches up)
 * `MatchStream.isServerDriving()` flips false only after `serverSilentMs` with
 * no entity data, so:
 *
 *   server silent  → BotBrain owns the bots → they walk, chase and shoot
 *   server talking → BotBrain yields entirely → server positions win
 *
 * There is no flag to flip and no scene-level branching; ArenaScene simply asks
 * who is driving. The day the backend lands its AI this file quietly stops
 * mattering and nothing else in the codebase changes.
 *
 * BEHAVIOUR (deliberately simple, and bounded)
 *   wander  → pick a direction, walk, occasionally jump
 *   engage  → a target within range → close distance, face it, shoot
 *   respect → never leave the arena, never act while dead
 *
 * This is a placeholder, not a real AI: no pathfinding, no cover, no difficulty
 * tuning. It exists so the mode is playable and the networking, combat and HUD
 * code can be exercised end-to-end against moving targets.
 */

import { COMBAT } from '../config/netConfig.js';

/** Tunables for the fallback brain (arena px / seconds). */
const BRAIN = {
  /** How far a bot notices a target. */
  aggroRange: 420,
  /** Preferred distance it tries to hold while engaging. */
  preferredRange: 190,
  /** Chance per think-tick of changing wander direction. */
  wanderJitter: 0.04,
  /** Probability per think-tick of a jump (clears the low platforms). */
  jumpChance: 0.02,
  /** Think interval in ms — AI decisions do not need every frame. */
  thinkIntervalMs: 180,
  /** Arena bounds the brain refuses to walk outside. */
  bounds: { minX: 70, maxX: 1210 },
};

export class BotBrain {
  /**
   * @param {object} opts
   * @param {() => Array<object>} opts.getTargets - Live entities (humans + bots).
   * @param {string} opts.selfId
   */
  constructor({ getTargets, selfId }) {
    this.getTargets = getTargets;
    this.selfId = selfId;

    /** Per-bot memory, keyed by entity id. */
    this._state = new Map();
  }

  /**
   * Per-bot decision state, created on first sight.
   * @param {string} id
   * @returns {object}
   */
  _stateFor(id) {
    let state = this._state.get(id);
    if (!state) {
      state = {
        dir: Math.random() < 0.5 ? -1 : 1,
        lastThinkAt: 0,
        nextShotAt: 0,
        mode: 'wander',
        aimAngle: 0,
        approachDir: 0,
        jump: false,
      };
      this._state.set(id, state);
    }
    return state;
  }

  /**
   * Decide what every bot should do, and hand back an intent per bot —
   * deliberately the SAME `{ moveX, jumpPressed, aimAngle }` shape the local
   * player produces, so nothing downstream cares who is driving.
   *
   * @param {number} nowMs
   * @param {(id: string, fallback: object) => object} [sampleAt] - Interpolated
   *   world lookup, so the brain reacts to where a target is DRAWN rather than
   *   where its last packet said it was (possibly 100 ms stale).
   * @returns {Map<string, {moveX: number, jumpPressed: boolean, aimAngle: number, firing: boolean}>}
   */
  thinkAll(nowMs, sampleAt = null) {
    const out = new Map();
    const targets = this.getTargets();

    for (const bot of targets) {
      if (!bot.isBot || bot.hp <= 0) continue;

      const state = this._stateFor(bot.id);

      // Decisions are throttled; between ticks the previous intent is reused so
      // movement stays smooth rather than stuttering at the think rate.
      if (nowMs - state.lastThinkAt >= BRAIN.thinkIntervalMs) {
        state.lastThinkAt = nowMs;
        this._decide(bot, state, targets, sampleAt, nowMs);
      }

      out.set(bot.id, {
        moveX: state.mode === 'engage' ? state.approachDir : state.dir,
        jumpPressed: state.jump,
        aimAngle: state.aimAngle,
        firing: state.mode === 'engage' && nowMs >= state.nextShotAt,
      });

      state.jump = false; // jump is an edge; consume it after one frame
    }

    return out;
  }
/**
   * One decision tick for a single bot.
   * @param {object} bot
   * @param {object} state
   * @param {object[]} targets
   * @param {Function|null} sampleAt
   * @param {number} nowMs
   * @returns {void}
   */
  _decide(bot, state, targets, sampleAt, nowMs) {
    // --- Acquire the nearest living target within aggro range ----------------
    let nearest = null;
    let nearestDist = Infinity;
    for (const other of targets) {
      if (other.id === bot.id || other.hp <= 0) continue;
      const pos = sampleAt ? sampleAt(other.id, other) : other;
      const dist = Math.hypot(pos.x - bot.x, pos.y - bot.y);
      if (dist < nearestDist && dist <= BRAIN.aggroRange) {
        nearestDist = dist;
        nearest = pos;
      }
    }

    if (!nearest) {
      // --- Wander -----------------------------------------------------------
      state.mode = 'wander';
      if (Math.random() < BRAIN.wanderJitter) state.dir = Math.random() < 0.5 ? -1 : 1;
      // Steer away from the arena walls instead of pacing into them.
      if (bot.x < BRAIN.bounds.minX) state.dir = 1;
      if (bot.x > BRAIN.bounds.maxX) state.dir = -1;
      state.aimAngle = state.dir > 0 ? 0 : Math.PI;
      state.jump = Math.random() < BRAIN.jumpChance;
      return;
    }

    // --- Engage -------------------------------------------------------------
    state.mode = 'engage';
    const dx = nearest.x - bot.x;
    const dy = nearest.y - bot.y;
    state.aimAngle = Math.atan2(dy, dx);

    // Close in if too far, back off if hugging us.
    if (nearestDist > BRAIN.preferredRange) state.approachDir = Math.sign(dx) || 1;
    else if (nearestDist < BRAIN.preferredRange * 0.6) state.approachDir = -Math.sign(dx) || -1;
    else state.approachDir = 0;

    // Fire on a cooldown rather than every frame.
    if (nearestDist <= COMBAT.range * 0.8 && nowMs >= state.nextShotAt) {
      state.nextShotAt = nowMs + COMBAT.fireCooldown * 1000 * 3; // bots are slower than players
    }

    // Hop while closing, so bots can reach platforms instead of headbutting them.
    state.jump = state.approachDir !== 0 && Math.random() < BRAIN.jumpChance * 2.5;
  }

  /** Forget all per-bot memory (match teardown). @returns {void} */
  reset() {
    this._state.clear();
  }
}

export default BotBrain;