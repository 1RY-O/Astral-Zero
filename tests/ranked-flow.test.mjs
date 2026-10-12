/**
 * Astral Zero — RANKED flow regressions (S14.6, SERVER + CLIENT).
 * ============================================================
 * The ranked maths (shared/ranked.js) had unit coverage; the FLOW did not:
 * nothing ever set `ranked: true` on a room, so ratings were dead code. These
 * checks drive the REAL managers (fake io) and the REAL NetworkManager (fake
 * socket) through the guarantees the design makes:
 *
 *   1. Selection — `queue_join { ranked:true }` reaches the room ONLY for the
 *      rated allow-list; everything else is an honest rejection or an unrated
 *      room. Ranked and casual waiters never share a buffer or a room.
 *   2. Completion — a decided, server-scored match applies each player's
 *      rating EXACTLY once, addressed privately per socket.
 *   3. Duplicates — a second match_end is refused (room already gone) and
 *      changes no rating.
 *   4. Ties/draws — no winner means no rating movement for anyone.
 *   5. Abandonment — leavers and emptied rooms are never rated.
 *   6. Placement — five decided ranked matches place a player.
 *   7. Parties — never rated.
 *   8. Neutral opponents — a match against "nobody" behaves like 1200, on BOTH
 *      sides (a solo remainder once paid 0 for a win and -K for a loss).
 *   9. Client — the flag only ever expresses intent, rides queue_join, and
 *      ranked/character updates from the server land in state untouched.
 *
 * Run with: npm run test:ranked
 */
import assert from 'node:assert/strict';

import { NetworkManager } from '../src/net/NetworkManager.js';
import { NET_EVENTS } from '../src/net/events.js';
import { SOCKET_EVENTS, GAME_MODES } from '../src/sockets/events.js';
import {
  initMatchmaking, joinQueue, leaveRoom, removeFromAllQueues, startPartyMatch, performMatchEnd,
} from '../src/matchmaking/matchmakingManager.js';
import { getRoom, getRoomForSocket } from '../src/rooms/roomManager.js';
import {
  upsertOnJoin, ensureProfile, saveProfile, recordMatchFinish,
} from '../src/players/playerStore.js';
import { createParty, joinParty, _getRawParty } from '../src/parties/partyManager.js';
import { applyRankedResult, seasonId, RATED_MODES } from '../src/shared/ranked.js';

let pass = 0;
let failures = 0;
function ok(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  pass += 1;
  if (!cond) failures += 1;
}
function section(t) { console.log(`\n--- ${t} ---`); }

// ---- fake Socket.io server (mirrors queue-lifecycle.test.mjs) --------------
class FakeSocket {
  constructor(id) {
    this.id = id;
    this.rooms = new Set([id]);
    this.emitted = [];
  }
  join(roomId) { this.rooms.add(roomId); return this; }
  leave(roomId) { this.rooms.delete(roomId); return this; }
  emit(evt, payload) { this.emitted.push({ evt, payload }); return this; }
  count(evt) { return this.emitted.filter((e) => e.evt === evt).length; }
  last(evt) { return [...this.emitted].reverse().find((e) => e.evt === evt)?.payload ?? null; }
}
class FakeIo {
  constructor() { this.sockets = { sockets: new Map() }; this.roomEmits = []; }
  add(id) { const s = new FakeSocket(id); this.sockets.sockets.set(id, s); return s; }
  to(roomId) {
    const self = this;
    return {
      emit(evt, payload) {
        self.roomEmits.push({ roomId, evt, payload });
        for (const s of self.sockets.sockets.values()) {
          if (s.rooms.has(roomId)) s.emit(evt, payload);
        }
        return this;
      },
    };
  }
}
const io = new FakeIo();
initMatchmaking(io, SOCKET_EVENTS);

let seq = 0;
// Factories return the LIVE FakeSocket with identity fields attached, so
// tests can both drive the player (joinQueue) and inspect their own emits.
function veteran(label) {
  seq += 1;
  const id = `sv${seq}`;
  const name = `Ranked-${label}-${seq}`;
  const s = io.add(id);
  s.socketId = id;
  s.name = name;
  upsertOnJoin(id, { name });
  recordMatchFinish([name], GAME_MODES.FFA, {}); // graduates first-match protection
  return s;
}
function rookie(label) {
  seq += 1;
  const id = `nr${seq}`;
  const name = `Rookie-${label}-${seq}`;
  const s = io.add(id);
  s.socketId = id;
  s.name = name;
  upsertOnJoin(id, { name });
  return s;
}
function place(name, rating = 1200) {
  const p = ensureProfile(name);
  p.ranked = {
    placed: true, rating, peak: rating, seasonId: seasonId(),
    wins: 0, losses: 0, placements: 1, scoreSoFar: 0,
  };
  saveProfile(p);
}
function rankedOf(name) { return { ...ensureProfile(name).ranked }; }
function endWithWinner(roomId, winner) {
  const room = getRoom(roomId);
  assert.ok(room?.sim, `room ${roomId} has a live sim to pin a result on`);
  room.sim.winInfo = winner ? { reason: 'score_limit', winner } : null;
  return performMatchEnd(roomId, 'finished');
}
function cleanup(...entries) {
  for (const e of entries) {
    if (getRoomForSocket(e.socketId)) leaveRoom(e.socketId, { stash: false });
    removeFromAllQueues(e.socketId);
  }
}
// ===========================================================================
section('A: ranked is a queue VARIANT — selection is honest');
// ===========================================================================
{
  // 1. control_point must be queueable at all (it shipped as a lobby card but
  //    was missing from GAME_MODES — queue_join answered BAD_MODE).
  const cp = veteran('cp');
  const r = joinQueue(cp, GAME_MODES.CONTROL, 'junkyard', {});
  ok(r.ok === true && r.mode === 'control_point', 'control_point queues (was BAD_MODE before the GAME_MODES fix)');
  cleanup(cp);

  // 2. Ranked request on unrated modes is REJECTED, not silently casual.
  for (const mode of [GAME_MODES.SCRAP, GAME_MODES.CONTROL, GAME_MODES.BOT_PRACTICE]) {
    const v = veteran('nr');
    const res = joinQueue(v, mode, 'junkyard', {}, true);
    ok(res.ok === false && res.error === 'NOT_RATED_MODE', `ranked+${mode} → NOT_RATED_MODE`);
    cleanup(v);
  }

  // 3. A truthy non-boolean can never make a queue rated.
  const tv = veteran('truthy');
  const tr = joinQueue(tv, GAME_MODES.FFA, 'junkyard', {}, 'true');
  ok(tr.ok === true && tr.ranked === false, "ranked:'true' is NOT ranked (strict === true)");
  cleanup(tv);

  // 4. First-match protection: a rookie's ranked request lands in PRACTICE,
  //    unrated — the room can never be rated without a rated effective mode.
  const rk = rookie('protect');
  const pr = joinQueue(rk, GAME_MODES.FFA, 'junkyard', {}, true);
  ok(pr.ok === true && pr.mode === GAME_MODES.BOT_PRACTICE && pr.ranked === false,
    'rookie ranked request → practice room, ranked: false');
  const prRoom = pr.roomId ? getRoom(pr.roomId) : null;
  ok(prRoom?.ranked === false, 'protection room is not rated');
  cleanup(rk);

  // 5. Only RATED_MODES admit ranked — the shared allow-list, both sides.
  ok(RATED_MODES.includes('ffa') && RATED_MODES.includes('tdm') && !RATED_MODES.includes('bot_practice'),
    'RATED_MODES allow-list is ffa + tdm only');
}


// ===========================================================================
section('B: ranked and casual queues never mix');
// ===========================================================================
{
  const c1 = veteran('casual1');
  const r1 = veteran('ranked1');
  const r2 = veteran('ranked2');
  const c2 = veteran('casual2');

  const a = joinQueue(r1, GAME_MODES.FFA, 'junkyard', {}, true);
  ok(a.ok === true && a.ranked === true && a.instant === false, 'ranked #1 waits (queue has 1)');
  const b = joinQueue(c1, GAME_MODES.FFA, 'junkyard', {});
  ok(b.ok === true && b.ranked === false && b.instant === false,
    'casual #1 waits in a SEPARATE buffer — ranked #1 did not drain with them');
  ok(!getRoomForSocket(a.socketId) && !getRoomForSocket(b.socketId), 'nobody seated from mixed demand');

  const c = joinQueue(r2, GAME_MODES.FFA, 'junkyard', {}, true);
  ok(c.ok === true && c.instant === true, 'ranked #2 completes the RANKED pair');
  const rankedRoom = getRoom(c.roomId);
  ok(rankedRoom?.ranked === true, 'drained ranked room carries ranked: true');
  ok(rankedRoom?.players.length === 2
    && rankedRoom.players.every((p) => [r1.socketId, r2.socketId].includes(p.socketId)),
  'ranked room seats ONLY ranked waiters');
  ok(!getRoomForSocket(c1.socketId), 'casual waiter still waiting — untouched by the ranked drain');

  const d = joinQueue(c2, GAME_MODES.FFA, 'junkyard', {});
  ok(d.ok === true && d.instant === true, 'casual #2 completes the CASUAL pair');
  const casualRoom = getRoom(d.roomId);
  ok(casualRoom?.ranked === false && casualRoom?.id !== rankedRoom?.id,
    'casual room is a different room and is NOT rated');

  // queue_update broadcasts name the RIGHT queue.
  const qUpdates = io.roomEmits.filter((e) => e.evt === SOCKET_EVENTS.QUEUE_UPDATE);
  const rankedUpdates = qUpdates.filter((e) => e.payload.ranked === true);
  const casualUpdates = qUpdates.filter((e) => e.payload.ranked === false);
  ok(rankedUpdates.length > 0 && casualUpdates.length > 0,
    'queue_update carries the ranked flag for both queues');

  performMatchEnd(rankedRoom.id, 'finished');
  performMatchEnd(casualRoom.id, 'finished');
  cleanup(c1, c2, r1, r2);
}


// ===========================================================================
section('C: a decided match rates everyone EXACTLY once, privately');
// ===========================================================================
{
  const a = veteran('winner');
  const b = veteran('loser');
  place(a.name, 1200);
  place(b.name, 1200);

  const r = joinQueue(a, GAME_MODES.FFA, 'junkyard', {}, true);
  const r2 = joinQueue(b, GAME_MODES.FFA, 'junkyard', {}, true);
  const roomId = r.instant ? r.roomId : r2.roomId;
  assert.ok(roomId, 'ranked pair drained into one room');
  a.emitted.length = 0;
  b.emitted.length = 0;

  const ended = endWithWinner(roomId, { id: a.socketId, name: a.name });
  ok(ended.ok === true && ended.ranked === true && ended.rankedByName != null,
    'match end reports ranked results');

  const pa = rankedOf(a.name);
  const pb = rankedOf(b.name);
  ok(pa.rating === 1216 && pa.wins === 1, `winner +16 → 1216 (got ${pa.rating}, W=${pa.wins})`);
  ok(pb.rating === 1184 && pb.losses === 1, `loser -16 → 1184 (got ${pb.rating}, L=${pb.losses})`);

  const ua = a.last(SOCKET_EVENTS.RANKED_UPDATE);
  const ub = b.last(SOCKET_EVENTS.RANKED_UPDATE);
  ok(ua?.you?.delta === 16 && ua.you.name === a.name, 'winner received THEIR OWN private delta (16)');
  ok(ub?.you?.delta === -16 && ub.you.name === b.name, 'loser received THEIR OWN private delta (-16)');
  ok(a.count(SOCKET_EVENTS.RANKED_UPDATE) === 1 && b.count(SOCKET_EVENTS.RANKED_UPDATE) === 1,
    'exactly one ranked_update per participant');
  ok(Array.isArray(ua?.leaderboard), 'the update carries the leaderboard read (server truth)');

  // Duplicate match_end: refused, and NOTHING moves a second time.
  const again = performMatchEnd(roomId, 'finished');
  ok(again.ok === false && again.error === 'ROOM_NOT_FOUND', 'duplicate match_end is refused');
  ok(rankedOf(a.name).rating === 1216 && rankedOf(b.name).rating === 1184,
    'no double rating application');
  ok(a.count(SOCKET_EVENTS.RANKED_UPDATE) === 1 && b.count(SOCKET_EVENTS.RANKED_UPDATE) === 1,
    'no second ranked_update emitted');
  cleanup(a, b);
}

// ===========================================================================
section('D: a draw moves nothing — no winner, no rating');
// ===========================================================================
{
  const a = veteran('drawA');
  const b = veteran('drawB');
  place(a.name, 1200);
  place(b.name, 1200);

  const r = joinQueue(a, GAME_MODES.FFA, 'junkyard', {}, true);
  const r2 = joinQueue(b, GAME_MODES.FFA, 'junkyard', {}, true);
  const roomId = r.instant ? r.roomId : r2.roomId;
  a.emitted.length = 0;

  const ended = endWithWinner(roomId, null); // sim never declared a winner
  ok(ended.ok === true && ended.rankedByName != null, 'draw still reports ranked info');
  ok(rankedOf(a.name).rating === 1200 && rankedOf(b.name).rating === 1200
    && rankedOf(a.name).wins === 0 && rankedOf(a.name).losses === 0,
  'draw: rating and W/L untouched for both');
  const u = a.last(SOCKET_EVENTS.RANKED_UPDATE);
  ok(u?.you?.drew === true && u.you.delta === 0, 'draw is reported as drew:true, delta 0 — not a loss');
  cleanup(a, b);
}


// ===========================================================================
section('E: abandonment — leavers and emptied rooms are never rated');
// ===========================================================================
{
  // E1: one player leaves a rated room mid-match; the survivor's match ends.
  const a = veteran('leaver');
  const b = veteran('stayer');
  place(a.name, 1200);
  place(b.name, 1200);

  const r = joinQueue(a, GAME_MODES.FFA, 'junkyard', {}, true);
  const r2 = joinQueue(b, GAME_MODES.FFA, 'junkyard', {}, true);
  const roomId = r.instant ? r.roomId : r2.roomId;

  const left = leaveRoom(a.socketId, { stash: false });
  ok(left.ok === true && left.empty === false, 'leaver removed, match survives for the other');

  const ended = endWithWinner(roomId, { id: b.socketId, name: b.name });
  ok(ended.ok === true, 'survivor match still ends with a server result');
  ok(rankedOf(a.name).rating === 1200 && rankedOf(a.name).wins === 0 && rankedOf(a.name).losses === 0,
    'the leaver was NOT rated (no update from an abandoned seat)');
  ok(rankedOf(b.name).rating === 1216, 'the survivor IS rated (their match completed)');
  cleanup(b);

  // E2: everyone leaves → room destroyed → nobody rated, no leftover state.
  const c = veteran('gone1');
  const d = veteran('gone2');
  place(c.name, 1200);
  place(d.name, 1200);
  const q = joinQueue(c, GAME_MODES.FFA, 'junkyard', {}, true);
  const q2 = joinQueue(d, GAME_MODES.FFA, 'junkyard', {}, true);
  const rid = q.instant ? q.roomId : q2.roomId;
  leaveRoom(c.socketId, { stash: false });
  const fin = leaveRoom(d.socketId, { stash: false });
  ok(fin.empty === true && !getRoom(rid), 'emptied rated room is destroyed');
  ok(rankedOf(c.name).rating === 1200 && rankedOf(d.name).rating === 1200,
    'no rating from an abandoned (never completed) match');
}

// ===========================================================================
section('F: five decided ranked matches place an unplaced player');
// ===========================================================================
{
  const x = rookie('placing'); // unplaced, but a veteran for protection
  recordMatchFinish([x.name], GAME_MODES.FFA, {});
  const y = veteran('anchor');
  place(y.name, 1200);

  for (let i = 1; i <= 5; i += 1) {
    removeFromAllQueues(x.socketId);
    removeFromAllQueues(y.socketId);
    const rA = joinQueue(x, GAME_MODES.FFA, 'junkyard', {}, true);
    const rB = joinQueue(y, GAME_MODES.FFA, 'junkyard', {}, true);
    const roomId = rA.instant ? rA.roomId : rB.roomId;
    assert.ok(roomId, `placement cycle ${i}: ranked room formed`);
    const ended = endWithWinner(roomId, { id: y.socketId, name: y.name });
    assert.ok(ended.ok, `placement cycle ${i}: match ended`);
    if (i < 5) {
      ok(rankedOf(x.name).placed === false, `cycle ${i}: still unplaced (placements are earned, not assumed)`);
    }
  }
  const px = rankedOf(x.name);
  ok(px.placed === true && px.losses === 5, `after 5 decided matches: placed, 5 losses recorded (got ${px.losses})`);
  ok(px.seasonId === seasonId(), 'placement stamps the current season');
  cleanup(x, y);
}

// ===========================================================================
section('G: parties are never rated');
// ===========================================================================
{
  const l = veteran('partyL');
  const m = veteran('partyM');
  place(l.name, 1200);
  place(m.name, 1200);
  const created = createParty(l);
  ok(created.ok === true, 'party created');
  joinParty(m, created.party.code);
  const res = startPartyMatch(_getRawParty(created.party.code), GAME_MODES.FFA, 'junkyard', {});
  ok(res.ok === true && res.roomId, 'party match started');
  const room = getRoom(res.roomId);
  ok(room?.ranked === false, 'party room is NEVER rated — no path passes ranked:true');
  performMatchEnd(res.roomId, 'finished');
  ok(rankedOf(l.name).rating === 1200 && rankedOf(m.name).rating === 1200,
    'party match left both ratings untouched');
  cleanup(l, m);
}

// ===========================================================================
section('H: neutral opponent (no meaningful pool) behaves like 1200');
// ===========================================================================
{
  const base = {
    placed: true, rating: 1200, peak: 1200, seasonId: seasonId(),
    wins: 0, losses: 0, placements: 1, scoreSoFar: 0,
  };
  const winVsNobody = applyRankedResult(base, { won: true, opponentRating: 0 });
  const winVs1200 = applyRankedResult(base, { won: true, opponentRating: 1200 });
  const lossVsNobody = applyRankedResult(base, { won: false, opponentRating: 0 });
  const lossVs1200 = applyRankedResult(base, { won: false, opponentRating: 1200 });
  ok(winVsNobody.delta === winVs1200.delta && winVsNobody.delta > 0,
    `a win vs nobody pays the same as vs 1200 (${winVsNobody.delta})`);
  ok(lossVsNobody.delta === lossVs1200.delta && lossVsNobody.delta < 0,
    `a loss vs nobody costs the same as vs 1200 (${lossVsNobody.delta}) — the old asymmetry is gone`);
  ok(winVsNobody.delta === 16 && lossVsNobody.delta === -16, 'neutral delta is the symmetric ±16 at 1200');
}


// ===========================================================================
section('I: CLIENT — intent in, server truth out');
// ===========================================================================
/** Minimal scripted socket for the REAL NetworkManager. */
class FakeClientSocket {
  constructor() {
    this.handlers = new Map();
    this.internal = new Map();
    this.requests = [];
    this.acks = new Map();
    this.id = 'sock-1';
    this.isConnected = true;
  }
  connect() {}
  announcePlayer() {}
  emit() { return true; }
  on(evt, handler) {
    if (!this.handlers.has(evt)) this.handlers.set(evt, new Set());
    this.handlers.get(evt).add(handler);
    return () => this.handlers.get(evt)?.delete(handler);
  }
  onInternal(evt, handler) {
    if (!this.internal.has(evt)) this.internal.set(evt, new Set());
    this.internal.get(evt).add(handler);
    return () => this.internal.get(evt)?.delete(handler);
  }
  request(evt, payload) {
    this.requests.push({ evt, payload });
    const fn = this.acks.get(evt);
    return Promise.resolve(fn ? fn(payload) : { ok: true });
  }
  when(evt, fn) { this.acks.set(evt, fn); }
  push(evt, payload) { for (const h of this.handlers.get(evt) ?? []) h(payload); }
  count(evt) { return this.requests.filter((r) => r.evt === evt).length; }
}

{
  const sock = new FakeClientSocket();
  const net = new NetworkManager({ socket: sock });
  net.setPlayerName('Cli');
  net.state.connection = 'online';
  net.state.contractOk = true;

  // setRanked gates on the mode allow-list and survives mode switches honestly.
  ok(net.setRanked(true) === true, 'ranked intent accepted on ffa');
  net.setMode('bot_practice');
  ok(net.state.rankedSelected === false, 'switching to an unrated mode DROPS the ranked intent');
  net.setMode('tdm');
  ok(net.setRanked(true) === true, 'ranked intent accepted on tdm');

  sock.when(NET_EVENTS.QUEUE_JOIN, () => ({ ok: true, mode: 'tdm', ranked: true, instant: false, position: 1 }));
  await net.queueJoin();
  const qj = sock.requests.find((r) => r.evt === NET_EVENTS.QUEUE_JOIN);
  ok(qj?.payload?.ranked === true, 'queue_join carries ranked: true');

  // queue_update reports the ACTUAL queue.
  sock.push(NET_EVENTS.QUEUE_UPDATE, { mode: 'tdm', ranked: true, position: 1, playersInQueue: 3 });
  ok(net.state.queue?.ranked === true && net.state.queue.position === 1, 'queue_update ranked flag adopted');
  sock.push(NET_EVENTS.QUEUE_UPDATE, { mode: 'tdm', position: 2 });
  ok(net.state.queue?.ranked === false, 'an old server without the flag reads as casual, not ranked');

  // A server ranked_update lands in state verbatim and fires the 'ranked' event.
  let rankedEvents = 0;
  net.on('ranked', () => { rankedEvents += 1; });
  sock.push(NET_EVENTS.RANKED_UPDATE, {
    seasonId: '2026-10',
    you: { name: 'Cli', placed: true, rating: 1216, league: 'orbital', delta: 16 },
    leaderboard: [{ name: 'Cli', rating: 1216 }],
  });
  ok(rankedEvents === 1 && net.state.ranked.you.rating === 1216, "ranked_update → state + 'ranked' event");
  ok(net.state.ranked.leaderboard.length === 1, 'leaderboard adopted from the server');

  // Board request goes out on the real event; empty season reads as empty.
  sock.when(NET_EVENTS.RANKED_BOARD, () => ({ ok: true }));
  const board = await net.requestRankedBoard();
  ok(board.ok === true && sock.count(NET_EVENTS.RANKED_BOARD) === 1, 'ranked_board requested once');
  sock.push(NET_EVENTS.RANKED_UPDATE, { seasonId: '2026-10', you: null, leaderboard: [] });
  ok(net.state.ranked.leaderboard.length === 0, 'empty season reads as empty — no fabricated rows');

  // Character selection: server-confirmed only; rejection changes nothing.
  sock.when(NET_EVENTS.CHARACTER_SET, () => ({ ok: true, character: 'vera', variant: null }));
  const cs = await net.setCharacter('vera');
  ok(cs.ok === true && net.state.character?.character === 'vera', 'accepted character_set lands in state');
  sock.when(NET_EVENTS.CHARACTER_SET, () => ({ ok: false, error: 'LOCKED' }));
  const bad = await net.setCharacter('locked-one');
  ok(bad.ok === false && net.state.character?.character === 'vera',
    'rejected selection keeps the previous character (no silent local swap)');
  ok(net.state.notice?.tone === 'error', 'rejection surfaced as an error notice');
  const csReq = sock.requests.find((r) => r.evt === NET_EVENTS.CHARACTER_SET);
  ok(csReq?.payload?.character === 'vera' && 'variant' in csReq.payload, 'character_set payload shape');

  // A truthy non-boolean can never make the CLIENT ask for ranked either.
  ok(net.setRanked('yes') === false, "setRanked('yes') is false — strict intent only");
}

// ===========================================================================
console.log(`\n${failures === 0 ? '✅' : '❌'} Ranked flow: ${pass} checks, ${failures} failures.`);
process.exit(failures === 0 ? 0 : 1);

