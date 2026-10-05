/**
 * Astral Zero — Scoring + win conditions (Phase 3, progression in Phase 5).
 * ============================================================
 * SCORE MODEL:
 *  - Every entity carries kills / deaths / score. In ffa/tdm score == kills;
 *    in scrap_collector score == banked (see below).
 *  - tdm ALSO tracks team totals: room.sim.teamScores = { red, blue }.
 *    recordTeamKill is called by the loop for every credited kill event.
 *
 * WIN CONDITIONS (tuning: server-config.js → gameModes):
 *  - ffa:          first entity to killLimit (default 10) → 'score_limit',
 *                  else highest score when durationSec elapses → 'time_limit'.
 *  - tdm:          first team to scoreLimit (default 25) → 'score_limit',
 *                  else higher team score at durationSec → 'time_limit'
 *                  (exact tie → one 60 s sudden-lead overtime → 'overtime'
 *                  or 'draw'; see §20).
 *  - bot_practice: NO winner ever — durationSec elapses → 'practice_complete'.
 *                  The scoreboard still ships (bragging rights are real).
 *  - scrap_collector (Phase 5): first to bankLimit banked → 'score_limit',
 *                  else most banked at durationSec → 'time_limit'. Real win
 *                  (graduates first-match protection like ffa/tdm).
 *
 * PROGRESSION (Phase 5): buildMatchResult enriches every score row with
 * xp / level / medals / accuracy, picks an mvp, and attaches telemetry.
 * XP lands in the (in-memory) player profile via recordMatchFinish.
 *
 * MATCH RESULT (extends the Phase 2 match_end payload — old fields kept):
 *  { roomId, mode, mapId, reason, winner {id,name,team,isBot}|null,
 *    teams {red,blue}|null, scores [{id,name,team,kills,deaths,score,isBot,
 *    banked,carried,xp,level,medals,accuracy,bestStreak}],
 *    results (legacy Phase 2 shape + xp), firstMatchGraduated,
 *    mvp {id,name}|null, telemetry {…}, timestamp }
 *
 * TIMING: room.sim.endsAt (ms) is stamped at PLAYING start (countdown
 * excluded — loading shouldn't eat match time). The tick loop polls
 * checkWin() every tick; it's O(n) and branch-cheap.
 */

import config from '../server-config.js';
import { getProgress } from '../players/playerStore.js';

function tuningFor(mode) {
  return config.gameModes?.[mode] || {};
}

/** Stamp match clock + limits onto a fresh sim (called when play begins). */
export function initMatchClock(room, now = Date.now()) {
  const tuning = tuningFor(room.mode);
  const durationSec = tuning.durationSec || 180;
  room.sim.endsAt = now + durationSec * 1000;
  room.sim.clockStartedAt = now; // Phase 5: telemetry duration anchor
  room.sim.durationSec = durationSec;
  room.sim.killLimit = tuning.killLimit || null;
  room.sim.scoreLimit = tuning.scoreLimit || null;
  room.sim.bankLimit = tuning.bankLimit || null; // Phase 5: scrap target
  room.sim.teamScores = { red: 0, blue: 0 };
  room.sim.over = false;
  room.sim.winInfo = null;
}

/** Credit a team point (tdm only — called for credited kills). */
export function recordTeamKill(room, killerTeam) {
  if (room.mode !== 'tdm' || !room.sim?.teamScores) return;
  if (killerTeam === 'red' || killerTeam === 'blue') {
    room.sim.teamScores[killerTeam] += 1;
  }
}

/**
 * Scoreboard DTO for `score_update` + `match_end`.
 * Sorted: score desc, deaths asc (fewer deaths breaks ties, feels fair).
 * Phase 5: rows also carry banked/carried (live satchel state for scrap HUDs).
 */
export function scoreboard(room) {
  const scores = [];
  if (room.sim?.entities) {
    for (const e of room.sim.entities.values()) {
      if (e.disconnected) continue;
      scores.push({
        id: e.id,
        name: e.name,
        team: e.team,
        kills: e.kills,
        deaths: e.deaths,
        score: e.score,
        isBot: e.isBot,
        banked: e.banked || 0,
        carried: e.carried || 0,
      });
    }
  }
  scores.sort((a, b) => b.score - a.score || a.deaths - b.deaths || a.name.localeCompare(b.name));
  return scores;
}

function topHumanOrBot(scores) {
  return scores.length ? scores[0] : null;
}

/**
 * Poll win conditions. Idempotent: once over, keeps returning the same info.
 * @param {object} room
 * @param {number} now server ms
 * @returns {object|null} { reason, winner, teams } when the match should end
 */
export function checkWin(room, now = Date.now()) {
  if (!room.sim || room.sim.over) return room.sim?.winInfo || null;
  // Phase 5: scrap has its own table (banked, not kills).
  if (room.mode === 'scrap_collector') return checkScrapWin(room, now);
  const scores = scoreboard(room);
  const timeUp = now >= (room.sim.endsAt || now + 1);

  if (room.mode === 'bot_practice') {
    if (timeUp) {
      return finish(room, { reason: 'practice_complete', winner: null, teams: null });
    }
    return null;
  }

  if (room.mode === 'tdm') {
    const { red, blue } = room.sim.teamScores;
    const limit = room.sim.scoreLimit;
    if (limit && (red >= limit || blue >= limit)) {
      const winnerTeam = red === blue ? null : red > blue ? 'red' : 'blue';
      return finish(room, { reason: 'score_limit', winner: winnerTeam ? { team: winnerTeam } : null, teams: { red, blue } });
    }
    // Phase 4 overtime: sudden-lead — any edge while the clock is extended
    // ends it immediately (checked every tick, before the horn logic).
    if (room.sim.overtime && red !== blue) {
      const winnerTeam = red > blue ? 'red' : 'blue';
      return finish(room, { reason: 'overtime', winner: { team: winnerTeam }, teams: { red, blue } });
    }
    if (timeUp) {
      // Tie at the horn → extend ONCE (overtime), not a draw yet. The loop
      // notices `overtimeJustStarted` and pushes the flag to clients.
      if (red === blue && !room.sim.overtime) {
        room.sim.overtime = true;
        room.sim.overtimeJustStarted = true;
        room.sim.endsAt = now + (config.sim?.overtimeSec || 60) * 1000;
        return null;
      }
      if (red === blue) return finish(room, { reason: 'draw', winner: null, teams: { red, blue } });
      const winnerTeam = red > blue ? 'red' : 'blue';
      return finish(room, { reason: 'time_limit', winner: { team: winnerTeam }, teams: { red, blue } });
    }
    return null;
  }

  // ffa (default path)
  const limit = room.sim.killLimit;
  const top = topHumanOrBot(scores);
  if (limit && top && top.score >= limit) {
    return finish(room, { reason: 'score_limit', winner: personOf(top), teams: null });
  }
  if (timeUp) {
    return finish(room, { reason: 'time_limit', winner: top ? personOf(top) : null, teams: null });
  }
  return null;
}

/**
 * Phase 5 scrap_collector win check. Score mirrors banked (the loop keeps
 * them in lockstep on every deposit), so the table sorts itself.
 */
export function checkScrapWin(room, now = Date.now()) {
  if (!room.sim || room.sim.over) return room.sim?.winInfo || null;
  const scores = scoreboard(room);
  const top = topHumanOrBot(scores);
  const limit = room.sim.bankLimit;
  if (limit && top && (top.banked || 0) >= limit) {
    return finish(room, { reason: 'score_limit', winner: personOf(top), teams: null });
  }
  if (now >= (room.sim.endsAt || now + 1)) {
    return finish(room, { reason: 'time_limit', winner: top ? personOf(top) : null, teams: null });
  }
  return null;
}

function personOf(s) {
  return s ? { id: s.id, name: s.name, team: s.team, isBot: s.isBot } : null;
}

function finish(room, info) {
  room.sim.over = true;
  room.sim.winInfo = info;
  return info;
}

/**
 * Phase 5 progression: XP, levels, medals, MVP, telemetry.
 *
 * XP FORMULA (per entity): kills × 100 + banked × 50 + win bonus 250 +
 * participation 25. Practice matches bank HALF (lessons still count).
 * Level = floor((lifetime total + this match) / 1000) + 1, read from the
 * in-memory profile (playerStore) so levels persist across reconnects.
 *
 * MEDALS (pure stat checks, zero gameplay effect):
 *  first_blood  killer struck the room's first credited blow
 *  sharpshooter ≥10 shots at ≥40% accuracy
 *  survivor     zero deaths with ≥3 kills
 *  banker       scrap mode, top banked (and > 0)
 *  rampage      best streak ≥ 5
 *  mvp          the match winner (person; team winners crown top scorer)
 *
 * @returns {{ rows: Map(id → {xp, level, medals, accuracy}), mvp, telemetry,
 *            xpByName: Map(name → xp) }}
 */
export function progressionFor(room, reason, winInfo, now = Date.now()) {
  const rows = new Map();
  const entities = room.sim?.entities ? [...room.sim.entities.values()] : [];
  const winner = winInfo?.winner || null;
  const mvpId = resolveMvpId(room, winner, entities);
  const maxBanked = Math.max(0, ...entities.map((e) => e.banked || 0));
  const practiceScale = room.mode === 'bot_practice' ? 0.5 : 1;

  for (const e of entities) {
    if (e.disconnected) continue;
    const accuracy = e.shots > 0 ? Math.round((e.hits / e.shots) * 100) / 100 : 0;
    const won =
      (winner?.id && winner.id === e.id) ||
      (winner?.team && !winner?.id && e.team === winner.team && e.id === mvpId);
    let xp = Math.round((e.kills * 100 + (e.banked || 0) * 50 + (won ? 250 : 0) + 25) * practiceScale);
    const medals = [];
    if (room.sim?.firstBlood?.id === e.id) medals.push('first_blood');
    if (e.shots >= 10 && accuracy >= 0.4) medals.push('sharpshooter');
    if (e.deaths === 0 && e.kills >= 3) medals.push('survivor');
    if (room.mode === 'scrap_collector' && (e.banked || 0) > 0 && (e.banked || 0) >= maxBanked) {
      medals.push('banker');
    }
    if ((e.bestStreak || 0) >= 5) medals.push('rampage');
    if (e.id === mvpId) medals.push('mvp');
    const lifetime = e.isBot ? 0 : getProgress(e.name).totalXp;
    rows.set(e.id, {
      xp,
      level: Math.floor((lifetime + xp) / 1000) + 1,
      medals,
      accuracy,
      bestStreak: e.bestStreak || 0,
    });
  }

  const st = room.sim?.stats || {};
  const totalShots = st.shots || 0;
  const totalHits = st.hits || 0;
  const telemetry = {
    durationSec: room.sim?.clockStartedAt ? Math.max(0, Math.round((now - room.sim.clockStartedAt) / 1000)) : 0,
    totalKills: entities.reduce((n, e) => n + (e.kills || 0), 0),
    totalShots,
    totalHits,
    accuracy: totalShots > 0 ? Math.round((totalHits / totalShots) * 100) / 100 : 0,
    lagCompHits: st.lagCompHits || 0,
    overtime: Boolean(room.sim?.overtime),
  };
  const mvp = mvpId ? personOf(entities.find((e) => e.id === mvpId)) : null;
  const xpByName = new Map();
  for (const e of entities) {
    if (!e.isBot && rows.has(e.id)) xpByName.set(e.name, rows.get(e.id).xp);
  }
  return { rows, mvp, telemetry, xpByName };
}

/** MVP person: ffa/scrap winner directly; tdm → top scorer of winning team. */
function resolveMvpId(room, winner, entities) {
  if (!winner) return null;
  if (winner.id) return winner.id;
  if (winner.team) {
    let best = null;
    for (const e of entities) {
      if (e.team !== winner.team || e.disconnected) continue;
      if (!best || e.score > best.score || (e.score === best.score && e.deaths < best.deaths)) {
        best = e;
      }
    }
    return best ? best.id : null;
  }
  return null;
}

/**
 * Full match_end payload. MUST be called BEFORE the room is destroyed
 * (endMatch destroys state — matchmaking calls this first via room result).
 * Keeps every Phase 2 field (roomId, mode, mapId, reason, results,
 * firstMatchGraduated, timestamp) and adds winner/teams/scores.
 *
 * Phase 5: scores gain banked/carried/xp/level/medals/accuracy/bestStreak;
 * results gain xp; top-level mvp + telemetry land alongside.
 */
export function buildMatchResult(room, reason, winInfo, humanNames) {
  const now = Date.now();
  const prog = progressionFor(room, reason, winInfo, now);
  const scores = scoreboard(room).map((s) => ({ ...s, ...(prog.rows.get(s.id) || { xp: 0, level: 1, medals: [], accuracy: 0, bestStreak: 0 }) }));
  const teams = room.mode === 'tdm' && room.sim?.teamScores ? { ...room.sim.teamScores } : null;
  const winner = winInfo?.winner || null;
  return {
    roomId: room.id,
    mode: room.mode,
    mapId: room.mapId,
    reason,
    winner,
    teams,
    scores,
    // Legacy Phase 2 standings (kept byte-compatible; score now REAL; +xp).
    results: scores
      .filter((s) => !s.isBot)
      .map((s) => ({ id: s.id, name: s.name, team: s.team, isBot: false, score: s.score, kills: s.kills, deaths: s.deaths, xp: s.xp })),
    firstMatchGraduated: room.mode !== 'bot_practice' ? humanNames : [],
    mvp: prog.mvp,
    telemetry: prog.telemetry,
    xpByName: Object.fromEntries(prog.xpByName),
    timestamp: now,
  };
}
