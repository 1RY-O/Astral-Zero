import express from 'express';

const router = express.Router();

const MISSIONS = [
  {
    id: 0,
    name: 'CONTRACT 0 — LEO PROVING GROUND (TUTORIAL)',
    shortName: 'CONTRACT 0 · DRILL',
    orbitShell: '350 KM LEO TRAINING SHELL',
    target: 'ORBITAL RIGGER DRILL · SIM-00',
    briefing: 'Latch docking pin, match rotation, swing and release into retrograde arc.',
    massKg: 380,
    conjunctionLimitSec: null,
  },
  {
    id: 1,
    name: 'MISSION 01 — SL-16 BOOSTER',
    shortName: 'MISSION 01 · SL-16',
    orbitShell: '450 KM LEO ORBIT',
    target: 'SL-16 BOOSTER DEBRIS #4182',
    briefing: 'Latch tumbling stage, pump angular momentum, drive perigee under 100 km.',
    massKg: 450,
    conjunctionLimitSec: null,
  },
  {
    id: 2,
    name: 'MISSION 02 — DELTA-K UPPER STAGE',
    shortName: 'MISSION 02 · DELTA-K',
    orbitShell: '620 KM SSO ORBIT',
    target: 'DELTA-K HULL #8821',
    briefing: 'Heavy angular spin. Use scroll wheel to reel in cable and accelerate rotation.',
    massKg: 740,
    conjunctionLimitSec: null,
  },
  {
    id: 3,
    name: 'MISSION 03 — COSMOS RESIDUAL',
    shortName: 'MISSION 03 · COSMOS',
    orbitShell: '780 KM POLAR ORBIT',
    target: 'COSMOS RESIDUAL #0944',
    briefing: 'Cascade threat detected. Complete retrograde deorbit before 75s conjunction.',
    massKg: 890,
    conjunctionLimitSec: 75.0,
  },
];

// GET /api/missions
router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    game: 'Astral Zero',
    tagline: 'DRIVE THE PERIGEE TO ZERO.',
    missions: MISSIONS,
  });
});

// GET /api/missions/:id
router.get('/:id', (req, res) => {
  const mission = MISSIONS.find((m) => m.id === parseInt(req.params.id, 10));
  if (!mission) {
    return res.status(404).json({
      error: 'MISSION_NOT_FOUND',
      message: 'Specified salvage mission not found in campaign manifest.',
    });
  }
  return res.json({ status: 'ok', mission });
});

export default router;
