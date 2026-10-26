/**
 * Solar Sentinel — Tiny REST router (status / info only).
 * ============================================================
 * Phase 1 exposes:
 *  - GET /api/health → "is the server up?" (load balancers, uptime bots)
 *  - GET /api/info   → game name, version, socket contract version,
 *                      and which features are (not) implemented yet.
 *
 * Phase 2 keeps BOTH shapes byte-compatible (only ADDS fields):
 *  - /api/info gains `gameModes`, `limits` (party size, room caps),
 *    live `counts` (online/parties/rooms/queues), and an updated roadmap.
 *
 * Phase 3 adds `sim` (tickHz, arena, scoring limits) the same way —
 * additive only, so old boot checks never break.
 *
 * Frontend boot sequence suggestion:
 *  1. fetch('/api/info') → check `socketEventsVersion` matches the
 *     version your Phaser client was coded against.
 *  2. io(serverUrl) → open the Socket.io connection.
 */

import express from 'express';
import config from '../server-config.js';
import { SOCKET_EVENTS, SOCKET_EVENTS_VERSION, GAME_MODE_LIST } from '../sockets/events.js';

const router = express.Router();

// GET /api/health — minimal liveness probe
router.get('/health', (_req, res) => {
  res.json({
    game: config.gameName,
    status: 'ok',
    version: config.gameVersion,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// GET /api/info — what can a client expect from this server?
router.get('/info', (_req, res) => {
  // Orbital monitoring stats — no player/party/room queues in Solar Sentinel
  const counts = { online: 0, parties: 0, rooms: 0, queues: null };
  res.json({
    game: config.gameName,
    version: config.gameVersion,
    // Increment this whenever websocket_events.md gains/breaks an event.
    socketEventsVersion: SOCKET_EVENTS_VERSION,
    transport: 'socket.io (JSON payloads, see websocket_events.md)',
    supportedSocketEvents: Object.values(SOCKET_EVENTS),
    // Solar Sentinel orbital monitoring surface
    orbital: {
      trackedObjects: 0,
      updateIntervalMs: 500,
      dataFetchIntervalMs: 30000,
      nasaApiEndpoint: 'https://api.nasa.gov/api/tle/{norad_id}',
    },
    // Mode info (kept for frontend compatibility)
    gameModes: GAME_MODE_LIST,
    maps: [
      { id: 'earth_orbit', name: 'Earth Orbit Monitoring' },
    ],
    limits: {
      maxTrackedObjects: 100,
    },
    counts,
    roadmap: {
      implemented: [
        'NASA TLE data fetching',
        'satellite.js orbital propagation',
        '2 Hz simulation loop',
        'Socket.io orbital_snapshot events',
        'GET /api/stats endpoint',
      ],
      notYet: [
        'Historical trajectory analysis',
        'Machine learning collision prediction',
        'Automated mitigation strategy suggestions',
      ],
    },
  });
});

// GET /api/stats — orbital debris monitoring statistics
router.get('/stats', async (_req, res) => {
  try {
    const loopModule = await import('../game/loop.js');
    const stats = loopModule.stats ? loopModule.stats() : {};
  } catch (_e) {
    // Loop module not initialized yet — return zero stats
  }
  
  const defaultStats = {
    objectsTracked: 0,
    globalThreatLevel: 'Low',
    updateIntervalMs: 500,
    dataFetchIntervalMs: 30000,
    lastDataFetchAge: 0,
  };
  
  // Try to get actual stats from loop module
  let actualStats = defaultStats;
  try {
    const loopModule = await import('../game/loop.js');
    if (loopModule && loopModule.stats) {
      actualStats = loopModule.stats();
    }
  } catch (_e) {
    // Use defaults
  }
  
  res.json({
    game: config.gameName,
    version: config.gameVersion,
    trackedObjects: actualStats.objectsTracked || 0,
    globalThreatLevel: actualStats.globalThreatLevel || 'Low',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    orbital: {
      updateIntervalMs: actualStats.updateIntervalMs || 500,
      dataFetchIntervalMs: actualStats.dataFetchIntervalMs || 30000,
      lastDataFetchAge: actualStats.lastDataFetchAge || 0,
    }
  });
});

// ---------------------------------------------------------------------------
// Tests — server-authoritative game-layer test seams (dev only, not public)
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV !== 'production') {
  router.post('/dev/force-cascade', async (_req, res) => {
    try {
      const loopModule = await import('../game/loop.js');
      const result =
        loopModule?.triggerKesslerCascadeNow?.() ?? {
          success: false,
          reason: 'trigger_kessler_cascade_not_found',
        };
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, reason: error.message });
    }
  });
}

export default router;
