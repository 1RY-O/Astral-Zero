/**
 * Kessler Tycoon — Shared Constants & Types
 * Built for the NASA International Space Apps Challenge 2026.
 */

export const ECONOMY = {
  INITIAL_BUDGET: 1000,
  TUG_COST: 200,
  UPGRADE_COST: 500,
  PURGE_COST: 1000,
  PURGE_RISK_SPIKE: 20.0,
  INSOLVENCY_LIMIT: -500,
};

export const ZONES = {
  LEO: {
    id: 'LEO',
    name: 'Low Earth Orbit (LEO)',
    altitude: '160 - 2,000 km',
    baseDebris: 12,
    basePayout: 350,
    autoCost: 1500,
    color: '#38BDF8',
    ringRadius: 65,
  },
  MEO: {
    id: 'MEO',
    name: 'Medium Earth Orbit (MEO)',
    altitude: '2,000 - 35,786 km',
    baseDebris: 18,
    basePayout: 550,
    autoCost: 3000,
    color: '#6d4aff',
    ringRadius: 105,
  },
  GEO: {
    id: 'GEO',
    name: 'Geostationary Orbit (GEO)',
    altitude: '35,786 km',
    baseDebris: 25,
    basePayout: 900,
    autoCost: 5000,
    color: '#FF2D95',
    ringRadius: 145,
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
};

export const AI_BOSS_TAUNTS = {
  GREETING: "NASA privatization protocol active. Don't bankrupt us on your first day.",
  BANKRUPT: "You're bankrupt. My toaster has more processing power than your company.",
  HIGH_RISK: "Orbit is turning into a blender. Do your job.",
  IDLE: "Are you dead, or just incompetent? Deploy a tug.",
  FLEET_UPGRADE: "Oh look, you bought a shiny new toy. Too bad you're still bad at your job.",
  AUTO_TUG: "Auto-tug acquired. Finally, automated hardware to compensate for human reaction times.",
  ZONE_CLEARED: "Finally. You did the bare minimum. Don't expect a raise.",
};
