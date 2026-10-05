/**
 * Astral Zero — Arena geometry + collision (Phase 3, map-aware in Phase 5).
 * ============================================================
 * Phase 3 model, unchanged: entities are feet-points, movement resolves
 * AXIS-SEPARATED (walls clamp X; ceiling/floor/platform-tops resolve Y),
 * jump-through from below is allowed, head-bump is ceiling-only.
 *
 * Phase 5 change: geometry comes from MAPS (`src/game/maps.js`), not from
 * a single global. Every helper takes an optional trailing `map` (a resolved
 * map def OR a mapId string). OMITTED → orbital_junkyard, whose numbers are
 * byte-identical to the old hardcoded arena — every Phase 3 unit expectation
 * holds without edits.
 *
 * COORDINATES: pixels, x right, y DOWN (Phaser convention). groundY is the
 * line feet rest on. All helpers are pure (no io, no state) → unit-testable.
 */

import config from '../server-config.js';
import { resolveMap } from './maps.js';

/** Accept a def, an id, or nothing (legacy default). */
function useMap(map) {
  if (typeof map === 'string') return resolveMap(map);
  return map || resolveMap('orbital_junkyard');
}

function boundsOf(map) {
  return useMap(map).bounds;
}

function platformsOf(map) {
  return useMap(map).platforms || [];
}

/**
 * Move feet-point (x, y) by (dx, dy) with collision. Mutates nothing;
 * returns the resolved position + flags.
 * @param {number} x feet x
 * @param {number} y feet y
 * @param {number} dx attempted x delta this tick
 * @param {number} dy attempted y delta this tick
 * @param {number} radius body radius (walls keep the BODY inside)
 * @param {object|string} [map] map def or id (default: orbital_junkyard)
 * @returns {{ x, y, hitWall, landed, hitHead }}
 */
export function moveAndCollide(x, y, dx, dy, radius = 14, map = null) {
  const A = boundsOf(map);
  const plats = platformsOf(map);
  const r = radius;
  let hitWall = false;
  let landed = false;
  let hitHead = false;

  // -- X axis: walls only (platforms are thin; side-collision with them is
  //    ignored on purpose — bodies slip past platform edges, never snag). --
  let nx = x + dx;
  if (nx - r < A.minX) {
    nx = A.minX + r;
    hitWall = true;
  } else if (nx + r > A.maxX) {
    nx = A.maxX - r;
    hitWall = true;
  }

  // -- Y axis: ceiling, floor, then platform tops (falling only). --
  let ny = y + dy;
  if (ny < A.ceilingY) {
    ny = A.ceilingY;
    hitHead = true;
  }
  if (ny >= A.groundY) {
    ny = A.groundY;
    landed = true;
  } else if (dy > 0) {
    // Falling: did we cross a platform top this tick? Feet must be within
    // the platform's x-span (with a small radius forgiveness).
    for (const p of plats) {
      const top = p.y;
      if (y <= top + 1 && ny >= top && nx >= p.x - r * 0.6 && nx <= p.x + p.w + r * 0.6) {
        ny = top;
        landed = true;
        break;
      }
    }
  }

  return { x: nx, y: ny, hitWall, landed, hitHead };
}

/**
 * Is a feet position standing on SOMETHING (floor or platform)?
 * Used at spawn to avoid materialising inside geometry.
 */
export function isSupported(x, y, map = null) {
  const A = boundsOf(map);
  if (y >= A.groundY - 1) return true;
  const r = config.sim?.entityRadius || 14;
  for (const p of platformsOf(map)) {
    if (Math.abs(y - p.y) < 2 && x >= p.x - r * 0.6 && x <= p.x + p.w + r * 0.6) return true;
  }
  return false;
}

/**
 * All candidate spawn feet-positions: floor spread + platform tops.
 * @param {object|string} [map] map def or id (default: orbital_junkyard)
 */
export function spawnPoints(map = null) {
  // Precomputed per map (same spread formula as the Phase 3 original).
  return useMap(map).spawns.map((s) => ({ ...s }));
}

/**
 * Pick a spawn far from live enemies (pads out to `radius`-separated).
 * Pure function over positions — the tick loop passes entity coordinates.
 * @param {{x:number,y:number}[]} enemyPositions live enemies to avoid
 * @param {{x:number,y:number}[]} [allPositions] everyone (separation)
 * @param {object|string} [map] map def or id (default: orbital_junkyard)
 * @returns {{x:number,y:number}}
 */
export function safeSpawn(enemyPositions = [], allPositions = [], map = null) {
  const pts = spawnPoints(map);
  let best = pts[0];
  let bestScore = -Infinity;
  for (const p of pts) {
    // Score = distance to nearest enemy (want FAR) + small distance to
    // nearest anyone (want SOME separation so we don't stack on a friend).
    let nearestEnemy = Infinity;
    for (const e of enemyPositions) {
      nearestEnemy = Math.min(nearestEnemy, Math.hypot(p.x - e.x, p.y - e.y));
    }
    let nearestAny = Infinity;
    for (const e of allPositions) {
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d > 1) nearestAny = Math.min(nearestAny, d);
    }
    const score = Math.min(nearestEnemy, 900) + Math.min(nearestAny, 200) * 0.25;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return { x: Math.round(best.x), y: Math.round(best.y) };
}

/** Clamp helper for handlers (sanity-checking client claims). */
export function clampToArena(x, y, map = null) {
  const A = boundsOf(map);
  const r = config.sim?.entityRadius || 14;
  return {
    x: Math.min(A.maxX - r, Math.max(A.minX + r, Number(x) || 0)),
    y: Math.min(A.groundY, Math.max(A.ceilingY, Number(y) || 0)),
  };
}
