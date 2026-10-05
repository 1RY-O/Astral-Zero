import Phaser from 'phaser';
import { SCENES } from '../config/gameConfig.js';

/**
 * Astral Zero - BootScene.
 *
 * Boot runs before any asset loading and has NO loaded textures available, so
 * it cannot draw real art. Its job here is to *generate* the Phase 1 gray-box
 * textures procedurally with Graphics + `generateTexture`.
 *
 * Why bother generating textures instead of just using coloured rectangles?
 *  - Sprites let us later swap in real art by changing nothing but the
 *    texture key ('player', 'platform', ...).
 *  - A tinted/particle-friendly texture works for juice effects (dust,
 *    muzzle flash) in later phases.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.BOOT);
  }

  /** @returns {void} */
  create() {
    this._createPlayerTexture();
    this._createPlatformTexture();
    this._createMuzzleTexture();

    // No real assets to preload yet - go straight to the lobby, which is the
    // player-facing entry point as of Phase 2. The arena is only started from
    // the lobby once the server reports a match is ready.
    this.scene.start(SCENES.LOBBY);
  }

  /**
   * Builds the placeholder janitor sprite: a rounded, bright cyan body with a
   * lighter "visor" band so the facing direction is readable at a glance.
   * @returns {void}
   */
  _createPlayerTexture() {
    const { width, height } = { width: 40, height: 56 };
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // Main body with slightly rounded corners for the cartoonish look.
    g.fillStyle(0x38e1ff, 1);
    g.fillRoundedRect(0, 0, width, height, 8);

    // Darker outline for readability against bright backgrounds.
    g.lineStyle(3, 0x04263a, 1);
    g.strokeRoundedRect(1.5, 1.5, width - 3, height - 3, 8);

    // Visor band near the top (faces the same way as the sprite).
    g.fillStyle(0x04263a, 1);
    g.fillRoundedRect(6, 8, width - 12, 12, 4);
    g.fillStyle(0xffffff, 1);
    g.fillRect(10, 11, 8, 5);

    // Little "jetpack" notch at the back-bottom to hint at the space theme.
    g.fillStyle(0xff9f43, 1);
    g.fillRoundedRect(width - 14, height - 16, 9, 10, 3);

    g.generateTexture('player', width, height);
    g.destroy();
  }

  /**
   * Flat platform slab with a lit top edge, so the landing surface reads
   * clearly while gray-boxing.
   * @returns {void}
   */
  _createPlatformTexture() {
    const width = 64;
    const height = 32;
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    g.fillStyle(0x2b3a67, 1);
    g.fillRect(0, 0, width, height);

    // Bright top edge = "this is the surface you can stand on".
    g.fillStyle(0x7fe7ff, 1);
    g.fillRect(0, 0, width, 5);

    // Subtle darker underside for depth.
    g.fillStyle(0x1a2444, 1);
    g.fillRect(0, height - 6, width, 6);

    // `displayWidth` tiling happens at creation time in ArenaScene; the
    // texture itself is a small repeatable tile.
    g.generateTexture('platform', width, height);
    g.destroy();
  }

  /**
   * Small rectangle used as the rotating weapon/muzzle marker for aiming.
   * @returns {void}
   */
  _createMuzzleTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    g.fillStyle(0xffd166, 1);
    g.fillRect(0, 0, 20, 8);
    g.lineStyle(2, 0x1a2444, 1);
    g.strokeRect(1, 1, 18, 6);

    g.generateTexture('muzzle', 20, 8);
    g.destroy();
  }
}