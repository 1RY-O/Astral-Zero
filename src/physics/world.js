/**
 * Debris Derby — Phase 3 physics world.
 *
 * Fixed-step (60 Hz) Verlet integration with position-based distance
 * constraints (12 iterations per fixed step). Zero-g environment: no
 * downward gravity. Atmospheric kill-zone (planet limb) deletes debris
 * on contact (burn up). Circle-circle collision with destructible impact
 * fragmentation.
 */

const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 5;
const CONSTRAINT_ITERATIONS = 12;
const DT2 = FIXED_DT * FIXED_DT;
const DAMPING = 0.9995;

// Tether
const TETHER_REST = 160; // px: slack below this length
const TETHER_MAX = 300; // px: hard reach cap
const GRAB_RADIUS = 32; // px: pointer radius test for GRAB
const ANCHOR_RADIUS = 7;

// Debris swarm
const PARTICLE_COUNT = 7;
const SPAWN_MIN_R = 70;
const SPAWN_MAX_R = 210;

// Thrust / fuel
const THRUST_ACC = 960; // px / s^2 along the tether normal, outward
const FUEL_DRAIN = 0.22; // fuel per second of thrust

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
  const t = Math.min(1, Math.max(0, (mass - 6) / 12));
  const a = 0.35 + 0.65 * t;
  return `rgba(255, 255, 255, ${a.toFixed(3)})`;
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

    this.fuel = 1;
    this.thrusting = false;
    this.thrustDir = null; // optional directional vector { x, y }
    this.tension = 0;
    this.substeps = 0;
    this.burnedCount = 0;

    // Last pointer position in world (CSS pixel) space.
    this.pointer = { x: 0, y: 0 };

    this.spawnScenario();
  }

  getPlanetLimb() {
    const r = Math.max(this.width, this.height) * 2;
    const apexY = this.height - 40;
    const cx = this.width * 0.5;
    const cy = apexY + r;
    return { cx, cy, r, apexY };
  }

  isInsideAtmosphere(x, y, radius = 0) {
    const limb = this.getPlanetLimb();
    const dx = x - limb.cx;
    const dy = y - limb.cy;
    return Math.hypot(dx, dy) <= (limb.r + radius);
  }

  spawnScenario() {
    const cx = this.width * 0.5;
    const anchorY = this.height * 0.22;

    this.anchor = makeFixedParticle(cx, anchorY, ANCHOR_RADIUS);

    this.particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const angle = this.rng() * TAU;
      const reach = SPAWN_MIN_R + this.rng() * (SPAWN_MAX_R - SPAWN_MIN_R);
      let x = cx + Math.cos(angle) * reach;
      let y = anchorY + Math.sin(angle) * reach;
      // Keep debris on screen at spawn.
      x = Math.min(Math.max(x, 40), this.width - 40);
      y = Math.min(Math.max(y, 40), this.height * 0.5);

      const radius = 6 + this.rng() * 10;
      const mass = 0.5 + radius;
      const speed = 20 + this.rng() * 40;
      const vx = -Math.sin(angle) * speed;
      const vy = Math.cos(angle) * speed;

      this.particles.push(
        makeParticle(`debris-${i}`, x, y, vx, vy, radius, mass, debrisColor(mass)),
      );
    }
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
    if (this.anchor) {
      this.anchor.x = width * 0.5;
      this.anchor.y = height * 0.22;
    }
  }

  /* ------------------------------------------------------------------ */
  // Input

  grab(worldX, worldY) {
    this.pointer.x = worldX;
    this.pointer.y = worldY;

    // If clicking on already grabbed body, release it
    if (this.grabbed) {
      if (dist2(worldX, worldY, this.grabbed.x, this.grabbed.y) <= Math.max(GRAB_RADIUS * GRAB_RADIUS, this.grabbed.radius * this.grabbed.radius * 4)) {
        this.release();
        return false;
      }
    }

    const reach2 = TETHER_MAX * TETHER_MAX;
    const ax = this.anchor.x;
    const ay = this.anchor.y;

    let best = null;
    let bestD2 = GRAB_RADIUS * GRAB_RADIUS;
    for (const p of this.particles) {
      const pHitRadius = Math.max(GRAB_RADIUS, p.radius + 12);
      const d2p = dist2(worldX, worldY, p.x, p.y);
      if (d2p > pHitRadius * pHitRadius) continue;
      if (dist2(ax, ay, p.x, p.y) > reach2) continue;
      if (d2p < bestD2) {
        bestD2 = d2p;
        best = p;
      }
    }
    if (!best) return false;

    this.grabbed = best;
    this.tether = { rest: TETHER_REST, max: TETHER_MAX };
    this.tension = 0;
    return true;
  }

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

  release() {
    const released = this.grabbed;
    this.tether = null;
    this.grabbed = null;
    this.tension = 0;
    return released;
  }

  setThrusting(thrusting, dir = null) {
    this.thrusting = !!thrusting;
    this.thrustDir = dir;
  }

  /* ------------------------------------------------------------------ */
  // Fixed step

  step() {
    const particles = this.particles;
    const dt = FIXED_DT;
    const dt2 = DT2;

    // 1. Forces: thrust along tether normal (or manual direction)
    if (this.thrusting && this.grabbed && this.fuel > 0) {
      const g = this.grabbed;
      const a = this.anchor;
      let dx = g.x - a.x;
      let dy = g.y - a.y;
      if (this.thrustDir && (this.thrustDir.x !== 0 || this.thrustDir.y !== 0)) {
        dx = this.thrustDir.x;
        dy = this.thrustDir.y;
      }
      const d = Math.hypot(dx, dy);
      if (d > 0) {
        g.ax += (dx / d) * THRUST_ACC;
        g.ay += (dy / d) * THRUST_ACC;
      }
      this.fuel = Math.max(0, this.fuel - FUEL_DRAIN * dt);
    }

    // 2. Verlet integration: zero-g (no downward gravity)
    for (const p of particles) {
      if (p.fixed) continue;
      const vx = (p.x - p.px) * DAMPING;
      const vy = (p.y - p.py) * DAMPING;
      p.px = p.x;
      p.py = p.y;
      p.x += vx + p.ax * dt2;
      p.y += vy + p.ay * dt2;
      p.ax = 0;
      p.ay = 0;
    }

    // 3. Position-based tether constraint (12 iterations per step)
    for (let it = 0; it < CONSTRAINT_ITERATIONS; it += 1) {
      if (this.tether && this.grabbed) this.solveTether();
    }

    // 4. Circle-circle collisions and destructible fragmentation
    this.solveCollisions();

    // 5. Atmospheric kill-zone (planet limb) - burn up on contact, NO bounce/slide
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      if (p.fixed) continue;
      if (this.isInsideAtmosphere(p.x, p.y, p.radius)) {
        if (this.grabbed === p) {
          this.release();
        }
        particles.splice(i, 1);
        this.burnedCount += 1;
      }
    }
  }

  solveTether() {
    const a = this.anchor;
    const b = this.grabbed;
    const { rest: restLength, max: maxLength } = this.tether;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1e-6;

    if (dist <= restLength) {
      this.tension = 0;
      return;
    }

    const target = dist > maxLength ? maxLength : restLength;
    const diff = (dist - target) / dist;
    const wa = a.invMass;
    const wb = b.invMass;
    const wsum = wa + wb;
    if (wsum > 0) {
      a.x += dx * diff * (wa / wsum);
      a.y += dy * diff * (wa / wsum);
      b.x -= dx * diff * (wb / wsum);
      b.y -= dy * diff * (wb / wsum);
    }

    this.tension = dist - target;
  }

  solveCollisions() {
    const dt = FIXED_DT;
    for (let i = 0; i < this.particles.length; i += 1) {
      const p1 = this.particles[i];
      for (let j = i + 1; j < this.particles.length; j += 1) {
        const p2 = this.particles[j];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const d2 = dx * dx + dy * dy;
        const minDist = p1.radius + p2.radius;
        if (d2 < minDist * minDist && d2 > 0) {
          const dist = Math.sqrt(d2);
          const nx = dx / dist;
          const ny = dy / dist;

          const v1x = (p1.x - p1.px) / dt;
          const v1y = (p1.y - p1.py) / dt;
          const v2x = (p2.x - p2.px) / dt;
          const v2y = (p2.y - p2.py) / dt;
          const relSpeed = Math.hypot(v2x - v1x, v2y - v1y);

          // Destructible fragmentation on fast impact
          if (relSpeed > 75 && (p1.radius >= 8 || p2.radius >= 8)) {
            const targetIdx = p1.radius >= p2.radius ? i : j;
            this.fragmentParticle(targetIdx, relSpeed, nx, ny);
            return;
          }

          // Elastic separation
          const overlap = minDist - dist;
          const w1 = p1.invMass;
          const w2 = p2.invMass;
          const wsum = w1 + w2;
          if (wsum > 0) {
            p1.x -= nx * overlap * (w1 / wsum);
            p1.y -= ny * overlap * (w1 / wsum);
            p2.x += nx * overlap * (w2 / wsum);
            p2.y += ny * overlap * (w2 / wsum);
          }

          const kx = v1x - v2x;
          const ky = v1y - v2y;
          const p = 2 * (nx * kx + ny * ky) / (p1.mass + p2.mass);
          p1.px = p1.x - (v1x - p * p2.mass * nx) * dt;
          p1.py = p1.y - (v1y - p * p2.mass * ny) * dt;
          p2.px = p2.x - (v2x + p * p1.mass * nx) * dt;
          p2.py = p2.y - (v2y + p * p1.mass * ny) * dt;
        }
      }
    }
  }

  fragmentParticle(index, impactSpeed, nx = 0, ny = 1) {
    const p = this.particles[index];
    if (!p) return;
    if (this.grabbed === p) {
      this.release();
    }
    this.particles.splice(index, 1);

    const newRadius = Math.max(3.5, p.radius * 0.58);
    const newMass = Math.max(0.2, p.mass / 3);
    const vx = (p.x - p.px) / FIXED_DT;
    const vy = (p.y - p.py) / FIXED_DT;
    const baseAngle = Math.atan2(ny, nx);

    for (let k = 0; k < 3; k += 1) {
      const angle = baseAngle + (k * (TAU / 3)) + (this.rng() * 0.2 - 0.1);
      const speed = Math.max(25, impactSpeed * 0.4);
      const fvx = vx * 0.5 + Math.cos(angle) * speed;
      const fvy = vy * 0.5 + Math.sin(angle) * speed;
      const fx = p.x + Math.cos(angle) * (newRadius + 2);
      const fy = p.y + Math.sin(angle) * (newRadius + 2);
      const frag = makeParticle(
        `${p.id}-f${k}-${Math.floor(this.rng() * 1000)}`,
        fx,
        fy,
        fvx,
        fvy,
        newRadius,
        newMass,
        debrisColor(newMass),
      );
      this.particles.push(frag);
    }
  }

  getTrajectory(steps = 90) {
    if (!this.grabbed) return [];
    const p = this.grabbed;
    const pts = [{ x: p.x, y: p.y }];
    let simX = p.x;
    let simY = p.y;
    let simVx = (p.x - p.px) / FIXED_DT;
    let simVy = (p.y - p.py) / FIXED_DT;
    const dt = FIXED_DT;

    for (let s = 0; s < steps; s += 1) {
      simX += simVx * dt;
      simY += simVy * dt;
      simVx *= DAMPING;
      simVy *= DAMPING;
      pts.push({ x: simX, y: simY });
      if (this.isInsideAtmosphere(simX, simY, p.radius)) {
        break;
      }
    }
    return pts;
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
