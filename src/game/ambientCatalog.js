/**
 * Debris Derby — ambient orbital catalog.
 *
 * The only server-side simulation left: a 2 Hz SGP4 pass over the cached
 * Celestrak active catalog. Gameplay physics lives on the client.
 *
 * Failure policy: no silent fallback. A failed refresh serves the previous
 * successful cache as `stale`, or serves an empty catalog as `unavailable`.
 * The client always receives `catalogStatus` and can badge it visibly.
 */

import * as satellite from 'satellite.js';

import defaultConfig from '../server-config.js';
import {
  CELESTRAK_ATTRIBUTION,
  CELESTRAK_GP_URL,
  fetchCelestrakCatalog,
} from './tleSource.js';

export const CATALOG_STATUS = Object.freeze({
  LIVE: 'live',
  STALE: 'stale',
  UNAVAILABLE: 'unavailable',
});

const RAD_TO_DEG = 180 / Math.PI;

/**
 * @param {{
 *   config?: typeof defaultConfig,
 *   fetchCatalog?: typeof fetchCelestrakCatalog,
 *   logger?: Pick<Console, 'log' | 'warn' | 'error'>,
 *   now?: () => number,
 * }} [options]
 */
export function createAmbientCatalog({
  config = defaultConfig,
  fetchCatalog = fetchCelestrakCatalog,
  logger = console,
  now = Date.now,
} = {}) {
  /** @type {{ emit: (event: string, payload: unknown) => void } | null} */
  let io = null;
  /** @type {Record<string, string> | null} */
  let events = null;

  let tickTimer = null;
  let refreshTimer = null;
  let retryTimer = null;
  let started = false;
  let fetching = false;

  /** @type {Array<{ noradId: number, id: string, name: string, isDebris: boolean, satrec: object }>} */
  let objects = [];
  let catalogStatus = CATALOG_STATUS.UNAVAILABLE;
  let lastUpdatedAt = null;
  let lastAttemptAt = null;
  let lastError = null;
  let tick = 0;

  const sourceUrl = config.catalog.url || CELESTRAK_GP_URL;
  const attribution = config.catalog.attribution || CELESTRAK_ATTRIBUTION;

  function iso(value) {
    return value === null ? null : new Date(value).toISOString();
  }

  function clearRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function scheduleRetry() {
    if (!started || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void refreshNow();
    }, config.catalog.retryIntervalMs ?? 60_000);
    retryTimer.unref?.();
  }

  /**
   * Attach the Socket.io server and event registry without starting timers.
   * Used by tests and by `ensureCatalog`.
   */
  function attach(socketIo, eventNames) {
    io = socketIo;
    events = eventNames;
  }

  /**
   * Fetch and replace the cache. Never throws; returns a result object.
   * @returns {Promise<{ ok: boolean, status: string, objects: number, error?: string }>}
   */
  async function refreshNow() {
    if (fetching) {
      return { ok: false, status: catalogStatus, objects: objects.length, error: 'FETCH_IN_FLIGHT' };
    }
    fetching = true;
    lastAttemptAt = now();

    try {
      const result = await fetchCatalog({
        url: sourceUrl,
        timeoutMs: config.catalog.requestTimeoutMs,
        limit: config.catalog.maxObjects,
        logger,
      });
      objects = result.objects;
      catalogStatus = CATALOG_STATUS.LIVE;
      lastUpdatedAt = now();
      lastError = null;
      clearRetry();
      logger.log(
        `[ambientCatalog] Celestrak fetch result: live — ${objects.length} objects — ${sourceUrl}`,
      );
      return { ok: true, status: catalogStatus, objects: objects.length };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      catalogStatus =
        objects.length > 0 ? CATALOG_STATUS.STALE : CATALOG_STATUS.UNAVAILABLE;
      logger.error(
        `[ambientCatalog] Celestrak fetch result: ${catalogStatus} — ${lastError}`,
      );
      if (catalogStatus === CATALOG_STATUS.STALE) {
        logger.error(
          `[ambientCatalog] Serving stale Celestrak cache from ${iso(lastUpdatedAt)} — no fallback data`,
        );
      } else {
        logger.error(
          '[ambientCatalog] No Celestrak data available — ambient_catalog will carry an empty object list',
        );
      }
      scheduleRetry();

      if (io && events) {
        io.emit(events.SERVER_NOTICE, {
          code:
            catalogStatus === CATALOG_STATUS.STALE
              ? 'CATALOG_STALE'
              : 'CATALOG_UNAVAILABLE',
          message: lastError,
          at: iso(now()),
        });
      }

      return { ok: false, status: catalogStatus, objects: objects.length, error: lastError };
    } finally {
      fetching = false;
    }
  }

  /**
   * Propagate the cached catalog to a single instant.
   * @param {number} at Unix ms
   */
  function propagate(at) {
    if (objects.length === 0) return [];
    const date = new Date(at);
    let gmst;
    try {
      gmst = satellite.gstime(date);
    } catch (error) {
      logger.warn(`[ambientCatalog] GMST calculation failed: ${error.message}`);
      return [];
    }

    const result = [];
    for (const object of objects) {
      try {
        const state = satellite.propagate(object.satrec, date);
        const position = state?.position;
        if (!position) continue;
        const geodetic = satellite.eciToGeodetic(position, gmst);
        const latDeg = satellite.degreesLat(geodetic.latitude);
        const lonDeg = satellite.degreesLong(geodetic.longitude);
        const altKm = geodetic.height;
        if (![latDeg, lonDeg, altKm].every(Number.isFinite)) continue;

        result.push({
          id: object.id,
          name: object.name,
          noradId: object.noradId,
          latDeg,
          lonDeg,
          altKm,
          inclinationDeg: object.satrec.inclo * RAD_TO_DEG,
          isDebris: object.isDebris,
        });
      } catch {
        // A single decayed or malformed satrec must not kill the tick.
      }
    }
    return result;
  }

  /**
   * Broadcast one catalog tick. Returns the payload for tests.
   * @param {number} [at]
   */
  function publish(at = now()) {
    if (!io || !events) return null;
    const payload = {
      tick: tick++,
      timestamp: at,
      catalogStatus,
      sourceUrl,
      attribution,
      lastUpdatedAt: iso(lastUpdatedAt),
      objects: catalogStatus === CATALOG_STATUS.UNAVAILABLE ? [] : propagate(at),
    };
    io.emit(events.AMBIENT_CATALOG, payload);
    return payload;
  }

  /** Alias used by tests and by the 2 Hz interval. */
  function tickOnce(at = now()) {
    return publish(at);
  }

  /** Start the 2 Hz tick and the 30-minute refresh loop. */
  function start() {
    if (started) return;
    started = true;

    logger.log(`[ambientCatalog] Celestrak URL: ${sourceUrl}`);
    void refreshNow();

    tickTimer = setInterval(() => publish(now()), config.catalog.tickIntervalMs);
    tickTimer.unref?.();

    refreshTimer = setInterval(() => {
      void refreshNow();
    }, config.catalog.refreshIntervalMs);
    refreshTimer.unref?.();

    logger.log(
      `[ambientCatalog] Ambient catalog started at ${config.catalog.tickHz} Hz`,
    );
  }

  /** Attach and start in one call — the server's entry point. */
  function ensureCatalog(socketIo, eventNames) {
    attach(socketIo, eventNames);
    start();
  }

  function stop() {
    if (tickTimer) clearInterval(tickTimer);
    if (refreshTimer) clearInterval(refreshTimer);
    clearRetry();
    tickTimer = null;
    refreshTimer = null;
    started = false;
  }

  function stats() {
    return {
      objects: objects.length,
      catalogStatus,
      sourceUrl,
      attribution,
      tickHz: config.catalog.tickHz,
      lastUpdatedAt: iso(lastUpdatedAt),
      lastAttemptAt: iso(lastAttemptAt),
      lastError,
    };
  }

  return {
    attach,
    start,
    ensureCatalog,
    refreshNow,
    tickOnce,
    publish,
    stats,
    stop,
  };
}

/** Process-wide instance used by the server. */
export const ambientCatalog = createAmbientCatalog();
