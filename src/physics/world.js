/**
 * Debris Derby — Phase 3 physics world.
 *
 * Fixed-step (60 Hz) Verlet integration with position-based distance
 * constraints (12 iterations per fixed step). Pure JavaScript: no DOM,
 * no React, no game engine. Every body and constraint is allocated once
 * at scenario spawn; the hot step loop mutates in place and allocates
 * nothing.
 *
 * Debug world (Phase 3 only): a flat 2D space with a fixed anchor (the
 * player tug) at the top centre, a planet limb curving across the
 * bottom, and a handful of seeded debris masses under constant gravity.
 * The tether is a rope constraint between the anchor and one grabbed
 * body: slack below rest length, taut toward rest length, hard-capped
 * at max length.
 */

const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 5;
const CONSTRAINT_ITERATIONS = 12;
const DT2 = FIXED_DT * FIXED_DT;

const GRAVITY = 520; // px / s^2, downward

// Tether
const TETHER_REST = 160; // px: slack below this length
const TETHER_MAX = 300; // px: hard reach cap
const GRAB_RADIUS = 24; // px: pointer radius test for GRAB
const ANCHOR_RADIUS = 7;

// Planet limb (bottom of the debug world)
const PLANET_RADIUS_FRAC = 0.9;
const PARTICLE_COUNT = 7;
const SPAWN_MIN_R = 70;
const SPAWN_MAX_R = 210;

// Thrust / fuel
const THRUST_ACC = 960; // px / s^2 along the tether normal, outward
const FUEL_DRAIN = 0.22; // fuel per second of thrust
const RESTITUTION = 0.4; // planet-limb bounce

const DEFAULT_SEED = 2026;
const TAU = Math.PI * 2;

/**
 * Seeded PRNG (mulberry32). Same seed => same scenario => same trace.
 */
function mulberry32(seed) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dist2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

function makeParticle(id, x, y, vx, vy, radius, mass, color) {
  return {
    id,
    x,
    y, // current position
    px: x - vx * FIXED_DT,
    py: y - vy * FIXED_DT, // previous position (implicit velocity)
    ax: 0,
    ay: 0, // acceleration accumulator
    invMass: mass > 0 ? 1 / mass : 0,
    radius,
    mass,
    fixed: false,
    color,
  };
}

function makeFixedParticle(x, y, radius) {
  const p = makeParticle('anchor', x, y, 0, 0, radius, Infinity, null);
  p.fixed = true;
  p.invMass = 0;
  return p;
}

function debrisColor(mass) {
  // Heavier debris reads whiter; mass affects visuals only in Phase 3.
  const t = Math.min(1, Math.max(0, (mass - 6) / 12));
  const a = 0.35 + 0.65 * t;
  return `rgba(255, 255, 255, ${a})`;
}

export class World {
  constructor({ width = 800, height = 600, devicePixelRatio = 1, seed = DEFAULT_SEED } = {}) {
    this.width = width;
    this.height = height;
    this.dpr = devicePixelRatio;
    this.seed = seed;
    this.rng = mulberry32(seed);

    this.particles = [];
    this.tether = null; // { rest, max } while a body is grabbed
    this.grabbed = null;
    this.anchor = null;
    this.planet = { x: 0, y: 0, radius: 0 };

    this.fuel = 1;
    this.thrusting = false;
    this.tension = 0;
    this.substeps = 0;

    // Last pointer position in world (CSS pixel) space.
    this.pointer = { x: 0, y: 0 };

    this.spawnScenario();
  }

  spawnScenario() {
    const cx = this.width * 0.5;
    const anchorY = this.height * 0.22;

    this.anchor = makeFixedParticle(cx, anchorY, ANCHOR_RADIUS);
    this.planet.radius = this.height * PLANET_RADIUS_FRAC;
    this.planet.x = cx;
    this.planet.y = this.height + this.planet.radius * 0.5;

    this.particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const angle = this.rng() * TAU;
      const reach = SPAWN_MIN_R + this.rng() * (SPAWN_MAX_R - SPAWN_MIN_R);
      let x = cx + Math.cos(angle) * reach;
      let y = anchorY + Math.sin(angle) * reach;
      // Keep debris on screen and clear of the limb at spawn.
      x = Math.min(Math.max(x, 40), this.width - 40);
      y = Math.min(Math.max(y, 40), this.height * 0.5);

      const radius = 6 + this.rng() * 10;
      const mass = 0.5 + radius; // kg-ish; visual only in Phase 3
      const speed = 20 + this.rng() * 40;
      // Tangential drift so the swarm is not static.
      const vx = -Math.sin(angle) * speed;
      const vy = Math.cos(angle) * speed;

      this.particles.push(
        makeParticle(`debris-${i}`, x, y, vx, vy, radius, mass, debrisColor(mass)),
      );
    }
  }

  /**
   * Canvas CSS size changed (resize / device-pixel-ratio). Re-anchor the
   * debug world without resetting the simulation.
   */
  setSize(width, height) {
    this.width = width;
    this.height = height;
    if (this.anchor) {
      this.anchor.x = width * 0.5;
      this.anchor.y = height * 0.22;
    }
    if (this.planet) {
      this.planet.radius = height * PLANET_RADIUS_FRAC;
      this.planet.x = width * 0.5;
      this.planet.y = height + this.planet.radius * 0.5;
    }
  }

  /* ------------------------------------------------------------------ */
  // Input

  /**
   * GRAB: pointer radius test. The nearest debris within GRAB_RADIUS of
   * the pointer and within TETHER_MAX of the anchor is attached. Rope
   * behaviour: slack below rest length, taut past it.
   */
  grab(worldX, worldY) {
    this.pointer.x = worldX;
    this.pointer.y = worldY;
    if (this.grabbed) return false;

    const radius2 = GRAB_RADIUS * GRAB_RADIUS;
    const reach2 = TETHER_MAX * TETHER_MAX;
    const ax = this.anchor.x;
    const ay = this.anchor.y;

    let best = null;
    let bestD2 = radius2;
    for (const p of this.particles) {
      if (dist2(worldX, worldY, p.x, p.y) >= bestD2) continue;
      if (dist2(ax, ay, p.x, p.y) > reach2) continue;
      bestD2 = dist2(worldX, worldY, p.x, p.y);
      best = p;
    }
    if (!best) return false;

    this.grabbed = best;
    this.tether = { rest: TETHER_REST, max: TETHER_MAX };
    this.tension = 0;
    return true;
  }

  /** GRAB without a pointer: nearest debris within tether reach (E key). */
  grabNearest() {
    if (this.grabbed) return false;
    const reach2 = TETHER_MAX * TETHER_MAX;
    const ax = this.anchor.x;
    const ay = this.anchor.y;

    let best = null;
    let bestD2 = reach2;
    for (const p of this.particles) {
      const d2 = dist2(ax, ay, p.x, p.y);
      if (d2 >= bestD2) continue;
      bestD2 = d2;
      best = p;
    }
    if (!best) return false;

    this.grabbed = best;
    this.tether = { rest: TETHER_REST, max: TETHER_MAX };
    this.tension = 0;
    return true;
  }

  /** RELEASE: detach the tether; the body keeps its release velocity. */
  release() {
    this.tether = null;
    this.grabbed = null;
    this.tension = 0;
  }

  setThrusting(thrusting) {
    this.thrusting = !!thrusting;
  }

  /* ------------------------------------------------------------------ */
  // Fixed step

  /**
   * One fixed step (1/60 s). Callers drive the accumulator; see the app
   * shell for max-substep clamping.
   */
  step() {
    const particles = this.particles;
    const dt2 = DT2;

    // 1. Forces: gravity plus thrust along the tether normal.
    for (const p of particles) {
      if (p.fixed) continue;
      p.ay += GRAVITY;
    }
    if (this.thrusting && this.grabbed && this.fuel > 0) {
      const g = this.grabbed;
      const a = this.anchor;
      let dx = g.x - a.x;
      let dy = g.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0) {
        g.ax += (dx / d) * THRUST_ACC;
        g.ay += (dy / d) * THRUST_ACC;
      }
      this.fuel = Math.max(0, this.fuel - FUEL_DRAIN * FIXED_DT);
    }

    // 2. Verlet integration.
    for (const p of particles) {
      if (p.fixed) continue;
      const nx = p.x;
      const ny = p.y;
      p.x += (p.x - p.px) + p.ax * dt2;
      p.y += (p.y - p.py) + p.ay * dt2;
      p.px = nx;
      p.py = ny;
      p.ax = 0;
      p.ay = 0;
    }

    // 3. Position-based constraints.
    for (let it = 0; it < CONSTRAINT_ITERATIONS; it += 1) {
      if (this.tether && this.grabbed) this.solveTether();
      for (const p of particles) this.resolvePlanet(p);
    }
  }

  solveTether() {
    const a = this.anchor;
    const g = this.grabbed;
    const { rest, max } = this.tether;

    let dx = g.x - a.x;
    let dy = g.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d === 0) {
      this.tension = 0;
      return;
    }

    // Rope: slack below rest length, taut toward rest length, hard cap
    // at max length.
    let target = null;
    if (d > max) target = max;
    else if (d > rest) target = rest;
    if (target === null) {
      this.tension = 0;
      return;
    }

    const correction = (d - target) / d;
    const totalInvMass = a.invMass + g.invMass;
    if (totalInvMass === 0) return;
    const share = g.invMass / totalInvMass;
    g.x -= dx * correction * share;
    g.y -= dy * correction * share;

    this.tension = d - target;
  }

  resolvePlanet(p) {
    const pl = this.planet;
    let dx = p.x - pl.x;
    let dy = p.y - pl.y;
    let d = Math.sqrt(dx * dx + dy * dy);
    const minDist = pl.radius + p.radius;
    if (d >= minDist) return;

    if (d === 0) {
      dx = 0;
      dy = 1;
    } else {
      dx /= d;
      dy /= d;
    }

    // Position correction: push the body out of the limb.
    p.x = pl.x + dx * minDist;
    p.y = pl.y + dy * minDist;

    // Reflect the implicit velocity (verlet previous position) so the
    // body bounces/slides with restitution.
    const vx = p.x - p.px;
    const vy = p.y - p.py;
    const vn = vx * dx + vy * dy;
    p.px = p.x - (vx - 2 * vn * dx) * RESTITUTION;
    p.py = p.y - (vy - 2 * vn * dy) * RESTITUTION;
  }
}

export {
  FIXED_DT,
  MAX_SUBSTEPS,
  CONSTRAINT_ITERATIONS,
  TETHER_REST,
  TETHER_MAX,
  GRAB_RADIUS,
  DEFAULT_SEED,
};