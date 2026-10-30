import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

import { createApp } from '../src/app.js';
import { createLeaderboard } from '../src/game/leaderboard.js';
import defaultConfig from '../src/server-config.js';

const silent = { log() {}, warn() {}, error() {} };
const NOW = Date.UTC(2026, 9, 30);

function fakeCatalog(stats = {}) {
  const catalogStats = {
    objects: 4,
    catalogStatus: 'live',
    sourceUrl:
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json',
    attribution: 'Orbital data: Celestrak (celestrak.org)',
    tickHz: 2,
    lastUpdatedAt: '2026-10-30T00:00:00.000Z',
    lastAttemptAt: '2026-10-30T00:00:00.000Z',
    lastError: null,
    ...stats,
  };
  return {
    stats: () => catalogStats,
    ensureCatalog() {},
    stop() {},
  };
}

async function withServer(callback) {
  const leaderboard = createLeaderboard({ now: () => NOW });
  const app = createApp({
    config: {
      ...defaultConfig,
      distDir: '/tmp/debris-derby-no-dist',
      publicDir: '/tmp/debris-derby-no-public',
    },
    catalog: fakeCatalog(),
    leaderboard,
    logger: silent,
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    await callback({ base, leaderboard });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET /api/health returns identity, contract version, and catalog status', async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/json/);
    const body = await response.json();
    assert.equal(body.game, 'Debris Derby');
    assert.equal(body.status, 'ok');
    assert.equal(body.version, '0.3.0');
    assert.equal(body.socketEventsVersion, '2.0.0-debris-derby');
    assert.equal(body.catalog.catalogStatus, 'live');
    assert.equal(body.catalog.objects, 4);
    assert.ok(typeof body.uptimeSeconds === 'number');
  });
});

test('GET /api/levels returns exactly the eight locked levels', async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(`${base}/api/levels`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.levels.length, 8);
    assert.deepEqual(
      body.levels.map((level) => level.name),
      [
        'First Contact',
        'Two-Body Problem',
        'Clean Sweep',
        'Ricochet',
        'Dominoes',
        'Fragile Cargo',
        'Moving Targets',
        'Kessler Event',
      ],
    );
    assert.deepEqual(body.levels[0], {
      id: 1,
      name: 'First Contact',
      order: 1,
    });
  });
});

test('GET /api/leaderboard is valid JSON when empty and after a run', async () => {
  await withServer(async ({ base, leaderboard }) => {
    const empty = await fetch(`${base}/api/leaderboard`);
    assert.equal(empty.status, 200);
    assert.deepEqual(await empty.json(), {
      levelId: null,
      entries: [],
      updatedAt: null,
    });

    leaderboard.submit({
      runId: 'run_test',
      levelId: 1,
      callsign: 'TEST',
      score: 580,
      seed: 42,
    });

    const filtered = await fetch(`${base}/api/leaderboard?levelId=1&limit=5`);
    assert.equal(filtered.status, 200);
    const body = await filtered.json();
    assert.equal(body.levelId, 1);
    assert.equal(body.entries.length, 1);
    assert.deepEqual(body.entries[0], {
      rank: 1,
      callsign: 'TEST',
      score: 580,
      levelId: 1,
      createdAt: '2026-10-30T00:00:00.000Z',
    });
  });
});

test('GET /api/leaderboard rejects a bad level and clamps the limit', async () => {
  await withServer(async ({ base, leaderboard }) => {
    const bad = await fetch(`${base}/api/leaderboard?levelId=99`);
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error, 'bad_request');

    for (let i = 0; i < 5; i += 1) {
      leaderboard.submit({
        runId: `run_${i}`,
        levelId: 1,
        callsign: `P${i}`,
        score: 500 + i,
        seed: i,
      });
    }
    const clamped = await fetch(`${base}/api/leaderboard?levelId=1&limit=0`);
    const body = await clamped.json();
    assert.equal(body.entries.length, 1);
    assert.equal(body.entries[0].score, 504);
  });
});

test('unknown API routes return JSON 404', async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(`${base}/api/does-not-exist`);
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.error, 'not_found');
    assert.equal(body.game, 'Debris Derby');
  });
});
