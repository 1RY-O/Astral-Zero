/**
 * Solar Sentinel — Socket.io initialization.
 * ============================================================
 * Sets up the NASA orbital data loop and socket event handlers.
 */

import { ensureLoop, handlePlayerCleanup } from '../game/loop.js';
import { SOCKET_EVENTS } from './events.js';

let loopStarted = false;

/**
 * Initialize Socket.io handlers and start the orbital monitoring loop.
 * @param {import('socket.io').Server} io
 */
export function initSockets(io) {
  // Start the 2 Hz orbital monitoring loop
  if (!loopStarted) {
    ensureLoop(io, SOCKET_EVENTS);
    loopStarted = true;
    console.log('[Solar Sentinel] Orbital monitoring loop started (2 Hz)');
  }

  // Connection handler
  io.on('connection', (socket) => {
    console.log(`[Solar Sentinel] Client connected: ${socket.id}`);

    // Welcome message with contract info
    socket.emit(SOCKET_EVENTS.CONNECTED, {
      socketId: socket.id,
      version: '1.0.0',
      serverName: 'Solar Sentinel',
      timestamp: new Date().toISOString(),
    });

    socket.on('disconnect', () => {
      console.log(`[Solar Sentinel] Client disconnected: ${socket.id}`);
    });

    // Handle player_cleanup: client requests removal of a tracked orbital object.
    // Validation is server-authoritative (energy + active-list check) via loop.js.
    socket.on(SOCKET_EVENTS.PLAYER_CLEANUP, (payload) => {
      const { id } = payload || {};
      const result = handlePlayerCleanup(id);

      if (result.success) {
        socket.emit(SOCKET_EVENTS.CLEANUP_SUCCESS, {
          id: result.id,
          success: true,
          energy: result.energy,
          score: result.score,
          cost: result.cost,
          currentWave: result.currentWave,
          wave: result.wave,
        });
        console.log(
          `[Solar Sentinel] ✅ Cleanup authorized for object ${id} (client: ${socket.id}) ` +
            `→ energy=${result.energy}, score=${result.score}, wave=${result.currentWave}`
        );
      } else {
        socket.emit(SOCKET_EVENTS.CLEANUP_FAILED, {
          id: id === undefined || id === null ? null : String(id),
          success: false,
          reason: result.reason,
          energy: result.energy,
          cost: result.cost,
        });
        console.log(
          `[Solar Sentinel] ❌ Cleanup failed for object ${id} (client: ${socket.id}): ${result.reason}`
        );
      }
    });
  });

  console.log('[Solar Sentinel] Socket.io initialized');
}
