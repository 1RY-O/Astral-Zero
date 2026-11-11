/**
 * ASTRAL ZERO — Spatial Hash Grid for Orbital Object Queries
 *
 * Complexity Analysis & Improvement:
 * - Naive pairwise distance checks require O(N^2) comparisons (e.g. 500 objects = 124,750 checks/tick).
 * - SpatialHashGrid partitions orbital space into discrete altitude and coordinate buckets.
 * - Insertion complexity: O(N) where each object hashes to its grid cell in O(1) time.
 * - Neighborhood query complexity: O(1) average per query, checking only adjacent cells.
 * - Overall simulation tick collision/conjunction complexity improves from O(N^2) to O(N).
 */

export class SpatialHashGrid {
  /**
   * @param {number} cellSize - Width/height of spatial bucket in orbital units (e.g., 100 km or 100 px)
   */
  constructor(cellSize = 120) {
    this.cellSize = cellSize;
    this.grid = new Map();
  }

  _hashKey(cellX, cellY) {
    return `${cellX}:${cellY}`;
  }

  _getCellCoords(x, y) {
    return {
      cx: Math.floor(x / this.cellSize),
      cy: Math.floor(y / this.cellSize),
    };
  }

  clear() {
    this.grid.clear();
  }

  /**
   * Insert an object into the spatial grid.
   * @param {string|number} id
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @param {object} metadata
   */
  insert(id, x, y, radius = 10, metadata = {}) {
    const minC = this._getCellCoords(x - radius, y - radius);
    const maxC = this._getCellCoords(x + radius, y + radius);

    const item = { id, x, y, radius, metadata };

    for (let cx = minC.cx; cx <= maxC.cx; cx++) {
      for (let cy = minC.cy; cy <= maxC.cy; cy++) {
        const key = this._hashKey(cx, cy);
        let cell = this.grid.get(key);
        if (!cell) {
          cell = [];
          this.grid.set(key, cell);
        }
        cell.push(item);
      }
    }
  }

  /**
   * Query all objects within radius of point (x, y).
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @returns {Array<object>} Deduplicated neighboring objects
   */
  queryNearby(x, y, radius) {
    const minC = this._getCellCoords(x - radius, y - radius);
    const maxC = this._getCellCoords(x + radius, y + radius);
    const nearby = new Map();
    const radiusSq = radius * radius;

    for (let cx = minC.cx; cx <= maxC.cx; cx++) {
      for (let cy = minC.cy; cy <= maxC.cy; cy++) {
        const key = this._hashKey(cx, cy);
        const cell = this.grid.get(key);
        if (cell) {
          for (const item of cell) {
            if (!nearby.has(item.id)) {
              const dx = item.x - x;
              const dy = item.y - y;
              const distSq = dx * dx + dy * dy;
              const maxDist = radius + item.radius;
              if (distSq <= maxDist * maxDist) {
                nearby.set(item.id, item);
              }
            }
          }
        }
      }
    }

    return Array.from(nearby.values());
  }

  /**
   * Spatial query specifically tailored for altitude bands (LEO, MEO, GEO).
   * Maps 1D altitude in kilometers to orbital shell tier in O(1).
   */
  static getAltitudeShell(altitudeKm) {
    if (altitudeKm <= 2000) return 'LEO';
    if (altitudeKm <= 35786) return 'MEO';
    return 'GEO';
  }
}
