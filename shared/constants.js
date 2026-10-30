/**
 * HELIOS PROTOCOL: Space Weather Superhero Tycoon — Shared Constants & Types
 * Built for the NASA International Space Apps Challenge 2026.
 */

export const ECONOMY = {
  INITIAL_BUDGET: 1000,
  INSOLVENCY_LIMIT: -500,
  INITIAL_MAGNETOSPHERE: 100.0,
  COLLAPSE_LIMIT: 0.0,
  EMERGENCY_SHIELD_COST: 800,
  EMERGENCY_SHIELD_RESTORE: 20.0,
};

export const DEPARTMENTS = {
  SOLAR_OBS: {
    id: 'solar_obs',
    name: 'Solar Observation Centre',
    role: 'Rapid Flare Interception & Manual Response',
    classification: 'LIVE OBSERVATION',
    scienceSource: 'NASA SDO (Atmospheric Imaging Assembly 131Å / 171Å)',
    description: 'Tracks extreme ultraviolet flares and active solar regions. High-speed interceptors.',
    baseCost: 150,
    basePayout: 320,
    baseIntegrityRestore: 2.8,
    baseDuration: 3.0,
    autoCost: 600,
    upgradeCost: 400,
  },
  RESEARCH_LAB: {
    id: 'research_lab',
    name: 'Space Weather Research Lab',
    role: 'Automated CME Trajectory & Plasma Analysis',
    classification: 'SCIENTIFIC FORECAST',
    scienceSource: 'NASA DONKI (Space Weather Database / WSA-Enlil Solar Wind)',
    description: 'Predicts interplanetary coronal mass ejection shock waves and plasma density.',
    baseCost: 350,
    basePayout: 750,
    baseIntegrityRestore: 5.5,
    baseDuration: 5.0,
    autoCost: 1200,
    upgradeCost: 800,
  },
  SAT_DEFENSE: {
    id: 'sat_defense',
    name: 'Satellite Protection Division',
    role: 'Geomagnetic Deflection & Orbital Grid Defense',
    classification: 'SIMULATED HERO MISSION',
    scienceSource: 'NOAA SWPC (Planetary K-index / Space Weather Scales G1-G5)',
    description: 'Dispatches heavy shield cruisers to absorb geomagnetic storm radiation belts.',
    baseCost: 700,
    basePayout: 1600,
    baseIntegrityRestore: 10.0,
    baseDuration: 7.0,
    autoCost: 2500,
    upgradeCost: 1500,
  },
};

export const COLORS = {
  HOT_PINK: '#FF2D95',
  PURPLE: '#6d4aff',
  DARK_SUBSTRATE: '#061120',
  SKY_300: '#7DD3FC',
  SKY_400: '#38BDF8',
  GREEN: '#4CAF50',
  AMBER: '#FFC107',
  WHITE: '#FFFFFF',
  SUN_GOLD: '#FFB800',
  SOLAR_ORANGE: '#FF5722',
};

export const AI_BOSS_TAUNTS = {
  GREETING: "HELIOS AI online. Solar Cycle 25 is peaking, Director. Try not to let Earth's atmosphere evaporate today.",
  BANKRUPT: "You're bankrupt, Director. My solar panels produce more net value than your entire agency.",
  CRITICAL_MAGNETOSPHERE: "Magnetosphere integrity under 35%! Aurora is visible in the tropics! That's not a light show, that's planetary failure!",
  IDLE: "Are you observing the sun, Director, or taking a nap under a sunlamp? Deploy an interceptor!",
  AUTOMATION_PURCHASED: "Autonomous spotters activated. Finally, machines are handling what biological leadership botched.",
  UPGRADE: "New hardware requisition approved. Let's see if you can utilize it without frying our capacitors.",
  HERO_DEPLOYED: "Hero mission launched into the solar wind. Godspeed, or whatever passes for physics in your head.",
  CME_ALERT: "NASA DONKI reports CME shock wave traveling at 1,600 km/s. Brace for bow-shock compression!",
  SOLAR_FLARE: "NASA SDO AIA detected an X-class solar flare! Ionizing radiation arriving in T-minus 8 minutes!",
  SUCCESS: "Solar event mitigated and plasma contained. Bare minimum achieved. Don't expect NASA to give you a medal.",
};
