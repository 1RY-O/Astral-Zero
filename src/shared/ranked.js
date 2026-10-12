/**
 * Astral Zero — RANKED ratings (shared client + server).
 * ============================================================
 * S14.6. Ratings are the one subsystem where a wrong number is worse than no
 * number: a rating computed from unverifiable client state, or one that resets
 * on deploy, is not a rating. So this is built to three rules:
 *
 *  1. SERVER-ONLY. A rating is written from `match_end`, which is server-built
 *     from server-scored results. The client is never asked whether it won.
 *  2. PLACEMENT FIRST. Until a player has played a placement series, they are
 *     UNPLACED and appear on no leaderboard — a starting rating of 1500 that
 *     silently counts is exactly the fake-progress trap.
 *  3. BOUNDED MOVEMENT. Elo-style K and placement ladders are clamped, so no
 *     single match (or a departure/return storm) can swing a rating wildly, and
 *     a season soft-reset is a documented, gentle pull toward the mean.
 *
 * LEAGUES (low → high) — cosmetic bands over a single numeric rating, so a
 * league is never a separate ladder that drifts out of sync.
 */

export const LEAGUES = Object.freeze([
  { id: 'scrap', label: 'Scrap', min: 0, max: 999, color: '#a9bcd8' },
  { id: 'cadet', label: 'Cadet', min: 1000, max: 1199, color: '#4ade80' },
  { id: 'orbital', label: 'Orbital', min: 1200, max: 1399, color: '#5ad8ff' },
  { id: 'nova', label: 'Nova', min: 1400, max: 1599, color: '#b58cff' },
  { id: 'supernova', label: 'Supernova', min: 1600, max: 1799, color: '#ff9f43' },
  { id: 'singularity', label: 'Singularity', min: 1800, max: Infinity, color: '#ff6b8b' },
]);

/** Rating a placed player starts a season at after a soft reset. */
export const SEASON_RESET_TO = 1200;

/**
 * Modes that carry a rating — the one allow-list, shared by client and server.
 * A mode is rated ON PURPOSE: `createRoom` refuses a `ranked` flag for anything
 * not on this list, and the lobby only offers the ranked toggle for it. Client
 * and server reading the SAME array is what keeps "RANKED" in the UI and
 * `room.ranked` on the server from ever disagreeing.
 */
export const RATED_MODES = Object.freeze(['ffa', 'tdm']);

/** Matches a player must complete before they are PLACED (and on a board). */
export const PLACEMENT_MATCHES = 5;

/**
 * @param {number} rating
 * @returns {object} the league row containing `rating`.
 */
export function rateFor(rating) {
  const r = Number.isFinite(rating) ? rating : 0;
  for (const l of LEAGUES) if (r >= l.min && r < l.max) return l;
  return LEAGUES[LEAGUES.length - 1];
}

/** Current season id — bucketed by month so a reset is reproducible. */
export function seasonId(now = Date.now()) {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const clampRating = (r) => Math.max(0, Math.min(5000, Math.round(r)));

/**
 * Placement: a short ladder that CONVERGES toward the player's true skill
 * quickly, then is done. After PLACEMENT_MATCHES the player is placed and moves
 * to Elo. This runs on the same scale so there is no jump at the boundary.
 *
 * @param {{wins:number, losses:number, scoreSoFar:number}} state
 * @param {boolean} won just-completed match result
 * @returns {{ rating:number, placed:boolean, next:number }}
 */
export function applyPlacement(state, won) {
  const played = state.wins + state.losses;
  const rating = clampRating(state.scoreSoFar + (won ? 260 : -160));
  const next = played + 1;
  return { rating, placed: next >= PLACEMENT_MATCHES, next };
}

/**
 * Standard Elo delta, K-factor reduced for high ratings to damp outliers.
 * @param {number} rating current
 * @param {boolean} won
 * @param {number} opponentRating
 * @returns {number} the delta to ADD (may be negative).
 */
export function eloDelta(rating, won, opponentRating) {
  const expected = 1 / (1 + 10 ** ((opponentRating - rating) / 400));
  const k = rating >= 1600 ? 24 : rating >= 1200 ? 32 : 40;
  return Math.round(k * ((won ? 1 : 0) - expected));
}

/**
 * Fold one completed, SERVER-SCORED match into a player's ranked state.
 *
 * `opponentRating` is the average rating of the room's other ranked humans
 * (0 / unknown → treated as the neutral 1200, so a bot-only farm does not farm
 * rating). This is the ONLY entry point; matchmaking, the client and the HUD
 * all read the result, none of them compute one.
 *
 * @param {object} ranked current `profile.ranked`
 * @param {{ won:boolean, opponentRating:number, season:string }} result
 * @returns {{ ranked:object, delta:number }}
 */
export function applyRankedResult(ranked, { won, opponentRating = 1200, season = seasonId() }) {
  const r = { ...ranked };
  // 0 / unknown / negative → the neutral 1200 (documented above). The caller
  // ALWAYS passes a number (averageOpponentRating returns 0 when there is no
  // meaningful pool), so the destructuring default alone never fires — without
  // this line a solo remainder would play against a phantom 0-rated opponent,
  // where a WIN pays ~0 and a LOSS costs a full K: the exact asymmetry the
  // neutral rule exists to prevent.
  const opp = Number.isFinite(opponentRating) && opponentRating > 0 ? opponentRating : 1200;
  // A new season soft-resets a PLACED player gently toward the mean, once.
  if (r.placed && r.seasonId && r.seasonId !== season) {
    r.rating = clampRating(r.rating * 0.6 + SEASON_RESET_TO * 0.4);
    r.seasonId = season;
  }
  if (!r.placed) {
    const { rating, placed, next } = applyPlacement(r, won);
    r.scoreSoFar = rating;
    if (placed) {
      r.placed = true;
      r.rating = rating;
      r.seasonId = season;
      r.placements = (r.placements || 0) + 1;
    }
    if (won) r.wins += 1; else r.losses += 1;
    return { ranked: r, delta: 0 };
  }
  const delta = eloDelta(r.rating, won, opp);
  r.rating = clampRating(r.rating + delta);
  r.peak = Math.max(r.peak || 0, r.rating);
  r.seasonId = season;
  if (won) r.wins += 1; else r.losses += 1;
  return { ranked: r, delta };
}

/**
 * Average rating of the room's other ranked humans, excluding the player and
 * any bots. Returns 0 when there is nobody meaningful to measure against, and
 * the caller treats 0 as "no rating change source" (not as a beatable 0).
 *
 * @param {Array<{id:string, isBot:boolean, rated:number|null}>} rows
 * @param {string} selfId
 * @returns {number}
 */
export function averageOpponentRating(rows, selfId) {
  const ratings = rows
    .filter((r) => r.id !== selfId && !r.isBot && Number.isFinite(r.rated) && r.rated > 0)
    .map((r) => r.rated);
  if (!ratings.length) return 0;
  return Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length);
}

export default LEAGUES;
