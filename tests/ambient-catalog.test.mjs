import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATALOG_STATUS,
  createAmbientCatalog,
} from '../src/game/ambientCatalog.js';
import { fetchCelestrakCatalog } from '../src/game/tleSource.js';
import { OMM_ROWS } from './fixtures/celestrak-omm.mjs';

const CONFIG = {
  catalog: {
    tickHz: 2,
    tickIntervalMs: 500,
    refreshIntervalMs: 1_800_000,
    requestTimeoutMs: 10,
    maxObjects: 120,
    url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json',
    attribution: 'Orbital data: Celestrak (celestrak.org)',
  },
};

const EVENTS = {
  AMBIENT_CATALOG: 'ambient_catalog',
  SERVER_NOTICE: 'server_notice',
};

function fakeIo() {
  const events = [];
  return {
    events,
    emit(event, payload) {
      events.push({ event, payload });
    },
  };
}

function silentLogger() {
  const logs = { log: [], warn: [], error: [] };
  return {
    logs,
    log: (message) => logs.log.push(String(message)),
    warn: (message) => logs.warn.push(String(message)),
    error: (message) => logs.error.push(String(message)),
  };
}

function jsonResponse(rows) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => rows,
  };
}

function catalogWith(fetchImpl, logger) {
  return createAmbientCatalog({
    config: CONFIG,
    logger,
    now: () => 1_728_000_000_000,
    fetchCatalog: (options) =>
      fetchCelestrakCatalog({ ...options, fetchImpl }),
  });
}

test('mock success: live catalog with Celestrak attribution and objects', async () => {
  const io = fakeIo();
  const logger = silentLogger();
  const catalog = catalogWith(async () => jsonResponse(OMM_ROWS), logger);
  catalog.attach(io, EVENTS);

  const result = await catalog.refreshNow();
  assert.equal(result.ok, true);
  assert.equal(result.objects, OMM_ROWS.length);

  const tick = catalog.tickOnce(1_728_000_000_000);
  assert.equal(tick.catalogStatus, CATALOG_STATUS.LIVE);
  assert.equal(tick.sourceUrl, CONFIG.catalog.url);
  assert.equal(tick.attribution, CONFIG.catalog.attribution);
  assert.equal(tick.objects.length, OMM_ROWS.length);
  assert.equal(tick.objects[0].name, 'ISS (ZARYA)');
  assert.equal(tick.objects[0].noradId, 25544);
  assert.equal(typeof tick.objects[0].latDeg, 'number');
  assert.equal(typeof tick.objects[0].lonDeg, 'number');
  assert.ok(Number.isFinite(tick.objects[0].altKm));

  assert.ok(
    logger.logs.log.some((line) =>
      line.includes('Celestrak fetch result: live'),
    ),
  );
});

test('mock timeout: unavailable status, no fallback data, loud error log', async () => {
  const io = fakeIo();
  const logger = silentLogger();
  const catalog = catalogWith(async () => {
    const error = new Error('The operation was aborted due to timeout');
    error.name = 'TimeoutError';
    throw error;
  }, logger);
  catalog.attach(io, EVENTS);

  const result = await catalog.refreshNow();
  assert.equal(result.ok, false);
  assert.equal(result.status, CATALOG_STATUS.UNAVAILABLE);

  const tick = catalog.tickOnce(1_728_000_000_000);
  assert.equal(tick.catalogStatus, CATALOG_STATUS.UNAVAILABLE);
  assert.deepEqual(tick.objects, []);
  assert.equal(tick.lastUpdatedAt, null);

  assert.ok(
    logger.logs.error.some((line) =>
      line.includes('Celestrak fetch result: unavailable'),
    ),
  );
  assert.ok(
    logger.logs.error.some((line) => line.includes('timeout')),
  );
  assert.ok(
    io.events.some(
      (entry) =>
        entry.event === EVENTS.SERVER_NOTICE &&
        entry.payload.code === 'CATALOG_UNAVAILABLE',
    ),
  );
});

test('refresh failure after a success: stale cache, never fallback data', async () => {
  const io = fakeIo();
  const logger = silentLogger();
  let mode = 'success';
  const catalog = catalogWith(async () => {
    if (mode === 'fail') throw new Error('Celestrak connection reset');
    return jsonResponse(OMM_ROWS);
  }, logger);
  catalog.attach(io, EVENTS);

  await catalog.refreshNow();
  const liveTick = catalog.tickOnce(1_728_000_000_000);
  assert.equal(liveTick.catalogStatus, CATALOG_STATUS.LIVE);
  assert.equal(liveTick.objects.length, OMM_ROWS.length);

  mode = 'fail';
  const result = await catalog.refreshNow();
  assert.equal(result.ok, false);
  assert.equal(result.status, CATALOG_STATUS.STALE);

  const staleTick = catalog.tickOnce(1_728_000_000_500);
  assert.equal(staleTick.catalogStatus, CATALOG_STATUS.STALE);
  assert.equal(staleTick.objects.length, OMM_ROWS.length);
  assert.ok(staleTick.lastUpdatedAt);
  assert.ok(
    logger.logs.error.some((line) =>
      line.includes('Serving stale Celestrak cache'),
    ),
  );
});

test('HTTP non-200: error includes status code and URL, no data served', async () => {
  const io = fakeIo();
  const logger = silentLogger();
  const catalog = catalogWith(
    async () => ({ ok: false, status: 503, statusText: 'Service Unavailable' }),
    logger,
  );
  catalog.attach(io, EVENTS);

  const result = await catalog.refreshNow();
  assert.equal(result.ok, false);
  assert.equal(result.status, CATALOG_STATUS.UNAVAILABLE);

  const errorLine = logger.logs.error.join('\n');
  assert.match(errorLine, /HTTP 503/);
  assert.match(errorLine, /celestrak\.org/);

  const tick = catalog.tickOnce(1_728_000_000_000);
  assert.deepEqual(tick.objects, []);
});
