import Phaser from 'phaser';
import { ART, BORDERS } from '../config/uiTheme.js';
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

    // Stay on Boot while the DOM loading screen runs its managed 4 s dwell.
    // `src/main.js` starts the first real scene (Home) when the dwell
    // completes — auto-starting the lobby here would put a live lobby (and
    // its name gate) behind the loading overlay, before the intended flow.
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
    g.fillStyle(ART.boot.body, 1);
    g.fillRoundedRect(0, 0, width, height, 8);

    // Darker outline for readability against bright backgrounds.
    g.lineStyle(BORDERS.base, ART.boot.bodyShade, 1);
    g.strokeRoundedRect(1.5, 1.5, width - 3, height - 3, 8);

    // Visor band near the top (faces the same way as the sprite).
    g.fillStyle(ART.boot.bodyShade, 1);
    g.fillRoundedRect(6, 8, width - 12, 12, 4);
    g.fillStyle(ART.boot.visor, 1);
    g.fillRect(10, 11, 8, 5);

    // Little "jetpack" notch at the back-bottom to hint at the space theme.
    g.fillStyle(ART.boot.boot, 1);
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

    g.fillStyle(ART.boot.platform, 1);
    g.fillRect(0, 0, width, height);

    // Bright top edge = "this is the surface you can stand on".
    g.fillStyle(ART.boot.platformRim, 1);
    g.fillRect(0, 0, width, 5);

    // Subtle darker underside for depth.
    g.fillStyle(ART.boot.platformShade, 1);
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

    g.fillStyle(ART.boot.player, 1);
    g.fillRect(0, 0, 20, 8);
    g.lineStyle(BORDERS.thin, ART.boot.platformShade, 1);
    g.strokeRect(1, 1, 18, 6);

    g.generateTexture('muzzle', 20, 8);
    g.destroy();
  }
}