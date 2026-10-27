/**
 * Solar Sentinel — Orbital Map Renderer (Vanilla Canvas 2D)
 * =========================================================
 * Tactical equirectangular world map: simplified geometric landmasses in
 * dark gray on black, a sci-fi grid overlay, a rotating cyan radar sweep,
 * and tiered debris dots:
 *
 *   1–4   LOW       small neon-green dot, no glow
 *   5–7   ELEVATED  yellow, medium dot, pulsing glow
 *   8–10  HIGH      large neon-red dot, fast pulsing glow + reticle
 *
 * The ISS is drawn as a glowing cyan satellite cross that rides a sine
 * wave across the map. Selecting any dot spins up an acquisition reticle
 * whose brackets close in before the target is authorized.
 *
 * Juice: screen shake + square/triangle particle bursts on cleanup.
 *
 * Performance rules for low-end PCs / phones:
 *  - one static starfield + world map baked into offscreen canvases
 *  - no shadowBlur / filter: glows are cheap multi-arc fills
 *  - a single requestAnimationFrame loop with dt-clamped smoothing
 */

/** Logical canvas size — matches the backend's equirectangular map space. */
export const MAP_W = 800;
export const MAP_H = 600;

const TAU = Math.PI * 2;
const ISS_SPEED = 58; // logical px / second
const SWEEP_SPEED = 0.85; // radar rotation, radians / second
const SWEEP_TRAIL = 1.0; // radians of fading trail behind the sweep head

/** Time the brackets take to close on a freshly clicked target. */
export const ACQUIRE_MS = 720;

const COLORS = {
  bg: '#010409',
  land: '#121a24',
  landDeep: '#0c1119',
  landEdge: '#46536b',
  low: '#39ff88',
  elev: '#ffd60a',
  high: '#ff003c',
  iss: '#00f3ff',
  grid: 'rgba(0, 243, 255, 0.075)',
};

const PARTICLE_PALETTE = [COLORS.iss, '#ffffff', '#9bfcff'];
const COLLISION_PALETTE = [COLORS.high, '#ff7a8f', '#ffd0d6'];

/** Orbital laser strike timings (ms). The beam travels, then detonates. */
const LASER_BEAM_MS = 500;
const LASER_LINGER_MS = 160;

/**
 * Simplified continent outlines in [longitude, latitude] pairs.
 * Deliberately geometric — this is a tactical schematic, not a GIS layer.
 */
export const CONTINENTS = Object.freeze([
  {
    name: 'NORTH AMERICA',
    points: [
      [-168, 66], [-158, 71], [-140, 70], [-125, 72], [-108, 74], [-92, 73],
      [-80, 70], [-62, 60], [-55, 50], [-66, 45], [-70, 42], [-75, 35],
      [-81, 26], [-90, 21], [-97, 17], [-106, 21], [-114, 28], [-124, 40],
      [-128, 51], [-140, 59], [-155, 58], [-168, 66],
    ],
  },
  {
    name: 'CENTRAL AMERICA',
    points: [
      [-95, 17], [-88, 16], [-82, 12], [-77, 8], [-79, 7], [-85, 10],
      [-91, 14], [-96, 16], [-95, 17],
    ],
  },
  {
    name: 'SOUTH AMERICA',
    points: [
      [-80, 10], [-72, 11], [-62, 10], [-52, 4], [-44, -2], [-35, -6],
      [-38, -15], [-42, -23], [-50, -31], [-58, -39], [-65, -55], [-71, -54],
      [-73, -43], [-72, -30], [-78, -18], [-81, -5], [-80, 10],
    ],
  },
  {
    name: 'EUROPE',
    points: [
      [-10, 36], [-5, 44], [3, 44], [10, 45], [16, 40], [25, 38], [30, 42],
      [40, 48], [32, 55], [24, 60], [18, 61], [10, 58], [4, 62], [-4, 58],
      [-10, 50], [-10, 36],
    ],
  },
  {
    name: 'AFRICA',
    points: [
      [-17, 15], [0, 20], [15, 32], [32, 32], [43, 12], [51, 12], [41, -2],
      [40, -15], [35, -25], [20, -35], [15, -33], [10, -25], [0, -15],
      [-10, -5], [-17, 15],
    ],
  },
  {
    name: 'ASIA',
    points: [
      [30, 42], [40, 50], [55, 55], [70, 64], [85, 72], [105, 76], [125, 72],
      [145, 62], [160, 62], [180, 66], [180, 45], [160, 46], [145, 36],
      [137, 26], [126, 21], [121, 7], [106, 1], [98, 9], [82, 7], [72, 22],
      [62, 27], [50, 31], [40, 36], [30, 42],
    ],
  },
  {
    name: 'AUSTRALIA',
    points: [
      [113, -22], [130, -12], [142, -11], [153, -25], [150, -38],
      [135, -35], [120, -34], [113, -22],
    ],
  },
  {
    name: 'GREENLAND',
    points: [
      [-45, 60], [-20, 70], [-20, 82], [-40, 83], [-60, 80], [-55, 68],
      [-45, 60],
    ],
  },
  {
    name: 'UNITED KINGDOM',
    points: [
      [-6, 50], [-3, 54], [-5, 58], [-8, 57], [-10, 54], [-6, 50],
    ],
  },
  {
    name: 'JAPAN',
    points: [
      [130, 31], [136, 35], [142, 40], [145, 44], [143, 44], [139, 38],
      [133, 34], [130, 31],
    ],
  },
  {
    name: 'MADAGASCAR',
    points: [
      [43, -12], [50, -15], [49, -25], [45, -25], [43, -18], [43, -12],
    ],
  },
  {
    name: 'NEW ZEALAND',
    points: [
      [166, -46], [174, -41], [178, -37], [176, -35], [172, -39],
      [167, -44], [166, -46],
    ],
  },
  {
    name: 'ANTARCTICA',
    points: [
      [-180, -70], [-150, -72], [-120, -68], [-90, -72], [-60, -64],
      [-30, -70], [0, -68], [30, -70], [60, -66], [90, -68], [120, -66],
      [150, -70], [180, -68], [180, -90], [-180, -90],
    ],
  },
]);

/** Equirectangular projection: lon/lat degrees → 800×600 map pixels. */
export function projectLonLat(lon, lat) {
  return {
    x: ((lon + 180) / 360) * MAP_W,
    y: ((90 - lat) / 180) * MAP_H,
  };
}

/**
 * ISS position at a given time. It crosses the full map on a single sine
 * wave; the wrap at the map edge is seamless because one period is used.
 * @param {number} timeSeconds
 * @returns {{x:number,y:number}}
 */
export function issPosition(timeSeconds = 0) {
  const travel =
    ((timeSeconds * ISS_SPEED + 120) % (MAP_W + 120) + (MAP_W + 120)) % (MAP_W + 120);
  const x = travel - 60;
  const y = MAP_H / 2 + Math.sin(((x - 60) / (MAP_W + 120)) * TAU * 2) * 105;
  return { x, y };
}

/** Risk level (backend scale 1–10) → tier key. */
export function riskTier(riskLevel) {
  if (riskLevel >= 8) return 'high';
  if (riskLevel >= 5) return 'elev';
  return 'low';
}

/**
 * Normalise one snapshot object's position into 800×600 map pixels.
 *
 * The backend normally sends equirectangular pixel coords, but its TLE
 * propagation can push lat/lon past ±180/±90, yielding x/y outside the
 * canvas (dots drawn off-screen → "empty map"). Accept pixel coords,
 * fall back to lat/lon projection, then wrap X and clamp Y so every
 * dot lands visibly on the map.
 *
 * @param {{x?:number,y?:number,latitude?:number,longitude?:number}} obj
 * @returns {{x:number,y:number}|null}
 */
export function normalizePoint(obj) {
  if (!obj) return null;
  let x = Number(obj.x);
  let y = Number(obj.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    const lat = Number(obj.latitude ?? obj.lat);
    const lon = Number(obj.longitude ?? obj.lon ?? obj.lng);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      x = MAP_W / 2 + (lon * MAP_W) / 360;
      y = MAP_H / 2 - (lat * MAP_H) / 180;
    } else {
      return null;
    }
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  // Wrap horizontally (equirectangular is periodic in longitude) and
  // clamp vertically so nothing ever renders outside the canvas.
  x = ((x % MAP_W) + MAP_W) % MAP_W;
  y = Math.min(MAP_H - 3, Math.max(3, y));
  return { x, y };
}

/** Tiny deterministic PRNG so the starfield is stable across reloads. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** '#rrggbb' + alpha → 'rgba(r,g,b,a)' without allocating gradients. */
function hexAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Stable per-object pulse phase. */
function phaseOf(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967296) * TAU;
}

function isIssTrack(track) {
  return /ISS|ZARYA/i.test(`${track?.name ?? ''} ${track?.id ?? ''}`);
}

const MAX_PARTICLES = 320;
const MAX_RINGS = 14;

/**
 * Smooth a closed polygon into a continuous Bezier path.
 * Uses the midpoint technique: each original vertex becomes a control
 * point and the segment midpoints become on-curve anchors, producing
 * a flowing, premium schematic outline instead of hard-edged blocks.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<[number, number]>} pts
 * @param {number} [_tension] kept for API compatibility
 */
function smoothClosedPath(ctx, pts, _tension = 1) {
  if (!pts || pts.length === 0) return;
  const n = pts.length;
  if (n === 1) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    return;
  }
  if (n === 2) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.lineTo(pts[1][0], pts[1][1]);
    return;
  }
  ctx.moveTo(
    (pts[0][0] + pts[n - 1][0]) / 2,
    (pts[0][1] + pts[n - 1][1]) / 2,
  );
  for (let i = 0; i < n; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % n];
    const midX = (p0[0] + p1[0]) / 2;
    const midY = (p0[1] + p1[1]) / 2;
    ctx.quadraticCurveTo(p0[0], p0[1], midX, midY);
  }
  ctx.closePath();
}


export class OrbitalMap {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });

    /** @type {Map<string, object>} id → live track state */
    this.tracks = new Map();
    /** @type {Array<object>} explosion particles (squares) */
    this.particles = [];
    /** @type {Array<object>} expanding shockwave rings */
    this.rings = [];
    /** @type {Array<object>} active orbital laser strikes */
    this.lasers = [];
    /** @type {Array<{canvas:HTMLCanvasElement, speed:number}>} parallax star layers */
    this._starLayers = [];
    this.selectedId = null;
    this.onPick = null;
    this.onLock = null;

    this._running = false;
    this._raf = 0;
    this._lastT = 0;
    this._time = 0;
    this._sweep = 0; // radians
    this._dpr = 0;
    this._stars = null;
    this._world = null;
    this._sweepLayer = null;
    this._lockAt = 0;
    this._lockT = 1;
    this.acquiring = false;
    this._shakeUntil = 0;
    this._shakeDur = 0;
    this._shakeMag = 0;

    this._resizeBackingStore();
    this._bakeParallaxStars();
    this._onClick = (ev) => this._handlePick(ev);
    canvas.addEventListener('click', this._onClick);
  }

  /** Hi-DPI backing store; CSS keeps the 4:3 box responsive. */
  _resizeBackingStore() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (dpr === this._dpr && this.canvas.width === MAP_W * dpr && this._world) return;
    this._dpr = dpr;
    this.canvas.width = MAP_W * dpr;
    this.canvas.height = MAP_H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._world = this._bakeWorldMap();
    this._sweepLayer = this._bakeSweep();
  }

  /**
   * Deep-space starfield in three parallax layers. Each layer is baked once
   * into an offscreen canvas and drifts horizontally at its own speed, so
   * distant stars crawl while near stars glide — cheap fake depth.
   */
  _bakeParallaxStars() {
    const makeLayer = (seed, count, { alphaMin, alphaVar, sizeMin, sizeMax, tint }) => {
      const off = document.createElement('canvas');
      off.width = MAP_W;
      off.height = MAP_H;
      const c = off.getContext('2d');
      const rnd = mulberry32(seed);
      for (let i = 0; i < count; i++) {
        const x = rnd() * MAP_W;
        const y = rnd() * MAP_H;
        const size = sizeMin + rnd() * (sizeMax - sizeMin);
        const alpha = alphaMin + rnd() * alphaVar;
        c.fillStyle = tint.replace('$a', alpha.toFixed(2));
        c.beginPath();
        c.arc(x, y, size, 0, TAU);
        c.fill();
      }
      return off;
    };

    const blueTint = 'rgba(158, 226, 255, $a)';
    const whiteTint = 'rgba(226, 244, 255, $a)';

    this._starLayers = [
      // Distant dust: tiny, dim, barely drifting.
      { canvas: makeLayer(20261022, 120, { alphaMin: 0.12, alphaVar: 0.3, sizeMin: 0.45, sizeMax: 0.8, tint: whiteTint }), speed: 2.2 },
      // Middle belt: soft glints.
      { canvas: makeLayer(9967331, 70, { alphaMin: 0.22, alphaVar: 0.4, sizeMin: 0.55, sizeMax: 1.05, tint: blueTint }), speed: 5.5 },
      // Near stars: fewer, brighter, a few with a faint halo.
      { canvas: makeLayer(7712345, 26, { alphaMin: 0.4, alphaVar: 0.5, sizeMin: 0.9, sizeMax: 1.7, tint: whiteTint }), speed: 10 },
    ];

    // Halos for a handful of near stars (kept static within the layer).
    const halo = document.createElement('canvas');
    halo.width = MAP_W;
    halo.height = MAP_H;
    const hc = halo.getContext('2d');
    const rnd = mulberry32(424242);
    for (let i = 0; i < 8; i++) {
      const x = rnd() * MAP_W;
      const y = rnd() * MAP_H;
      const g = hc.createRadialGradient(x, y, 0, x, y, 6);
      g.addColorStop(0, 'rgba(200, 240, 255, 0.35)');
      g.addColorStop(1, 'rgba(200, 240, 255, 0)');
      hc.fillStyle = g;
      hc.fillRect(x - 6, y - 6, 12, 12);
    }
    this._starLayerHalos = halo;
  }

  /**
   * Bake the landmasses once: each polygon's outline is rebuilt through
   * smoothed quadratic Bezier segments (midpoint technique) so the map reads
   * as sleek, flowing satellite cartography instead of hard-edged blocks.
   */
  _bakeWorldMap() {
    const off = document.createElement('canvas');
    off.width = MAP_W;
    off.height = MAP_H;
    const c = off.getContext('2d');

    // Faint deep-space floor so landmasses never float on pure void.
    const floor = c.createLinearGradient(0, 0, 0, MAP_H);
    floor.addColorStop(0, 'rgba(8, 14, 24, 0.35)');
    floor.addColorStop(0.5, 'rgba(6, 10, 18, 0.16)');
    floor.addColorStop(1, 'rgba(10, 16, 26, 0.32)');
    c.fillStyle = floor;
    c.fillRect(0, 0, MAP_W, MAP_H);

    for (const land of CONTINENTS) {
      const pts = land.points.map(([lon, lat]) => {
        const p = projectLonLat(lon, lat);
        return [p.x, p.y];
      });

      // Soft cyan corona under each landmass (cheap baked glow pass).
      c.beginPath();
      smoothClosedPath(c, pts, 2.2);
      c.strokeStyle = 'rgba(0, 243, 255, 0.06)';
      c.lineWidth = 6;
      c.stroke();

      // Body fill with a subtle north-lit gradient.
      const p0 = pts.reduce((s, p) => [Math.min(s[0], p[0]), Math.min(s[1], p[1])], [1e9, 1e9]);
      const p1 = pts.reduce((s, p) => [Math.max(s[0], p[0]), Math.max(s[1], p[1])], [-1e9, -1e9]);
      const grad = c.createLinearGradient(0, p0[1], 0, p1[1]);
      grad.addColorStop(0, 'rgba(22, 32, 45, 0.96)');
      grad.addColorStop(1, 'rgba(11, 16, 24, 0.96)');
      c.fillStyle = grad;
      c.fill();

      // Crisp tech-blue coastline.
      c.beginPath();
      smoothClosedPath(c, pts, 2.2);
      c.strokeStyle = COLORS.landEdge;
      c.lineWidth = 1.1;
      c.stroke();

      // Inner highlight for the "premium schematic" look.
      const inner = pts.map(([x, y]) => [x, y]);
      c.beginPath();
      smoothClosedPath(c, inner, 1.2);
      c.strokeStyle = 'rgba(0, 243, 255, 0.04)';
      c.lineWidth = 3.5;
      c.stroke();
    }

    return off;
  }

  /**
   * Bake the radar wedge once. The leading edge points east (angle 0); the
   * draw loop simply rotates the whole layer around the map centre. Sliced
   * fills give a smooth cyan gradient without a per-frame conic gradient.
   */
  _bakeSweep() {
    const off = document.createElement('canvas');
    off.width = MAP_W;
    off.height = MAP_H;
    const c = off.getContext('2d');
    const cx = MAP_W / 2;
    const cy = MAP_H / 2;
    const radius = Math.hypot(MAP_W, MAP_H);

    const radial = c.createRadialGradient(cx, cy, 0, cx, cy, radius);
    radial.addColorStop(0, 'rgba(0, 243, 255, 0)');
    radial.addColorStop(0.2, 'rgba(0, 243, 255, 0.05)');
    radial.addColorStop(0.6, 'rgba(0, 243, 255, 0.12)');
    radial.addColorStop(1, 'rgba(0, 243, 255, 0.22)');

    const slices = 32;
    for (let i = 0; i < slices; i++) {
      const t = i / slices;
      const a0 = -SWEEP_TRAIL * t;
      const a1 = -SWEEP_TRAIL * (t + 1);
      c.globalAlpha = Math.pow(1 - t, 1.6);
      c.fillStyle = radial;
      c.beginPath();
      c.moveTo(cx, cy);
      c.arc(cx, cy, radius, a1, a0);
      c.closePath();
      c.fill();
    }
    c.globalAlpha = 1;

    // Bright leading edge, hotter at the rim.
    const edge = c.createLinearGradient(cx, cy, cx + radius, cy);
    edge.addColorStop(0, 'rgba(0, 243, 255, 0)');
    edge.addColorStop(0.55, 'rgba(0, 243, 255, 0.22)');
    edge.addColorStop(1, 'rgba(0, 243, 255, 0.68)');
    c.strokeStyle = edge;
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + radius, cy);
    c.stroke();

    return off;
  }

  /**
   * Merge a fresh snapshot into the live track map. Positions are
   * normalised via {@link normalizePoint} so out-of-range backend coords
   * still render.
   * @param {Array<object>} objects
   */
  setObjects(objects) {
    const seen = new Set();
    for (const obj of objects) {
      const pt = normalizePoint(obj);
      if (!pt) continue;
      const id = String(obj.id ?? obj.name ?? `${pt.x.toFixed(1)}:${pt.y.toFixed(1)}`);
      seen.add(id);
      const track = this.tracks.get(id);
      if (track) {
        track.tx = pt.x;
        track.ty = pt.y;
        track.name = obj.name || track.name;
        track.riskLevel = obj.riskLevel ?? track.riskLevel;
        track.altitude = obj.altitude ?? track.altitude;
        track.velocity = obj.velocity ?? track.velocity;
      } else {
        this.tracks.set(id, {
          id,
          name: obj.name || id,
          x: pt.x,
          y: pt.y,
          tx: pt.x,
          ty: pt.y,
          riskLevel: obj.riskLevel ?? 1,
          altitude: obj.altitude,
          velocity: obj.velocity,
          phase: phaseOf(id),
        });
      }
    }
    // Drop objects the server stopped reporting.
    for (const id of [...this.tracks.keys()]) {
      if (!seen.has(id)) this.tracks.delete(id);
    }
    if (this.selectedId && !this.tracks.has(this.selectedId)) {
      this.selectedId = null;
      this.acquiring = false;
    }
  }

  /**
   * Authorize cleanup: remove the track and detonate exactly 15 cyan/white
   * fragments (alternating squares and triangles).
   * @param {string} id
   * @returns {boolean} true when a live track was destroyed
   */
  explode(id) {
    const t = this.tracks.get(id);
    this.tracks.delete(id);
    if (this.selectedId === id) {
      this.selectedId = null;
      this.acquiring = false;
    }
    if (!t) return false;
    this._burst(t.x, t.y, PARTICLE_PALETTE, 15, { shapes: true });
    this._ring(t.x, t.y, COLORS.iss);
    return true;
  }

  /**
   * Collision detonation: red particle burst at a map position.
   * @param {number} x
   * @param {number} y
   */
  collisionBurst(x, y) {
    this._burst(x, y, COLLISION_PALETTE, 30, { shapes: true });
    this._ring(x, y, COLORS.high);
  }

  /**
   * Orbital laser strike: register a thick glowing cyan/white beam that
   * travels from the top of the canvas down to (x, y), followed by a
   * massive shockwave ring. Rendered by the animation loop.
   * @param {number} x
   * @param {number} y
   */
  drawOrbitalLaser(x, y) {
    this.lasers.push({
      x: Number.isFinite(x) ? x : MAP_W / 2,
      y: Number.isFinite(y) ? y : MAP_H / 2,
      start: performance.now(),
      beamMs: LASER_BEAM_MS,
      lingerMs: LASER_LINGER_MS,
    });
    // Massive shockwave ring queued via the beam's arrival (handled in render).
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {string[]} palette
   * @param {number} count exact number of fragments to emit
   * @param {{shapes?:boolean}} [opts]
   */
  _burst(x, y, palette, count, { shapes = false } = {}) {
    const room = MAX_PARTICLES - this.particles.length;
    if (count > room) this.particles.splice(0, count - room);

    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + (Math.random() - 0.5) * 0.55;
      const speed = 70 + Math.random() * 220;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 1,
        size: 1.8 + Math.random() * 2.8,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 11,
        shape: shapes ? (i % 2 === 0 ? 'square' : 'triangle') : 'square',
        color: palette[i % palette.length],
      });
    }
  }

  _ring(x, y, color) {
    if (this.rings.length >= MAX_RINGS) return;
    this.rings.push({ x, y, r: 5, life: 1, color });
  }

  /** Violent canvas shake. @param {number} ms @param {number} mag */
  shake(ms = 200, mag = 12) {
    this._shakeUntil = performance.now() + ms;
    this._shakeDur = ms;
    this._shakeMag = mag;
  }

  /**
   * Collision-grade screen shake. Collisions call this for exactly 300 ms.
   * @param {number} [duration] ms
   * @param {number} [intensity] pixel amplitude
   */
  screenShake(duration = 300, intensity = 12) {
    this.shake(duration, intensity);
  }

  /**
   * @param {string|null} id
   * @param {{acquire?:boolean}} [opts] start the closing-bracket animation
   */
  select(id, { acquire = false } = {}) {
    const next = id && this.tracks.has(id) ? id : null;
    const changed = next !== this.selectedId;
    this.selectedId = next;

    if (!next) {
      this.acquiring = false;
      this._lockAt = 0;
      this._lockT = 1;
      return;
    }
    if (acquire || changed) {
      this.acquiring = acquire;
      this._lockAt = performance.now();
      this._lockT = acquire ? 0 : 1;
    }
  }

  /** Current track list, sorted high-risk first (for the target list UI). */
  list() {
    return [...this.tracks.values()].sort((a, b) => b.riskLevel - a.riskLevel);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._lastT = performance.now();
    const frame = (t) => {
      if (!this._running) return;
      this._draw(Math.min((t - this._lastT) / 1000, 0.1));
      this._lastT = t;
      this._raf = requestAnimationFrame(frame);
    };
    this._raf = requestAnimationFrame(frame);
  }

  stop() {
    this._running = false;
    cancelAnimationFrame(this._raf);
  }

  destroy() {
    this.stop();
    this.canvas.removeEventListener('click', this._onClick);
  }

  /** Map a click/tap in CSS pixels → logical map coordinates. */
  _toLocal(ev) {
    const rect = this.canvas.getBoundingClientRect();

    // The canvas is letterboxed by `object-fit: contain`; account for the
    // rendered bitmap box so clicks land on the dot the operator sees.
    const scale = Math.min(rect.width / MAP_W, rect.height / MAP_H) || 1;
    const renderW = MAP_W * scale;
    const renderH = MAP_H * scale;
    const offsetX = (rect.width - renderW) / 2;
    const offsetY = (rect.height - renderH) / 2;

    return {
      x: (ev.clientX - rect.left - offsetX) / scale,
      y: (ev.clientY - rect.top - offsetY) / scale,
    };
  }

  _handlePick(ev) {
    const p = this._toLocal(ev);
    let best = null;
    let bestD = 17; // generous hit radius for touch targets
    for (const t of this.tracks.values()) {
      if (isIssTrack(t)) continue;
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    this.select(best ? best.id : null, { acquire: Boolean(best) });
    if (this.onPick) this.onPick(this.selectedId);
  }

  /** @param {number} dt - seconds since last frame (clamped upstream) */
  _draw(dt) {
    const ctx = this.ctx;
    this._time += dt;
    this._sweep = (this._sweep + dt * SWEEP_SPEED) % TAU;

    // Screen shake — offsets the whole scene; base fill covers the gaps.
    let ox = 0;
    let oy = 0;
    const now = performance.now();
    if (now < this._shakeUntil) {
      const ratio = (this._shakeUntil - now) / Math.max(this._shakeDur, 1);
      const amp = this._shakeMag * Math.max(ratio, 0.3);
      ox = (Math.random() * 2 - 1) * amp;
      oy = (Math.random() * 2 - 1) * amp;
    }

    // Advance the closing-bracket acquisition animation.
    if (this.acquiring && this.selectedId) {
      this._lockT = Math.min(1, (now - this._lockAt) / ACQUIRE_MS);
      if (this._lockT >= 1) {
        this.acquiring = false;
        this.onLock?.(this.selectedId);
      }
    }

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    ctx.save();
    ctx.translate(ox, oy);

    // Frame-rate independent smoothing: k≈5 feels smooth at 2 Hz input.
    const ease = 1 - Math.exp(-dt * 5);

    // Parallax starfield — three layers drift horizontally at their own
    // speed for cheap fake depth.
    for (const layer of this._starLayers) {
      const offset = (this._time * layer.speed) % MAP_W;
      ctx.drawImage(layer.canvas, -offset, 0, MAP_W, MAP_H);
      ctx.drawImage(layer.canvas, MAP_W - offset, 0, MAP_W, MAP_H);
    }
    if (this._starLayerHalos) ctx.drawImage(this._starLayerHalos, 0, 0, MAP_W, MAP_H);
    if (this._world) ctx.drawImage(this._world, 0, 0, MAP_W, MAP_H);
    this._drawGrid(ctx);
    this._drawSweep(ctx);

    for (const t of this.tracks.values()) {
      t.x += (t.tx - t.x) * ease;
      t.y += (t.ty - t.y) * ease;
      if (!isIssTrack(t)) this._drawObject(ctx, t);
    }

    this._drawISS(ctx);
    this._drawEffects(ctx, dt);
    this._drawLasers(ctx, now);

    // Selection reticle on top of everything.
    if (this.selectedId) {
      const sel = this.tracks.get(this.selectedId);
      if (sel) this._drawSelection(ctx, sel);
    }

    ctx.restore();
  }

  /** Particles (tiny squares) + shockwave rings. */
  _drawEffects(ctx, dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt * 1.8;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 2.1;
      p.vy *= 1 - dt * 2.1;
      p.rot += p.vr * dt;

      const s = p.size * (0.4 + p.life * 0.6);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = hexAlpha(p.color, Math.max(p.life, 0) * 0.95);
      if (p.shape === 'triangle') {
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.78);
        ctx.lineTo(s * 0.7, s * 0.55);
        ctx.lineTo(-s * 0.7, s * 0.55);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(-s / 2, -s / 2, s, s);
      }
      ctx.restore();
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt * 2.1;
      if (r.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      r.r += dt * 170;
      ctx.strokeStyle = hexAlpha(r.color, r.life * 0.8);
      ctx.lineWidth = 2 * r.life + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.stroke();
    }
  }

  /** Render active orbital laser strikes. */
  _drawLasers(ctx, now) {
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const L = this.lasers[i];
      const age = now - L.start;
      const total = L.beamMs + L.lingerMs;
      if (age > total) {
        this.lasers.splice(i, 1);
        continue;
      }
      const beamProgress = Math.min(1, age / L.beamMs);
      const tipY = L.y * beamProgress;

      ctx.save();
      // Thick glowing beam (outer glow).
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.35)';
      ctx.lineWidth = 18;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(L.x, 0);
      ctx.lineTo(L.x, tipY);
      ctx.stroke();

      // Mid glow.
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.7)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(L.x, 0);
      ctx.lineTo(L.x, tipY);
      ctx.stroke();

      // Bright white core.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(L.x, 0);
      ctx.lineTo(L.x, tipY);
      ctx.stroke();

      // Impact head while traveling.
      if (beamProgress < 1) {
        const g = ctx.createRadialGradient(L.x, tipY, 0, L.x, tipY, 14);
        g.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        g.addColorStop(1, 'rgba(0, 243, 255, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(L.x, tipY, 14, 0, TAU);
        ctx.fill();
      }

      // Massive shockwave ring on arrival.
      if (age >= L.beamMs) {
        const ringAge = age - L.beamMs;
        const ringProgress = Math.min(1, ringAge / L.lingerMs);
        const r = 12 + ringProgress * 150;
        const alpha = 1 - ringProgress;
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
        ctx.lineWidth = 4 * alpha + 1;
        ctx.beginPath();
        ctx.arc(L.x, L.y, r, 0, TAU);
        ctx.stroke();

        ctx.strokeStyle = `rgba(0, 243, 255, ${alpha * 0.8})`;
        ctx.lineWidth = 2 * alpha + 0.5;
        ctx.beginPath();
        ctx.arc(L.x, L.y, r * 0.7, 0, TAU);
        ctx.stroke();

        // Flash at impact point.
        const flashAlpha = Math.max(0, 1 - ringProgress * 2.5);
        if (flashAlpha > 0) {
          const fg = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, 60);
          fg.addColorStop(0, `rgba(255, 255, 255, ${flashAlpha})`);
          fg.addColorStop(1, 'rgba(0, 243, 255, 0)');
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.arc(L.x, L.y, 60, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  /** Dark sci-fi grid drawn over the world map, plus radar range rings. */
  _drawGrid(ctx) {
    // Minor cell grid.
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.028)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= MAP_W; x += 40) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, MAP_H);
    }
    for (let y = 0; y <= MAP_H; y += 40) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(MAP_W, y + 0.5);
    }
    ctx.stroke();

    // Major cells.
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    for (let x = 0; x <= MAP_W; x += 80) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, MAP_H);
    }
    for (let y = 0; y <= MAP_H; y += 80) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(MAP_W, y + 0.5);
    }
    ctx.stroke();

    // Equator + prime meridian.
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.14)';
    ctx.beginPath();
    ctx.moveTo(0, MAP_H / 2 + 0.5);
    ctx.lineTo(MAP_W, MAP_H / 2 + 0.5);
    ctx.moveTo(MAP_W / 2 + 0.5, 0);
    ctx.lineTo(MAP_W / 2 + 0.5, MAP_H);
    ctx.stroke();

    // Concentric radar range rings around the sweep origin.
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.05)';
    ctx.setLineDash([2, 7]);
    ctx.beginPath();
    for (let r = 75; r <= 300; r += 75) {
      ctx.moveTo(MAP_W / 2 + r, MAP_H / 2);
      ctx.arc(MAP_W / 2, MAP_H / 2, r, 0, TAU);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Corner ticks — HUD framing.
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.5)';
    ctx.lineWidth = 2;
    const m = 10;
    const L = 18;
    ctx.beginPath();
    ctx.moveTo(m, m + L); ctx.lineTo(m, m); ctx.lineTo(m + L, m);
    ctx.moveTo(MAP_W - m - L, m); ctx.lineTo(MAP_W - m, m); ctx.lineTo(MAP_W - m, m + L);
    ctx.moveTo(m, MAP_H - m - L); ctx.lineTo(m, MAP_H - m); ctx.lineTo(m + L, MAP_H - m);
    ctx.moveTo(MAP_W - m - L, MAP_H - m); ctx.lineTo(MAP_W - m, MAP_H - m); ctx.lineTo(MAP_W - m, MAP_H - m - L);
    ctx.stroke();
  }

  /** Continuous 360° cyan radar sweep rotating from the map centre. */
  _drawSweep(ctx) {
    if (!this._sweepLayer) return;
    ctx.save();
    ctx.translate(MAP_W / 2, MAP_H / 2);
    ctx.rotate(this._sweep);
    ctx.drawImage(this._sweepLayer, -MAP_W / 2, -MAP_H / 2);
    ctx.restore();
  }

  /** Glowing cyan ISS cross riding the sine-wave orbit. */
  _drawISS(ctx) {
    // Visible dashed trajectory the ISS follows across the map.
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.32)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 9]);
    ctx.beginPath();
    for (let px = 0; px <= MAP_W; px += 4) {
      const py = MAP_H / 2 + Math.sin(((px - 60) / (MAP_W + 120)) * TAU * 2) * 105;
      if (px === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    const { x, y } = issPosition(this._time);
    if (x < -30 || x > MAP_W + 30) return;

    const pulse = 0.5 + 0.5 * Math.sin(this._time * 3.4);

    // Cheap layered glow (no shadowBlur).
    ctx.fillStyle = hexAlpha(COLORS.iss, 0.07 + pulse * 0.05);
    ctx.beginPath();
    ctx.arc(x, y, 15 + pulse * 5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = hexAlpha(COLORS.iss, 0.18);
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.28);

    // Thin solar-panel arms.
    ctx.strokeStyle = hexAlpha(COLORS.iss, 0.9);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-17, 0);
    ctx.lineTo(-5, 0);
    ctx.moveTo(5, 0);
    ctx.lineTo(17, 0);
    ctx.moveTo(0, -10);
    ctx.lineTo(0, -4);
    ctx.moveTo(0, 4);
    ctx.lineTo(0, 10);
    ctx.stroke();

    // Solar panel blocks.
    ctx.fillStyle = hexAlpha(COLORS.iss, 0.52);
    ctx.fillRect(-17, -3.2, 9, 6.4);
    ctx.fillRect(8, -3.2, 9, 6.4);

    // Bright core + white cross pip.
    ctx.fillStyle = '#d9fdff';
    ctx.fillRect(-3.2, -3.2, 6.4, 6.4);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-1.8, 0);
    ctx.lineTo(1.8, 0);
    ctx.moveTo(0, -1.8);
    ctx.lineTo(0, 1.8);
    ctx.stroke();

    // Blinking beacon.
    if (pulse > 0.55) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -12.5, 1.6, 0, TAU);
      ctx.fill();
    }

    ctx.restore();

    // Callsign.
    ctx.font = '9px "Share Tech Mono", "Fira Code", monospace';
    ctx.fillStyle = hexAlpha(COLORS.iss, 0.9);
    ctx.fillText('ISS', x + 20, y - 11);
  }

  /** Tiered glowing dots. */
  _drawObject(ctx, t) {
    const tier = (t.riskLevel ?? 0) >= 7 ? 'high' : riskTier(t.riskLevel);
    const x = t.x;
    const y = t.y;
    const phase = t.phase || 0;

    // Direct-threat warning: red tether to the ISS for every high-risk object.
    if ((t.riskLevel ?? 0) >= 7) {
      const iss = issPosition(this._time);
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 0, 60, 0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(iss.x, iss.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    if (tier === 'low') {
      // Small neon-green dot, no glow.
      ctx.fillStyle = hexAlpha(COLORS.low, 0.92);
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, TAU);
      ctx.fill();
      return;
    }

    if (tier === 'elev') {
      // Yellow, medium, pulsing glow.
      const p = 0.5 + 0.5 * Math.sin(this._time * 4 + phase);
      ctx.fillStyle = hexAlpha(COLORS.elev, 0.1 + 0.12 * p);
      ctx.beginPath();
      ctx.arc(x, y, 5.5 + p * 3.5, 0, TAU);
      ctx.fill();

      ctx.fillStyle = hexAlpha(COLORS.elev, 0.3);
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, TAU);
      ctx.fill();

      ctx.fillStyle = COLORS.elev;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, TAU);
      ctx.fill();
      return;
    }

    // HIGH: aggressive red pulse — sharp spikes, not a gentle sine.
    const wave = 0.5 + 0.5 * Math.sin(this._time * 11 + phase);
    const spike = Math.pow(wave, 5);

    ctx.fillStyle = hexAlpha(COLORS.high, 0.07 + 0.3 * spike);
    ctx.beginPath();
    ctx.arc(x, y, 10 + spike * 14, 0, TAU);
    ctx.fill();

    ctx.fillStyle = hexAlpha(COLORS.high, 0.2 + 0.22 * spike);
    ctx.beginPath();
    ctx.arc(x, y, 7.5 + spike * 2, 0, TAU);
    ctx.fill();

    ctx.fillStyle = COLORS.high;
    ctx.beginPath();
    ctx.arc(x, y, 3.8, 0, TAU);
    ctx.fill();

    // Expanding pulse ring.
    ctx.strokeStyle = hexAlpha(COLORS.high, 0.42 * (1 - wave));
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, 12 + wave * 16, 0, TAU);
    ctx.stroke();

    // Crosshair reticle.
    const inner = 15;
    const outer = 22 + spike * 4;
    ctx.strokeStyle = hexAlpha(COLORS.high, 0.45 + 0.45 * spike);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      ctx.moveTo(x + dx * inner, y + dy * inner);
      ctx.lineTo(x + dx * outer, y + dy * outer);
    }
    ctx.stroke();

    // Fast rotating targeting ring.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this._time * 1.4 + phase);
    ctx.strokeStyle = hexAlpha(COLORS.high, 0.3 + 0.3 * spike);
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, 18.5, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  /** Locked target: rotating brackets close in, then pulse on lock. */
  _drawSelection(ctx, t) {
    const tier = riskTier(t.riskLevel);
    const color = tier === 'high' ? COLORS.high : tier === 'elev' ? COLORS.elev : COLORS.low;
    const pulse = 0.5 + 0.5 * Math.sin(this._time * 6);
    const acquiring = this.acquiring;
    const lock = acquiring ? this._lockT : 1;
    const ease = 1 - Math.pow(1 - lock, 3);

    ctx.save();
    ctx.translate(t.x, t.y);

    // Rotating dashed acquisition ring — closes in while acquiring.
    const ringR = 15 + pulse * 2 + (1 - ease) * 32;
    ctx.rotate(acquiring ? this._time * 4.2 * (1.2 - ease) : -this._time * 1.6);
    ctx.strokeStyle = hexAlpha(color, acquiring ? 0.45 + ease * 0.55 : 1);
    ctx.lineWidth = 1.5;
    ctx.setLineDash(acquiring ? [3, 6] : [5, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, ringR, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.rotate(acquiring ? -this._time * 4.2 * (1.2 - ease) : this._time * 1.6);

    // Crosshair lines with a clear center gap.
    const gap = 4.5 + (1 - ease) * 5;
    const span = 25 + pulse * 3 + (1 - ease) * 14;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(-span, 0);
    ctx.lineTo(-gap, 0);
    ctx.moveTo(gap, 0);
    ctx.lineTo(span, 0);
    ctx.moveTo(0, -span);
    ctx.lineTo(0, -gap);
    ctx.moveTo(0, gap);
    ctx.lineTo(0, span);
    ctx.stroke();

    // Four corner brackets — rotating during acquisition, snapping shut.
    const r = 17 + pulse * 2 + (1 - ease) * 29;
    const len = 6 + (1 - ease) * 5;
    ctx.save();
    ctx.rotate(acquiring ? (1 - ease) * -1.5 + this._time * 2.4 : 0);
    ctx.lineWidth = 2;
    ctx.strokeStyle = hexAlpha(color, acquiring ? 0.55 + ease * 0.45 : 1);
    ctx.beginPath();
    ctx.moveTo(-r, -r + len); ctx.lineTo(-r, -r); ctx.lineTo(-r + len, -r);
    ctx.moveTo(r - len, -r); ctx.lineTo(r, -r); ctx.lineTo(r, -r + len);
    ctx.moveTo(-r, r - len); ctx.lineTo(-r, r); ctx.lineTo(-r + len, r);
    ctx.moveTo(r - len, r); ctx.lineTo(r, r); ctx.lineTo(r, r - len);
    ctx.stroke();
    ctx.restore();

    // Acquisition progress arc.
    if (acquiring) {
      ctx.strokeStyle = hexAlpha(color, 0.85);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 28, -Math.PI / 2, -Math.PI / 2 + TAU * lock);
      ctx.stroke();
    }

    // Center dot keeps the exact target readable under the crosshair.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 1.7, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Label.
    ctx.font = '10px "Share Tech Mono", "Fira Code", monospace';
    const label = acquiring
      ? `ACQUIRING · ${String(Math.round(lock * 100)).padStart(3, ' ')}%`
      : `LOCK · ${String(t.name || t.id).toUpperCase()}`;
    ctx.fillStyle = acquiring ? hexAlpha(color, 0.8 + ease * 0.2) : 'rgba(230, 247, 255, 0.92)';
    const lx = Math.min(t.x + 22, MAP_W - ctx.measureText(label).width - 8);
    const ly = t.y < 24 ? t.y + 38 : t.y - 28;
    ctx.fillText(label, lx, ly);
  }
}
