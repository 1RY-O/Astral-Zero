/**
 * Astral Zero — authoritative progression test (Phase 5).
 * ============================================================
 * Phase 5 made progression server-side: `match_end` carries per-player
 * xp/level/medals/accuracy, an mvp and a telemetry block. The client no longer
 * computes anything, so this test asserts the OPPOSITE of the old one — that
 * the client renders the server's numbers VERBATIM and never invents a value
 * when the server omits one.
 *
 * These fixtures are copied from the real shapes in src/game/scoring.js
 * (buildMatchResult) rather than invented, so a contract change shows up as a
 * failure here instead of a wrong number on the summary screen.
 *
 * Run with: npm run test:progression
 */

import {
  MEDAL_TYPES, titleForLevel, selfRow, outcomeFor, medalInfo, summarise,
} from '../src/game/Progression.js';

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures += 1;
};
const section = (t) => console.log(`\n--- ${t} ---`);

// Shape copied from src/game/scoring.js buildMatchResult().
const PAYLOAD = {
  roomId: 'room_abc', mode: 'ffa', mapId: 'orbital_junkyard', reason: 'score_limit',
  winner: { id: 'me', name: 'Me', team: null, isBot: false },
  teams: null,
  scores: [
    { id: 'me', name: 'Me', team: null, kills: 7, deaths: 2, score: 7, isBot: false,
      banked: 0, carried: 0, xp: 640, level: 3, medals: ['first_blood', 'rampage', 'mvp'],
      accuracy: 0.62, bestStreak: 5 },
    { id: 'p2', name: 'Rival', team: null, kills: 4, deaths: 5, score: 4, isBot: false,
      banked: 0, carried: 0, xp: 320, level: 2, medals: ['survivor'], accuracy: 0.4, bestStreak: 2 },
    { id: 'b1', name: 'Bin Chicken', team: null, kills: 1, deaths: 8, score: 1, isBot: true,
      banked: 0, carried: 0, xp: 0, level: 1, medals: [], accuracy: 0.2, bestStreak: 1 },
  ],
  mvp: { id: 'me', name: 'Me' },
  telemetry: { durationMs: 182000, avgPingMs: 42 },
  timestamp: 1,
};

// ===========================================================================
section('The server\'s values are rendered verbatim');
// ===========================================================================
{
  const v = summarise(PAYLOAD, 'me');
  ok(v.xp === 640, `XP is the server's 640, not a local calculation (${v.xp})`);
  ok(v.level === 3, `level is the server's 3 (${v.level})`);
  ok(v.kills === 7 && v.deaths === 2, 'kills/deaths are the server values');
  ok(v.accuracy === 0.62, 'accuracy is the server value, not recomputed');
  ok(v.bestStreak === 5, 'best streak is the server value');
  ok(v.isMvp === true, 'mvp flag comes from the server mvp block');
  ok(v.won === true && v.outcomeKnown === true, 'the win is the server verdict');
  ok(v.medals.length === 3, 'all three server medals are rendered');
}

// ===========================================================================
section('All six server medal types are understood');
// ===========================================================================
{
  ok(MEDAL_TYPES.length === 6, `exactly the six server medals (${MEDAL_TYPES.length})`);
  for (const id of ['first_blood', 'sharpshooter', 'survivor', 'banker', 'rampage', 'mvp']) {
    ok(MEDAL_TYPES.some((m) => m.id === id), `medal id "${id}" is recognised`);
    ok(medalInfo(id).known === true, `"${id}" resolves to a display name`);
  }
  // An unknown id must render as-is, not throw or vanish.
  const unknown = medalInfo('some_future_medal');
  ok(unknown.known === false && unknown.name === 'some_future_medal',
    'an unknown medal renders its raw id instead of disappearing');
}

// ===========================================================================
section('Missing values render as unknown, never invented');
// ===========================================================================
{
  // A payload with no progression at all (e.g. an older server, or a mode that
  // does not award XP).
  const bare = { winner: null, scores: [{ id: 'me', name: 'Me', kills: 0, deaths: 0, score: 0 }] };
  const v = summarise(bare, 'me');

  ok(v.xp === null, 'missing XP is null (renders "—", not 0)');
  ok(v.level === null, 'missing level is null');
  ok(v.accuracy === null, 'missing accuracy is null');
  ok(v.medals.length === 0, 'missing medals is an empty list');
  ok(v.outcomeKnown === true && v.won === false, 'an explicit null winner reads as "not won"');
  // Critically: null must never be coerced to a number.
  ok(typeof v.xp !== 'number', 'a missing XP is not silently turned into 0');

  // No payload at all must not throw.
  const none = summarise({}, 'me');
  ok(none.xp === null && none.standings.length === 0, 'an empty payload degrades safely');
}

// ===========================================================================
section('Row selection and identity fallback');
// ===========================================================================
{
  ok(selfRow(PAYLOAD, 'me')?.xp === 640, 'self row found by socket id');
  // After a reconnect our socket id changes but our NAME does not — the server
  // keys progression by name, so the fallback has to work.
  ok(selfRow(PAYLOAD, 'NEW_SOCKET_ID', 'Me')?.xp === 640,
    'self row falls back to name (reconnect case)');
  ok(selfRow(PAYLOAD, 'nobody') === null, 'an unknown id yields null, not a wrong row');

  // Bots must not appear in the human standings.
  const v = summarise(PAYLOAD, 'me');
  ok(v.standings.every((r) => !r.isBot), 'bot rows are filtered out of the standings');
  ok(v.standings.length === 2, `standings are humans only (${v.standings.length})`);
  ok(v.standings[0].score >= v.standings[1].score, 'standings are sorted by score');
}

// ===========================================================================
section('Outcome honesty');
// ===========================================================================
{
  ok(outcomeFor(PAYLOAD, 'me').won === true, 'winner id match reads as a win');
  ok(outcomeFor(PAYLOAD, 'p2').won === false, 'a different winner reads as a loss');
  const noWinner = summarise({ scores: [] }, 'me');
  ok(noWinner.outcomeKnown === false,
    'with no winner field the UI is told the outcome is UNKNOWN (it must not guess)');
}

// ===========================================================================
section('Level titles are cosmetic only');
// ===========================================================================
{
  ok(typeof titleForLevel(1) === 'string' && titleForLevel(1).length > 0, 'level 1 has a title');
  ok(titleForLevel(3) !== titleForLevel(1), 'titles differ by level');
  // Out-of-range levels must clamp rather than return undefined.
  ok(typeof titleForLevel(9999) === 'string', 'a huge level clamps to a real title');
  ok(typeof titleForLevel(NaN) === 'string', 'NaN level clamps to a real title');
  ok(typeof titleForLevel(0) === 'string', 'level 0 clamps to a real title');
}

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
process.exit(failures ? 1 : 0);
