/**
 * ASTRAL ZERO — Newtonian Orbital Physics & Rigid Tether Dynamics.
 * Built for the NASA International Space Apps Challenge 2026.
 *
 * Implements:
 * - Semi-implicit Euler integration (zero ambient drag in vacuum)
 * - PBD (Position-Based Dynamics) rigid distance constraints with mass weighting
 * - Torque generation from off-center anchor forces
 * - Vis-viva perigee estimation based on release velocity
 * - Forward orbital trajectory projection & collision detection
 */

import { Vec, clamp } from './vector.js';

export const CONSTANTS = {
  FIXED_DT: 1 / 60,
  MAX_SUBSTEPS: 5,
  CONSTRAINT_ITERATIONS: 12,
  TETHER_REST_LENGTH: 130,
  TETHER_MAX_STRAIN: 2.2,
  TUG_MASS: 150,
  TUG_RADIUS: 14,
  TUG_THRUST_ACCEL: 880, // Snappier RCS thrust responsiveness (+30%)
  TUG_TURN_SPEED: 4.8,
  INITIAL_DELTA_V: 1500, // Generous 1500 m/s delta-v propellant budget
  DELTA_V_BURN_RATE: 120, // m/s consumed per second of continuous main thrust
  DEORBIT_RETROGRADE_THRESHOLD: -85, // m/s along-track velocity threshold for atmospheric deorbit (< 100 km)
  ATMOSPHERE_ENTRY_ALT_KM: 100, // Karman line entry threshold
  BASE_SHELL_ALT_KM: 450, // Nominal LEO operating shell
};

/**
 * Creates a physical body with position, linear velocity, orientation,
 * angular velocity, mass, moment of inertia, and collision radius.
 */
export function createBody({
  x = 0,
  y = 0,
  vx = 0,
  vy = 0,
  angle = 0,
  av = 0,
  mass = 100,
  radius = 16,
} = {}) {
  const invMass = mass > 0 ? 1 / mass : 0;
  // Moment of inertia for solid cylinder/disk: I = 0.5 * m * r^2
  const inertia = mass > 0 ? 0.5 * mass * radius * radius : 0;
  const invInertia = inertia > 0 ? 1 / inertia : 0;

  return {
    pos: new Vec(x, y),
    vel: new Vec(vx, vy),
    angle,
    av,
    mass,
    invMass,
    inertia,
    invInertia,
    radius,
    thrusting: false,
    fuel: CONSTANTS.INITIAL_DELTA_V,
  };
}

/**
 * Semi-implicit Euler integration for one fixed timestep.
 * No atmospheric drag: momentum and rotational energy are conserved.
 */
export function integrateBody(body, dt) {
  body.pos.x += body.vel.x * dt;
  body.pos.y += body.vel.y * dt;

  body.angle += body.av * dt;
  // Normalize angle to [-PI, PI]
  body.angle = Math.atan2(Math.sin(body.angle), Math.cos(body.angle));
}

/**
 * Applies a linear force impulse at a specific world-space offset from center of mass,
 * producing both linear acceleration and rotational torque.
 */
export function applyImpulseAtOffset(body, jx, jy, offsetX, offsetY) {
  body.vel.x += jx * body.invMass;
  body.vel.y += jy * body.invMass;

  // 2D torque: tau = r_x * F_y - r_y * F_x
  const torque = offsetX * jy - offsetY * jx;
  body.av += torque * body.invInertia;
}

/**
 * Solves the PBD distance constraint between tug nose and hulk anchor point.
 * Iteratively corrects positions weighted by inverse mass to maintain rigid tether length.
 *
 * @returns {number} Tension force magnitude in Newtons
 */
export function solveTetherConstraint(tug, hulk, anchorOffsetWorld, restLength = CONSTANTS.TETHER_REST_LENGTH) {
  const anchorX = hulk.pos.x + anchorOffsetWorld.x;
  const anchorY = hulk.pos.y + anchorOffsetWorld.y;

  const dx = anchorX - tug.pos.x;
  const dy = anchorY - tug.pos.y;
  const currentDist = Math.hypot(dx, dy);

  if (currentDist < 1e-4) return 0;

  const delta = currentDist - restLength;
  const invMassSum = tug.invMass + hulk.invMass;
  if (invMassSum <= 0) return 0;

  // Normal vector from tug to anchor
  const nx = dx / currentDist;
  const ny = dy / currentDist;

  // Position correction
  const stiffness = 0.95;
  const impulseMag = (delta * stiffness) / invMassSum;

  tug.pos.x += nx * impulseMag * tug.invMass;
  tug.pos.y += ny * impulseMag * tug.invMass;

  hulk.pos.x -= nx * impulseMag * hulk.invMass;
  hulk.pos.y -= ny * impulseMag * hulk.invMass;

  // Compute tension force: T = |delta| * k / dt^2
  const tension = Math.abs(delta) * 120;
  return tension;
}

/**
 * Calculates whether a release velocity achieves atmospheric deorbit.
 * In the local orbital shell frame, negative horizontal velocity (retrograde burn)
 * lowers the perigee into Earth's atmospheric entry threshold (< 100 km).
 *
 * @param {Vec} vel - Release velocity vector
 * @returns {{ isDeorbit: boolean, estimatedPerigeeKm: number }}
 */
export function evaluateDeorbit(vel) {
  // Base shell altitude 450 km. Each -1 m/s of retrograde delta-v lowers perigee by ~4.12 km.
  const retrogradeDeltaV = -vel.x;
  const estimatedPerigeeKm = Math.max(0, Math.round(CONSTANTS.BASE_SHELL_ALT_KM - retrogradeDeltaV * 4.12));
  const isDeorbit = vel.x <= CONSTANTS.DEORBIT_RETROGRADE_THRESHOLD || estimatedPerigeeKm <= CONSTANTS.ATMOSPHERE_ENTRY_ALT_KM;

  return {
    isDeorbit,
    estimatedPerigeeKm,
  };
}

/**
 * Predicts the forward orbital trajectory points of an object if released right now.
 * In the orbital reference frame, retrograde along-track velocity (vx < 0) creates
 * an orbital decay curve that curves downward toward Earth's atmospheric boundary.
 *
 * @param {Vec} pos - Starting position
 * @param {Vec} vel - Instantaneous velocity
 * @param {number} steps - Number of projection points
 * @param {number} dt - Prediction timestep
 * @returns {Array<{x: number, y: number}>}
 */
export function predictOrbitalPath(pos, vel, steps = 60, dt = 0.04) {
  const points = [];
  let curX = pos.x;
  let curY = pos.y;
  let curVx = vel.x;
  let curVy = vel.y;

  // In local frame: downward acceleration toward Earth increases with retrograde velocity
  // Vis-viva downward curvature factor: a_y = -35.0 * (1 - v_x / v_circular)
  const retroFactor = Math.max(0, -curVx / 40.0);
  const orbitalGravity = 18.0 + retroFactor * 32.0;

  for (let i = 0; i < steps; i++) {
    curX += curVx * dt;
    curY += curVy * dt;

    // Apply atmospheric/gravity orbital dip
    curVy += orbitalGravity * dt;

    points.push({ x: curX, y: curY });
  }

  return points;
}

/**
 * Circle-circle collision test between tug and derelict hulk.
 */
export function checkCollision(bodyA, bodyB) {
  const dx = bodyB.pos.x - bodyA.pos.x;
  const dy = bodyB.pos.y - bodyA.pos.y;
  const distSq = dx * dx + dy * dy;
  const minDist = bodyA.radius + bodyB.radius;
  return distSq <= minDist * minDist;
}
