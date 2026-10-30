/**
 * Debris Darling — Express + Socket.IO Backend Server
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
    game: 'Debris Darling',
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

let globalDebrisCount = 1420;
const leaderboardEntries = [];

function updateLeaderboard(socketId, payload) {
  leaderboardEntries.unshift({
    socketId,
    ...payload,
  });
  if (leaderboardEntries.length > 50) {
    leaderboardEntries.pop();
  }
}

io.on('connection', (socket) => {
  console.log(`[Debris Darling Server] Client connected: ${socket.id}`);

  socket.on('mission_join', (data = {}) => {
    const missionId = data.missionId || 'mission-default';
    socket.join(missionId);
    io.to(missionId).emit('ai_taunt', {
      message: 'Pathetic. NASA paid $2B for this script kiddie.',
      intensity: 'medium',
    });
  });

  socket.on('throw_event', (payload = {}) => {
    const { direction, mass = 1, deltaV = 0 } = payload;
    if (direction === 'prograde') {
      globalDebrisCount += 14;
      io.to(socket.id).emit('ai_anger', {
        severity: 'high',
        effect: 'chromatic_aberration',
        scorePenalty: mass * 10,
        debrisCreated: 14,
      });
      updateLeaderboard(socket.id, { kesslerContribution: true, timestamp: Date.now() });
    } else {
      globalDebrisCount = Math.max(0, globalDebrisCount - 1);
      io.to(socket.id).emit('ai_dismissal', {
        comment: 'Finally. Still only 0.003% progress.',
        xpGained: Math.floor(mass * 2),
        deltaV,
      });
    }
  });

  socket.on('request_debris_status', () => {
    socket.emit('global_stats', {
      totalDebris: globalDebrisCount,
      kesslerThreshold: 84,
      activePlayers: io.sockets.adapter.rooms.size,
    });
  });

  socket.on('disconnect', () => {
    console.log(`[Debris Darling Server] Client disconnected: ${socket.id}`);
  });
});

httpServer.listen(port, () => {
  console.log(`[Debris Darling Server] Online at http://localhost:${port}`);
  console.log(`[Debris Darling Server] Health endpoint: http://localhost:${port}/api/health`);
});
