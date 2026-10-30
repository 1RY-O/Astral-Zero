/**
 * Debris Derby — Phase 4 physics world and game loop.
 *
 * Verlet integration with position-based distance constraints (12 iterations).
 * Zero-g space, atmospheric kill-zone, circle-circle collision with destructible
 * fragmentation, 900ms cascade chain multiplier, retrograde/prograde scoring,
 * slow-mo, screen shake, and level progression.
 */

import { getLevelDef } from '../game/levels.js';
import { playGrab, playWhip, playThrust, playImpact, playDeorbit } from '../game/audio.js';
import { PALETTE } from '../ui/tokens.js';

const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 5;
const CONSTRAINT_ITERATIONS = 12;
const DAMPING = 0.9995;

// Tether
const TETHER_REST = 160; // px
const TETHER_MAX = 300; // px
const GRAB_RADIUS = 36; // px
const ANCHOR_RADIUS = 8;

// Thrust / fuel
const THRUST_ACC = 980; // px / s^2
const FUEL_DRAIN = 0.22; // fuel fraction per second

const DEFAULT_SEED = 2026;
const TAU = Math.PI * 2;
const CHAIN_WINDOW_MS = 900;

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

/**
 * Exact hit detection: returns true if click coordinates are within
 * multiplier * radius of the target coordinates.
 */
export function isHit(clickX, clickY, targetX, targetY, radius, multiplier = 2.5) {
  const dx = targetX - clickX;
  const dy = targetY - clickY;
  const hitRadius = multiplier * radius;
  return dx * dx + dy * dy <= hitRadius * hitRadius;
}

function makeParticle(id, x, y, vx, vy, radius, mass, color) {
  return {
    id,
    x,
    y,
    px: x - vx * FIXED_DT,
    py: y - vy * FIXED_DT,
    ax: 0,
    ay: 0,
    invMass: mass > 0 ? 1 / mass : 0,
    radius,
    mass,
    fixed: false,
    color,
    releaseDot: -1, // default retrograde
    releasedAt: 0,
    chainedFrom: null,
  };
}

function makeFixedParticle(x, y, radius) {
  const p = makeParticle('anchor', x, y, 0, 0, radius, Infinity, null);
  p.fixed = true;
  p.invMass = 0;
  return p;
}

function debrisColor(mass) {
  const t = Math.min(1, Math.max(0, (mass - 6) / 16));
  const a = 0.4 + 0.6 * t;
  return `rgba(255, 255, 255, ${a.toFixed(3)})`;
}

export class World {
  constructor({ width = 800, height = 600, devicePixelRatio = 1, seed = DEFAULT_SEED, levelId = null } = {}) {
    this.width = width;
    this.height = height;
    this.dpr = devicePixelRatio;
    this.seed = seed;
    this.rng = mulberry32(seed);

    this.levelId = levelId;
    this.particles = [];
    this.tether = null;
    this.grabbed = null;
    this.anchor = null;
    this.flashPink = 0;

    this.fuelMax = 100;
    this.fuel = 1; // 0..1 ratio of fuelMax
    this.thrusting = false;
    this.thrustDir = null;
    this.tension = 0;
    this.substeps = 0;

    // Juice & Effects
    this.timeScale = 1.0;
    this.slowMoTimer = 0;
    this.freezeFrames = 0;
    this.screenShake = 0;
    this.shakeX = 0;
    this.shakeY = 0;

    // Scoring & Cascades
    this.score = 0;
    this.chain = 0;
    this.maxChain = 0;
    this.lastDeorbitTime = null;
    this.deorbits = [];
    this.lingers = 0;
    this.burnedCount = 0;
    this.gameTime = 0;
    this.state = 'playing'; // 'playing' | 'cleared' | 'failed'
    this.floatingTexts = [];

    this.pointer = { x: 0, y: 0 };

    this.spawnScenario();
  }

  resetSwarm(seed = this.seed) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.fuel = 1;
    this.tension = 0;
    this.grabbed = null;
    this.tether = null;
    this.thrusting = false;
    this.thrustDir = null;
    this.burnedCount = 0;
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

    for (let i = 0; i < 7; i += 1) {
      const angle = this.rng() * TAU;
      const reach = 70 + this.rng() * 140;
      let x = cx + Math.cos(angle) * reach;
      let y = anchorY + Math.sin(angle) * reach;
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

  loadLevel(levelId) {
    this.levelId = levelId;
    const def = getLevelDef(levelId);
    this.fuelMax = def.fuelMax;
    this.fuel = 1;
    this.score = 0;
    this.chain = 0;
    this.maxChain = 0;
    this.deorbits = [];
    this.lingers = 0;
    this.burnedCount = 0;
    this.gameTime = 0;
    this.state = 'playing';
    this.floatingTexts = [];
    this.lastDeorbitTime = null;

    const cx = this.width * 0.5;
    const anchorY = this.height * 0.22;
    this.anchor = makeFixedParticle(cx, anchorY, ANCHOR_RADIUS);

    const spawned = def.spawn(this.rng, this.width, this.height);
    this.particles = spawned.map((item) =>
      makeParticle(
        item.id,
        item.x,
        item.y,
        item.vx,
        item.vy,
        item.radius,
        item.mass,
        debrisColor(item.mass),
      ),
    );
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
    if (this.anchor) {
      this.anchor.x = width * 0.5;
      this.anchor.y = height * 0.22;
    }
  }

  addFloatingText(text, x, y, color = PALETTE.clean) {
    this.floatingTexts.push({
      text,
      x,
      y,
      color,
      vy: -30,
      life: 1.0,
      maxLife: 1.0,
    });
  }

  /* ------------------------------------------------------------------ */
  // Input Verbs

  grab(worldX, worldY) {
    this.pointer.x = worldX;
    this.pointer.y = worldY;

    // Toggle release if clicking on currently grabbed object
    if (this.grabbed) {
      if (isHit(worldX, worldY, this.grabbed.x, this.grabbed.y, this.grabbed.radius, 2.5)) {
        this.release();
        return false;
      }
    }

    let best = null;
    let bestDist = Infinity;

    // Hit detection: click within 2.5x radius of any debris object
    for (const p of this.particles) {
      if (p.fixed) continue;
      const dx = p.x - worldX;
      const dy = p.y - worldY;
      const dist = Math.hypot(dx, dy);

      if (dist <= 2.5 * p.radius) {
        if (dist < bestDist) {
          bestDist = dist;
          best = p;
        }
      }
    }

    if (!best) return false;

    const ax = this.anchor ? this.anchor.x : this.width * 0.5;
    const ay = this.anchor ? this.anchor.y : this.height * 0.22;
    const dist = Math.hypot(best.x - ax, best.y - ay);
    const lockedLength = Math.max(40, dist);

    this.grabbed = best;
    this.tether = { length: lockedLength, rest: lockedLength, max: Math.max(TETHER_MAX, lockedLength + 40) };
    this.tension = 0;
    playGrab();
    return true;
  }

  grabNearest() {
    if (this.grabbed) return false;
    const ax = this.anchor ? this.anchor.x : this.width * 0.5;
    const ay = this.anchor ? this.anchor.y : this.height * 0.22;

    let best = null;
    let bestD2 = Infinity;
    for (const p of this.particles) {
      if (p.fixed) continue;
      const d2 = dist2(ax, ay, p.x, p.y);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = p;
      }
    }
    if (!best) return false;

    const dist = Math.sqrt(bestD2);
    const lockedLength = Math.max(40, dist);
    this.grabbed = best;
    this.tether = { length: lockedLength, rest: lockedLength, max: Math.max(TETHER_MAX, lockedLength + 40) };
    this.tension = 0;
    playGrab();
    return true;
  }

  release() {
    const released = this.grabbed;
    if (released) {
      const vx = (released.x - released.px) / FIXED_DT;
      const vy = (released.y - released.py) / FIXED_DT;
      const speed = Math.hypot(vx, vy);
      // Horizontal component defines retrograde vs prograde
      released.isPrograde = vx > 0;
      released.isRetrograde = vx < 0;
      released.releaseDot = speed > 0 ? -vx / speed : -1;
      released.releasedAt = this.gameTime;

      // NEWTON'S RECOIL: On release, apply an opposite impulse to the ship based on the object's mass
      if (this.anchor) {
        const shipMass = 120; // tug ship mass in kg
        const ratio = Math.min(1.5, released.mass / shipMass);
        const recoilVx = -vx * ratio * 0.4;
        const recoilVy = -vy * ratio * 0.4;
        this.anchor.recoilVx = (this.anchor.recoilVx || 0) + recoilVx;
        this.anchor.recoilVy = (this.anchor.recoilVy || 0) + recoilVy;
      }

      playWhip();
    }
    this.tether = null;
    this.grabbed = null;
    this.tension = 0;
    return released;
  }

  setThrusting(thrusting, dir = null) {
    if (thrusting && !this.thrusting && this.fuel > 0) {
      playThrust();
    }
    this.thrusting = !!thrusting;
    this.thrustDir = dir;
  }

  /* ------------------------------------------------------------------ */
  // Step Loop

  step() {
    if (this.freezeFrames > 0) {
      this.freezeFrames -= 1;
      return;
    }

    // Screen shake decay
    if (this.screenShake > 0.05) {
      this.screenShake *= 0.88;
      this.shakeX = (this.rng() * 2 - 1) * this.screenShake;
      this.shakeY = (this.rng() * 2 - 1) * this.screenShake;
    } else {
      this.screenShake = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    }

    // Slow-motion timer
    if (this.slowMoTimer > 0) {
      this.slowMoTimer -= FIXED_DT;
      if (this.slowMoTimer <= 0) {
        this.timeScale = 1.0;
      }
    }

    // Tether flash decay
    if (this.flashPink > 0) {
      this.flashPink = Math.max(0, this.flashPink - FIXED_DT * 2.5);
    }

    // Anchor recoil & restoring spring to station
    if (this.anchor) {
      const defaultX = this.width * 0.5;
      const defaultY = this.height * 0.22;
      if (this.anchor.recoilVx || this.anchor.recoilVy) {
        this.anchor.x += (this.anchor.recoilVx || 0) * FIXED_DT;
        this.anchor.y += (this.anchor.recoilVy || 0) * FIXED_DT;
        this.anchor.recoilVx *= 0.92;
        this.anchor.recoilVy *= 0.92;
        if (Math.abs(this.anchor.recoilVx) < 0.1) this.anchor.recoilVx = 0;
        if (Math.abs(this.anchor.recoilVy) < 0.1) this.anchor.recoilVy = 0;
      }
      this.anchor.x += (defaultX - this.anchor.x) * 0.05;
      this.anchor.y += (defaultY - this.anchor.y) * 0.05;
    }

    const dt = FIXED_DT * this.timeScale;
    const dt2 = dt * dt;
    this.gameTime += dt;

    // Update floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i -= 1) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      ft.y += ft.vy * dt;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // 1. Forces: thrust along tether normal (drives tangential swing)
    if (this.thrusting && this.grabbed && this.fuel > 0) {
      const g = this.grabbed;
      const a = this.anchor;
      const rx = g.x - a.x;
      const ry = g.y - a.y;
      const d = Math.hypot(rx, ry);

      if (d > 0) {
        if (this.thrustDir && (this.thrustDir.x !== 0 || this.thrustDir.y !== 0)) {
          const mag = Math.hypot(this.thrustDir.x, this.thrustDir.y);
          g.ax += (this.thrustDir.x / mag) * THRUST_ACC;
          g.ay += (this.thrustDir.y / mag) * THRUST_ACC;
        } else {
          // Tangential normal acceleration perpendicular to tether
          const tx = -ry / d;
          const ty = rx / d;
          const vx = (g.x - g.px) / FIXED_DT;
          const vy = (g.y - g.py) / FIXED_DT;
          const dot = vx * tx + vy * ty;
          const sign = Math.abs(dot) > 2 ? (dot >= 0 ? 1 : -1) : 1;
          g.ax += tx * sign * THRUST_ACC;
          g.ay += ty * sign * THRUST_ACC;
        }
      }
      this.fuel = Math.max(0, this.fuel - FUEL_DRAIN * dt);
    }

    // 2. Verlet integration: zero-g with arena boundary containment
    for (const p of this.particles) {
      if (p.fixed) continue;
      const vx = (p.x - p.px) * DAMPING;
      const vy = (p.y - p.py) * DAMPING;
      p.px = p.x;
      p.py = p.y;
      p.x += vx + p.ax * dt2;
      p.y += vy + p.ay * dt2;
      p.ax = 0;
      p.ay = 0;

      // Soft boundary bounce to keep zero-g floating debris in view
      const pad = p.radius + 16;
      if (p.x < pad) {
        p.x = pad;
        p.px = p.x + Math.abs(vx);
      } else if (p.x > this.width - pad) {
        p.x = this.width - pad;
        p.px = p.x - Math.abs(vx);
      }
      if (p.y < pad) {
        p.y = pad;
        p.py = p.y + Math.abs(vy);
      }
    }

    // 3. Position-based distance constraints (12 iterations)
    for (let it = 0; it < CONSTRAINT_ITERATIONS; it += 1) {
      if (this.tether && this.grabbed) this.solveTether();
    }

    // 4. Circle-circle collisions and destructible fragmentation
    this.solveCollisions();

    // 5. Atmospheric kill-zone (burn up on contact, respawn to maintain 7 floating debris)
    const atMs = Math.round(this.gameTime * 1000);
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      if (p.fixed) continue;
      if (this.isInsideAtmosphere(p.x, p.y, p.radius)) {
        if (this.grabbed === p) {
          this.release();
        }
        this.burnedCount += 1;

        // Points, scoring popups and cascade effects disabled for testing per user request
        const isRetrograde = p.releaseDot < 0;
        this.score = 0;

        this.deorbits.push({
          objectId: p.id,
          massKg: p.mass,
          releaseDot: isRetrograde ? -1 : 1,
          atMs,
        });

        playDeorbit();

        if (this.levelId !== null) {
          // In levels, deorbited satellite is permanently cleared
          this.particles.splice(i, 1);
        } else {
          // In sandbox mode only, respawn particle in upper orbit so debris swarm stays active
          const angle = this.rng() * TAU;
          const reach = 70 + this.rng() * 140;
          const cx = this.width * 0.5;
          const anchorY = this.anchor ? this.anchor.y : this.height * 0.22;
          p.x = Math.min(Math.max(cx + Math.cos(angle) * reach, 40), this.width - 40);
          p.y = Math.min(Math.max(anchorY + Math.sin(angle) * reach, 40), this.height * 0.48);
          const speed = 20 + this.rng() * 40;
          const vx = -Math.sin(angle) * speed;
          const vy = Math.cos(angle) * speed;
          p.px = p.x - vx * FIXED_DT;
          p.py = p.y - vy * FIXED_DT;
          p.ax = 0;
          p.ay = 0;
          p.releaseDot = -1;
        }
      }
    }

    // Win condition check
    if (this.levelId !== null && this.state === 'playing') {
      if (this.particles.length === 0) {
        this.state = 'cleared';
        // Fuel bonus on level clear
        const fuelBonus = Math.round(500 * this.fuel);
        this.score += fuelBonus;
        this.addFloatingText(`LEVEL CLEARED! +${fuelBonus} FUEL`, this.width * 0.5, this.height * 0.4, PALETTE.clean);
      } else if (this.fuel <= 0 && !this.grabbed) {
        // Check if any remaining debris is moving toward atmospheric entry
        const hasMoving = this.particles.some((p) => Math.hypot(p.x - p.px, p.y - p.py) > 0.5);
        if (!hasMoving) {
          this.state = 'failed';
        }
      }
    }
  }

  solveTether() {
    const a = this.anchor;
    const b = this.grabbed;
    if (!a || !b || !this.tether) return;
    const { length: lockedLength, max: maxLength } = this.tether;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1e-6;

    // TETHER SNAP: If distance > maxLength, snap the tether and flash the screen --pink
    if (dist > maxLength + 8) {
      this.release();
      this.flashPink = 1.0;
      this.screenShake = 16;
      this.addFloatingText('TETHER SNAPPED!', a.x, a.y + 30, PALETTE.pink500);
      return;
    }

    // Rigid pendulum distance constraint
    const target = lockedLength || maxLength;
    const diff = (dist - target) / dist;
    b.x -= dx * diff;
    b.y -= dy * diff;

    this.tension = Math.max(0, dist - target);
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
            playImpact();
            this.screenShake = Math.min(22, 6 + relSpeed * 0.08);
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

    this.addFloatingText('CASCADE SHATTER', p.x, p.y, PALETTE.danger);
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
  CHAIN_WINDOW_MS,
};
