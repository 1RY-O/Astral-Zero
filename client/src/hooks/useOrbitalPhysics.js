/**
 * Debris Darling — useOrbitalPhysics Hook
 * Preserves the 60Hz Verlet tether engine, rigid distance constraints (12 iterations),
 * Newton's recoil, zero-g collisions, and throw event emissions.
 * Built for the NASA International Space Apps Challenge 2026.
 */

import { useRef, useCallback, useState, useEffect } from 'react';
import { playGrab, playWhip, playThrust, playImpact, playDeorbit } from '../audio.js';

export const FIXED_DT = 1 / 60;
export const MAX_SUBSTEPS = 5;
export const CONSTRAINT_ITERATIONS = 12;
export const DAMPING = 0.9995;

export const TETHER_REST = 160;
export const TETHER_MAX = 300;
export const GRAB_RADIUS = 36;
export const ANCHOR_RADIUS = 8;
export const THRUST_ACC = 980;
export const FUEL_DRAIN = 0.22;
export const CHAIN_WINDOW_MS = 900;
const TAU = Math.PI * 2;

function mulberry32(seed) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
    releaseDot: -1,
    releasedAt: 0,
    isPrograde: false,
  };
}

function makeFixedParticle(x, y, radius) {
  const p = makeParticle('anchor', x, y, 0, 0, radius, Infinity, '#38BDF8');
  p.fixed = true;
  p.invMass = 0;
  p.recoilVx = 0;
  p.recoilVy = 0;
  return p;
}

export class PhysicsWorld {
  constructor({ width = 800, height = 600, seed = 2026, onThrowEvent, onFuelWarning } = {}) {
    this.width = width;
    this.height = height;
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.onThrowEvent = onThrowEvent;
    this.onFuelWarning = onFuelWarning;

    this.particles = [];
    this.tether = null;
    this.grabbed = null;
    this.anchor = null;

    this.fuel = 1.0;
    this.fuelWarned = false;
    this.thrusting = false;
    this.thrustDir = null;
    this.tension = 0;

    this.score = 0;
    this.chain = 0;
    this.lastDeorbitTime = null;
    this.successfulDeorbits = 0;
    this.gameTime = 0;
    this.screenShake = 0;
    this.shakeX = 0;
    this.shakeY = 0;

    this.initScenario();
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
    if (this.anchor) {
      this.anchor.x = width * 0.5;
      this.anchor.y = height * 0.22;
      this.anchor.px = this.anchor.x;
      this.anchor.py = this.anchor.y;
    }
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
    return Math.hypot(dx, dy) <= limb.r + radius;
  }

  initScenario() {
    const cx = this.width * 0.5;
    const anchorY = this.height * 0.22;
    this.anchor = makeFixedParticle(cx, anchorY, ANCHOR_RADIUS);
    this.particles = [];
    this.grabbed = null;
    this.tether = null;
    this.fuel = 1.0;
    this.fuelWarned = false;

    for (let i = 0; i < 7; i += 1) {
      const angle = this.rng() * TAU;
      const reach = 80 + this.rng() * 150;
      let x = cx + Math.cos(angle) * reach;
      let y = anchorY + Math.sin(angle) * reach;
      x = Math.min(Math.max(x, 40), this.width - 40);
      y = Math.min(Math.max(y, 40), this.height * 0.55);

      const radius = 6 + this.rng() * 10;
      const mass = 0.5 + radius;
      const speed = 25 + this.rng() * 35;
      const vx = -Math.sin(angle) * speed;
      const vy = Math.cos(angle) * speed;

      this.particles.push(
        makeParticle(
          `debris-${i}`,
          x,
          y,
          vx,
          vy,
          radius,
          mass,
          `rgba(255, 255, 255, ${0.4 + (mass / 20) * 0.6})`,
        ),
      );
    }
  }

  grabNearest(clickX, clickY) {
    if (this.grabbed) {
      if (isHit(clickX, clickY, this.grabbed.x, this.grabbed.y, this.grabbed.radius, 2.5)) {
        return this.release();
      }
    }

    let best = null;
    let bestDist2 = Infinity;
    const anchor = this.anchor;

    for (const p of this.particles) {
      if (p.fixed) continue;
      const d2 = (p.x - clickX) ** 2 + (p.y - clickY) ** 2;
      const r = p.radius * 2.8;
      if (d2 <= r * r && d2 < bestDist2) {
        best = p;
        bestDist2 = d2;
      }
    }

    if (!best && anchor) {
      for (const p of this.particles) {
        if (p.fixed) continue;
        const d = Math.hypot(p.x - anchor.x, p.y - anchor.y);
        if (d <= TETHER_MAX && d < bestDist2) {
          best = p;
          bestDist2 = d;
        }
      }
    }

    if (best && anchor) {
      const dist = Math.hypot(best.x - anchor.x, best.y - anchor.y);
      this.grabbed = best;
      this.tether = {
        length: Math.max(40, Math.min(dist, TETHER_MAX)),
        max: TETHER_MAX,
      };
      this.tension = 0;
      playGrab();
      return true;
    }

    return false;
  }

  release() {
    const released = this.grabbed;
    if (released) {
      const vx = (released.x - released.px) / FIXED_DT;
      const vy = (released.y - released.py) / FIXED_DT;
      const speed = Math.hypot(vx, vy);

      // Horizontal component determines retrograde vs prograde
      released.isPrograde = vx > 0;
      released.releaseDot = speed > 0 ? -vx / speed : -1;
      released.releasedAt = this.gameTime;

      // Newton's Recoil: Tug ship absorbs equal and opposite impulse
      if (this.anchor) {
        const shipMass = 120;
        const ratio = Math.min(1.5, released.mass / shipMass);
        this.anchor.recoilVx = (this.anchor.recoilVx || 0) - vx * ratio * 0.4;
        this.anchor.recoilVy = (this.anchor.recoilVy || 0) - vy * ratio * 0.4;
      }

      playWhip();

      // Emit throw event to server & client listeners
      if (this.onThrowEvent) {
        const direction = released.isPrograde ? 'prograde' : 'retrograde';
        this.onThrowEvent({
          direction,
          mass: released.mass,
          deltaV: speed,
        });
      }
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

  step() {
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

    // Anchor recoil damping
    if (this.anchor) {
      const defaultX = this.width * 0.5;
      const defaultY = this.height * 0.22;
      if (this.anchor.recoilVx || this.anchor.recoilVy) {
        this.anchor.x += this.anchor.recoilVx * FIXED_DT;
        this.anchor.y += this.anchor.recoilVy * FIXED_DT;
        this.anchor.recoilVx *= 0.92;
        this.anchor.recoilVy *= 0.92;
      }
      this.anchor.x += (defaultX - this.anchor.x) * 0.05;
      this.anchor.y += (defaultY - this.anchor.y) * 0.05;
    }

    const dt = FIXED_DT;
    const dt2 = dt * dt;
    this.gameTime += dt;

    // 1. Tangential Thrust Acceleration
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

      if (this.fuel <= 0.2 && !this.fuelWarned) {
        this.fuelWarned = true;
        this.onFuelWarning?.();
      }
    }

    // 2. Verlet integration: zero-g with soft arena boundary
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

    // 5. Atmospheric kill-zone
    const atMs = Math.round(this.gameTime * 1000);
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      if (p.fixed) continue;

      if (this.isInsideAtmosphere(p.x, p.y, p.radius)) {
        if (this.grabbed === p) {
          this.release();
        }

        const isRetrograde = p.releaseDot < 0;

        if (this.lastDeorbitTime !== null && atMs - this.lastDeorbitTime <= CHAIN_WINDOW_MS) {
          this.chain += 1;
        } else {
          this.chain = 1;
        }
        this.lastDeorbitTime = atMs;

        const objectValue = 50 * Math.min(4, Math.max(0.5, p.mass / 10));
        const multiplier = (this.chain * (this.chain + 1)) / 2;
        const gainedScore = Math.round(objectValue * multiplier + (isRetrograde ? 80 : -150));
        this.score = Math.max(0, this.score + gainedScore);
        if (isRetrograde) {
          this.successfulDeorbits += 1;
        }

        playDeorbit();

        // Respawn in upper orbit to keep debris field dynamic
        const angle = this.rng() * TAU;
        const reach = 80 + this.rng() * 140;
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

  solveTether() {
    const a = this.anchor;
    const b = this.grabbed;
    if (!a || !b || !this.tether) return;
    const { length: lockedLength, max: maxLength } = this.tether;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1e-6;

    if (dist > maxLength + 8) {
      this.release();
      this.screenShake = 16;
      return;
    }

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

          if (relSpeed > 75 && (p1.radius >= 8 || p2.radius >= 8)) {
            playImpact();
            this.screenShake = Math.min(20, 6 + relSpeed * 0.08);
            const targetIdx = p1.radius >= p2.radius ? i : j;
            this.fragmentParticle(targetIdx);
            return;
          }

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
          const p = (2 * (nx * kx + ny * ky)) / (p1.mass + p2.mass);
          p1.px = p1.x - (v1x - p * p2.mass * nx) * dt;
          p1.py = p1.y - (v1y - p * p2.mass * ny) * dt;
          p2.px = p2.x - (v2x + p * p1.mass * nx) * dt;
          p2.py = p2.y - (v2y + p * p1.mass * ny) * dt;
        }
      }
    }
  }

  fragmentParticle(index) {
    const p = this.particles[index];
    if (!p) return;
    if (this.grabbed === p) {
      this.release();
    }
    this.particles.splice(index, 1);

    const newRadius = Math.max(3.5, p.radius * 0.58);
    const newMass = Math.max(0.2, p.mass / 3);

    for (let k = 0; k < 3; k += 1) {
      const angle = (k * TAU) / 3 + this.rng() * 0.5;
      const speed = 30 + this.rng() * 40;
      this.particles.push(
        makeParticle(
          `frag-${Date.now()}-${k}`,
          p.x + Math.cos(angle) * (newRadius + 2),
          p.y + Math.sin(angle) * (newRadius + 2),
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          newRadius,
          newMass,
          '#FF2D95',
        ),
      );
    }
  }
}

export function useOrbitalPhysics({ onThrowEvent, onFuelWarning } = {}) {
  const worldRef = useRef(null);
  const [debrisCount, setDebrisCount] = useState(7);
  const [successfulDeorbits, setSuccessfulDeorbits] = useState(0);
  const [score, setScore] = useState(0);
  const [fuel, setFuel] = useState(1.0);

  const initWorld = useCallback(
    (width, height) => {
      const world = new PhysicsWorld({
        width,
        height,
        onThrowEvent,
        onFuelWarning,
      });
      worldRef.current = world;
      return world;
    },
    [onThrowEvent, onFuelWarning],
  );

  const syncState = useCallback(() => {
    if (worldRef.current) {
      const w = worldRef.current;
      setDebrisCount(w.particles.filter((p) => !p.fixed).length);
      setSuccessfulDeorbits(w.successfulDeorbits);
      setScore(w.score);
      setFuel(w.fuel);
    }
  }, []);

  return {
    worldRef,
    initWorld,
    syncState,
    debrisCount,
    successfulDeorbits,
    score,
    fuel,
  };
}

export default useOrbitalPhysics;
