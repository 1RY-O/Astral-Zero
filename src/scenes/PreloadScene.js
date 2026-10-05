import Phaser from 'phaser';
import { SCENES } from '../config/gameConfig.js';

/**
 * Astral Zero - PreloadScene.
 *
 * This is the single place where real art/audio from `public/assets/` is
 * registered with the Phaser loader. During Phase 1 the folder is empty, so
 * this scene is intentionally a no-op - but it exists NOW (rather than later)
 * so that adding an asset later is a one-line change and never a refactor.
 *
 * Example of what Phase 2 will look like:
 *   this.load.image('player', 'assets/players/janitor.png');
 *   this.load.atlas('bots', 'assets/bots/bots.png', 'assets/bots/bots.json');
 *   this.load.audio('shoot', 'assets/audio/sfx/shoot.wav');
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SCENES.PRELOAD);
  }

  /** @returns {void} */
  preload() {
    // --- Asset manifest goes here (Phase 1: nothing to load yet) ------------
    // Procedural gray-box textures are generated in BootScene instead.

    // `public/assets/` is currently empty. Vite serves `public/` at the web
    // root, so any file dropped there later is reachable as '/assets/...'.
  }

  /** @returns {void} */
  create() {
    // Always hand off to the lobby; Preload exists to host the asset list.
    this.scene.start(SCENES.LOBBY);
  }
}