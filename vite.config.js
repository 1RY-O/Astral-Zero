/**
 * Solar Sentinel - Vite configuration.
 *
 * Bundles the vanilla JS frontend (Canvas 2D + Socket.io client) and serves
 * `public/` at the site root. No game engine chunks — the whole client is a
 * few KB of ES modules.
 */
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build also works when served from a sub-path
  // (e.g. by the Express + Socket.io backend).
  base: './',

  server: {
    port: 5173,
    // Bind on all interfaces so the dashboard can be tested on phones.
    host: true,
    open: false,
  },

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
  },
});
