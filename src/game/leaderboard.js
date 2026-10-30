/**
 * Debris Derby — in-memory leaderboard.
 *
 * No accounts, no database. A restart clears the board; that is documented
 * in websocket_events.md and STATUS.md.
 */

/**
 * @param {{ maxRuns?: number, now?: () => number }} [options]
 */
export function createLeaderboard({ maxRuns = 500, now = Date.now } = {}) {
  /** @type {Array<{ runId: string, levelId: number, callsign: string, score: number, seed: number, createdAt: string }>} */
  const runs = [];
  let updatedAt = null;

  function sortRuns(levelId) {
    const filtered =
      levelId === null || levelId === undefined
        ? runs.slice()
        : runs.filter((run) => run.levelId === levelId);
    filtered.sort(
      (a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt),
    );
    return filtered;
  }

  function toEntries(sorted, limit) {
    return sorted.slice(0, limit).map((run, index) => ({
      rank: index + 1,
      callsign: run.callsign,
      score: run.score,
      levelId: run.levelId,
      createdAt: run.createdAt,
    }));
  }

  /**
   * @param {{ runId: string, levelId: number, callsign: string, score: number, seed: number }} run
   */
  function submit(run) {
    const entry = {
      runId: run.runId,
      levelId: run.levelId,
      callsign: run.callsign,
      score: run.score,
      seed: run.seed,
      createdAt: new Date(now()).toISOString(),
    };
    runs.push(entry);
    if (runs.length > maxRuns) runs.shift();
    updatedAt = entry.createdAt;

    const sorted = sortRuns(run.levelId);
    const rank = sorted.findIndex((candidate) => candidate.runId === run.runId) + 1;
    const best = sorted.length > 0 ? sorted[0].score : run.score;

    return { entry, rank, best };
  }

  /**
   * @param {{ levelId?: number | null, limit?: number }} [options]
   */
  function list({ levelId = null, limit = 10 } = {}) {
    const sorted = sortRuns(levelId);
    return {
      levelId: levelId ?? null,
      entries: toEntries(sorted, limit),
      updatedAt,
    };
  }

  function reset() {
    runs.length = 0;
    updatedAt = null;
  }

  return { submit, list, reset, size: () => runs.length };
}

/** Process-wide board used by the server. */
export const leaderboard = createLeaderboard();
