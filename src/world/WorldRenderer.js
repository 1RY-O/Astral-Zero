/**
 * Astral Zero — WorldRenderer (FRONTEND, Phase 5).
 * ============================================================
 * Draws the server's authoritative map: platforms, hazard zones (coolant strips,
 * acid ponds), low-gravity volumes, scrap deposit docks, and the live scrap
 * tokens.
 *
 * ★ EVERY RECTANGLE HERE COMES FROM `room_joined.map`
 * The server ships bounds, platforms, zones and stations, and the SIM uses those
 * same volumes for collision and damage. Anything the client invented here
 * would be a visual lie: a coolant strip drawn in the wrong place, or a hazard
 * that looks harmless because it is half a metre off. So this renderer is a
 * pure function of the server payload — it never computes geometry.
 *
 * WHY THE PLAYER MUST BE ABLE TO READ IT
 * Hazard zones apply damage and low-gravity volumes change how you move, so
 * both are gameplay information, not decoration. Each is therefore drawn with a
 * distinct, high-contrast treatment plus a short label, and both pulse so they
 * read instantly in peripheral vision during a fight.
 */

import { COMBAT } from '../config/netConfig.js';

/** Palette per hazard id family, so coolant and acid never look alike. */
const HAZARD_STYLE = Object.freeze({
  coolant: 0x38e1ff, // reactor coolant — freezing blue
  acid: 0x9dff5c,    // biodome pond — corrosive green
  default: 0xff6b8b,
});

const LOWGRAV_STYLE = 0x9fd4ff;

export class WorldRenderer {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} [opts]
   * @param {number} [opts.depth] - Behind actors.
   */
  constructor(scene, { depth = -5 } = {}) {
    this.scene = scene;
    this.depth = depth;

    /** @type {Array<Phaser.GameObjects.GameObject>} */
    this._static = [];
    /** @type {Map<string, Phaser.GameObjects.GameObject>} tokenId → sprite */
    this._tokens = new Map();
    /** @type {Array<object>} */
    this._pulseTweens = [];
    /** @type {Phaser.GameObjects.GameObject[]} */
    this._docks = [];
  }

  /**
   * Build (or rebuild) the static world from an authoritative map.
   *
   * Idempotent: teardown first, so a late-joining `match_state` map does not
   * leave two overlapping sets of platforms.
   *
   * @param {object} map - Output of `mapFromWire`.
   * @returns {void}
   */
  build(map) {
    this.clear();
    if (!map) return;

    this._buildBounds(map);
    this._buildPlatforms(map);
    this._buildHazards(map);
    this._buildLowGravity(map);
    this._buildDocks(map);
  }

  /**
   * Floor + side walls, so the arena edge is visible rather than implied.
   * @param {object} map
   * @returns {void}
   */
  _buildBounds(map) {
    const b = map.bounds;
    if (!b) return;
    const w = b.maxX - b.minX;
    const h = b.groundY - b.ceilingY;

    this._static.push(
      this.scene.add
        .rectangle((b.minX + b.maxX) / 2, b.groundY + 20, w, 40, 0x1a2444)
        .setDepth(this.depth),
      this.scene.add
        .rectangle(b.minX, (b.ceilingY + b.groundY) / 2, 8, h, 0x14203a)
        .setDepth(this.depth),
      this.scene.add
        .rectangle(b.maxX, (b.ceilingY + b.groundY) / 2, 8, h, 0x14203a)
        .setDepth(this.depth),
    );
  }

  /**
   * Solid platforms. These are the SAME rectangles the server collides against.
   * @param {object} map
   * @returns {void}
   */
  _buildPlatforms(map) {
    for (const p of map.platforms ?? []) {
      // `x,y` is the platform's CENTRE in the server's map, matching the tile
      // sprite convention used everywhere else in this client.
      const slab = this.scene.add
        .tileSprite(p.x, p.y, p.w, p.h, 'platform')
        .setOrigin(0.5, 0.5)
        .setDepth(this.depth + 1);
      this._static.push(slab);
      // A matching static body so local prediction collides identically.
      this.scene.physics.add.existing(slab, true);
    }
  }

  /**
   * Damage zones. Pulsed so they are unmissable without a tutorial.
   * @param {object} map
   * @returns {void}
   */
  _buildHazards(map) {
    for (const z of map.zones?.hazard ?? []) {
      const color = HAZARD_STYLE[z.id?.includes('coolant')
        ? 'coolant'
        : z.id?.includes('acid')
          ? 'acid'
          : 'default'];

      const fill = this.scene.add
        .rectangle(z.x, z.y, z.w, z.h, color, 0.22)
        .setDepth(this.depth + 2);
      const edge = this.scene.add
        .rectangle(z.x, z.y, z.w, z.h, color, 0)
        .setStrokeStyle(2, color, 0.7)
        .setDepth(this.depth + 3);
      const label = this.scene.add
        .text(z.x, z.y, `${z.dps ?? 0} dps`, {
          fontFamily: 'Consolas, monospace',
          fontSize: '11px',
          color: `#${color.toString(16).padStart(6, '0')}`,
        })
        .setOrigin(0.5)
        .setDepth(this.depth + 4)
        .setAlpha(0.85);

      this._static.push(fill, edge, label);
      this._pulseTweens.push(
        this.scene.tweens.add({
          targets: fill,
          alpha: { from: 0.14, to: 0.34 },
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        }),
      );
    }
  }

  /**
   * Low-gravity volumes. Drawn as a soft overlay with a "LOW-G" tag: the player
   * must be able to tell that their jumps will behave differently in here.
   * @param {object} map
   * @returns {void}
   */
  _buildLowGravity(map) {
    for (const z of map.zones?.lowgrav ?? []) {
      const fill = this.scene.add
        .rectangle(z.x, z.y, z.w, z.h, LOWGRAV_STYLE, 0.1)
        .setDepth(this.depth + 2);
      const edge = this.scene.add
        .rectangle(z.x, z.y, z.w, z.h, LOWGRAV_STYLE, 0)
        .setStrokeStyle(1, LOWGRAV_STYLE, 0.45)
        .setDepth(this.depth + 3);
      const label = this.scene.add
        .text(z.x, z.y - z.h / 2 + 14, 'LOW-G', {
          fontFamily: 'Consolas, monospace',
          fontSize: '10px',
          color: '#9fd4ff',
        })
        .setOrigin(0.5)
        .setDepth(this.depth + 4)
        .setAlpha(0.7);

      this._static.push(fill, edge, label);
      this._pulseTweens.push(
        this.scene.tweens.add({
          targets: edge,
          alpha: { from: 0.25, to: 0.6 },
          duration: 1400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        }),
      );
    }
  }

  /**
   * Scrap deposit docks (scrap_collector). Pulses gold so the objective is
   * obvious the moment the mode starts.
   * @param {object} map
   * @returns {void}
   */
  _buildDocks(map) {
    for (const s of map.stations ?? []) {
      const r = s.r ?? 60;
      const ring = this.scene.add
        .circle(s.x, s.y, r, 0xffd166, 0.1)
        .setStrokeStyle(2, 0xffd166, 0.55)
        .setDepth(this.depth + 2);
      const label = this.scene.add
        .text(s.x, s.y, 'DEPOSIT', {
          fontFamily: 'Consolas, monospace',
          fontSize: '11px',
          color: '#ffd166',
        })
        .setOrigin(0.5)
        .setDepth(this.depth + 3)
        .setAlpha(0.85);

      this._docks.push(ring, label);
      this._pulseTweens.push(
        this.scene.tweens.add({
          targets: ring,
          alpha: { from: 0.06, to: 0.2 },
          scale: { from: 0.94, to: 1.06 },
          duration: 1100,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        }),
      );
    }
  }

  /**
   * Sync the live scrap tokens to a snapshot.
   *
   * Tokens are static pickups, so they are reconciled by ID rather than
   * interpolated: create what appeared, destroy what went away, and leave the
   * rest untouched so a bobbing token does not jitter when the list reorders.
   *
   * @param {Array<{id:string,x:number,y:number,value?:number}>} tokens
   * @returns {void}
   */
  syncTokens(tokens = []) {
    const seen = new Set();
    for (const tok of tokens) {
      const id = String(tok.id ?? '');
      if (!id) continue;
      seen.add(id);

      let sprite = this._tokens.get(id);
      if (!sprite) {
        sprite = this.scene.add
          .circle(tok.x, tok.y, 7, 0xffd166, 0.95)
          .setStrokeStyle(2, 0xfff3c4, 0.9)
          .setDepth(this.depth + 5);
        this._pulseTweens.push(
          this.scene.tweens.add({
            targets: sprite,
            scale: { from: 0.85, to: 1.15 },
            duration: 700,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          }),
        );
        this._tokens.set(id, sprite);
      }
      sprite.setPosition(tok.x, tok.y);
    }

    for (const [id, sprite] of this._tokens) {
      if (seen.has(id)) continue;
      sprite.destroy();
      this._tokens.delete(id);
    }
  }

  /** Remove every world object and stop every tween. @returns {void} */
  clear() {
    this._pulseTweens.forEach((t) => t.stop());
    this._pulseTweens = [];
    for (const obj of this._static) obj?.destroy?.();
    for (const obj of this._docks) obj?.destroy?.();
    for (const sprite of this._tokens.values()) sprite.destroy();
    this._static = [];
    this._docks = [];
    this._tokens.clear();
  }

  /** @returns {void} */
  destroy() {
    this.clear();
  }
}

export default WorldRenderer;
