/**
 * Debris Derby — Socket.io event registry (single source of truth).
 *
 * Names only. Payload shapes live in websocket_events.md and are enforced by
 * src/sockets/index.js and src/game/runValidation.js.
 *
 * Contract version 2.0.0-debris-derby is a full break from the Solar
 * Sentinel contract. The server is not authoritative for gameplay: it emits
 * an ambient TLE catalog and accepts validated completed runs.
 */

export const SOCKET_EVENTS_VERSION = '2.0.0-debris-derby';

export const SOCKET_EVENTS = Object.freeze({
  // Socket.io built-ins
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',

  // Lifecycle
  CONNECTED: 'connected', // S->C: socket id, contract version, catalog status

  // Ambient catalog (server -> client, 2 Hz)
  AMBIENT_CATALOG: 'ambient_catalog',

  // Completed-run submission (client -> server, ack) and board update
  RUN_SUBMIT: 'run_submit',
  LEADERBOARD_UPDATE: 'leaderboard_update',

  // Uniform server notice envelope
  SERVER_NOTICE: 'server_notice',
});

export const SERVER_NOTICE_CODES = Object.freeze({
  CATALOG_UNAVAILABLE: 'CATALOG_UNAVAILABLE',
  CATALOG_STALE: 'CATALOG_STALE',
  BAD_PAYLOAD: 'BAD_PAYLOAD',
  BAD_LEVEL: 'BAD_LEVEL',
  BAD_SEED: 'BAD_SEED',
  RATE_LIMITED: 'RATE_LIMITED',
  SCORE_MISMATCH: 'SCORE_MISMATCH',
});
