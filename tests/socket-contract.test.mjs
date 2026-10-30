import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';

import { Server } from 'socket.io';
import { io as clientIo } from 'socket.io-client';

import { createLeaderboard } from '../src/game/leaderboard.js';
import { initSockets } from '../src/sockets/index.js';

const silent = { log() {}, warn() {}, error() {} };

const TICK = {
  tick: 1,
  timestamp: 1_728_000_000_000,
  catalogStatus: 'live',
  sourceUrl:
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json',
  attribution: 'Orbital data: Celestrak (celestrak.org)',
  lastUpdatedAt: '2026-10-30T00:00:00.000Z',
  objects: [
    {
      id: '25544',
      name: 'ISS (ZARYA)',
      noradId: 25544,
      latDeg: 1.2,
      lonDeg: 3.4,
      altKm: 420,
      inclinationDeg: 51.64,
      isDebris: false,
    },
  ],
};

function waitFor(socket, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      timeoutMs,
    );
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function emitAck(socket, event, payload, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event} ack`)),
      timeoutMs,
    );
    socket.emit(event, payload, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

test('socket connects, receives connected + ambient tick, submits a run, disconnects', async (t) => {
  const httpServer = createServer();
  const ioServer = new Server(httpServer, { cors: { origin: '*' } });

  const catalog = {
    ensureCatalog(io, events) {
      io.on('connection', (socket) => {
        socket.emit(events.AMBIENT_CATALOG, TICK);
      });
    },
    stats() {
      return {
        objects: 1,
        catalogStatus: 'live',
        sourceUrl: TICK.sourceUrl,
        attribution: TICK.attribution,
        tickHz: 2,
        lastUpdatedAt: TICK.lastUpdatedAt,
        lastAttemptAt: TICK.lastUpdatedAt,
        lastError: null,
      };
    },
    stop() {},
  };

  const leaderboard = createLeaderboard({ now: () => 1_728_000_000_000 });
  initSockets(ioServer, {
    catalog,
    leaderboard,
    logger: silent,
    now: () => 1_728_000_000_000,
    rateLimitMs: 0,
  });

  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address();

  const client = clientIo(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });

  t.after(async () => {
    client.close();
    await new Promise((resolve) => ioServer.close(resolve));
    if (httpServer.listening) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
  });

  const connectedPromise = waitFor(client, 'connected');
  const catalogPromise = waitFor(client, 'ambient_catalog');
  await once(client, 'connect');

  const connected = await connectedPromise;
  assert.equal(connected.game, 'Debris Derby');
  assert.equal(connected.socketEventsVersion, '2.0.0-debris-derby');
  assert.equal(connected.catalog.catalogStatus, 'live');
  assert.equal(connected.catalog.tickHz, 2);

  const tick = await catalogPromise;
  assert.equal(tick.catalogStatus, 'live');
  assert.equal(tick.objects.length, 1);
  assert.equal(tick.objects[0].name, 'ISS (ZARYA)');
  assert.equal(tick.attribution, TICK.attribution);

  const noticePromise = waitFor(client, 'server_notice');
  const bad = await emitAck(client, 'run_submit', { levelId: 99 });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'BAD_LEVEL');
  const notice = await noticePromise;
  assert.equal(notice.code, 'BAD_LEVEL');

  const updatePromise = waitFor(client, 'leaderboard_update');
  const good = await emitAck(client, 'run_submit', {
    levelId: 1,
    callsign: 'TEST',
    seed: 42,
    durationMs: 10_000,
    fuelUsed: 10,
    lingers: 0,
    deorbits: [
      { objectId: '25544', massKg: 10, releaseDot: -1, atMs: 0 },
    ],
    clientScore: 580,
  });
  assert.equal(good.ok, true);
  assert.equal(good.score, 580);
  assert.equal(good.rank, 1);
  assert.match(good.runId, /^run_/);

  const update = await updatePromise;
  assert.equal(update.levelId, 1);
  assert.equal(update.entries.length, 1);
  assert.equal(update.entries[0].callsign, 'TEST');
  assert.equal(update.entries[0].score, 580);

  client.close();
  assert.equal(leaderboard.size(), 1);
});

test('score mismatch is rejected and not stored', async (t) => {
  const httpServer = createServer();
  const ioServer = new Server(httpServer, { cors: { origin: '*' } });

  const catalog = {
    ensureCatalog() {},
    stats() {
      return {
        objects: 0,
        catalogStatus: 'unavailable',
        sourceUrl: 'https://celestrak.org/',
        attribution: 'Orbital data: Celestrak (celestrak.org)',
        tickHz: 2,
        lastUpdatedAt: null,
        lastAttemptAt: null,
        lastError: 'offline',
      };
    },
    stop() {},
  };
  const leaderboard = createLeaderboard();

  initSockets(ioServer, {
    catalog,
    leaderboard,
    logger: silent,
    now: () => 1_728_000_000_000,
    rateLimitMs: 0,
  });

  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address();
  const client = clientIo(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });

  t.after(async () => {
    client.close();
    await new Promise((resolve) => ioServer.close(resolve));
    if (httpServer.listening) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
  });

  await once(client, 'connect');
  const result = await emitAck(client, 'run_submit', {
    levelId: 1,
    callsign: 'CHEAT',
    seed: 42,
    durationMs: 10_000,
    fuelUsed: 10,
    lingers: 0,
    deorbits: [
      { objectId: '25544', massKg: 10, releaseDot: -1, atMs: 0 },
    ],
    clientScore: 9999,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SCORE_MISMATCH');
  assert.equal(leaderboard.size(), 0);
});
