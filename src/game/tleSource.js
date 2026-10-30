/**
 * Celestrak GP (OMM JSON) source.
 *
 * The only runtime TLE source. There is deliberately no bundled fallback
 * catalog: if Celestrak is unreachable, the ambient catalog goes stale or
 * unavailable and the client is told so. No historical TLEs are served.
 */

import * as satellite from 'satellite.js';

import {
  CELESTRAK_ATTRIBUTION,
  CELESTRAK_GP_URL,
} from '../server-config.js';

export { CELESTRAK_ATTRIBUTION, CELESTRAK_GP_URL };

export class TleFetchError extends Error {
  /**
   * @param {string} message
   * @param {{ url?: string, status?: number, cause?: unknown }} [details]
   */
  constructor(message, details = {}) {
    super(message, details.cause ? { cause: details.cause } : undefined);
    this.name = 'TleFetchError';
    this.url = details.url ?? null;
    this.status = details.status ?? null;
  }
}

/** Fields required by satellite.js `json2satrec`. */
const REQUIRED_NUMERIC_FIELDS = [
  'NORAD_CAT_ID',
  'MEAN_MOTION',
  'ECCENTRICITY',
  'INCLINATION',
  'RA_OF_ASC_NODE',
  'ARG_OF_PERICENTER',
  'MEAN_ANOMALY',
  'BSTAR',
  'MEAN_MOTION_DOT',
  'MEAN_MOTION_DDOT',
];

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Validate one OMM row before handing it to satellite.js.
 * @param {unknown} row
 * @returns {row is Record<string, unknown>}
 */
export function isOmmRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  const record = /** @type {Record<string, unknown>} */ (row);
  if (typeof record.OBJECT_NAME !== 'string' || record.OBJECT_NAME.length === 0) {
    return false;
  }
  if (typeof record.EPOCH !== 'string' || Number.isNaN(Date.parse(record.EPOCH))) {
    return false;
  }
  return REQUIRED_NUMERIC_FIELDS.every((field) => isFiniteNumber(record[field]));
}

/**
 * Convert Celestrak OMM rows into cached propagation records.
 * Invalid rows are skipped and counted; a batch with zero valid rows is an
 * error, not an empty catalog.
 *
 * @param {unknown[]} rows
 * @param {{ limit?: number, logger?: Pick<Console, 'warn'> }} [options]
 */
export function parseOmmRows(rows, { limit = 120, logger = console } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new TleFetchError('Celestrak response contained no objects');
  }

  const objects = [];
  let skipped = 0;

  for (const row of rows.slice(0, limit)) {
    if (!isOmmRow(row)) {
      skipped += 1;
      continue;
    }
    try {
      const satrec = satellite.json2satrec(row);
      const noradId = Number(row.NORAD_CAT_ID);
      if (!Number.isFinite(noradId) || !Number.isFinite(satrec.no)) {
        skipped += 1;
        continue;
      }
      objects.push({
        noradId,
        id: String(noradId),
        name: row.OBJECT_NAME,
        isDebris: false, // GROUP=active is, by definition, active satellites.
        satrec,
      });
    } catch {
      skipped += 1;
    }
  }

  if (objects.length === 0) {
    throw new TleFetchError('Celestrak response contained no valid OMM rows');
  }
  if (skipped > 0) {
    logger.warn(`[tleSource] Skipped ${skipped} invalid Celestrak row(s)`);
  }

  return { objects, skipped };
}

/**
 * Fetch and parse the Celestrak active catalog.
 *
 * @param {{
 *   url?: string,
 *   timeoutMs?: number,
 *   limit?: number,
 *   fetchImpl?: typeof fetch,
 *   logger?: Pick<Console, 'warn'>,
 * }} [options]
 */
export async function fetchCelestrakCatalog({
  url = CELESTRAK_GP_URL,
  timeoutMs = 10_000,
  limit = 120,
  fetchImpl = globalThis.fetch,
  logger = console,
} = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'debris-derby/0.3.0 (+https://github.com/1RY-O/debris-derby)',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new TleFetchError(`Celestrak request failed for ${url}: ${reason}`, {
      url,
      cause: error,
    });
  }

  if (!response.ok) {
    throw new TleFetchError(
      `Celestrak request failed: HTTP ${response.status} ${response.statusText} for ${url}`,
      { url, status: response.status },
    );
  }

  let rows;
  try {
    rows = await response.json();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new TleFetchError(`Celestrak returned invalid JSON for ${url}: ${reason}`, {
      url,
      cause: error,
    });
  }

  return parseOmmRows(rows, { limit, logger });
}
