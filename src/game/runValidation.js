/**
 * Debris Derby — run validation and the authoritative score.
 *
 * The server never simulates gameplay. It accepts a completed run, validates
 * every field, recomputes the score from the locked formulas, and stores the
 * server result. The client's number is only a consistency check.
 */

/** Chain detection window, brief-specified. */
export const CHAIN_WINDOW_MS = 900;

export const LEVELS = Object.freeze(
  [
    { id: 1, name: 'First Contact', order: 1, fuelMax: 100 },
    { id: 2, name: 'Two-Body Problem', order: 2, fuelMax: 110 },
    { id: 3, name: 'Clean Sweep', order: 3, fuelMax: 120 },
    { id: 4, name: 'Ricochet', order: 4, fuelMax: 110 },
    { id: 5, name: 'Dominoes', order: 5, fuelMax: 120 },
    { id: 6, name: 'Fragile Cargo', order: 6, fuelMax: 100 },
    { id: 7, name: 'Moving Targets', order: 7, fuelMax: 120 },
    { id: 8, name: 'Kessler Event', order: 8, fuelMax: 140 },
  ].map((level) => Object.freeze(level)),
);

export const LEVEL_BY_ID = new Map(LEVELS.map((level) => [level.id, level]));

export const RUN_SUBMIT_ERRORS = Object.freeze({
  BAD_PAYLOAD: 'BAD_PAYLOAD',
  BAD_LEVEL: 'BAD_LEVEL',
  BAD_SEED: 'BAD_SEED',
  RATE_LIMITED: 'RATE_LIMITED',
  SCORE_MISMATCH: 'SCORE_MISMATCH',
});

const MAX_DEORBITS = 64;
const MAX_DURATION_MS = 3_600_000;
const MAX_FUEL_USED = 1_000_000;
const MAX_SCORE = 1_000_000;
const CALLSIGN_PATTERN = /^[A-Za-z0-9 _.-]+$/;
const OBJECT_ID_PATTERN = /^[A-Za-z0-9_.:-]+$/;

function fail(code, message) {
  return { ok: false, code, message };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Validate and normalize one `run_submit` payload.
 * @param {unknown} payload
 * @returns {{ ok: true, value: object } | { ok: false, code: string, message: string }}
 */
export function validateRunSubmit(payload) {
  if (!isPlainObject(payload)) {
    return fail(RUN_SUBMIT_ERRORS.BAD_PAYLOAD, 'Payload must be an object.');
  }

  const levelId = payload.levelId;
  if (!Number.isInteger(levelId) || !LEVEL_BY_ID.has(levelId)) {
    return fail(RUN_SUBMIT_ERRORS.BAD_LEVEL, 'levelId must be an integer from 1 to 8.');
  }
  const level = LEVEL_BY_ID.get(levelId);

  const seed = payload.seed;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    return fail(RUN_SUBMIT_ERRORS.BAD_SEED, 'seed must be an unsigned 32-bit integer.');
  }

  const durationMs = payload.durationMs;
  if (
    typeof durationMs !== 'number' ||
    !Number.isFinite(durationMs) ||
    durationMs < 0 ||
    durationMs > MAX_DURATION_MS
  ) {
    return fail(
      RUN_SUBMIT_ERRORS.BAD_PAYLOAD,
      `durationMs must be between 0 and ${MAX_DURATION_MS}.`,
    );
  }

  const fuelUsed = payload.fuelUsed;
  if (
    typeof fuelUsed !== 'number' ||
    !Number.isFinite(fuelUsed) ||
    fuelUsed < 0 ||
    fuelUsed > Math.min(level.fuelMax, MAX_FUEL_USED)
  ) {
    return fail(
      RUN_SUBMIT_ERRORS.BAD_PAYLOAD,
      `fuelUsed must be between 0 and ${level.fuelMax} for level ${levelId}.`,
    );
  }

  const lingers = payload.lingers;
  if (!Number.isInteger(lingers) || lingers < 0 || lingers > MAX_DEORBITS) {
    return fail(
      RUN_SUBMIT_ERRORS.BAD_PAYLOAD,
      `lingers must be an integer between 0 and ${MAX_DEORBITS}.`,
    );
  }

  let callsign = 'Anonymous';
  if (payload.callsign !== undefined) {
    if (typeof payload.callsign !== 'string') {
      return fail(RUN_SUBMIT_ERRORS.BAD_PAYLOAD, 'callsign must be a string.');
    }
    callsign = payload.callsign.trim();
    if (
      callsign.length === 0 ||
      callsign.length > 24 ||
      !CALLSIGN_PATTERN.test(callsign)
    ) {
      return fail(
        RUN_SUBMIT_ERRORS.BAD_PAYLOAD,
        'callsign must be 1-24 characters: letters, numbers, space, dot, dash, underscore.',
      );
    }
  }

  const deorbits = payload.deorbits;
  if (!Array.isArray(deorbits) || deorbits.length > MAX_DEORBITS) {
    return fail(
      RUN_SUBMIT_ERRORS.BAD_PAYLOAD,
      `deorbits must be an array of at most ${MAX_DEORBITS} entries.`,
    );
  }

  const normalizedDeorbits = [];
  let previousAtMs = -1;
  for (const [index, entry] of deorbits.entries()) {
    if (!isPlainObject(entry)) {
      return fail(RUN_SUBMIT_ERRORS.BAD_PAYLOAD, `deorbits[${index}] must be an object.`);
    }
    const { objectId, massKg, releaseDot, atMs } = entry;
    if (
      typeof objectId !== 'string' ||
      objectId.length === 0 ||
      objectId.length > 32 ||
      !OBJECT_ID_PATTERN.test(objectId)
    ) {
      return fail(
        RUN_SUBMIT_ERRORS.BAD_PAYLOAD,
        `deorbits[${index}].objectId must be 1-32 safe characters.`,
      );
    }
    if (
      typeof massKg !== 'number' ||
      !Number.isFinite(massKg) ||
      massKg <= 0 ||
      massKg > 10_000
    ) {
      return fail(
        RUN_SUBMIT_ERRORS.BAD_PAYLOAD,
        `deorbits[${index}].massKg must be a positive finite number.`,
      );
    }
    if (
      typeof releaseDot !== 'number' ||
      !Number.isFinite(releaseDot) ||
      releaseDot < -1 ||
      releaseDot > 1
    ) {
      return fail(
        RUN_SUBMIT_ERRORS.BAD_PAYLOAD,
        `deorbits[${index}].releaseDot must be between -1 and 1.`,
      );
    }
    if (
      typeof atMs !== 'number' ||
      !Number.isFinite(atMs) ||
      atMs < 0 ||
      atMs > durationMs ||
      atMs < previousAtMs
    ) {
      return fail(
        RUN_SUBMIT_ERRORS.BAD_PAYLOAD,
        `deorbits[${index}].atMs must be non-decreasing and inside the run duration.`,
      );
    }
    previousAtMs = atMs;

    normalizedDeorbits.push({
      objectId,
      massKg,
      releaseDot,
      atMs,
    });
  }

  const clientScore = payload.clientScore;
  if (
    typeof clientScore !== 'number' ||
    !Number.isFinite(clientScore) ||
    clientScore < 0 ||
    clientScore > MAX_SCORE
  ) {
    return fail(
      RUN_SUBMIT_ERRORS.BAD_PAYLOAD,
      `clientScore must be between 0 and ${MAX_SCORE}.`,
    );
  }

  return {
    ok: true,
    value: {
      levelId,
      callsign,
      seed,
      durationMs,
      fuelUsed,
      lingers,
      deorbits: normalizedDeorbits,
      clientScore,
    },
  };
}

/**
 * Recompute the locked score from a validated run.
 *
 * run_score = sum(object_value * cascade_multiplier)
 *           + 80 * retrograde deorbits
 *           - 150 * lingers
 *           + 500 * fuel_left / fuel_max
 *
 * @param {object} run
 */
export function scoreRun(run) {
  const level = LEVEL_BY_ID.get(run.levelId);
  if (!level) throw new Error(`Unknown level ${run.levelId}`);

  let objectScore = 0;
  let deorbitBonus = 0;
  let chain = 0;
  let previousAtMs = null;
  const chainLengths = [];

  for (const deorbit of run.deorbits) {
    if (previousAtMs === null || deorbit.atMs - previousAtMs <= CHAIN_WINDOW_MS) {
      chain += 1;
    } else {
      chain = 1;
    }
    previousAtMs = deorbit.atMs;
    chainLengths.push(chain);

    const objectValue = 50 * clamp(deorbit.massKg / 10, 0.5, 4);
    objectScore += objectValue * ((chain * (chain + 1)) / 2);

    if (deorbit.releaseDot < 0) {
      deorbitBonus += 80;
    }
  }

  const lingerPenalty = -150 * run.lingers;
  const fuelLeft = Math.max(0, level.fuelMax - run.fuelUsed);
  const fuelBonus = 500 * (fuelLeft / level.fuelMax);
  const score = Math.round(objectScore + deorbitBonus + lingerPenalty + fuelBonus);

  return {
    score,
    breakdown: {
      objectScore,
      deorbitBonus,
      lingerPenalty,
      fuelBonus,
      chainLengths,
      fuelLeft,
      fuelMax: level.fuelMax,
    },
  };
}
