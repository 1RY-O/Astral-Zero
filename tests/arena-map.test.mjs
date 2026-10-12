/**
 * Astral Zero — authoritative map adoption regression (empty arena + bounce).
 * ============================================================
 * The arena built an EMPTY world (no floor, no platforms) on normal entry:
 * the lobby adopts the manifest BEFORE the arena subscribes, so the new
 * MatchStream always misses the live `room_joined` map event and its map slot
 * stays null. The player then fell to the physics edge while the server sim
 * rested on the real floor — reconciliation ping-ponged between the two
 * truths, a perpetual bounce with no input (authY frozen, client teleporting
 * ~70px every snapshot).
 *
 * The fix seeds the world from the adopted room's verbatim `raw.map` when the
 * stream slot is empty. These tests pin the pieces:
 *
 *   1. normaliseRoom preserves the verbatim wire map on `raw.map`.
 *   2. selectWireMap prefers the live stream map, else the adopted raw map.
 *   3. mapFromWire passes server geometry through untouched.
 *   4. mapFromWire(null) builds nothing (never invents geometry).
 *
 * Run with: npm run test:map
 */
import assert from 'node:assert';
import { normaliseRoom, selectWireMap } from '../src/net/MatchModel.js';
import { mapFromWire } from '../src/config/maps.js';

let pass = 0;
const ok = (name, fn) => { fn(); pass += 1; console.log(`PASS  ${name}`); };

const WIRE_MAP = Object.freeze({
  id: 'orbital_junkyard',
  name: 'Orbital Junkyard',
  bounds: { minX: 40, maxX: 1240, groundY: 650, ceilingY: 40 },
  platforms: [{ x: 290, y: 500, w: 220, h: 18 }],
  zones: { lowgrav: [], hazard: [] },
  stations: [],
  spawns: [{ x: 100, y: 650 }],
});

const ROOM_PAYLOAD = (map) => ({
  room: {
    roomId: 'room_1', mode: 'bot_practice', mapId: 'junkyard', phase: 'countdown',
    countdownMs: 3000, createdAt: 1_700_000_000_000,
    map,
    players: [{ id: 's1', socketId: 's1', name: 'Jan', x: 100, y: 650, hp: 100, maxHp: 100, isBot: false }],
    bots: [],
  },
});

console.log('\n--- manifest preserves the verbatim wire map ---');

ok('normaliseRoom keeps raw.map with geometry intact', () => {
  const room = normaliseRoom(ROOM_PAYLOAD(WIRE_MAP), { localPlayerId: 's1' });
  assert.ok(room, 'room normalised');
  assert.strictEqual(room.raw.map, WIRE_MAP, 'raw.map is the verbatim payload (no copy, no rewrite)');
  assert.strictEqual(room.raw.map.bounds.groundY, 650);
  assert.strictEqual(room.raw.map.platforms.length, 1);
});

ok('a manifest without a map still normalises (offline path)', () => {
  const room = normaliseRoom(ROOM_PAYLOAD(undefined), { localPlayerId: 's1' });
  assert.ok(room, 'room normalised');
  assert.strictEqual(room.raw.map, undefined, 'no map invented');
});

console.log('\n--- selectWireMap precedence ---');

ok('live stream map wins when present', () => {
  const live = { id: 'reactor_core' };
  const room = normaliseRoom(ROOM_PAYLOAD(WIRE_MAP), {});
  assert.strictEqual(selectWireMap(live, room), live);
});

ok('falls back to the adopted raw.map (normal arena entry)', () => {
  const room = normaliseRoom(ROOM_PAYLOAD(WIRE_MAP), {});
  assert.strictEqual(selectWireMap(null, room), WIRE_MAP);
});

ok('null when nothing arrived (caller must build nothing)', () => {
  assert.strictEqual(selectWireMap(null, null), null);
  assert.strictEqual(selectWireMap(null, normaliseRoom(ROOM_PAYLOAD(undefined), {})), null);
});

console.log('\n--- mapFromWire geometry handling ---');

ok('server geometry passes through untouched', () => {
  const map = mapFromWire(WIRE_MAP, 'junkyard');
  assert.deepStrictEqual(map.bounds, WIRE_MAP.bounds);
  assert.deepStrictEqual(map.platforms, WIRE_MAP.platforms);
  assert.deepStrictEqual(map.spawns, WIRE_MAP.spawns);
});

ok('null map yields empty geometry (never invented)', () => {
  const map = mapFromWire(null, 'junkyard');
  assert.strictEqual(map.bounds, null);
  assert.deepStrictEqual(map.platforms, []);
});

console.log(`\n✅ Arena map adoption checks passed (${pass} groups).`);
process.exit(0);
