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
import { ART, PALETTE } from '../config/uiTheme.js';

/**
 * Palette per hazard id family, so coolant and acid never look alike.
 * Comes from the theme's ART block, which is where the world's illustration
 * colours live.
 */
const HAZARD_STYLE = ART.hazards;

const LOWGRAV_STYLE = ART.lowGravity;

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
    /** @type {{x:number,y:number,w:number,h:number}[]} solid clip geometry */
    this._solidRects = [];
    /** @type {object|null} the arena rect this world was built with. */
    this._bounds = null;
    /** @type {Map<string, Phaser.GameObjects.GameObject>} tokenId → sprite */
    this._tokens = new Map();
    /** @type {Map<string, object>} S14.4 live scrap mimics, keyed by id. */
    this._mimics = new Map();
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
  /**
   * Reposition the EXISTING platform slabs to new centres (S14.3 orbital shift).
   *
   * Rather than tearing the world down and rebuilding it mid-match — which would
   * destroy every token sprite, dock and ambience tween — this slides the slab
   * sprites and their static bodies to the new positions and refreshes the
   * aiming ray's clip geometry. The server has ALREADY moved its own geometry by
   * the time this runs, so this is a visual sync, not a decision.
   *
   * @param {{x:number,y:number}[]} platforms - one entry per platform, in order
   * @returns {void}
   */
  applyPlatformShift(platforms) {
    if (!Array.isArray(platforms) || !platforms.length) return;
    const slabs = this._static.filter((o) => o.body && o.texture?.key === 'platform');
    for (let i = 0; i < Math.min(platforms.length, slabs.length); i += 1) {
      const slab = slabs[i];
      const to = platforms[i];
      if (!to || !Number.isFinite(to.x) || !Number.isFinite(to.y)) continue;
      slab.setPosition(to.x, to.y);
      // A static body has no velocity, so refreshing its transform is enough —
      // but it must be refreshed or the physics tree keeps the old AABB.
      slab.body.reset(to.x, to.y);
    }
    // Refresh the aim-ray clip set from the moved geometry.
    this._buildSolidRects({
      platforms: slabs.map((o) => ({ x: o.x, y: o.y, w: o.width, h: o.height })),
      bounds: this._bounds,
    });
  }

  build(map) {
    this.clear();
    if (!map) return;

    this._buildBounds(map);
    this._buildPlatforms(map);
    this._buildSolidRects(map);
    this._buildHazards(map);
    this._buildLowGravity(map);
    this._buildDocks(map);
  }

  /**
   * The arena's hull: floor,ceiling and side walls, so the arena edge is visible
   * rather than implied.
   *
   * VISUAL CONTRACT: the camera deliberately frames the player off-centre, which
   * needs a little headroom beyond the playable rect (see
   * ThirdPersonCamera._boundsPadding). That headroom is only acceptable if it
   * does not read as a hole in the world — so the perimeter is a solid
   * industrial hull with a hazard-striped trim, and the space beyond it is
   * intentional deep background, not missing level.
   *
   * @param {object} map
   * @returns {void}
   */
  _buildBounds(map) {
    const b = map.bounds;
    if (!b) return;
    this._bounds = { ...b };
    const w = b.maxX - b.minX;
    const h = b.groundY - b.ceilingY;
    const hullDepth = this.depth;
    const trimDepth = this.depth + 0.1;

    // Hull plates. The floor is the thickest: it is the surface every fight
    // happens around, so it must read as solid rather than as a line.
    this._static.push(
      this.scene.add
        .rectangle((b.minX + b.maxX) / 2, b.groundY + 26, w, 52, ART.hull.plate)
        .setDepth(hullDepth),
      this.scene.add
        .rectangle((b.minX + b.maxX) / 2, b.ceilingY - 26, w, 52, ART.hull.ceiling)
        .setDepth(hullDepth),
      this.scene.add
        .rectangle(b.minX - 4, (b.ceilingY + b.groundY) / 2, 16, h + 104, ART.hull.wall)
        .setDepth(hullDepth),
      this.scene.add
        .rectangle(b.maxX + 4, (b.ceilingY + b.groundY) / 2, 16, h + 104, ART.hull.wall)
        .setDepth(hullDepth),
    );

    // Hazard trim along the walkable edges. A chevron stripe reads as "this is
    // the boundary" far faster than a colour change, and it is the one repeated
    // motif that also identifies hazard zones elsewhere in the arena.
    const stripe = (x0, y0, sw, sh, count) => {
      const g = this.scene.add.graphics().setDepth(trimDepth);
      for (let i = 0; i < count; i += 1) {
        g.fillStyle(i % 2 === 0 ? ART.hazards.stripeLight : ART.hazards.stripeDark, 0.85);
        g.fillRect(x0 + i * sw, y0, sw, sh);
      }
      this._static.push(g);
    };
    stripe(b.minX, b.groundY - 6, 26, 6, Math.floor(w / 26));
    stripe(b.minX, b.ceilingY, 26, 6, Math.floor(w / 26));
  }

  /**
   * Solid platforms. These are the SAME rectangles the server collides against.
   *
   * COLLISION PARITY: the authoritative resolver (src/game/arena.js) treats a
   * platform as a one-way slab — you land on its TOP while falling, and you pass
   * straight through it from below or from the side. A plain Arcade body is a
   * solid box, so without configuring `checkCollision` the client blocks where
   * the server does not: you cannot jump up through a platform the server lets
   * you through, and the two halves then disagree about where your feet are.
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
      const body = slab.body;
      // Top-only, like the server: land on the upper face, hop through the rest.
      body.checkCollision.up = true;
      body.checkCollision.down = false;
      body.checkCollision.left = false;
      body.checkCollision.right = false;
    }
  }

  /**
   * Build the arena's clip geometry: the platforms plus the walls and floor.
   *
   * Called once from `build()` — deliberately NOT from the platform builder, so
   * there is exactly one code path that assembles the set and no way for a
   * caller that arrives before the platforms to get a half-populated list back.
   * @param {object} map
   * @returns {void}
   */
  _buildSolidRects(map) {
    const rects = [];
    for (const p of map.platforms ?? []) {
      rects.push({ x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h });
    }
    const b = map.bounds;
    if (b) {
      // Thick edges so a ray leaving the arena still clips on the surface the
      // player is actually stopped by, not a pixel-thin plane the slab test can
      // slip past at a shallow angle.
      const t = 60;
      const left = b.minX;
      const right = b.maxX;
      const top = b.ceilingY;
      const bottom = b.groundY;
      rects.push(
        { x: left - t, y: top - t, w: right - left + t * 2, h: t },        // ceiling
        { x: left - t, y: bottom, w: right - left + t * 2, h: t },        // floor
        { x: left - t, y: top - t, w: t, h: bottom - top + t * 2 },       // left wall
        { x: right, y: top - t, w: t, h: bottom - top + t * 2 },          // right wall
      );
    }
    this._solidRects = rects;
  }

  /**
   * Every surface a shot can actually be blocked by, as axis-aligned rects.
   *
   * The walls and floor are decorative rectangles with no physics body
   * (collision there comes from `physics.world.setBounds` +
   * `setCollideWorldBounds`), which meant the aiming ray had no idea they
   * existed and happily drew through the floor and out of the arena — telling
   * the player they were shooting into a void that stops their rounds.
   * @returns {{x:number,y:number,w:number,h:number}[]}
   */
  solidRects() {
    return this._solidRects;
  }

  /**
   * Every surface a shot can actually be blocked by: the platforms, plus the
   * arena's walls and floor.
   *
   * The walls/floor are decorative rectangles with no physics body (collision
   * there comes from `physics.world.setBounds` + `setCollideWorldBounds`), which
   * meant the aiming ray had no idea they existed and happily drew through the
   * floor and out of the arena. Exposing them here lets the ray clip at the
   * same boundaries the player cannot cross.
   * @param {object} map
   * @returns {{x:number,y:number,w:number,h:number}[]}
   */
  solidRects(map) {
    if (this._solidRects.length) return this._solidRects;
    this._solidRects = [];
    for (const p of map?.platforms ?? []) {
      this._solidRects.push({ x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h });
    }
    const b = map?.bounds;
    if (b) {
      const t = 40;
      this._solidRects.push(
        { x: b.minX - t, y: b.ceilingY - t, w: b.maxX - b.minX + t * 2, h: t },
        { x: b.minX - t, y: b.groundY, w: b.maxX - b.minX + t * 2, h: t },
        { x: b.minX - t, y: b.ceilingY - t, w: t, h: b.groundY - b.ceilingY + t * 2 },
        { x: b.maxX, y: b.ceilingY - t, w: t, h: b.groundY - b.ceilingY + t * 2 },
      );
    }
    return this._solidRects;
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
          color: ART.ambient.mote,
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
        .circle(s.x, s.y, r, ART.scrap.core, 0.1)
        .setStrokeStyle(2, ART.scrap.core, 0.55)
        .setDepth(this.depth + 2);
      const label = this.scene.add
        .text(s.x, s.y, 'DEPOSIT', {
          fontFamily: 'Consolas, monospace',
          fontSize: '11px',
          color: ART.scrap.label,
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
  /**
   * Sync the control-point objective (S14.5).
   *
   * The owner ring, the capture bar and the radius are all driven by server
   * snapshot fields. The one thing this computes LOCALLY is the bar's FILL
   * animation, and even that only interpolates toward a server value — it never
   * decides who owns the point. A client that thinks it captured something is a
   * client that will disagree with the scoreboard.
   *
   * @param {object|null} cp
   * @returns {void}
   */
  syncControlPoint(cp) {
    if (!cp?.enabled) {
      this.clearControlPoint();
      return;
    }
    if (!this._cp) {
      const g = this.scene.add.container(cp.x, cp.y).setDepth(this.depth + 4);
      const ring = this.scene.add.circle(0, 0, cp.radius, ART.controlPoint.clear, 0).setStrokeStyle(3, PALETTE.cyanEdge, 0.9);
      const back = this.scene.add.rectangle(0, -cp.radius - 26, 132, 12, 0x000000, ART.controlPoint.barBackAlpha).setStrokeStyle(1, PALETTE.cyanEdge, 0.4);
      const fill = this.scene.add.rectangle(-66, -cp.radius - 26, 132, 8, PALETTE.cyanEdge, 1).setOrigin(0, 0.5);
      g.add([ring, back, fill]);
      this._cp = { g, ring, fill, barW: 132 };
    }
    const node = this._cp;
    node.g.setPosition(cp.x, cp.y);
    node.ring.setRadius(cp.radius);
    node.ring.setStrokeStyle(3, cp.owner === 'red' ? PALETTE.red : cp.owner === 'blue' ? PALETTE.bluePanel : PALETTE.cyanEdge, 0.9);

    // Fill the bar from the left; colour it by who is capturing.
    const pct = Math.max(0, Math.min(100, cp.progress || 0)) / 100;
    const width = node.barW * pct;
    node.fill.setPosition(-node.barW / 2, -cp.radius - 26);
    node.fill.width = Math.max(1, width);
    node.fill.setFillStyle(
      cp.contender === 'red' ? PALETTE.red : cp.contender === 'blue' ? PALETTE.bluePanel : PALETTE.cyanEdge,
      1,
    );

    // A contested point is the one state that MUST read instantly: it is frozen,
    // and frozen is why nobody is winning.
    const contested = cp.state === 'contested';
    if (contested && !node.contestedTween) {
      node.contestedTween = this.scene.tweens.add({
        targets: node.ring,
        alpha: { from: 1, to: 0.35 },
        duration: 420,
        yoyo: true,
        repeat: -1,
      });
    } else if (!contested && node.contestedTween) {
      node.contestedTween.stop();
      node.contestedTween = null;
      node.ring.setAlpha(1);
    }
  }

  /** Remove the objective visuals (mode change / teardown). */
  clearControlPoint() {
    this._cp?.g?.destroy();
    this._cp = null;
  }

  /**
   * Sync the live Scrap Mimics (S14.4). Dormant mimics are drawn with the
   * EXACT same sprite and palette as a scrap token — that is the whole point of
   * the decoy, so a player who cannot tell them apart is playing correctly.
   * Only once the server says `arming`/`armed` does the sprite change, which is
   * the readable "that one was bait" moment.
   *
   * @param {{id:string,x:number,y:number,state:string}[]} mimics
   * @returns {void}
   */
  syncMimics(mimics = []) {
    const seen = new Set();
    for (const mk of mimics) {
      const id = String(mk.id ?? '');
      if (!id) continue;
      seen.add(id);
      const armed = mk.state === 'arming' || mk.state === 'armed';

      let sprite = this._mimics.get(id);
      if (!sprite) {
        sprite = this.scene.add
          .circle(mk.x, mk.y, 7, ART.scrap.core, 0.95)
          .setStrokeStyle(2, ART.scrap.highlight, 0.9)
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
        this._mimics.set(id, sprite);
      }
      sprite.setPosition(mk.x, mk.y);

      if (armed && !sprite.getData('revealed')) {
        sprite.setData('revealed', true);
        // Reveal: the decoy turns hostile-red and starts lunging toward you.
        sprite.setFillStyle(PALETTE.red, 1);
        sprite.setStrokeStyle(3, PALETTE.redPink, 1);
        this.scene.tweens.add({
          targets: sprite,
          scale: { from: 1, to: 1.9 },
          duration: 260,
          yoyo: true,
          repeat: -1,
          ease: 'Quad.easeOut',
        });
      }
    }

    for (const [id, sprite] of this._mimics) {
      if (seen.has(id)) continue;
      sprite.destroy();
      this._mimics.delete(id);
    }
  }

  /** Stop drawing every mimic (mode change / match teardown). */
  clearMimics() {
    for (const [, sprite] of this._mimics || []) sprite.destroy();
    this._mimics?.clear();
  }

  syncTokens(tokens = []) {
    const seen = new Set();
    for (const tok of tokens) {
      const id = String(tok.id ?? '');
      if (!id) continue;
      seen.add(id);

      let sprite = this._tokens.get(id);
      if (!sprite) {
        sprite = this.scene.add
          .circle(tok.x, tok.y, 7, ART.scrap.core, 0.95)
          .setStrokeStyle(2, ART.scrap.highlight, 0.9)
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
    this._solidRects = [];
    this._docks = [];
    this._tokens.clear();
  }

  /** @returns {void} */
  destroy() {
    this.clear();
  }
}

export default WorldRenderer;
