/**
 * Debris Derby — REST surface.
 *
 * Config, leaderboard reads, and catalog health only. There is no gameplay
 * authority and no write endpoint that bypasses socket validation.
 */

import express from 'express';

import defaultConfig from '../server-config.js';
import { ambientCatalog } from '../game/ambientCatalog.js';
import { leaderboard as defaultLeaderboard } from '../game/leaderboard.js';
import { LEVELS } from '../game/runValidation.js';
import { SOCKET_EVENTS_VERSION } from '../sockets/events.js';

/**
 * @param {{
 *   config?: typeof defaultConfig,
 *   catalog?: typeof ambientCatalog,
 *   leaderboard?: ReturnType<typeof import('../game/leaderboard.js').createLeaderboard>,
 * }} [options]
 */
export function createApiRouter({
  config = defaultConfig,
  catalog = ambientCatalog,
  leaderboard = defaultLeaderboard,
} = {}) {
  const router = express.Router();

  // GET /api/health — liveness, contract version, and catalog status.
  router.get('/health', (_req, res) => {
    res.json({
      game: config.gameName,
      status: 'ok',
      version: config.gameVersion,
      socketEventsVersion: SOCKET_EVENTS_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      catalog: catalog.stats(),
    });
  });

  // GET /api/levels — the eight locked levels, public fields only.
  router.get('/levels', (_req, res) => {
    res.json({
      levels: LEVELS.map(({ id, name, order }) => ({ id, name, order })),
    });
  });

  // GET /api/leaderboard?levelId=&limit=
  router.get('/leaderboard', (req, res) => {
    let levelId = null;
    if (req.query.levelId !== undefined) {
      const parsed = Number(req.query.levelId);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > LEVELS.length) {
        return res.status(400).json({
          error: 'bad_request',
          message: `levelId must be an integer from 1 to ${LEVELS.length}.`,
        });
      }
      levelId = parsed;
    }

    let limit = config.leaderboard.defaultLimit;
    if (req.query.limit !== undefined) {
      const parsed = Number(req.query.limit);
      if (!Number.isFinite(parsed)) {
        return res.status(400).json({
          error: 'bad_request',
          message: 'limit must be a number.',
        });
      }
      limit = Math.min(
        config.leaderboard.maxLimit,
        Math.max(1, Math.trunc(parsed)),
      );
    }

    const board = leaderboard.list({ levelId, limit });
    return res.json({
      levelId: board.levelId,
      entries: board.entries,
      updatedAt: board.updatedAt,
    });
  });

  return router;
}

export default createApiRouter;
