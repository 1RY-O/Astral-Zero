import express from 'express';
import { tleCache } from '../tleCache.js';

const router = express.Router();

// GET /api/telemetry — Overview and orbital risk metrics
router.get('/', async (req, res) => {
  await tleCache.refreshIfExpired();
  const stats = tleCache.getStats();

  res.json({
    status: 'ok',
    game: 'Astral Zero',
    telemetrySource: 'CelesTrak GP / NORAD 18th Space Defense Squadron',
    trackedObjects: stats.cachedObjectsCount,
    kesslerRiskIndex: 78.4,
    cache: stats,
    timestamp: new Date().toISOString(),
  });
});

// GET /api/telemetry/tle — Validated TLE records with in-memory caching (90-min refresh)
router.get('/tle', async (req, res) => {
  await tleCache.refreshIfExpired();
  const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
  const records = tleCache.getRecords(limit);
  const stats = tleCache.getStats();

  res.json({
    status: 'ok',
    attribution: 'Data provided by CelesTrak and NORAD 18 SDS',
    cachedAt: stats.lastFetchedAt,
    cacheAgeMinutes: stats.cacheAgeMinutes,
    totalTracked: stats.cachedObjectsCount,
    rejectedCorruptedCount: stats.rejectedCorruptedCount,
    records,
  });
});

export default router;
