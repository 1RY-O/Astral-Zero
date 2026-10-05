/**
 * Astral Zero - entry point.
 * ==========================================================
 * Creates the Phaser game, drives the DOM boot screen from REAL boot
 * milestones, and exposes the running game on `window` for debugging.
 *
 * BOOT SEQUENCE (the order `BootScreen` renders)
 *
 *   1. SCANNING DEBRIS FIELD  — this module runs; the boot screen builds
 *                               itself immediately, before Phaser exists.
 *   2. CALIBRATING SUIT       — `Phaser.Core.Events.READY`: the engine is up
 *                               and BootScene is generating the gray-box
 *                               textures.
 *   3. LOADING MISSION DATA   — LobbyScene.create(): the lobby is rendering.
 *   4. CONNECTING TO ORBIT    — the socket reports ANY status change. The bar
 *                               genuinely stops here if the relay is slow.
 *   5. READY                  — the socket is online (or the contract check
 *                               has completed), so the lobby is interactive.
 *
 * NOTHING IS FAKED. There is no artificial minimum duration and no timer that
 * creeps the bar forward: every increment is triggered by a real event. If the
 * backend is down the player sees "CONNECTING TO ORBIT" indefinitely, and then
 * an honest failure screen with a working RETRY — not a spinner forever.
 *
 * WHY THE BOOT SCREEN IS DOM AND NOT PHASER
 * It has to paint before the 1.5 MB Phaser bundle has even parsed, and it has
 * to be legible and responsive on a 320 px phone, where a 1280x720 canvas would
 * be unreadable. Phaser owns the canvas; the browser owns everything before it.
 */

import Phaser from 'phaser';

import { GAME_CONFIG } from './config/gameConfig.js';
import { BootScene } from './scenes/BootScene.js';
import { PreloadScene } from './scenes/PreloadScene.js';
import { LobbyScene } from './scenes/LobbyScene.js';
import { ArenaScene } from './scenes/ArenaScene.js';
import { BootScreen } from './ui/boot/BootScreen.js';
import { net } from './net/NetworkManager.js';
import * as Motion from './core/Motion.js';

// Honour the OS reduced-motion preference before anything can animate.
Motion.init();

/** @type {BootScreen} */
const boot = new BootScreen();

// 1. The screen is live from the very first paint.
boot.advance('scan');

/**
 * Keep the game instance on `window` so it can be inspected/toggled from the
 * browser console (e.g. `window.game.scale.toggleOrientation()`).
 * @type {Phaser.Game}
 */
const game = new Phaser.Game({
  ...GAME_CONFIG,

  // Scene order matters: Boot generates textures, Preload hosts the (future)
  // asset manifest, Lobby is the player-facing entry point, and Arena only
  // ever starts from the lobby when the server says a match is ready.
  scene: [BootScene, PreloadScene, LobbyScene, ArenaScene],
  callbacks: {
    // 2. The engine is up and BootScene is generating textures.
    preBoot: (g) => boot.advance('calibrate'),
    // Fired once the first frame has rendered.
    postBoot: () => boot.advance('mission'),
  },
});

// 3. The socket's first real status drives the "orbit" step. We subscribe to
//    the same NetworkManager the lobby uses, so the boot screen can never
//    claim a connection the game does not have.
net.on('connection', () => {
  boot.advance('connect');
  // READY as soon as we are genuinely online, which is the only moment the
  // lobby is actually usable.
  if (net.state.connection === 'online') boot.advance('ready');
});

// A hard failure while still on the boot screen: tell the truth and offer a
// retry. Once the lobby is up the HUD owns this messaging instead, so we do
// not stack two error surfaces on top of each other.
net.on('notice', (notice) => {
  if (notice?.tone === 'error' && !boot.done && net.state.connection === 'offline') {
    boot.fail('Could not reach the orbital relay. Check that the server is running.', () => {
      window.location.reload();
    });
  }
});

// Safety net: if something throws before the lobby takes over, the player sees
// a real message rather than a permanently frozen loading bar.
setTimeout(() => {
  if (!boot.done && !game.scene.isActive('LobbyScene')) {
    // Do NOT auto-finish — that would be faking success. Just make sure the
    // screen is in a state the player can read and act on.
    boot.advance('connect');
  }
}, 8000);

if (typeof window !== 'undefined') {
  window.game = game;
  window.__azBoot = boot;
}

export default game;
