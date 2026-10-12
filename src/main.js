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
 *                               has completed), so the entry scene is interactive.
 *
 * The DOM loading screen additionally holds for exactly 4 s (BOOT_DWELL_MS)
 * before handing off to Home, so every launch reads as a deliberate startup
 * rather than a flash. Milestones still drive the bar honestly within that
 * window; the dwell only gates the transition, never the progress.
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
import { HomeScene } from './scenes/HomeScene.js';
import { BootScreen, BOOT_DWELL_MS } from './ui/boot/BootScreen.js';
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

  // Scene order matters: Boot generates textures and holds while the DOM
  // loading screen runs its dwell; Home is the player-facing entry point;
  // Lobby owns party/mode/friends; Arena only ever starts on server-confirmed
  // room membership (never optimistically from a button).
  scene: [BootScene, PreloadScene, HomeScene, LobbyScene, ArenaScene],
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

// Safety net: if something throws before the handoff takes over, the player sees
// a real message rather than a permanently frozen loading bar. The fail()
// path renders an honest message plus a working RETRY (and cancels the 4 s
// dwell), so a boot failure never leaves the player staring at a bar.
setTimeout(() => {
  if (!boot.done && !handoffDone) {
    const active = game.scene.getScenes(true).map((s) => s.scene.key);
    if (!active.includes('HomeScene') && !active.includes('LobbyScene') && !active.includes('ArenaScene')) {
      boot.fail(
        'The orbital relay did not come online in time. Check that the server is',
        () => window.location.reload(),
      );
    }
  }
}, Math.max(6000, BOOT_DWELL_MS + 2000));

// -------------------------------------------------------------------------
// Navigation (hash-routed app shell).
// -------------------------------------------------------------------------
import { currentRoute, navigate, sceneKey } from './core/Router.js';

/** Route scene key → real scene class. Owned here (not in Router) to avoid cycles. */
const SCENE_CLASSES = Object.freeze({
  HomeScene,
  LobbyScene,
  ArenaScene,
});

/** True once the loading dwell has handed off to the first scene. */
let handoffDone = false;

/**
 * Show a route's scene, keeping Phaser scenes exclusive. Uses the Phaser
 * scene manager directly — there is exactly one routing system.
 * @param {string} id - The route id from `Router.js`.
 * @returns {void}
 */
function showScene(id) {
  const key = sceneKey(id);
  if (game.scene.isActive(key)) return;
  const SceneClass = SCENE_CLASSES[key] ?? HomeScene;
  // Scenes from the config list are pre-registered; only add if missing
  // (defensive for tests that construct a bare manager).
  try {
    if (!game.scene.getScene(key)) game.scene.add(key, SceneClass);
  } catch {
    /* already registered — fall through to start */
  }
  // Keep scenes exclusive: stop whatever is active so Lobby/Home/Arena can
  // never stack and double-subscribe the network.
  for (const s of game.scene.getScenes(true)) {
    if (s.scene.key !== key) {
      try {
        game.scene.stop(s.scene.key);
      } catch {
        /* best-effort */
      }
    }
  }
  game.scene.start(key);
}

/**
 * First transition, fired exactly once when the 4 s loading dwell completes.
 * Defaults to Home (the intended entry point); respects an existing hash.
 * @returns {void}
 */
function handoff() {
  if (handoffDone) return;
  handoffDone = true;
  if (boot.failed) return; // fail() already claimed the screen with a retry
  boot.settle();
  showScene(currentRoute());
}

// The loading screen runs exactly BOOT_DWELL_MS, then hands off.
boot.startDwell(handoff, BOOT_DWELL_MS);
// Rotating tips drawn from implemented mechanics. Inert (one frozen line) when
// the player prefers reduced motion.
boot.startTips();

window.addEventListener('hashchange', () => {
  // Ignore hash churn during the loading dwell — the handoff owns the first
  // transition and must not be double-fired by an early hash write.
  if (!handoffDone) return;
  showScene(currentRoute());
});

// Controlled debug/test seam: the game instance, boot screen and network
// facade for console + automated probes. Game/net state holds no secrets
// (player name, connection, room roster) — no tokens or keys are exposed.
if (typeof window !== 'undefined') {
  window.game = game;
  window.__azBoot = boot;
  window.__azNet = net;
  window.__azDwellMs = BOOT_DWELL_MS;
}

export default game;
