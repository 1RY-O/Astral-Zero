import express from 'express';

const router = express.Router();

const MISSIONS = [
  {
    id: 1,
    name: 'Sector 01: First Contact',
    taunt: 'Calibrate your pathetic tether. Try not to miss the broad side of a satellite.',
    debrisCount: 7,
    kesslerRiskBase: 14.2,
    fuelBudget: 100,
  },
  {
    id: 2,
    name: 'Sector 02: Two-Body Problem',
    taunt: 'Slingshot or obliterate. Telemetry predicts your failure probability at 99.4%.',
    debrisCount: 12,
    kesslerRiskBase: 28.5,
    fuelBudget: 90,
  },
  {
    id: 3,
    name: 'Sector 03: Clean Sweep',
    taunt: 'Cascade mitigation protocol. Every prograde throw further enrages Mission Control.',
    debrisCount: 18,
    kesslerRiskBase: 42.0,
    fuelBudget: 80,
  },
  {
    id: 4,
    name: 'Sector 04: Kessler Run',
    taunt: 'LEO density approaching supercritical threshold. Good luck, meatbag.',
    debrisCount: 28,
    kesslerRiskBase: 84.0,
    fuelBudget: 70,
  },
];

// GET /api/missions
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    aiPersona: 'CORRUPTED_FLIGHT_CONTROLLER_V4',
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
