/**
 * Astral Zero — Backend entry point.
 * ============================================================
 * Starts the Express + Socket.io server.
 *
 * Responsibilities (Phase 1 only):
 *  1. Load config (port, paths).
 *  2. Build the Express app (see src/app.js) — serves Phaser
 *     game from the `public/` folder.
 *  3. Attach Socket.io (see src/sockets/) — event skeleton only,
 *     no game logic / bot AI / rooms yet.
 *  4. Listen on PORT.
 *
 * Frontend engineers: you only need `public/` + `websocket_events.md`.
 * Just open http://localhost:3000 after `npm run dev:server`.
 *
 * NOTE: this repo is `"type": "module"`, so the backend uses ESM
 * `import` syntax (same as the Phaser/Vite frontend).
 */

import 'dotenv/config'; // loads .env — see .env.example
import http from 'http';
import { Server } from 'socket.io';
import config from './src/server-config.js';
import createApp from './src/app.js';
import { initSockets } from './src/sockets/index.js';

// --- 1. Express app (static hosting + REST stub) ---------------------------
const app = createApp();

// --- 2. Raw HTTP server (required so Express + Socket.io share a port) ----
const httpServer = http.createServer(app);

// --- 3. Socket.io server ----------------------------------------------------
// CORS is left open for local Phaser development (Vite / Live Server /
// file:// testing). Lock `CORS_ORIGIN` down in production.
const io = new Server(httpServer, {
  cors: {
    origin: config.corsOrigin, // "*" by default in Phase 1
    methods: ['GET', 'POST'],
  },
  // NOTE: we keep all payloads as plain JSON objects (see websocket_events.md).
  maxHttpBufferSize: 1e6, // 1 MB — prevents accidental huge payloads
});

// Register all Phase 1 event handlers (skeleton: log + acknowledge only).
initSockets(io);

// --- 4. Listen ---------------------------------------------------------------
httpServer.listen(config.port, () => {
  console.log('');
  console.log('  ★ Astral Zero backend online ★');
  console.log(`  → HTTP + Socket.io : http://localhost:${config.port}`);
  console.log(`  → Phaser root      : http://localhost:${config.port}/  (serves public/)`);
  console.log(`  → Health check     : http://localhost:${config.port}/api/health`);
  console.log(`  → Contract         : see websocket_events.md`);
  console.log('');
});

// Graceful shutdown so nodemon / Ctrl+C doesn't leave the port hanging.
process.on('SIGTERM', () => {
  console.log('[Astral Zero] SIGTERM received, closing server...');
  httpServer.close(() => process.exit(0));
});
