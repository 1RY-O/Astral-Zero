/**
 * Astral Zero — authoritative map + world rendering test (Phase 5).
 * ============================================================
 * Phase 5 moved map geometry to the server (`room_joined.map`). The client is
 * now a pure adapter over that payload, which is easy to get wrong in a
 * dangerous direction: inventing a "helpful" default for a missing field would
 * put the player inside a platform the server thinks is empty.
 *
 * These tests pin the two properties that matter:
 *  - a well-formed server map passes through UNCHANGED
 *  - a missing/garbage map yields NO geometry (never a plausible guess)
 *
 * The fixtures are the real shapes from src/game/maps.js mapToWire().
 *
 * Run with: npm run test:world
 */

import { mapFromWire, ambienceFor, KNOWN_MAP_IDS } from '../src/config/maps.js';

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures += 1;
};
const section = (t) => console.log(`\n--- ${t} ---`);

// Verbatim copy of the server's wire shape for reactor_core.
const REACTOR = {
  id: 'reactor_core',
  name: 'Reactor Core',
  bounds: { minX: 120, maxX: 1160, groundY: 620, ceilingY: 80 },
  platforms: [
    { x: 400, y: 470, w: 180, h: 18 },
    { x: 700, y: 470, w: 180, h: 18 },
    { x: 540, y: 320, w: 200, h: 18 },
  ],
  zones: {
    lowgrav: [{ id: 'core-shaft', x: 560, y: 120, w: 160, h: 220, factor: 0.5 }],
    hazard: [
      { id: 'coolant-west', x: 120, y: 570, w: 200, h: 50, dps: 15 },
      { id: 'coolant-east', x: 960, y: 570, w: 200, h: 50, dps: 15 },
    ],
  },
  stations: [
    { id: 'dock-a', x: 320, y: 620, r: 70 },
    { id: 'dock-b', x: 960, y: 620, r: 70 },
  ],
  spawns: [{ x: 180, y: 620 }],
};

// ===========================================================================
section('A valid server map passes through unchanged');
// ===========================================================================
{
  const m = mapFromWire(REACTOR);
  ok(m.id === 'reactor_core' && m.name === 'Reactor Core', 'id and name come from the server');
  ok(m.platforms.length === 3, 'all platforms are carried through');
  ok(m.platforms[0].w === 180 && m.platforms[0].h === 18,
    'platform dimensions are the SERVER values, not rounded or recomputed');
  ok(m.zones.hazard.length === 2, 'both coolant hazard zones are present');
  ok(m.zones.hazard[0].dps === 15, 'hazard dps is preserved (the HUD labels it)');
  ok(m.zones.lowgrav[0].factor === 0.5, 'the low-gravity factor is preserved');
  ok(m.stations.length === 2, 'both deposit docks are present');
  ok(m.stations[0].r === 70, 'dock radius is preserved');
  ok(m.bounds.groundY === 620, 'bounds are carried through for physics');
  ok(m.spawns.length === 1, 'server spawns are carried through');
}

// ===========================================================================
section('Biodome: acid pond + spore cloud are readable');
// ===========================================================================
{
  const m = mapFromWire({
    id: 'biodome', name: 'Biodome',
    bounds: { minX: 60, maxX: 1220, groundY: 660, ceilingY: 60 },
    platforms: [],
    zones: {
      lowgrav: [{ id: 'spore-cloud', x: 200, y: 200, w: 300, h: 180, factor: 0.6 }],
      hazard: [{ id: 'acid-pond', x: 560, y: 610, w: 160, h: 50, dps: 20 }],
    },
    stations: [],
    spawns: [],
  });
  ok(m.zones.hazard[0].id === 'acid-pond', 'the acid pond is identified by id');
  ok(m.zones.hazard[0].dps === 20, 'acid pond dps is preserved (20)');
  ok(m.zones.lowgrav[0].id === 'spore-cloud', 'the spore cloud is identified by id');
}

// ===========================================================================
section('A missing or malformed map yields NO geometry');
// ===========================================================================
{
  // This is the important one: a "helpful" default would drop the player
  // through a platform the server simulates as solid.
  for (const [label, input] of [
    ['null', null],
    ['undefined', undefined],
    ['empty object', {}],
    ['a string', 'reactor_core'],
    ['a number', 42],
  ]) {
    const m = mapFromWire(input);
    ok(m.platforms.length === 0, `${label} map yields no platforms`);
    ok(m.zones.hazard.length === 0 && m.zones.lowgrav.length === 0, `${label} map yields no zones`);
    ok(m.stations.length === 0, `${label} map yields no stations`);
    ok(m.bounds === null, `${label} map yields no bounds`);
  }

  // Partially-valid payloads degrade per-field, not wholesale.
  const partial = mapFromWire({ id: 'x', platforms: [{ x: 1, y: 2, w: 3, h: 4 }] });
  ok(partial.platforms.length === 1, 'a valid platform list survives a partial payload');
  ok(partial.stations.length === 0, 'missing stations default to empty, not undefined');
  ok(Array.isArray(partial.spawns) && partial.spawns.length === 0, 'missing spawns default to []');
}

// ===========================================================================
section('Malformed sub-fields never throw');
// ===========================================================================
{
  const m = mapFromWire({
    id: 'x',
    platforms: 'not an array',
    zones: { hazard: 42, lowgrav: null },
    stations: { nope: true },
    spawns: 'nope',
  });
  ok(Array.isArray(m.platforms) && m.platforms.length === 0, 'a non-array platforms field yields []');
  ok(m.zones.hazard.length === 0, 'a numeric hazard field yields []');
  ok(m.zones.lowgrav.length === 0, 'a null lowgrav field yields []');
  ok(m.stations.length === 0, 'an object stations field yields []');
  ok(m.spawns.length === 0, 'a string spawns field yields []');
}

// ===========================================================================
section('Ambience is local-only and always resolves');
// ===========================================================================
{
  for (const id of KNOWN_MAP_IDS) {
    const a = ambienceFor(id);
    ok(a && Number.isFinite(a.dust) && Number.isFinite(a.vents),
      `ambience for "${id}" resolves with finite counts`);
  }
  // Unknown id must still return a usable recipe (cosmetic code runs in create()).
  const unknown = ambienceFor('a_map_from_the_future');
  ok(Number.isFinite(unknown.dust), 'an unknown map id still gets a usable ambience recipe');
}

// ===========================================================================
section('The legacy map id is still understood');
// ===========================================================================
{
  // Every pre-5 client sends 'junkyard'; the server aliases it, so the client
  // must not treat it as unknown and warn on every room join.
  ok(KNOWN_MAP_IDS.includes('junkyard'), "the legacy 'junkyard' id is still recognised");
  const m = mapFromWire({ id: 'junkyard', platforms: [] });
  ok(m.id === 'junkyard', 'a legacy id is passed through, not rewritten');
}

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
process.exit(failures ? 1 : 0);
