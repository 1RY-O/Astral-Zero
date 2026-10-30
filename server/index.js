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
      name: 'Low Earth Orbit (LEO)',
      altitude: '160 - 2,000 km',
      debris: 12,
      basePayout: 350,
      riskImpact: 1.2,
      dangerLevel: 'CRITICAL CONGESTION',
    },
    MEO: {
      id: 'MEO',
      name: 'Medium Earth Orbit (MEO)',
      altitude: '2,000 - 35,786 km',
      debris: 18,
      basePayout: 550,
      riskImpact: 2.4,
      dangerLevel: 'MODERATE SHIELDING',
    },
    GEO: {
      id: 'GEO',
      name: 'Geostationary Orbit (GEO)',
      altitude: '35,786 km',
      debris: 25,
      basePayout: 900,
      riskImpact: 4.0,
      dangerLevel: 'LETHAL VELOCITY',
    },
  };
}

// Map socketId -> player game state
const players = new Map();

function createPlayerState(socketId) {
  return {
    socketId,
    budget: 1000,
    kesslerRisk: 10.0,
    fleetLevel: 1, // deploy time = Math.max(1, 6 - fleetLevel) seconds
    zones: getInitialZones(),
    activeTugs: [],
    gameOver: false,
    gameOverReason: null,
    totalCleared: 0,
    lastActionAt: Date.now(),
    lastIdleTauntAt: 0,
    lastRiskTauntAt: 0,
    lastBrokeTauntAt: 0,
  };
}

io.on('connection', (socket) => {
  console.log(`[Kessler Tycoon Server] Contractor connected: ${socket.id}`);
  const state = createPlayerState(socket.id);
  players.set(socket.id, state);

  function emitTaunt(message, intensity = 'medium') {
    socket.emit('boss_taunt', { message, intensity, timestamp: Date.now() });
  }

  function emitState() {
    socket.emit('state_update', {
      budget: state.budget,
      kesslerRisk: parseFloat(state.kesslerRisk.toFixed(1)),
      fleetLevel: state.fleetLevel,
      deployTimeSeconds: Math.max(1, 6 - state.fleetLevel),
      upgradeCost: 500,
      zones: state.zones,
      activeTugs: state.activeTugs,
      gameOver: state.gameOver,
      gameOverReason: state.gameOverReason,
      totalCleared: state.totalCleared,
    });
  }

  // Initial connection greeting
  socket.emit('init_game', {
    budget: state.budget,
    kesslerRisk: state.kesslerRisk,
    fleetLevel: state.fleetLevel,
    deployTimeSeconds: 5,
    upgradeCost: 500,
    zones: state.zones,
  });

  emitTaunt("NASA privatization protocol active. Don't bankrupt us on your first day.");

  // Action: Deploy Tug
  socket.on('deploy_tug', (payload = {}) => {
    state.lastActionAt = Date.now();
    if (state.gameOver) return;

    const zoneId = payload.zone || 'LEO';
    const zone = state.zones[zoneId];
    if (!zone) return;

    if (zone.debris <= 0) {
      emitTaunt(`Zone ${zoneId} has no debris to clear, genius.`);
      return;
    }

    const deployCost = 200;
    state.budget -= deployCost;

    const deployDuration = Math.max(1, 6 - state.fleetLevel);
    const tugId = `tug-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    state.activeTugs.push({
      tugId,
      zoneId,
      duration: deployDuration,
      startedAt: Date.now(),
    });

    emitState();

    // Check if broke (< $100)
    if (state.budget < 100 && Date.now() - state.lastBrokeTauntAt > 8000) {
      state.lastBrokeTauntAt = Date.now();
      emitTaunt("You're bankrupt. My toaster has more processing power than your company.");
    }

    // Schedule tug completion
    setTimeout(() => {
      // Find and remove tug
      const idx = state.activeTugs.findIndex((t) => t.tugId === tugId);
      if (idx !== -1) {
        state.activeTugs.splice(idx, 1);
      }

      if (state.gameOver) return;

      if (zone.debris > 0) {
        zone.debris -= 1;
        state.totalCleared += 1;
        const payoutMultiplier = 1 + (state.fleetLevel - 1) * 0.35;
        const payout = Math.round(zone.basePayout * payoutMultiplier);
        state.budget += payout;
        state.kesslerRisk = Math.max(0, state.kesslerRisk - 1.8);

        socket.emit('tug_success', {
          tugId,
          zoneId,
          payout,
          clearedDebris: 1,
        });

        if (zone.debris === 0) {
          emitTaunt("Finally. You did the bare minimum. Don't expect a raise.");
        }
      }

      emitState();
    }, deployDuration * 1000);
  });

  // Action: Upgrade Fleet
  socket.on('upgrade_fleet', () => {
    state.lastActionAt = Date.now();
    if (state.gameOver) return;

    const upgradeCost = 500;
    if (state.budget < upgradeCost) {
      emitTaunt('Insufficient funds. You cannot even afford a bolt, contractor.');
      return;
    }

    if (state.fleetLevel >= 5) {
      emitTaunt('Fleet is already at peak orbital spec.');
      return;
    }

    state.budget -= upgradeCost;
    state.fleetLevel += 1;

    emitState();
    emitTaunt("Oh look, you bought a shiny new toy. Too bad you're still bad at your job.");
  });

  // Action: Emergency Purge
  socket.on('emergency_purge', (payload = {}) => {
    state.lastActionAt = Date.now();
    if (state.gameOver) return;

    const purgeCost = 1000;
    if (state.budget < purgeCost) {
      emitTaunt('Emergency laser burn requires $1,000 cash upfront.');
      return;
    }

    const zoneId = payload.zone || 'LEO';
    const zone = state.zones[zoneId];
    if (!zone) return;

    state.budget -= purgeCost;
    const cleared = zone.debris;
    zone.debris = 0;
    state.totalCleared += cleared;

    // Purge spikes Kessler Risk by 20%
    state.kesslerRisk = Math.min(100, state.kesslerRisk + 20.0);

    socket.emit('purge_success', {
      zoneId,
      clearedDebris: cleared,
      riskSpike: 20.0,
    });

    if (state.kesslerRisk >= 80 && Date.now() - state.lastRiskTauntAt > 6000) {
      state.lastRiskTauntAt = Date.now();
      emitTaunt('Orbit is turning into a blender. Do your job.');
    }

    emitState();
  });

  // Action: Restart Game
  socket.on('restart_game', () => {
    const fresh = createPlayerState(socket.id);
    players.set(socket.id, fresh);
    fresh.lastActionAt = Date.now();
    socket.emit('init_game', {
      budget: fresh.budget,
      kesslerRisk: fresh.kesslerRisk,
      fleetLevel: fresh.fleetLevel,
      deployTimeSeconds: 5,
      upgradeCost: 500,
      zones: fresh.zones,
    });
    emitTaunt("Telemetry reset. Try not to embarrass NASA this time.");
  });

  socket.on('disconnect', () => {
    console.log(`[Kessler Tycoon Server] Contractor disconnected: ${socket.id}`);
    players.delete(socket.id);
  });
});

// Server 3-second simulation loop & idle checker
setInterval(() => {
  const now = Date.now();

  for (const [socketId, state] of players.entries()) {
    if (state.gameOver) continue;

    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;

    // 1. Natural debris accumulation over time
    // LEO accumulates fastest (+2), MEO (+1 every tick), GEO (+1 every other tick)
    state.zones.LEO.debris += 2;
    state.zones.MEO.debris += 1;
    if (Math.random() > 0.4) {
      state.zones.GEO.debris += 1;
    }

    // 2. Risk increases with total debris
    const totalDebris =
      state.zones.LEO.debris + state.zones.MEO.debris + state.zones.GEO.debris;
    const riskIncrement = 0.6 + totalDebris * 0.035;
    state.kesslerRisk = Math.min(100, state.kesslerRisk + riskIncrement);

    // 3. Idle check (10 seconds without action)
    if (now - state.lastActionAt >= 10000 && now - state.lastIdleTauntAt >= 12000) {
      state.lastIdleTauntAt = now;
      socket.emit('boss_taunt', {
        message: 'Are you dead, or just incompetent? Deploy a tug.',
        intensity: 'high',
        timestamp: now,
      });
    }

    // 4. High Risk Taunt (> 80%)
    if (state.kesslerRisk >= 80 && now - state.lastRiskTauntAt >= 10000) {
      state.lastRiskTauntAt = now;
      socket.emit('boss_taunt', {
        message: 'Orbit is turning into a blender. Do your job.',
        intensity: 'high',
        timestamp: now,
      });
    }

    // 5. Fail state check: Risk >= 100% OR Budget < -$500
    if (state.kesslerRisk >= 100) {
      state.gameOver = true;
      state.gameOverReason = 'KESSLER SYNDROME TRIGGERED (100% RISK)';
      socket.emit('game_over', {
        reason: state.gameOverReason,
        finalScore: state.totalCleared,
        message: 'Orbit has collapsed into a cascading storm of shrapnel. You are terminated.',
      });
      socket.emit('boss_taunt', {
        message: 'You triggered Kessler syndrome. NASA has revoked your contractor license permanently.',
        intensity: 'critical',
      });
    } else if (state.budget < -500) {
      state.gameOver = true;
      state.gameOverReason = 'CORPORATE INSOLVENCY (DEBT EXCEEDED -$500)';
      socket.emit('game_over', {
        reason: state.gameOverReason,
        finalScore: state.totalCleared,
        message: 'Your debt exceeded -$500. NASA bailiffs have repossessed your fleet.',
      });
      socket.emit('boss_taunt', {
        message: "You're bankrupt. Security is escorting your belongings to the space incinerator.",
        intensity: 'critical',
      });
    }

    // Broadcast updated state
    socket.emit('state_update', {
      budget: state.budget,
      kesslerRisk: parseFloat(state.kesslerRisk.toFixed(1)),
      fleetLevel: state.fleetLevel,
      deployTimeSeconds: Math.max(1, 6 - state.fleetLevel),
      upgradeCost: 500,
      zones: state.zones,
      activeTugs: state.activeTugs,
      gameOver: state.gameOver,
      gameOverReason: state.gameOverReason,
      totalCleared: state.totalCleared,
    });
  }
}, 3000);

httpServer.listen(port, () => {
  console.log(`[Kessler Tycoon Server] Online at http://localhost:${port}`);
  console.log(`[Kessler Tycoon Server] Health check: http://localhost:${port}/api/health`);
});
