/**
 * Debris Derby — Level specifications (Levels 1–8).
 * Locked table per docs/SPEC.md.
 */

export const LEVEL_DEFS = Object.freeze([
  {
    id: 1,
    name: 'First Contact',
    order: 1,
    fuelMax: 100,
    hint: 'GRAB with Click/E  ·  THRUST with Space/WASD  ·  RELEASE retrograde into atmosphere',
    spawn: (rng, width, height) => [
      {
        id: 'sat-primary',
        x: width * 0.45,
        y: height * 0.35,
        vx: 15,
        vy: 0,
        radius: 14,
        mass: 25,
      },
    ],
  },
  {
    id: 2,
    name: 'Two-Body Problem',
    subtitle: 'Gravity Assist',
    order: 2,
    fuelMax: 120,
    hint: 'Two-Body Problem: Gravity Assist — Slingshot past the Moon! Swing the first, then grapple and deorbit the second.',
    hasMoon: true,
    spawn: (rng, width, height) => [
      {
        id: 'sat-alpha',
        x: width * 0.36,
        y: height * 0.32,
        vx: 22,
        vy: -5,
        radius: 13,
        mass: 18,
      },
      {
        id: 'sat-beta',
        x: width * 0.64,
        y: height * 0.38,
        vx: -20,
        vy: 8,
        radius: 14,
        mass: 22,
      },
    ],
  },
  {
    id: 3,
    name: 'Clean Sweep',
    order: 3,
    fuelMax: 120,
    hint: 'Debris cluster! Smash satellites sideways to fragment and chain multipliers.',
    spawn: (rng, width, height) => {
      const items = [];
      const cx = width * 0.5;
      const cy = height * 0.35;
      for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * Math.PI * 2 + rng() * 0.5;
        const dist = 45 + rng() * 55;
        items.push({
          id: `cluster-${i + 1}`,
          x: cx + Math.cos(angle) * dist,
          y: cy + Math.sin(angle) * dist,
          vx: -Math.sin(angle) * (20 + rng() * 20),
          vy: Math.cos(angle) * (15 + rng() * 15),
          radius: 9 + rng() * 5,
          mass: 8 + rng() * 8,
        });
      }
      return items;
    },
  },
  {
    id: 4,
    name: 'Ricochet',
    order: 4,
    fuelMax: 110,
    hint: 'Bank payloads off obstacles to reach the atmospheric kill-zone.',
    spawn: (rng, width, height) => [
      { id: 'sat-heavy', x: width * 0.3, y: height * 0.3, vx: 25, vy: 10, radius: 15, mass: 28 },
      { id: 'sat-drone', x: width * 0.7, y: height * 0.35, vx: -20, vy: -10, radius: 10, mass: 12 },
    ],
  },
  {
    id: 5,
    name: 'Dominoes',
    order: 5,
    fuelMax: 120,
    hint: 'Chained removals within 900ms trigger cascading multipliers.',
    spawn: (rng, width, height) => {
      const items = [];
      for (let i = 0; i < 6; i += 1) {
        items.push({
          id: `domino-${i + 1}`,
          x: width * 0.25 + (i * width * 0.5) / 5,
          y: height * 0.3 + (i % 2 === 0 ? -20 : 20),
          vx: 10 * (i % 2 === 0 ? 1 : -1),
          vy: 5,
          radius: 10,
          mass: 14,
        });
      }
      return items;
    },
  },
  {
    id: 6,
    name: 'Fragile Cargo',
    order: 6,
    fuelMax: 100,
    hint: 'Handle high-mass fragile payloads with controlled tether tension.',
    spawn: (rng, width, height) => [
      { id: 'fragile-1', x: width * 0.4, y: height * 0.32, vx: 18, vy: 0, radius: 13, mass: 22 },
      { id: 'fragile-2', x: width * 0.6, y: height * 0.36, vx: -16, vy: 4, radius: 12, mass: 20 },
    ],
  },
  {
    id: 7,
    name: 'Moving Targets',
    order: 7,
    fuelMax: 120,
    hint: 'Drifting orbital velocities. Lead the grab ahead of the target.',
    spawn: (rng, width, height) => {
      const items = [];
      for (let i = 0; i < 5; i += 1) {
        items.push({
          id: `target-${i + 1}`,
          x: width * 0.2 + (i * width * 0.6) / 4,
          y: height * (0.25 + (i % 3) * 0.08),
          vx: 30 * (i % 2 === 0 ? 1 : -1),
          vy: 12 * (i % 2 === 0 ? -1 : 1),
          radius: 11,
          mass: 16,
        });
      }
      return items;
    },
  },
  {
    id: 8,
    name: 'Kessler Event',
    order: 8,
    fuelMax: 140,
    hint: 'Dense chaotic orbital field. The ultimate tether exam.',
    spawn: (rng, width, height) => {
      const items = [];
      for (let i = 0; i < 8; i += 1) {
        const angle = rng() * Math.PI * 2;
        const r = 50 + rng() * 120;
        items.push({
          id: `kessler-${i + 1}`,
          x: width * 0.5 + Math.cos(angle) * r,
          y: height * 0.35 + Math.sin(angle) * r * 0.6,
          vx: -Math.sin(angle) * (25 + rng() * 30),
          vy: Math.cos(angle) * (20 + rng() * 25),
          radius: 8 + rng() * 6,
          mass: 10 + rng() * 15,
        });
      }
      return items;
    },
  },
]);

export function getLevelDef(levelId) {
  return LEVEL_DEFS.find((l) => l.id === levelId) || LEVEL_DEFS[0];
}
