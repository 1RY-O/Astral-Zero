/**
 * Solar Sentinel — Backend entry point.
 * ============================================================
 * Starts the Express + Socket.io server.
 *
 * Responsibilities:
 *  1. Load config (port, paths).
 *  2. Build the Express app (see src/app.js).
 *  3. Attach Socket.io (see src/sockets/) — NASA orbital monitoring.
 *  4. Listen on PORT.
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
const io = new Server(httpServer, {
  cors: {
    origin: config.corsOrigin,
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1e6, // 1 MB — prevents accidental huge payloads
});

// Register all Socket.io event handlers
initSockets(io);

// --- 4. Listen ---------------------------------------------------------------
httpServer.listen(config.port, () => {
  console.log('');
  console.log('  ★ Solar Sentinel backend online ★');
  console.log(`  → HTTP + Socket.io : http://localhost:${config.port}`);
  console.log(`  → Dashboard root   : http://localhost:${config.port}/`);
  console.log(`  → Health check     : http://localhost:${config.port}/api/health`);
  console.log(`  → Orbital stats    : http://localhost:${config.port}/api/stats`);
  console.log(`  → Contract         : see websocket_events.md`);
  console.log('');
});

// Graceful shutdown so nodemon / Ctrl+C doesn't leave the port hanging.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Solar Sentinel] ${signal} received, closing server...`);
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
