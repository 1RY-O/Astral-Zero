/**
 * Solar Sentinel — Central backend configuration.
 * ============================================================
 * Single place for every magic number / env var.
 */

import path from 'path';
import { fileURLToPath } from 'url';

// ESM has no __dirname — rebuild it from the module URL.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');

// Solar Sentinel configuration — minimal setup for orbital monitoring
const config = {
  // -- Identity -------------------------------------------------------------
  gameName: 'Solar Sentinel',
  gameVersion: '0.1.0',

  // -- Networking -----------------------------------------------------------
  port: parseInt(process.env.PORT, 10) || 3000,
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // -- Static hosting ---------------------------------------------------------
  distDir: process.env.DIST_DIR || path.join(repoRoot, 'dist'),
  publicDir: process.env.PUBLIC_DIR || path.join(repoRoot, 'public'),

  // -- Solar Sentinel data refresh tuning -------------------------------------
  dataRefreshIntervalMs: 30000,
  orbitalUpdateIntervalMs: 500,
};

export default config;
