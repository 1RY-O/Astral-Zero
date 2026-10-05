/**
 * Astral Zero — Bot factory (Phase 2).
 * ============================================================
 * Builds the friendly-practice bot roster that fills every room:
 *  - bot_practice: bots ONLY (no stranger humans ever grouped in).
 *  - ffa / tdm:    bots top up whatever humans matchmaking grouped,
 *    so a solo tester still gets a lively arena.
 *
 * Bot shape (authoritative, sent inside `room_joined` / `match_state`):
 *  { id, botId, name, botType, team, x, y, hp, maxHp, isBot: true }
 *  - `id` AND `botId` are both set (Phaser can key on either).
 *  - `team`: null in ffa/practice, 'red'|'blue' in tdm (alternate).
 *  - Spawn positions are spread across the junkyard arena with jitter
 *    so clients can spawn everyone without overlap.
 */

import config from '../server-config.js';
import { resolveMap } from '../game/maps.js';

const BOT_TYPES = ['chaser', 'shooter', 'brute', 'kamikaze'];

let botSeq = 0;

/**
 * Map-table spawn (Phase 5): floor spread + platform tops with jitter,
 * so bots materialise ON surfaces of whatever arena the room rolled.
 */
function mapSpawn(map, index) {
  const pts = map.spawns && map.spawns.length ? map.spawns : [{ x: 640, y: 650 }];
  const p = pts[index % pts.length];
  const jitter = () => (Math.random() - 0.5) * 60;
  return { x: Math.round(p.x + jitter()), y: p.y };
}

/**
 * Make N bots for a mode.
 * @param {number} count
 * @param {string} mode 'ffa' | 'tdm' | 'bot_practice'
 * @param {string} mapId (stored on bot for future multi-map)
 * @returns {object[]} bots
 */
export function makeBots(count, mode = 'ffa', mapId = 'junkyard') {
  const names = config.rooms?.botNames || ['Scrap Bot'];
  const map = resolveMap(mapId); // 'junkyard' et al → canonical table
  const bots = [];
  for (let i = 0; i < count; i += 1) {
    botSeq += 1;
    const { x, y } = mapSpawn(map, i);
    const hp = 40 + ((botSeq * 13) % 40); // deterministic-ish variety: 40–79
    bots.push({
      id: `bot_${Date.now().toString(36)}_${botSeq}`,
      botId: `bot_${botSeq}`, // short alias (Phase 1 `bot_spawn` compat)
      name: names[(botSeq - 1) % names.length],
      botType: BOT_TYPES[(botSeq - 1) % BOT_TYPES.length],
      team: mode === 'tdm' ? (i % 2 === 0 ? 'red' : 'blue') : null,
      x,
      y,
      hp,
      maxHp: hp,
      mapId,
      isBot: true,
    });
  }
  return bots;
}

/**
 * How many bots does a room need to feel full?
 * @param {string} mode
 * @param {number} humanCount
 */
export function botsNeeded(mode, humanCount) {
  const tuning = config.gameModes?.[mode] || {};
  if (mode === 'bot_practice') {
    // Practice = 1 human vs a crowd. Target 6 total entities.
    const target = tuning.targetTotal || 6;
    return Math.max(0, target - humanCount);
  }
  if (mode === 'tdm') {
    // 4v4 = 8 total; fill missing slots with bots.
    return Math.max(0, 8 - humanCount);
  }
  // ffa: top up to targetTotal (default 6), never exceed maxPlayers.
  const target = tuning.targetTotal || 6;
  const max = tuning.maxPlayers || 10;
  return Math.max(0, Math.min(target, max) - humanCount);
}
