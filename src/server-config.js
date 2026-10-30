/**
 * Debris Derby — central backend configuration.
 *
 * Single place for every magic number and environment variable. The server
 * owns config, the leaderboard, run validation, and TLE propagation only.
 * It does not simulate gameplay.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM has no __dirname — rebuild it from the module URL.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');

export const CELESTRAK_GP_URL =
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json';

export const CELESTRAK_ATTRIBUTION = 'Orbital data: Celestrak (celestrak.org)';

const config = {
  // -- Identity -------------------------------------------------------------
  gameName: 'Debris Derby',
  gameVersion: '0.3.0',

  // -- Networking -----------------------------------------------------------
  port: parseInt(process.env.PORT, 10) || 3000,
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // -- Static hosting -------------------------------------------------------
  distDir: process.env.DIST_DIR || path.join(repoRoot, 'dist'),
  publicDir: process.env.PUBLIC_DIR || path.join(repoRoot, 'public'),

  // -- Ambient catalog ------------------------------------------------------
  catalog: {
    tickHz: 2,
    tickIntervalMs: 500,
    refreshIntervalMs: 30 * 60 * 1000, // 30 minutes
    retryIntervalMs: 60 * 1000, // retry a failed fetch after 1 minute
    requestTimeoutMs: 10_000,
    maxObjects: 120, // keep the 2 Hz SGP4 pass bounded
    url: CELESTRAK_GP_URL,
    attribution: CELESTRAK_ATTRIBUTION,
  },

  // -- Leaderboard ----------------------------------------------------------
  leaderboard: {
    maxRuns: 500,
    defaultLimit: 10,
    maxLimit: 50,
    submitRateLimitMs: 3000,
  },
};

export default config;
