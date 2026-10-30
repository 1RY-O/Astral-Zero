/**
 * Debris Derby — backend entry point.
 *
 * Starts Express + Socket.io, the ambient Celestrak catalog, and nothing
 * else. Gameplay lives on the client.
 */

import 'dotenv/config';
import http from 'node:http';
import { Server } from 'socket.io';

import config from './src/server-config.js';
import createApp from './src/app.js';
import { ambientCatalog } from './src/game/ambientCatalog.js';
import { initSockets } from './src/sockets/index.js';

const app = createApp();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: config.corsOrigin,
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1e6,
});

initSockets(io);

httpServer.listen(config.port, () => {
  console.log('');
  console.log('  ★ Debris Derby backend online ★');
  console.log(`  → HTTP + Socket.io : http://localhost:${config.port}`);
  console.log(`  → Health           : http://localhost:${config.port}/api/health`);
  console.log(`  → Levels           : http://localhost:${config.port}/api/levels`);
  console.log(`  → Leaderboard      : http://localhost:${config.port}/api/leaderboard`);
  console.log(`  → Celestrak source : ${config.catalog.url}`);
  console.log('  → Contract         : see websocket_events.md');
  console.log('');
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Debris Derby] ${signal} received, closing server...`);
  ambientCatalog.stop();
  io.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
