/**
 * HELIOS PROTOCOL: Space Weather Superhero Tycoon — Server Backend
 * Built for the NASA International Space Apps Challenge 2026.
 */

import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';

import missionsRouter from './routes/missions.js';
import telemetryRouter from './routes/telemetry.js';
import { AI_BOSS_TAUNTS, ECONOMY, DEPARTMENTS } from '../shared/constants.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());

// Routes
app.use('/api/missions', missionsRouter);
app.use('/api/telemetry', telemetryRouter);

// Health Endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    system: 'SYSTEM ONLINE',
    corruptedAI: 'ACTIVE',
    game: 'HELIOS PROTOCOL: Space Weather Superhero Tycoon',
    agency: 'HELIOS International Space-Protection Agency',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

function getInitialDepartments() {
  return {
    solar_obs: {
      id: 'solar_obs',
      name: DEPARTMENTS.SOLAR_OBS.name,
      role: DEPARTMENTS.SOLAR_OBS.role,
      classification: DEPARTMENTS.SOLAR_OBS.classification,
      scienceSource: DEPARTMENTS.SOLAR_OBS.scienceSource,
      description: DEPARTMENTS.SOLAR_OBS.description,
      threatName: 'X-Class & M-Class Solar Flares',
      threatCount: 6,
      maxThreats: 18,
      level: 1,
      automated: false,
      baseCost: DEPARTMENTS.SOLAR_OBS.baseCost,
      basePayout: DEPARTMENTS.SOLAR_OBS.basePayout,
      baseIntegrityRestore: DEPARTMENTS.SOLAR_OBS.baseIntegrityRestore,
      baseDuration: DEPARTMENTS.SOLAR_OBS.baseDuration,
      autoCost: DEPARTMENTS.SOLAR_OBS.autoCost,
      upgradeCost: DEPARTMENTS.SOLAR_OBS.upgradeCost,
    },
    research_lab: {
      id: 'research_lab',
      name: DEPARTMENTS.RESEARCH_LAB.name,
      role: DEPARTMENTS.RESEARCH_LAB.role,
      classification: DEPARTMENTS.RESEARCH_LAB.classification,
      scienceSource: DEPARTMENTS.RESEARCH_LAB.scienceSource,
      description: DEPARTMENTS.RESEARCH_LAB.description,
      threatName: 'Coronal Mass Ejections (CMEs)',
      threatCount: 4,
      maxThreats: 14,
      level: 1,
      automated: false,
      baseCost: DEPARTMENTS.RESEARCH_LAB.baseCost,
      basePayout: DEPARTMENTS.RESEARCH_LAB.basePayout,
      baseIntegrityRestore: DEPARTMENTS.RESEARCH_LAB.baseIntegrityRestore,
      baseDuration: DEPARTMENTS.RESEARCH_LAB.baseDuration,
      autoCost: DEPARTMENTS.RESEARCH_LAB.autoCost,
      upgradeCost: DEPARTMENTS.RESEARCH_LAB.upgradeCost,
    },
    sat_defense: {
      id: 'sat_defense',
      name: DEPARTMENTS.SAT_DEFENSE.name,
      role: DEPARTMENTS.SAT_DEFENSE.role,
      classification: DEPARTMENTS.SAT_DEFENSE.classification,
      scienceSource: DEPARTMENTS.SAT_DEFENSE.scienceSource,
      description: DEPARTMENTS.SAT_DEFENSE.description,
      threatName: 'Geomagnetic Storm Shockwaves',
      threatCount: 3,
      maxThreats: 10,
      level: 1,
      automated: false,
      baseCost: DEPARTMENTS.SAT_DEFENSE.baseCost,
      basePayout: DEPARTMENTS.SAT_DEFENSE.basePayout,
      baseIntegrityRestore: DEPARTMENTS.SAT_DEFENSE.baseIntegrityRestore,
      baseDuration: DEPARTMENTS.SAT_DEFENSE.baseDuration,
      autoCost: DEPARTMENTS.SAT_DEFENSE.autoCost,
      upgradeCost: DEPARTMENTS.SAT_DEFENSE.upgradeCost,
    },
  };
}

// Map socketId -> player game state
const players = new Map();

function createPlayerState(socketId) {
  return {
    socketId,
    budget: ECONOMY.INITIAL_BUDGET, // Funding Credits
    magnetosphereIntegrity: ECONOMY.INITIAL_MAGNETOSPHERE, // 100.0%
    departments: getInitialDepartments(),
    activeMissions: [],
    gameOver: false,
    gameOverReason: null,
    totalEventsMitigated: 0,
    totalCreditsEarned: ECONOMY.INITIAL_BUDGET,
    lastActionAt: Date.now(),
    lastIdleTauntAt: 0,
    lastRiskTauntAt: 0,
    lastBrokeTauntAt: 0,
    lastAutoDeployAt: {
      solar_obs: 0,
      research_lab: 0,
      sat_defense: 0,
    },
    solarTelemetry: {
      sdoFlareClass: 'M5.4',
      donkiCmeSpeed: '1,320 km/s',
      noaaKpIndex: 6.4,
      stormStatus: 'G3 (STRONG STORM)',
      solarWindSpeed: '590 km/s',
      cyclePhase: 'Solar Cycle 25 Maximum',
    },
  };
}

io.on('connection', (socket) => {
  console.log(`[HELIOS PROTOCOL Server] Director connected: ${socket.id}`);
  const state = createPlayerState(socket.id);
  players.set(socket.id, state);

  function emitTaunt(message, intensity = 'medium') {
    socket.emit('boss_taunt', { message, intensity, timestamp: Date.now() });
  }

  function emitState() {
    socket.emit('state_update', {
      budget: state.budget,
      fundingCredits: state.budget,
      magnetosphereIntegrity: parseFloat(state.magnetosphereIntegrity.toFixed(1)),
      kesslerRisk: parseFloat((100 - state.magnetosphereIntegrity).toFixed(1)), // backwards compatibility
      departments: state.departments,
      activeMissions: state.activeMissions,
      activeTugs: state.activeMissions, // backwards compatibility
      gameOver: state.gameOver,
      gameOverReason: state.gameOverReason,
      totalEventsMitigated: state.totalEventsMitigated,
      totalCleared: state.totalEventsMitigated, // backwards compatibility
      totalCreditsEarned: state.totalCreditsEarned,
      solarTelemetry: state.solarTelemetry,
    });
  }

  // Initial connection state
  socket.emit('init_game', {
    budget: state.budget,
    fundingCredits: state.budget,
    magnetosphereIntegrity: state.magnetosphereIntegrity,
    kesslerRisk: 0.0,
    departments: state.departments,
    solarTelemetry: state.solarTelemetry,
  });

  emitTaunt(AI_BOSS_TAUNTS.GREETING, 'medium');

  // Trigger Hero Mission Deployment
  function launchMission(deptId) {
    if (state.gameOver) return;

    const dept = state.departments[deptId];
    if (!dept) return;

    if (state.budget < dept.baseCost) {
      emitTaunt('Insufficient funding credits to deploy hero craft. Balance the budget, Director!', 'medium');
      return;
    }

    state.lastActionAt = Date.now();
    state.budget -= dept.baseCost;

    const missionDuration = Math.max(1, dept.baseDuration - (dept.level - 1) * 0.4);
    const missionId = `mission-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const newMission = {
      missionId,
      tugId: missionId, // backwards compatibility
      deptId,
      zoneId: deptId, // backwards compatibility
      duration: missionDuration,
      startedAt: Date.now(),
      heroName:
        deptId === 'solar_obs'
          ? 'SOLAR INTERCEPTOR'
          : deptId === 'research_lab'
            ? 'PLASMA HARVESTER'
            : 'SHIELD CRUISER',
    };

    state.activeMissions.push(newMission);
    emitState();

    if (state.budget < 100 && Date.now() - state.lastBrokeTauntAt > 10000) {
      state.lastBrokeTauntAt = Date.now();
      emitTaunt(AI_BOSS_TAUNTS.BANKRUPT, 'high');
    }

    // Mission completion timer
    setTimeout(() => {
      const idx = state.activeMissions.findIndex((m) => m.missionId === missionId);
      if (idx !== -1) {
        state.activeMissions.splice(idx, 1);
      }

      if (state.gameOver) return;

      // Calculate reward
      const levelMultiplier = 1 + (dept.level - 1) * 0.45;
      const payout = Math.round(dept.basePayout * levelMultiplier);
      const integrityGain = parseFloat((dept.baseIntegrityRestore * (1 + (dept.level - 1) * 0.25)).toFixed(1));

      state.budget += payout;
      state.totalCreditsEarned += payout;
      state.magnetosphereIntegrity = Math.min(100.0, state.magnetosphereIntegrity + integrityGain);
      dept.threatCount = Math.max(0, dept.threatCount - 1);
      state.totalEventsMitigated += 1;

      // Emit success events
      socket.emit('mission_success', {
        missionId,
        tugId: missionId,
        deptId,
        payout,
        integrityGain,
        clearedThreats: 1,
      });

      socket.emit('tug_success', {
        tugId: missionId,
        zoneId: deptId,
        payout,
        clearedDebris: 1,
      });

      if (Math.random() < 0.25) {
        emitTaunt(AI_BOSS_TAUNTS.SUCCESS, 'low');
      }

      emitState();
    }, missionDuration * 1000);
  }

  // Socket listener: deploy_mission (and deploy_hero / deploy_tug aliases)
  socket.on('deploy_mission', (payload = {}) => {
    const deptId = payload.deptId || payload.zone || 'solar_obs';
    launchMission(deptId);
  });

  socket.on('deploy_hero', (payload = {}) => {
    const deptId = payload.deptId || payload.zone || 'solar_obs';
    launchMission(deptId);
  });

  socket.on('deploy_tug', (payload = {}) => {
    // Map legacy zones if needed
    let deptId = payload.zone;
    if (deptId === 'LEO') deptId = 'solar_obs';
    else if (deptId === 'MEO') deptId = 'research_lab';
    else if (deptId === 'GEO') deptId = 'sat_defense';
    if (!state.departments[deptId]) deptId = 'solar_obs';
    launchMission(deptId);
  });

  // Socket listener: upgrade_department (and upgrade_fleet alias)
  socket.on('upgrade_department', (payload = {}) => {
    state.lastActionAt = Date.now();
    if (state.gameOver) return;

    const deptId = payload.deptId || 'solar_obs';
    const dept = state.departments[deptId];
    if (!dept) return;

    if (state.budget < dept.upgradeCost) {
      emitTaunt(`Insufficient funding credits for ${dept.name} upgrade.`, 'medium');
      return;
    }

    if (dept.level >= 5) {
      emitTaunt(`${dept.name} is already at maximum operational spec (MK-5).`, 'medium');
      return;
    }

    state.budget -= dept.upgradeCost;
    dept.level += 1;
    dept.upgradeCost = Math.round(dept.upgradeCost * 1.6);

    emitState();
    emitTaunt(AI_BOSS_TAUNTS.UPGRADE, 'medium');
  });

  socket.on('upgrade_fleet', () => {
    // Default to solar_obs or first upgradeable
    const target = state.departments.solar_obs.level < 5
      ? 'solar_obs'
      : state.departments.research_lab.level < 5
        ? 'research_lab'
        : 'sat_defense';
    socket.emit('upgrade_department', { deptId: target });
  });

  // Socket listener: buy_automation
  socket.on('buy_automation', (payload = {}) => {
    state.lastActionAt = Date.now();
    if (state.gameOver) return;

    const deptId = payload.deptId || 'solar_obs';
    const dept = state.departments[deptId];
    if (!dept) return;

    if (dept.automated) {
      emitTaunt(`${dept.name} automation is already active!`, 'low');
      return;
    }

    if (state.budget < dept.autoCost) {
      emitTaunt(`Need ${dept.autoCost} credits to automate ${dept.name}. Go earn them!`, 'medium');
      return;
    }

    state.budget -= dept.autoCost;
    dept.automated = true;

    emitState();
    emitTaunt(AI_BOSS_TAUNTS.AUTOMATION_PURCHASED, 'medium');
  });

  // Socket listener: emergency_shield (and emergency_purge alias)
  socket.on('emergency_shield', () => {
    state.lastActionAt = Date.now();
    if (state.gameOver) return;

    const cost = ECONOMY.EMERGENCY_SHIELD_COST;
    if (state.budget < cost) {
      emitTaunt('Overcharging planetary magnetic coils requires 800 funding credits.', 'medium');
      return;
    }

    state.budget -= cost;
    state.magnetosphereIntegrity = Math.min(100.0, state.magnetosphereIntegrity + ECONOMY.EMERGENCY_SHIELD_RESTORE);

    // Half all active threat counts
    Object.values(state.departments).forEach((dept) => {
      const cleared = Math.ceil(dept.threatCount / 2);
      dept.threatCount -= cleared;
      state.totalEventsMitigated += cleared;
    });

    socket.emit('shield_success', {
      restoredIntegrity: ECONOMY.EMERGENCY_SHIELD_RESTORE,
      cost,
    });
    socket.emit('purge_success', {
      zoneId: 'ALL',
      clearedDebris: 5,
      riskSpike: -20.0,
    });

    emitState();
    emitTaunt('Planetary dipole coil overcharged! Solar plasma deflected, but watch your credit balance.', 'medium');
  });

  socket.on('emergency_purge', () => {
    // Alias to emergency shield
    socket.emit('emergency_shield');
  });

  // Socket listener: restart_game
  socket.on('restart_game', () => {
    const fresh = createPlayerState(socket.id);
    players.set(socket.id, fresh);
    fresh.lastActionAt = Date.now();

    socket.emit('init_game', {
      budget: fresh.budget,
      fundingCredits: fresh.budget,
      magnetosphereIntegrity: fresh.magnetosphereIntegrity,
      kesslerRisk: 0.0,
      departments: fresh.departments,
      solarTelemetry: fresh.solarTelemetry,
    });
    emitTaunt("HELIOS Protocol reset. Telemetry re-established. Protect our atmosphere!", 'medium');
  });

  socket.on('disconnect', () => {
    console.log(`[HELIOS PROTOCOL Server] Director disconnected: ${socket.id}`);
    players.delete(socket.id);
  });
});

// Periodic Simulation Tick & Automation Runner (Every 2.5 seconds)
setInterval(() => {
  const now = Date.now();

  for (const [socketId, state] of players.entries()) {
    if (state.gameOver) continue;

    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;

    // 1. Natural Solar Activity / Space Weather Event Emergence
    // Solar Observation Centre (SDO flares emerge quickly)
    if (state.departments.solar_obs.threatCount < state.departments.solar_obs.maxThreats) {
      state.departments.solar_obs.threatCount += Math.random() > 0.3 ? 1 : 0;
    }

    // Space Weather Research Lab (CMEs emerge periodically)
    if (state.departments.research_lab.threatCount < state.departments.research_lab.maxThreats) {
      state.departments.research_lab.threatCount += Math.random() > 0.5 ? 1 : 0;
    }

    // Satellite Protection Division (Geomagnetic shocks emerge slower but hit hard)
    if (state.departments.sat_defense.threatCount < state.departments.sat_defense.maxThreats) {
      state.departments.sat_defense.threatCount += Math.random() > 0.65 ? 1 : 0;
    }

    // 2. Solar Wind Erosion on Magnetosphere Integrity
    const totalThreats =
      state.departments.solar_obs.threatCount +
      state.departments.research_lab.threatCount * 1.5 +
      state.departments.sat_defense.threatCount * 2.5;

    // Degradation rate based on solar storm intensity
    const erosion = 0.4 + totalThreats * 0.045;
    state.magnetosphereIntegrity = Math.max(0.0, state.magnetosphereIntegrity - erosion);

    // 3. Automated Department Auto-Deployment
    Object.values(state.departments).forEach((dept) => {
      if (dept.automated) {
        const lastDeploy = state.lastAutoDeployAt[dept.id] || 0;
        const cooldown = (dept.baseDuration - (dept.level - 1) * 0.3) * 1000 + 1000;

        // Auto deploy if cooldown met and player has credits (or minimal balance)
        if (now - lastDeploy >= cooldown && state.budget >= dept.baseCost) {
          state.lastAutoDeployAt[dept.id] = now;
          state.budget -= dept.baseCost;

          const missionDuration = Math.max(1, dept.baseDuration - (dept.level - 1) * 0.4);
          const missionId = `auto-${dept.id}-${now}`;

          const mission = {
            missionId,
            tugId: missionId,
            deptId: dept.id,
            zoneId: dept.id,
            duration: missionDuration,
            startedAt: now,
            isAutomated: true,
            heroName:
              dept.id === 'solar_obs'
                ? 'AUTO-INTERCEPTOR'
                : dept.id === 'research_lab'
                  ? 'PLASMA DRONE'
                  : 'DEFENSE SATELLITE',
          };

          state.activeMissions.push(mission);

          setTimeout(() => {
            const idx = state.activeMissions.findIndex((m) => m.missionId === missionId);
            if (idx !== -1) state.activeMissions.splice(idx, 1);
            if (state.gameOver) return;

            const levelMultiplier = 1 + (dept.level - 1) * 0.45;
            const payout = Math.round(dept.basePayout * levelMultiplier);
            const integrityGain = parseFloat((dept.baseIntegrityRestore * (1 + (dept.level - 1) * 0.25)).toFixed(1));

            state.budget += payout;
            state.totalCreditsEarned += payout;
            state.magnetosphereIntegrity = Math.min(100.0, state.magnetosphereIntegrity + integrityGain);
            dept.threatCount = Math.max(0, dept.threatCount - 1);
            state.totalEventsMitigated += 1;

            socket.emit('mission_success', {
              missionId,
              tugId: missionId,
              deptId: dept.id,
              payout,
              integrityGain,
              clearedThreats: 1,
              isAutomated: true,
            });
            socket.emit('tug_success', {
              tugId: missionId,
              zoneId: dept.id,
              payout,
              clearedDebris: 1,
            });
          }, missionDuration * 1000);
        }
      }
    });

    // 4. Hostile AI Taunts for Idle or Critical States
    if (now - state.lastActionAt >= 12000 && now - state.lastIdleTauntAt >= 14000) {
      state.lastIdleTauntAt = now;
      socket.emit('boss_taunt', {
        message: AI_BOSS_TAUNTS.IDLE,
        intensity: 'high',
        timestamp: now,
      });
    }

    if (state.magnetosphereIntegrity < 35 && now - state.lastRiskTauntAt >= 10000) {
      state.lastRiskTauntAt = now;
      socket.emit('boss_taunt', {
        message: AI_BOSS_TAUNTS.CRITICAL_MAGNETOSPHERE,
        intensity: 'critical',
        timestamp: now,
      });
    }

    // 5. Fail State Checks
    if (state.magnetosphereIntegrity <= 0) {
      state.gameOver = true;
      state.gameOverReason = 'MAGNETOSPHERE COLLAPSE (0% INTEGRITY)';
      socket.emit('game_over', {
        reason: state.gameOverReason,
        finalScore: state.totalEventsMitigated,
        message:
          'Earth’s geomagnetic shield was stripped by extreme coronal mass ejections. Planetary power grids fried. Game Over.',
      });
      socket.emit('boss_taunt', {
        message: 'Planetary shield collapsed. Earth is fried. NASA will see you in space court, Director.',
        intensity: 'critical',
      });
    } else if (state.budget < ECONOMY.INSOLVENCY_LIMIT) {
      state.gameOver = true;
      state.gameOverReason = 'AGENCY INSOLVENCY (DEBT EXCEEDED -500 CREDITS)';
      socket.emit('game_over', {
        reason: state.gameOverReason,
        finalScore: state.totalEventsMitigated,
        message: 'HELIOS has run out of funds. Space weather assets seized by creditors.',
      });
      socket.emit('boss_taunt', {
        message: 'Insolvency limit reached. The Sun wins. Pack up your office, Director.',
        intensity: 'critical',
      });
    }

    // Broadcast state update
    socket.emit('state_update', {
      budget: state.budget,
      fundingCredits: state.budget,
      magnetosphereIntegrity: parseFloat(state.magnetosphereIntegrity.toFixed(1)),
      kesslerRisk: parseFloat((100 - state.magnetosphereIntegrity).toFixed(1)),
      departments: state.departments,
      activeMissions: state.activeMissions,
      activeTugs: state.activeMissions,
      gameOver: state.gameOver,
      gameOverReason: state.gameOverReason,
      totalEventsMitigated: state.totalEventsMitigated,
      totalCleared: state.totalEventsMitigated,
      totalCreditsEarned: state.totalCreditsEarned,
      solarTelemetry: state.solarTelemetry,
    });
  }
}, 2500);

httpServer.listen(port, () => {
  console.log(`[HELIOS PROTOCOL Server] Online at http://localhost:${port}`);
  console.log(`[HELIOS PROTOCOL Server] Health check: http://localhost:${port}/api/health`);
});
