/**
 * Debris Darling — Shared Constants & Types
 * Built for the NASA International Space Apps Challenge 2026.
 */

export const PHYSICS = {
  FIXED_DT: 1 / 60,
  MAX_SUBSTEPS: 5,
  CONSTRAINT_ITERATIONS: 12,
  DAMPING: 0.9995,
  TETHER_REST: 160,
  TETHER_MAX: 300,
  GRAB_RADIUS: 36,
  ANCHOR_RADIUS: 8,
  THRUST_ACC: 980,
  FUEL_DRAIN: 0.22,
  CHAIN_WINDOW_MS: 900,
  SHIP_MASS: 120,
};

export const COLORS = {
  HOT_PINK: '#FF2D95',
  PURPLE: '#6d4aff',
  DARK_SUBSTRATE: '#061120',
  SKY_300: '#7DD3FC',
  SKY_400: '#38BDF8',
  GREEN: '#4CAF50',
  AMBER: '#FFC107',
  WHITE: '#FFFFFF',
};

export const AI_TAUNTS = {
  JOIN: 'Pathetic. NASA paid $2B for this script kiddie.',
  PROGRADE: 'YOU JUST CREATED 14 NEW DEBRIS OBJECTS. GREAT JOB.',
  RETROGRADE: "Finally. Still only 0.003% progress. Don't get cocky.",
  FUEL_CRITICAL: 'Thruster integrity critical. Try not to die before lunch.',
};

export const KESSLER = {
  CRITICAL_THRESHOLD: 84,
  MAX_DEBRIS_BASE: 100,
  DEORBIT_REDUCTION_SCALE: 50,
};
