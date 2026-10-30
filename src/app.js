/**
 * Debris Derby — Express app factory.
 *
 * Hosts the built client, the REST surface, and the Socket.io handshake
 * (server.js owns the socket server). No game logic lives here.
 *
 * Local dev has two processes:
 *  - `npm run dev`        Vite on :5173, proxies /api and /socket.io to :3000
 *  - `npm run dev:server` this backend on :3000
 * Production (`npm run build` then `npm start`) is one process.
 */

import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';

import defaultConfig from './server-config.js';
import { ambientCatalog } from './game/ambientCatalog.js';
import { leaderboard as defaultLeaderboard } from './game/leaderboard.js';
import { createApiRouter } from './routes/api.js';

/**
 * @param {{
 *   config?: typeof defaultConfig,
 *   catalog?: typeof ambientCatalog,
 *   leaderboard?: ReturnType<typeof import('./game/leaderboard.js').createLeaderboard>,
 *   logger?: Pick<Console, 'log'>,
 * }} [options]
 */
export function createApp({
  config = defaultConfig,
  catalog = ambientCatalog,
  leaderboard = defaultLeaderboard,
  logger = console,
} = {}) {
  const app = express();
  app.disable('x-powered-by');

  app.use(express.json({ limit: '64kb' }));
  app.use(cors({ origin: config.corsOrigin }));

  app.use((req, _res, next) => {
    logger.log(`[Debris Derby HTTP] ${req.method} ${req.url}`);
    next();
  });

  // API first, so /api/* never collides with a built asset.
  app.use(
    '/api',
    createApiRouter({ config, catalog, leaderboard }),
  );

  // Built client (after `npm run build`).
  if (fs.existsSync(config.distDir)) {
    logger.log(`[Debris Derby] serving built client from ${config.distDir}`);
    app.use(express.static(config.distDir));
  } else {
    logger.log('[Debris Derby] no dist/ yet — run `npm run build` to host the client.');
  }

  // Vite static assets.
  app.use(express.static(config.publicDir));

  // SPA fallback for deep links.
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();

    const builtIndex = path.join(config.distDir, 'index.html');
    if (fs.existsSync(builtIndex)) {
      return res.sendFile(builtIndex);
    }
    if (req.accepts('html')) {
      return res.status(200).send(
        '<h1>Debris Derby API</h1>' +
          '<p>REST and Socket.io are live. No <code>dist/</code> build found — ' +
          'run <code>npm run dev</code> for Vite or <code>npm run build</code> then refresh.</p>',
      );
    }
    return next();
  });

  // JSON 404 for anything else.
  app.use((req, res) => {
    res.status(404).json({
      game: config.gameName,
      error: 'not_found',
      message: `No route for ${req.method} ${req.originalUrl}`,
    });
  });

  return app;
}

export default createApp;
