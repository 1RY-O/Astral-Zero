/**
 * Solar Sentinel — Express app factory.
 * ===========================================================
 * Builds the HTTP layer:
 *  - Serves the built dashboard from `dist/` (after `npm run build`).
 *  - Serves raw assets from `public/` (Vite static dir, always mounted).
 *  - Exposes JSON REST endpoints for NASA orbital debris monitoring
 *    (useful for load balancers + dashboard boot checks).
 *  - No game logic here by design — that lives in src/game/ and src/sockets/
 *    (orbital monitoring authority).
 *
 * Local dev has TWO servers (different ports, different jobs):
 *  - `npm run dev`         → Vite on :5173, hot-reloads the dashboard.
 *  - `npm run dev:server`  → this backend on :3000, sockets + REST.
 * The dashboard client connects back via `io('http://localhost:3000')`
 * (see websocket_events.md §5). In production (`npm start` after
 * `npm run build`) this ONE server hosts everything: dashboard + API + sockets.
 *
 * @returns {import('express').Express} configured Express app
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import config from './server-config.js';
import apiRoutes from './routes/api.js';

function createApp() {
  const app = express();

  // --- Middleware ---------------------------------------------------------
  // JSON body parsing for future REST calls (NASA data, status checks, ...).
  app.use(express.json({ limit: '256kb' }));

  // Permissive CORS in Phase 1 for easy dashboard iteration
  // (Vite on :5173 talking to backend on :3000 is cross-origin!).
  app.use(cors({ origin: config.corsOrigin }));

  // Tiny request logger (no dependency needed). Swap for morgan/pino later.
  app.use((req, _res, next) => {
    console.log(`[Solar Sentinel HTTP] ${req.method} ${req.url}`);
    next();
  });

  // --- REST -----------------------------------------------------------------
  // Mounted BEFORE static so /api/* never collides with a dashboard asset file.
  app.use('/api', apiRoutes);

  // --- Static hosting -------------------------------------------------------
  // 1. `dist/` — the Vite production build (`npm run build`).
  //    Only mounted when the folder exists, so `dev:server` works
  //    before the frontend has ever been built.
  if (fs.existsSync(config.distDir)) {
    console.log(`[Solar Sentinel] serving built dashboard from ${config.distDir}`);
    app.use(express.static(config.distDir));
  } else {
    console.log('[Solar Sentinel] no dist/ yet — run `npm run build` to host the dashboard here.');
  }

  // 2. `public/` — Vite static assets (always mounted).
  //    e.g. public/assets/logo.png → http://localhost:3000/assets/logo.png
  app.use(express.static(config.publicDir));

  // --- SPA fallback ---------------------------------------------------------
  // Deep links (or a stale dashboard route) fall back to the built index.html.
  // Without a build yet, return a JSON hint instead of a blank page.
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    const builtIndex = path.join(config.distDir, 'index.html');
    if (fs.existsSync(builtIndex)) {
      return res.sendFile(builtIndex);
    }
    if (req.accepts('html')) {
      return res.status(200).send(
        `<h1>★ Solar Sentinel dashboard ★</h1>` +
          `<p>API + Socket.io are live. No <code>dist/</code> build found yet — ` +
          `run the dashboard with <code>npm run dev</code> (Vite :5173) or ` +
          `<code>npm run build</code> then refresh.</p>`,
      );
    }
    next();
  });

  // --- 404 JSON (only reached for /api/* misses) ------------------------------
  app.use((req, res) => {
    res.status(404).json({
      game: config.gameName,
      error: 'not_found',
      message: `No route for ${req.method} ${req.originalUrl}`,
      hint: 'Dashboard build lives in dist/. API lives under /api/*.',
    });
  });

  return app;
}

export default createApp;
