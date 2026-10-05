/**
 * Astral Zero — Snapshot builder (Phase 3).
 * ============================================================
 * The tick loop simulates at 20 Hz; every tick each `playing` room emits:
 *
 *   entity_snapshot = {
 *     roomId, tick, serverTime, phase,
 *     entities: [ { id, socketId/botId, name, team, isBot,
 *                   x, y, vx, vy, facing, hp, maxHp, alive, seq,
 *                   score, kills, deaths, time }, ... ]
 *   }
 *
 * INTERPOLATION CONTRACT (frontend SnapshotBuffer):
 *  - `time` == snapshot `serverTime` for every entity in the batch, so all
 *    samples in one batch share a timestamp (bracket cleanly, no shear).
 *  - `tick` is monotonic per room; clients drop `tick` < last seen to ignore
 *    reordered batches without comparing every entity.
 *  - `serverTime` is Date.now() at broadcast; clients ALSO stamp arrival with
 *    their local clock, so cross-clock skew never breaks rendering.
 *  - Dead entities STAY in the snapshot with alive:false (clients play death
 *    FX from `entity_death`, then keep rendering the corpse marker until
 *    `entity_respawn` — no pop-out, no ghost).
 *
 * Also builds the legacy `bot_update` subset in the EXACT Phase 1 shape
 * ({ bots, serverTick, timestamp }) so old listeners + the client's
 * server-silence watchdog keep working while rendering moves to snapshots.
 */

import { toWire } from './entities.js';

/**
 * Full-room snapshot DTO (pure — no io).
 *
 * Phase 5: `tokens` rides along (live scrap tokens; empty in other modes).
 * Additive — old readers ignore it, scrap HUDs render pickups from it.
 * @param {object} room internal room (room.sim.entities is the live Map)
 * @param {number} now server ms
 */
export function buildSnapshot(room, now = Date.now()) {
  const tick = room.sim?.tick || 0;
  const entities = [];
  if (room.sim?.entities) {
    for (const e of room.sim.entities.values()) {
      entities.push(toWire(e, now));
    }
  }
  return {
    roomId: room.id,
    tick,
    serverTime: now,
    phase: room.phase,
    entities,
    tokens: (room.sim?.tokens || []).map((t) => ({ ...t, time: now })),
  };
}

/**
 * Legacy bot-only subset (Phase 1 shape + hp/alive/state for Phase 3 life).
 * Broadcast at half the snapshot rate — enough for the client's
 * `serverSilentMs` watchdog and for old single-purpose bot renderers.
 */
export function buildBotUpdate(room, now = Date.now()) {
  const bots = [];
  if (room.sim?.entities) {
    for (const e of room.sim.entities.values()) {
      if (!e.isBot) continue;
      bots.push({
        botId: e.id,
        x: Math.round(e.x * 10) / 10,
        y: Math.round(e.y * 10) / 10,
        vx: Math.round(e.vx * 10) / 10,
        vy: Math.round(e.vy * 10) / 10,
        hp: Math.max(0, Math.round(e.hp)),
        state: e.alive ? e.aiState || 'chase' : 'dead',
      });
    }
  }
  return {
    bots,
    serverTick: room.sim?.tick || 0,
    timestamp: now,
  };
}
