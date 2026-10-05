/**
 * Astral Zero — Tiny REST router (status / info only).
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
import { SOCKET_EVENTS, SOCKET_EVENTS_VERSION } from '../sockets/events.js';
import { stats as playerStats } from '../players/playerStore.js';
import { stats as partyStats } from '../parties/partyManager.js';
import { stats as roomStats } from '../rooms/roomManager.js';
import { stats as queueStats } from '../matchmaking/matchmakingManager.js';

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
  // Live counts are best-effort (all in-memory maps). Never throws —
  // /api/info must stay up even if a manager has an odd day.
  let counts = { online: 0, parties: 0, rooms: 0, queues: null };
  try {
    counts.online = playerStats().onlineSessions || 0;
    counts.parties = partyStats().partyCount || 0;
    counts.rooms = roomStats().roomCount || 0;
    counts.queues = queueStats();
  } catch {
    /* keep defaults */
  }
  res.json({
    game: config.gameName,
    version: config.gameVersion,
    // Increment this whenever websocket_events.md gains/breaks an event.
    socketEventsVersion: SOCKET_EVENTS_VERSION,
    transport: 'socket.io (JSON payloads, see websocket_events.md)',
    supportedSocketEvents: Object.values(SOCKET_EVENTS),
    // -- Phase 2: locked design surface (mirrors websocket_events.md §7) --
    gameModes: ['ffa', 'tdm', 'bot_practice', 'scrap_collector'],
    maps: [
      { id: 'orbital_junkyard', name: 'Orbital Junkyard' },
      { id: 'reactor_core', name: 'Reactor Core' },
      { id: 'biodome', name: 'Biodome' },
    ],
    limits: {
      partyMaxSize: config.party?.maxSize || 4,
      partyCodeLength: config.party?.codeLength || 6,
      ffaMaxPlayers: config.gameModes?.ffa?.maxPlayers || 10,
      tdmTeamSize: config.gameModes?.tdm?.teamSize || 4,
      scrapMaxPlayers: config.gameModes?.scrap_collector?.maxPlayers || 8,
      maxSpectators: config.rooms?.maxSpectators || 8,
    },
    counts,
    // -- Phase 3: sim surface (mirrors websocket_events.md §13) --
    sim: {
      tickHz: config.sim?.tickHz || 20,
      arena: {
        width: config.sim?.arena?.width || 1280,
        height: config.sim?.arena?.height || 720,
      },
      scoring: {
        ffa: { killLimit: config.gameModes?.ffa?.killLimit || 10, durationSec: config.gameModes?.ffa?.durationSec || 180 },
        tdm: { scoreLimit: config.gameModes?.tdm?.scoreLimit || 25, durationSec: config.gameModes?.tdm?.durationSec || 240 },
        bot_practice: { durationSec: config.gameModes?.bot_practice?.durationSec || 180 },
        scrap_collector: { bankLimit: config.gameModes?.scrap_collector?.bankLimit || 20, durationSec: config.gameModes?.scrap_collector?.durationSec || 180 },
      },
      // -- Phase 4: fairness + feel surface (mirrors §18–§20) --
      lagComp: {
        historySamples: config.sim?.lagComp?.historySamples || 40,
        gracePx: config.sim?.lagComp?.gracePx ?? 26,
      },
      reconnectGraceSec: config.sim?.reconnectGraceSec || 60,
      overtimeSec: config.sim?.overtimeSec || 60,
    },
    roadmap: {
      implemented: [
        'static hosting (public/)',
        'socket skeleton (echo only)',
        'party system (create/join/leave/invite, leader start)',
        'friends system (add/remove/list, persistent in-memory)',
        'matchmaking (solo queue + party start + bot fill + first-match protection)',
        'rooms (roster + match_state lifecycle + match_end → lobby)',
        'authoritative sim (20 Hz tick, server physics, entity snapshots)',
        'bot AI (chase/strafe/flee, team-aware, per-mode temperament)',
        'server combat (projectiles, melee arcs, death/respawn)',
        'scoring + win conditions (ffa/tdm limits, practice timer)',
        'lag compensation (rewind grace-band hit tests)',
        'bot personalities (easy/normal/aggressive, reaction, cohesion)',
        'killfeed medals (first blood + streak tiers)',
        'reconnect grace + late join + tdm overtime',
      ],
      notYet: [
        'lag compensation / server-side prediction reconciliation',
        'raycast line-of-sight (distance + height check for now)',
        'puzzles, jumpscares, rocket-jump validation',
        'persistent DB (all state is still in-memory)',
      ],
    },
  });
});

export default router;
