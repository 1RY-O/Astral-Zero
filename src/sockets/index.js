/**
 * Debris Derby — Socket.io wiring.
 *
 * Two directions only:
 *  - server -> client: ambient catalog ticks, board updates, notices
 *  - client -> server: validated completed runs
 *
 * There is no player input, movement, cleanup authority, cascade, or
 * game_over event. Those were removed in Phase 2.
 */

import { randomUUID } from 'node:crypto';

import defaultConfig from '../server-config.js';
import { ambientCatalog } from '../game/ambientCatalog.js';
import { leaderboard as defaultLeaderboard } from '../game/leaderboard.js';
import {
  RUN_SUBMIT_ERRORS,
  scoreRun,
  validateRunSubmit,
} from '../game/runValidation.js';
import { SOCKET_EVENTS, SOCKET_EVENTS_VERSION } from './events.js';

const SCORE_TOLERANCE = 2;

/**
 * @param {import('socket.io').Server} io
 * @param {{
 *   catalog?: typeof ambientCatalog,
 *   leaderboard?: ReturnType<typeof import('../game/leaderboard.js').createLeaderboard>,
 *   logger?: Pick<Console, 'log' | 'error' | 'warn'>,
 *   now?: () => number,
 *   rateLimitMs?: number,
 * }} [options]
 */
export function initSockets(
  io,
  {
    catalog = ambientCatalog,
    leaderboard = defaultLeaderboard,
    logger = console,
    now = Date.now,
    rateLimitMs = defaultConfig.leaderboard.submitRateLimitMs,
  } = {},
) {
  catalog.ensureCatalog(io, SOCKET_EVENTS);

  /** @type {Map<string, number>} */
  const lastSubmitAt = new Map();

  io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
    const stats = catalog.stats();
    socket.emit(SOCKET_EVENTS.CONNECTED, {
      socketId: socket.id,
      game: defaultConfig.gameName,
      socketEventsVersion: SOCKET_EVENTS_VERSION,
      serverTime: new Date(now()).toISOString(),
      catalog: {
        tickHz: stats.tickHz,
        objects: stats.objects,
        catalogStatus: stats.catalogStatus,
        sourceUrl: stats.sourceUrl,
        attribution: stats.attribution,
        lastUpdatedAt: stats.lastUpdatedAt,
      },
    });

    socket.on(SOCKET_EVENTS.RUN_SUBMIT, (payload, ack) => {
      const reply = (result) => {
        if (typeof ack === 'function') {
          ack(result);
        }
      };

      const reject = (code, message) => {
        reply({ ok: false, code, message });
        socket.emit(SOCKET_EVENTS.SERVER_NOTICE, {
          code,
          message,
          at: new Date(now()).toISOString(),
        });
      };

      const last = lastSubmitAt.get(socket.id);
      if (last !== undefined && now() - last < rateLimitMs) {
        return reject(
          RUN_SUBMIT_ERRORS.RATE_LIMITED,
          `Wait ${Math.ceil((rateLimitMs - (now() - last)) / 1000)}s before submitting another run.`,
        );
      }

      const validated = validateRunSubmit(payload);
      if (!validated.ok) {
        return reject(validated.code, validated.message);
      }

      const run = validated.value;
      const { score } = scoreRun(run);
      if (Math.abs(score - run.clientScore) > SCORE_TOLERANCE) {
        return reject(
          RUN_SUBMIT_ERRORS.SCORE_MISMATCH,
          `Submitted score ${run.clientScore} does not match server score ${score}.`,
        );
      }

      lastSubmitAt.set(socket.id, now());
      const runId = `run_${randomUUID()}`;
      const { rank, best } = leaderboard.submit({
        runId,
        levelId: run.levelId,
        callsign: run.callsign,
        score,
        seed: run.seed,
      });

      const board = leaderboard.list({
        levelId: run.levelId,
        limit: defaultConfig.leaderboard.defaultLimit,
      });
      io.emit(SOCKET_EVENTS.LEADERBOARD_UPDATE, {
        levelId: run.levelId,
        entries: board.entries,
        updatedAt: board.updatedAt,
      });

      logger.log(
        `[Debris Derby] run accepted: ${runId} level=${run.levelId} score=${score} rank=${rank}`,
      );
      reply({ ok: true, runId, score, rank, best });
    });

    socket.on(SOCKET_EVENTS.DISCONNECT, () => {
      lastSubmitAt.delete(socket.id);
      logger.log(`[Debris Derby] Client disconnected: ${socket.id}`);
    });

    logger.log(`[Debris Derby] Client connected: ${socket.id}`);
  });

  logger.log('[Debris Derby] Socket.io initialized');
}
