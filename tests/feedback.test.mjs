/**
 * Astral Zero — combat feedback test (Phase 4).
 * ============================================================
 * The Phase 3 feedback layer listened for `player_hit` / `kill` / `player_death`
 * / `player_spawn`, none of which the server ever emits — so the whole layer was
 * dead code that only passed against a fake socket. These tests run the REAL
 * MatchStream against a fake socket and assert the feedback the HUD depends on
 * actually fires from the REAL event names.
 *
 * Also covers the arena-side wiring decisions that are easy to regress:
 * respawn timing comes from the server, and confirmed damage is never invented.
 *
 * Run with: npm run test:feedback
 */

import { MatchStream } from '../src/net/MatchStream.js';
import { NET_EVENTS } from '../src/net/events.js';
import { Emitter } from '../src/core/Emitter.js';
import { HEALTH } from '../src/config/netConfig.js';

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures += 1;
};
const section = (t) => console.log(`\n--- ${t} ---`);

class FakeSocket extends Emitter {
  emit(event, payload) { super.emit(event, payload); }
}

function makeStream(localId = 'me') {
  const socket = new FakeSocket();
  const stream = new MatchStream({ socket, state: { localId } }, { now: () => 0 });
  stream.start();
  const seen = { health: [], hit: [], death: [], spawn: [], streak: [], score: [] };
  for (const name of Object.keys(seen)) stream.on(name, (e) => seen[name].push(e));
  return { socket, stream, seen };
}

// ===========================================================================
section('The feedback events the HUD needs actually fire');
// ===========================================================================
{
  const { socket, stream, seen } = makeStream();

  // Seed a target at a known HP so the delta is computable.
  socket.emit(NET_EVENTS.ENTITY_SNAPSHOT, {
    entities: [{ id: 'bot1', x: 500, y: 600, hp: 100, maxHp: 100, isBot: true }],
  });
  socket.emit(NET_EVENTS.PLAYER_HEALTH_UPDATE, { id: 'bot1', hp: 100, maxHp: 100 });
  socket.emit(NET_EVENTS.PLAYER_HEALTH_UPDATE, { id: 'bot1', hp: 84, maxHp: 100 });

  ok(seen.hit.length === 1, 'a remote HP drop produces a confirmed hit (solid marker + number)');
  ok(seen.hit[0].isSelf === true, 'the confirmed hit is attributed to us');
  ok(seen.hit[0].damage === 16, `the damage number is the real server delta (${seen.hit[0].damage})`);

  socket.emit(NET_EVENTS.ENTITY_DEATH, {
    victimId: 'bot1', victimName: 'Scrap Bot', killedById: 'me', killedByName: 'Me', cause: 'bullet',
  });
  ok(seen.death.length === 1, 'entity_death drives the death animation + killfeed row');
  ok(seen.death[0].isSelf === false, 'someone else dying is not our death');
  ok(seen.death[0].killerId === 'me', 'the kill is attributed from the same event');

  socket.emit(NET_EVENTS.ENTITY_RESPAWN, { id: 'me', x: 100, y: 600, hp: 100, maxHp: 100 });
  ok(seen.spawn[0]?.isSelf === true && seen.spawn[0].x === 100,
    'entity_respawn revives us at the server position');
}

// ===========================================================================
section('We take damage: health event, and no fabricated hit');
// ===========================================================================
{
  const { socket, seen } = makeStream();
  socket.emit(NET_EVENTS.PLAYER_HEALTH_UPDATE, { id: 'me', hp: 100, maxHp: 100 });
  socket.emit(NET_EVENTS.PLAYER_HEALTH_UPDATE, { id: 'me', hp: 72, maxHp: 100 });

  const self = seen.health.at(-1);
  ok(self.isSelf === true, 'our own HP change is flagged as self');
  ok(self.damage === 28, `damage taken is the real delta (${self.damage})`);
  ok(seen.hit.length === 0, 'taking damage never fabricates a confirmed hit marker');

  // A heal (respawn) must not read as damage — the HUD would flash for nothing.
  socket.emit(NET_EVENTS.PLAYER_HEALTH_UPDATE, { id: 'me', hp: 100, maxHp: 100, reason: 'respawn' });
  ok(seen.health.at(-1).damage === null, 'a respawn heal reports no damage (no false hurt flash)');
}

// ===========================================================================
section('Medals, scores and overtime reach the UI');
// ===========================================================================
{
  const { socket, seen } = makeStream();
  socket.emit(NET_EVENTS.STREAK_EVENT, { kind: 'first_blood', id: 'me', name: 'Me', text: 'First Blood — Me' });
  ok(seen.streak[0]?.kind === 'first_blood' && seen.streak[0].isSelf, 'first blood arrives as a self medal');
  socket.emit(NET_EVENTS.STREAK_EVENT, { kind: 'streak', id: 'me', name: 'Me', streak: 8 });
  ok(/Unstoppable/.test(seen.streak[1].text), `tier fallback text renders ("${seen.streak[1].text}")`);

  socket.emit(NET_EVENTS.SCORE_UPDATE, { mode: 'tdm', scores: [{ id: 'me', score: 4 }], teams: { red: 4, blue: 4 }, overtime: true });
  ok(seen.score[0].overtime === true, 'overtime flag reaches the HUD');
  ok(seen.score[0].teams.red === 4, 'team totals reach the HUD');
  ok(Array.isArray(seen.score[0].scores), 'scores is always an array (scoreboard can .map safely)');
}

// ===========================================================================
section('Server owns the respawn delay');
// ===========================================================================
{
  const { stream } = makeStream();
  // The scene uses `respawnInMs` off the death event, not a local constant.
  // Verify the value survives normalisation, and that a missing field is 0
  // (the scene then falls back to HEALTH.respawnMs).
  const { socket, seen } = makeStream();
  socket.emit(NET_EVENTS.ENTITY_DEATH, { victimId: 'me', respawnInMs: 4200 });
  ok(seen.death[0].respawnInMs === 4200, 'the server respawn delay is carried through verbatim');

  const b = makeStream();
  b.socket.emit(NET_EVENTS.ENTITY_DEATH, { victimId: 'me' });
  ok(b.seen.death[0].respawnInMs === 0, 'a missing respawn delay normalises to 0 (scene falls back)');
}

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
process.exit(failures ? 1 : 0);
