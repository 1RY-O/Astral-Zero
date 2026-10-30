import express from 'express';

const router = express.Router();

const MISSIONS = [
  {
    id: 1,
    name: 'Sector 01: Low Earth Orbit (LEO)',
    taunt: 'Calibrate your tug. 160-2000 km altitude is dense with spent rocket boosters.',
    debrisCount: 12,
    basePayout: 350,
  },
  {
    id: 2,
    name: 'Sector 02: Medium Earth Orbit (MEO)',
    taunt: 'Navigation constellation corridor. High-velocity orbital junk hazards.',
    debrisCount: 18,
    basePayout: 550,
  },
  {
    id: 3,
    name: 'Sector 03: Geostationary Orbit (GEO)',
    taunt: 'High-value communications belt. Clear derelicts before catastrophic cascade.',
    debrisCount: 25,
    basePayout: 900,
  },
];

// GET /api/missions
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    aiPersona: 'CORRUPTED_NASA_FLIGHT_CONTROLLER_V4',
    missions: MISSIONS,
  });
});

// GET /api/missions/:id
router.get('/:id', (req, res) => {
  const mission = MISSIONS.find((m) => m.id === parseInt(req.params.id, 10));
  if (!mission) {
    return res.status(404).json({
      error: 'MISSION_NOT_FOUND',
      message: 'Specified orbital sector corrupted or purged from memory.',
    });
  }
  return res.json({ status: 'ok', mission });
});

export default router;
