/**
 * Debris Derby — Vite configuration.
 *
 * The client is split in two:
 *  - React owns the UI chrome (menus, HUD overlays, mission report).
 *  - A single Canvas 2D surface is created and driven imperatively outside
 *    React's render cycle (see ARCHITECTURE.md).
 *
 * In development, REST and Socket.io traffic is proxied to the Express
 * server on :3000 so the browser sees one origin.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',

  plugins: [react()],

  server: {
    port: 5173,
    host: true,
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    target: 'es2022',
  },
});
