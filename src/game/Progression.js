/**
 * Astral Zero — progression display (FRONTEND, Phase 5).
 * ============================================================
 * ★ REWRITTEN. Phase 5 made progression SERVER-AUTHORITATIVE.
 *
 * The previous version of this file computed XP locally from kills/deaths and
 * stored a rank in localStorage. That is now wrong twice over:
 *
 *  1. It would DISAGREE with the server. The backend's `buildMatchResult`
 *     already attaches authoritative `xp`, `level`, `medals`, `accuracy` and
 *     `bestStreak` to every score row, picks an `mvp`, and ships a `telemetry`
 *     block. A local estimate would show a different number from the one the
 *     player's real profile earned, and a different rank than everyone else
 *     sees.
 *  2. It was never trustworthy. A client-side rank is one `localStorage` edit
 *     away from being wrong.
 *
 * So this module no longer calculates anything. It is a pure READ + PRESENT
 * layer over the `match_end` payload:
 *
 *   { roomId, mode, mapId, reason, winner, teams,
 *     scores: [{ id, name, team, kills, deaths, score, isBot,
 *                banked, carried, xp, level, medals, accuracy, bestStreak }],
 *     results, firstMatchGraduated, mvp: {id,name}|null,
 *     telemetry: {...}, xpByName, timestamp }
 *
 * The six medal types are fixed by the server (src/game/scoring.js):
 *   first_blood · sharpshooter · survivor · banker · rampage · mvp
 *
 * NOTHING HERE IS AUTHORITATIVE. If a field is missing we render "—" rather
 * than inventing a value: a summary screen that quietly fills in plausible
 * numbers is worse than one that admits it does not know.
 */

/** The server's six medal ids, in the order they are awarded. */
export const MEDAL_TYPES = Object.freeze([
  { id: 'first_blood', name: 'First Blood', blurb: 'Opened the match with a kill.' },
  { id: 'sharpshooter', name: 'Sharpshooter', blurb: '10+ shots at 40% accuracy or better.' },
  { id: 'survivor', name: 'Survivor', blurb: 'Finished with 3+ kills and zero deaths.' },
  { id: 'banker', name: 'Banker', blurb: 'Banked scrap at a deposit dock.' },
  { id: 'rampage', name: 'Rampage', blurb: 'Hit a 5-kill streak.' },
  { id: 'mvp', name: 'MVP', blurb: 'Top score of the match.' },
]);

const MEDAL_BY_ID = Object.freeze(Object.fromEntries(MEDAL_TYPES.map((m) => [m.id, m])));

/** Rank titles, chosen client-side for display only — the LEVEL is the server's. */
const LEVEL_TITLES = Object.freeze([
  'Orbit Cadet', 'Debris Sweeper', 'Vacuum Juggler', 'Orbital Tech',
  'Janitor Prime', 'Legend of Low Orbit',
]);

/**
 * Title for an authoritative level. Purely cosmetic — the level itself always
 * comes from the server.
 * @param {number} level
 * @returns {string}
 */
export function titleForLevel(level) {
  const n = Math.max(1, Math.floor(Number(level) || 1));
  return LEVEL_TITLES[Math.min(n - 1, LEVEL_TITLES.length - 1)];
}

/**
 * Find OUR row in a `match_end` payload.
 *
 * Prefers the full `scores` array (which carries xp/level/medals) and falls
 * back to the legacy `results` array. Matching is by id, and by name as a
 * fallback for the (rare) case where our socket id changed across a reconnect.
 *
 * @param {object} payload - The `match_end` result.
 * @param {string} localId
 * @param {string} [localName]
 * @returns {object|null}
 */
export function selfRow(payload, localId, localName = null) {
  const scores = Array.isArray(payload?.scores) ? payload.scores : [];
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const all = scores.length ? scores : results;

  return (
    all.find((r) => r.id === localId) ??
    (localName ? all.find((r) => r?.name === localName) : null) ??
    null
  );
}

/**
 * Did we win?
 *
 * `winner` is the server's verdict, so it is the only signal used. The score
 * comparison is a last resort for a payload that predates the field, and it is
 * clearly marked because inferring a winner is exactly the kind of client-side
 * guess this rewrite is removing.
 *
 * @param {object} payload
 * @param {string} localId
 * @returns {{won: boolean, known: boolean}}
 */
export function outcomeFor(payload, localId) {
  const winner = payload?.winner;
  if (winner?.id) return { won: winner.id === localId, known: true };
  if (winner === null && payload && 'winner' in payload) return { won: false, known: true };
  return { won: false, known: false };
}

/**
 * Decode a server medal id into display data.
 * @param {string} id
 * @returns {{id:string, name:string, blurb:string, known:boolean}}
 */
export function medalInfo(id) {
  const hit = MEDAL_BY_ID[id];
  // Must set `known` explicitly: returning the bare table row would leave
  // `known` undefined, and the summary renders "(unrecognised)" whenever it is
  // falsy — so every legitimate medal would be flagged as unknown.
  if (hit) return { ...hit, known: true };
  return { id, name: id, blurb: '', known: false };
}

/**
 * Everything the summary screen renders, derived purely from `match_end`.
 *
 * @param {object} payload - The `match_end` result.
 * @param {string} localId
 * @param {string} [localName]
 * @returns {object}
 */
export function summarise(payload, localId, localName = null) {
  const self = selfRow(payload, localId, localName);
  const { won, known } = outcomeFor(payload, localId);
  const scores = Array.isArray(payload?.scores) ? payload.scores : [];

  return {
    // `null` (not 0) when the server did not tell us — the screen renders "—".
    xp: self?.xp ?? null,
    level: self?.level ?? null,
    levelTitle: self?.level != null ? titleForLevel(self.level) : null,
    kills: self?.kills ?? null,
    deaths: self?.deaths ?? null,
    accuracy: Number.isFinite(Number(self?.accuracy)) ? self.accuracy : null,
    bestStreak: self?.bestStreak ?? null,
    banked: self?.banked ?? null,
    carried: self?.carried ?? null,
    medals: Array.isArray(self?.medals) ? self.medals.map(medalInfo) : [],
    isMvp: Boolean(payload?.mvp?.id) && payload.mvp.id === localId,
    mvpName: payload?.mvp?.name ?? null,
    won,
    outcomeKnown: known,
    winnerName: payload?.winner?.name ?? null,
    teams: payload?.teams ?? null,
    standings: scores
      .filter((r) => !r.isBot)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    telemetry: payload?.telemetry ?? null,
  };
}

export default { MEDAL_TYPES, titleForLevel, selfRow, outcomeFor, medalInfo, summarise };
