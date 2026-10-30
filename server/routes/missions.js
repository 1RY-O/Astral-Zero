import express from 'express';

const router = express.Router();

const MISSIONS = [
  {
    id: 1,
    name: 'Sector 01: Solar Flare Intercept (NASA SDO)',
    classification: 'LIVE OBSERVATION',
    taunt: 'Active Region 3664 has erupted with an X-class flare. Deploy interceptors before high-frequency radio blackouts spread.',
    eventCount: 6,
    threatLevel: 'M4.2 - X1.0 Solar Flare',
    payout: 320,
    scienceSource: 'NASA Solar Dynamics Observatory (SDO) Atmospheric Imaging Assembly',
  },
  {
    id: 2,
    name: 'Sector 02: Coronal Mass Ejection Deflection (NASA DONKI)',
    classification: 'SCIENTIFIC FORECAST',
    taunt: 'DONKI telemetry confirms a halo CME traveling at 1,450 km/s. Deflect the interplanetary plasma front.',
    eventCount: 4,
    threatLevel: 'Fast CME Shock Front',
    payout: 750,
    scienceSource: 'NASA DONKI (Space Weather Database of Notifications, Knowledge, Information)',
  },
  {
    id: 3,
    name: 'Sector 03: Magnetosphere Dipole Reinforcement (NOAA SWPC)',
    classification: 'SIMULATED HERO MISSION',
    taunt: 'NOAA SWPC reports Kp 7.6. Dayside magnetopause compressed below geosynchronous orbit. Reinforce Earth dipole shields.',
    eventCount: 3,
    threatLevel: 'G3 Strong Geomagnetic Storm',
    payout: 1600,
    scienceSource: 'NOAA Space Weather Prediction Center (SWPC) Planetary K-Index',
  },
  {
    id: 4,
    name: 'Sector 04: Carrington-Scale Superflare Protocol',
    classification: 'EMERGENCY PROTOCOL',
    taunt: 'Superstorm telemetry confirmed. Extreme radiation belt storm. All HELIOS superhero divisions converge!',
    eventCount: 12,
    threatLevel: 'G5 Extreme Solar Storm / Carrington Event',
    payout: 5000,
    scienceSource: 'NASA Heliophysics System Observatory & NOAA SWPC Combined Feed',
  },
];

// GET /api/missions
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    aiPersona: 'HELIOS_MISSION_CONTROL_AI_V5',
    agency: 'HELIOS International Space-Protection Protocol',
    missions: MISSIONS,
  });
});

// GET /api/missions/:id
router.get('/:id', (req, res) => {
  const mission = MISSIONS.find((m) => m.id === parseInt(req.params.id, 10));
  if (!mission) {
    return res.status(404).json({
      error: 'MISSION_NOT_FOUND',
      message: 'Specified space weather sector corrupted or purged from HELIOS telemetry.',
    });
  }
  return res.json({ status: 'ok', mission });
});

export default router;
