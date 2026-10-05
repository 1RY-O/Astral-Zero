/**
 * Astral Zero - entry point.
 *
 * Creates the Phaser game instance and hands control to BootScene, which
 * generates the Phase 1 gray-box textures before the arena loads.
 */
import Phaser from 'phaser';

import { GAME_CONFIG } from './config/gameConfig.js';
import { BootScene } from './scenes/BootScene.js';
import { PreloadScene } from './scenes/PreloadScene.js';
import { LobbyScene } from './scenes/LobbyScene.js';
import { ArenaScene } from './scenes/ArenaScene.js';

// Keep the game instance on `window` so it can be inspected/toggled from the
// browser console (e.g. `window.game.scale.toggleOrientation()`), and so the
// future Socket.io layer can reach the running game if needed.
/** @type {Phaser.Game} */
const game = new Phaser.Game({
  ...GAME_CONFIG,

  // Scene order matters: Boot generates textures, Preload hosts the (future)
  // asset manifest, Lobby is the player-facing entry point, and Arena only
  // ever starts from the lobby when the server says a match is ready.
  scene: [BootScene, PreloadScene, LobbyScene, ArenaScene],
});

// Remove the HTML boot placeholder once Phaser has rendered its first frame.
game.events.once(Phaser.Core.Events.READY, () => {
  document.getElementById('boot-status')?.remove();
});

if (typeof window !== 'undefined') {
  window.game = game;
}

export default game;