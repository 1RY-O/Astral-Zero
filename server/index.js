/**
 * Kessler Tycoon — Server-Authoritative Express + Socket.IO Backend
 * Built for the NASA International Space Apps Challenge 2026.
 */

import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';

import missionsRouter from './routes/missions.js';
import telemetryRouter from './routes/telemetry.js';
import { ECONOMY, ZONES, AI_BOSS_TAUNTS } from '../shared/constants.js';

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
    game: 'Kessler Tycoon',
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

function getInitialZones() {
  return {
    LEO: {
      id: 'LEO',
      name: ZONES.LEO.name,
      altitude: ZONES.LEO.altitude,
      debris: ZONES.LEO.baseDebris,
      basePayout: ZONES.LEO.basePayout,
      autoTug: false,
      autoCost: ZONES.LEO.autoCost,
    },
    MEO: {
      id: 'MEO',
      name: ZONES.MEO.name,
      altitude: ZONES.MEO.altitude,
      debris: ZONES.MEO.baseDebris,
      basePayout: ZONES.MEO.basePayout,
      autoTug: false,
      autoCost: ZONES.MEO.autoCost,
    },
    GEO: {
      id: 'GEO',
      name: ZONES.GEO.name,
      altitude: ZONES.GEO.altitude,
      debris: ZONES.GEO.baseDebris,
      basePayout: ZONES.GEO.basePayout,
      autoTug: false,
      autoCost: ZONES.GEO.autoCost,
    },
  };
}

// Map socketId -> player game state
const players = new Map();
// Map socketId -> Set of active setTimeout IDs
const playerTimeouts = new Map();

function createPlayerState(socketId) {
  return {
    socketId,
    status: 'active', // 'active' | 'terminated'
    budget: ECONOMY.INITIAL_BUDGET,
    kesslerRisk: 10.0,
    fleetLevel: 1,
    upgradeCost: ECONOMY.UPGRADE_COST,
    zones: getInitialZones(),
    activeTugs: [],
    gameOver: false,
    gameOverReason: null,
    totalCleared: 0,
    lastActionAt: Date.now(),
    lastIdleTauntAt: 0,
    lastRiskTauntAt: 0,
    lastBrokeTauntAt: 0,
    lastAutoTugAt: { LEO: 0, MEO: 0, GEO: 0 },
  };
}

function clearAllPlayerTimeouts(socketId) {
  const timers = playerTimeouts.get(socketId);
  if (timers) {
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
  }
}

function registerPlayerTimeout(socketId, timerId) {
  let timers = playerTimeouts.get(socketId);
  if (!timers) {
    timers = new Set();
    playerTimeouts.set(socketId, timers);
  }
  timers.add(timerId);
}

function unregisterPlayerTimeout(socketId, timerId) {
  const timers = playerTimeouts.get(socketId);
  if (timers) {
    timers.delete(timerId);
  }
}

io.on('connection', (socket) => {
  console.log(`[Kessler Tycoon Server] Contractor connected: ${socket.id}`);
  const state = createPlayerState(socket.id);
  players.set(socket.id, state);
  playerTimeouts.set(socket.id, new Set());

  function emitTaunt(message, intensity = 'medium') {
    socket.emit('boss_taunt', { message, intensity, timestamp: Date.now() });
  }

  function emitState() {
    socket.emit('state_update', {
      status: state.status,
      budget: state.budget,
      kesslerRisk: parseFloat(state.kesslerRisk.toFixed(1)),
      fleetLevel: state.fleetLevel,
      deployTimeSeconds: Math.max(1, 5 - (state.fleetLevel - 1) * 0.8),
      upgradeCost: state.upgradeCost,
      zones: state.zones,
      activeTugs: state.activeTugs,
      gameOver: state.gameOver,
      gameOverReason: state.gameOverReason,
      totalCleared: state.totalCleared,
    });
  }

  // Check fail conditions immediately on any state change
  function checkFailState() {
    if (state.gameOver || state.status === 'terminated') return true;

    if (state.kesslerRisk >= 100) {
      state.status = 'terminated';
      state.gameOver = true;
      state.gameOverReason = 'Kessler Cascade Detected';
      clearAllPlayerTimeouts(socket.id);
      socket.emit('game_over', {
        status: 'terminated',
        reason: state.gameOverReason,
        finalScore: state.totalCleared,
        finalBudget: state.budget,
        message: 'Orbit has collapsed into a cascading storm of shrapnel. You are terminated.',
      });
      socket.emit('boss_taunt', {
        message: 'You triggered Kessler syndrome. NASA has revoked your contractor license permanently.',
        intensity: 'critical',
      });
      emitState();
      return true;
    }

    if (state.budget < ECONOMY.INSOLVENCY_LIMIT) {
      state.status = 'terminated';
      state.gameOver = true;
      state.gameOverReason = 'Insolvency';
      clearAllPlayerTimeouts(socket.id);
      socket.emit('game_over', {
        status: 'terminated',
        reason: state.gameOverReason,
        finalScore: state.totalCleared,
        finalBudget: state.budget,
        message: 'Your debt exceeded -$500. NASA bailiffs have repossessed your fleet.',
      });
      socket.emit('boss_taunt', {
        message: "You're bankrupt. Security is escorting your belongings to the space incinerator.",
        intensity: 'critical',
      });
      emitState();
      return true;
    }

    return false;
  }

  // Initial connection greeting
  socket.emit('init_game', {
    status: state.status,
    budget: state.budget,
    kesslerRisk: state.kesslerRisk,
    fleetLevel: state.fleetLevel,
    deployTimeSeconds: 5,
    upgradeCost: state.upgradeCost,
    zones: state.zones,
  });

  emitTaunt(AI_BOSS_TAUNTS.GREETING, 'medium');

  // Trigger Tug Deployment function
  function deployTugToZone(zoneId, isAuto = false) {
    if (checkFailState()) return;

    const zone = state.zones[zoneId];
    if (!zone) return;

    if (zone.debris <= 0) {
      if (!isAuto) emitTaunt(`Zone ${zoneId} has no debris to clear, genius.`, 'low');
      return;
    }

    if (state.budget <= ECONOMY.INSOLVENCY_LIMIT) {
      checkFailState();
      return;
    }

    state.lastActionAt = Date.now();
    state.budget -= ECONOMY.TUG_COST;

    const deployDuration = Math.max(1.2, 4.5 - (state.fleetLevel - 1) * 0.7);
    const tugId = `tug-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    state.activeTugs.push({
      tugId,
      zoneId,
      duration: deployDuration,
      startedAt: Date.now(),
      isAuto,
    });

    if (checkFailState()) return;
    emitState();

    if (state.budget < 100 && Date.now() - state.lastBrokeTauntAt > 10000) {
      state.lastBrokeTauntAt = Date.now();
      emitTaunt(AI_BOSS_TAUNTS.BANKRUPT, 'high');
    }

    // Schedule tug completion
    let timerId = null;
    timerId = setTimeout(() => {
      unregisterPlayerTimeout(socket.id, timerId);

      const idx = state.activeTugs.findIndex((t) => t.tugId === tugId);
      if (idx !== -1) {
        state.activeTugs.splice(idx, 1);
      }

      if (state.gameOver || state.status === 'terminated') return;

      if (zone.debris > 0) {
        zone.debris -= 1;
        state.totalCleared += 1;
        const payoutMultiplier = 1 + (state.fleetLevel - 1) * 0.4;
        const payout = Math.round(zone.basePayout * payoutMultiplier);
        state.budget += payout;
        state.kesslerRisk = Math.max(0, state.kesslerRisk - 1.8);

        socket.emit('tug_success', {
          tugId,
          zoneId,
          payout,
          clearedDebris: 1,
        });

        if (zone.debris === 0 && Math.random() < 0.3) {
          emitTaunt(AI_BOSS_TAUNTS.ZONE_CLEARED, 'low');
        }
      }

      emitState();
    }, deployDuration * 1000);

    registerPlayerTimeout(socket.id, timerId);
  }

  // Socket listener: deploy_tug
  socket.on('deploy_tug', (payload = {}) => {
    const zoneId = payload.zone || payload.deptId || 'LEO';
    deployTugToZone(zoneId, false);
  });

  // Socket listener: buy_auto_tug
  socket.on('buy_auto_tug', (payload = {}) => {
    state.lastActionAt = Date.now();
    if (checkFailState()) return;

    const zoneId = payload.zoneId || payload.zone || 'LEO';
    const zone = state.zones[zoneId];
    if (!zone) return;

    if (zone.autoTug) {
      emitTaunt(`${zone.name} already has auto-tug active!`, 'low');
      return;
    }

    if (state.budget < zone.autoCost) {
      emitTaunt(`Auto-Tug for ${zoneId} costs $${zone.autoCost}. Keep grinding!`, 'medium');
      return;
    }

    state.budget -= zone.autoCost;
    zone.autoTug = true;

    emitState();
    emitTaunt(AI_BOSS_TAUNTS.AUTO_TUG, 'medium');
  });

  // Socket listener: upgrade_fleet
  socket.on('upgrade_fleet', () => {
    state.lastActionAt = Date.now();
    if (checkFailState()) return;

    if (state.budget < state.upgradeCost) {
      emitTaunt('Insufficient funds for fleet upgrade.', 'medium');
      return;
    }

    if (state.fleetLevel >= 5) {
      emitTaunt('Fleet is already at peak orbital spec (MK-5).', 'medium');
      return;
    }

    state.budget -= state.upgradeCost;
    state.fleetLevel += 1;
    state.upgradeCost = Math.round(state.upgradeCost * 1.6);

    emitState();
    emitTaunt(AI_BOSS_TAUNTS.FLEET_UPGRADE, 'medium');
  });

  // Socket listener: emergency_purge
  socket.on('emergency_purge', (payload = {}) => {
    state.lastActionAt = Date.now();
    if (checkFailState()) return;

    const purgeCost = ECONOMY.PURGE_COST;
    const zoneId = payload.zone || 'LEO';
    const zone = state.zones[zoneId];
    if (!zone) return;

    state.budget -= purgeCost;
    const cleared = zone.debris;
    zone.debris = 0;
    state.totalCleared += cleared;

    // Purge spikes Kessler Risk by 20%
    state.kesslerRisk = Math.min(100, state.kesslerRisk + ECONOMY.PURGE_RISK_SPIKE);

    socket.emit('purge_success', {
      zoneId,
      clearedDebris: cleared,
      riskSpike: ECONOMY.PURGE_RISK_SPIKE,
    });

    if (state.kesslerRisk >= 80 && Date.now() - state.lastRiskTauntAt > 6000) {
      state.lastRiskTauntAt = Date.now();
      emitTaunt(AI_BOSS_TAUNTS.HIGH_RISK, 'high');
    }

    if (checkFailState()) return;
    emitState();
  });

  // Socket listener: restart_game (Full reset of all timeouts and game state)
  socket.on('restart_game', () => {
    console.log(`[Kessler Tycoon Server] Resetting game for contractor: ${socket.id}`);
    clearAllPlayerTimeouts(socket.id);

    const fresh = createPlayerState(socket.id);
    players.set(socket.id, fresh);
    fresh.lastActionAt = Date.now();

    socket.emit('init_game', {
      status: 'active',
      budget: fresh.budget,
      kesslerRisk: fresh.kesslerRisk,
      fleetLevel: fresh.fleetLevel,
      deployTimeSeconds: 5,
      upgradeCost: fresh.upgradeCost,
      zones: fresh.zones,
      activeTugs: [],
      gameOver: false,
      gameOverReason: null,
      totalCleared: 0,
    });

    socket.emit('state_update', {
      status: 'active',
      budget: fresh.budget,
      kesslerRisk: fresh.kesslerRisk,
      fleetLevel: fresh.fleetLevel,
      deployTimeSeconds: 5,
      upgradeCost: fresh.upgradeCost,
      zones: fresh.zones,
      activeTugs: [],
      gameOver: false,
      gameOverReason: null,
      totalCleared: 0,
    });

    emitTaunt("Contract re-initialized. Telemetry reset. Don't blow it this time.", 'medium');
  });

  socket.on('disconnect', () => {
    console.log(`[Kessler Tycoon Server] Contractor disconnected: ${socket.id}`);
    clearAllPlayerTimeouts(socket.id);
    playerTimeouts.delete(socket.id);
    players.delete(socket.id);
  });
});

// Periodic Simulation Tick (every 2.5 seconds)
setInterval(() => {
  const now = Date.now();

  for (const [socketId, state] of players.entries()) {
    if (state.gameOver || state.status === 'terminated') continue;

    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;

    // 1. Natural debris accumulation over time
    // LEO accumulates fastest (+2), MEO (+1), GEO (+1 every other tick)
    state.zones.LEO.debris += 2;
    state.zones.MEO.debris += 1;
    if (Math.random() > 0.4) {
      state.zones.GEO.debris += 1;
    }

    // 2. Risk increases with total debris
    const totalDebris =
      state.zones.LEO.debris + state.zones.MEO.debris + state.zones.GEO.debris;
    const riskIncrement = 0.5 + totalDebris * 0.035;
    state.kesslerRisk = Math.min(100, state.kesslerRisk + riskIncrement);

    // 3. Auto-Tug Automatic Deployments
    Object.values(state.zones).forEach((zone) => {
      if (zone.autoTug && zone.debris > 0) {
        const lastDeploy = state.lastAutoTugAt[zone.id] || 0;
        const cooldown = (Math.max(1.2, 4.5 - (state.fleetLevel - 1) * 0.7) + 0.8) * 1000;

        if (now - lastDeploy >= cooldown && state.budget > ECONOMY.INSOLVENCY_LIMIT) {
          state.lastAutoTugAt[zone.id] = now;
          state.budget -= ECONOMY.TUG_COST;

          const deployDuration = Math.max(1.2, 4.5 - (state.fleetLevel - 1) * 0.7);
          const tugId = `auto-tug-${zone.id}-${now}`;

          state.activeTugs.push({
            tugId,
            zoneId: zone.id,
            duration: deployDuration,
            startedAt: now,
            isAuto: true,
          });

          let timerId = null;
          timerId = setTimeout(() => {
            unregisterPlayerTimeout(socketId, timerId);

            const idx = state.activeTugs.findIndex((t) => t.tugId === tugId);
            if (idx !== -1) state.activeTugs.splice(idx, 1);
            if (state.gameOver || state.status === 'terminated') return;

            if (zone.debris > 0) {
              zone.debris -= 1;
              state.totalCleared += 1;
              const payoutMultiplier = 1 + (state.fleetLevel - 1) * 0.4;
              const payout = Math.round(zone.basePayout * payoutMultiplier);
              state.budget += payout;
              state.kesslerRisk = Math.max(0, state.kesslerRisk - 1.8);

              socket.emit('tug_success', {
                tugId,
                zoneId: zone.id,
                payout,
                clearedDebris: 1,
                isAuto: true,
              });
            }
          }, deployDuration * 1000);

          registerPlayerTimeout(socketId, timerId);
        }
      }
    });

    // 4. Idle Check (12s without action)
    if (now - state.lastActionAt >= 12000 && now - state.lastIdleTauntAt >= 14000) {
      state.lastIdleTauntAt = now;
      socket.emit('boss_taunt', {
        message: AI_BOSS_TAUNTS.IDLE,
        intensity: 'high',
        timestamp: now,
      });
    }

    // 5. High Risk Taunt (> 80%)
    if (state.kesslerRisk >= 80 && now - state.lastRiskTauntAt >= 10000) {
      state.lastRiskTauntAt = now;
      socket.emit('boss_taunt', {
        message: AI_BOSS_TAUNTS.HIGH_RISK,
        intensity: 'high',
        timestamp: now,
      });
    }

    // 6. Fail State Check: Risk >= 100% OR Budget < -$500
    if (state.kesslerRisk >= 100) {
      state.status = 'terminated';
      state.gameOver = true;
      state.gameOverReason = 'Kessler Cascade Detected';
      clearAllPlayerTimeouts(socketId);
      socket.emit('game_over', {
        status: 'terminated',
        reason: state.gameOverReason,
        finalScore: state.totalCleared,
        finalBudget: state.budget,
        message: 'Orbit has collapsed into a cascading storm of shrapnel. You are terminated.',
      });
      socket.emit('boss_taunt', {
        message: 'You triggered Kessler syndrome. NASA has revoked your contractor license permanently.',
        intensity: 'critical',
      });
    } else if (state.budget < ECONOMY.INSOLVENCY_LIMIT) {
      state.status = 'terminated';
      state.gameOver = true;
      state.gameOverReason = 'Insolvency';
      clearAllPlayerTimeouts(socketId);
      socket.emit('game_over', {
        status: 'terminated',
        reason: state.gameOverReason,
        finalScore: state.totalCleared,
        finalBudget: state.budget,
        message: 'Your debt exceeded -$500. NASA bailiffs have repossessed your fleet.',
      });
      socket.emit('boss_taunt', {
        message: "You're bankrupt. Security is escorting your belongings to the space incinerator.",
        intensity: 'critical',
      });
    }

    // Broadcast updated state
    socket.emit('state_update', {
      status: state.status,
      budget: state.budget,
      kesslerRisk: parseFloat(state.kesslerRisk.toFixed(1)),
      fleetLevel: state.fleetLevel,
      deployTimeSeconds: Math.max(1, 5 - (state.fleetLevel - 1) * 0.8),
      upgradeCost: state.upgradeCost,
      zones: state.zones,
      activeTugs: state.activeTugs,
      gameOver: state.gameOver,
      gameOverReason: state.gameOverReason,
      totalCleared: state.totalCleared,
    });
  }
}, 2500);

httpServer.listen(port, () => {
  console.log(`[Kessler Tycoon Server] Online at http://localhost:${port}`);
  console.log(`[Kessler Tycoon Server] Health check: http://localhost:${port}/api/health`);
});
