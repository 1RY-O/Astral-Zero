/**
 * Astral Zero - Vite configuration.
 *
 * Vite bundles the Phaser 3 game and serves `public/` at the site root, so art
 * dropped into `public/assets/` is fetched at runtime as `/assets/...`.
 */
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build also works when served from a sub-path
  // (e.g. by the future Express + Socket.io backend).
  base: './',

  server: {
    port: 5173,
    // Bind on all interfaces so the game can be tested on other devices
    // (useful when checking touch/mobile controls later).
    host: true,
    open: false,
  },

  build: {
    // Send the (large) Phaser engine into its own chunk so game code can be
    // re-downloaded independently while iterating on levels or enemies.
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
});