/**
 * Kessler Tycoon — Dashboard Component
 * Corrupted CRT terminal with central real-time orbital canvas & Roblox Tycoon progression.
 * Built for the NASA International Space Apps Challenge 2026.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  playCashChime,
  playTugLaunch,
  playZap,
  playUpgradeDing,
  playPurgeAlarm,
} from '../audio.js';
import '../styles/glitch.css';

export const getKesslerColor = (risk) => {
  const val = parseFloat(risk);
  if (val < 50) return '#4CAF50';
  if (val < 80) return '#FFC107';
  return '#FF2D95';
};

const RING_CONFIG = {
  LEO: { r: 75, color: '#38BDF8', speed: 0.018 },
  MEO: { r: 125, color: '#818CF8', speed: 0.010 },
  GEO: { r: 175, color: '#FF2D95', speed: 0.005 },
};

export default function TycoonDashboard({
  socket,
  systemOnline = true,
  onBackToMenu,
}) {
  const [gameState, setGameState] = useState({
    budget: 1000,
    kesslerRisk: 10.0,
    fleetLevel: 1,
    deployTimeSeconds: 5,
    upgradeCost: 500,
    zones: {
      LEO: { id: 'LEO', name: 'Low Earth Orbit (LEO)', altitude: '160 - 2,000 km', debris: 12, basePayout: 350, autoTug: false, autoCost: 1500 },
      MEO: { id: 'MEO', name: 'Medium Earth Orbit (MEO)', altitude: '2,000 - 35,786 km', debris: 18, basePayout: 550, autoTug: false, autoCost: 3000 },
      GEO: { id: 'GEO', name: 'Geostationary Orbit (GEO)', altitude: '35,786 km', debris: 25, basePayout: 900, autoTug: false, autoCost: 5000 },
    },
    activeTugs: [],
    gameOver: false,
    gameOverReason: null,
    totalCleared: 0,
  });

  const [screenFlashed, setScreenFlashed] = useState(false);
  const [floatingTexts, setFloatingTexts] = useState([]);
  const canvasRef = useRef(null);

  // Persistent visual simulation state in ref (debris angles, active tug visuals, laser sparks)
  const simRef = useRef({
    debrisByZone: {
      LEO: Array.from({ length: 12 }, (_, i) => ({ id: `leo-${i}`, theta: (i / 12) * Math.PI * 2 })),
      MEO: Array.from({ length: 18 }, (_, i) => ({ id: `meo-${i}`, theta: (i / 18) * Math.PI * 2 })),
      GEO: Array.from({ length: 25 }, (_, i) => ({ id: `geo-${i}`, theta: (i / 25) * Math.PI * 2 })),
    },
    tugVisuals: new Map(), // tugId -> { zoneId, startedAt, duration, targetTheta, zapped: false }
    sparks: [], // laser zap spark particles
    time: 0,
  });

  // Spawn floating reward text
  const spawnFloatingReward = (text, x, y, color = '#4CAF50') => {
    const id = `float-${Date.now()}-${Math.random()}`;
    setFloatingTexts((prev) => [
      ...prev,
      { id, text, color, x: x || 250, y: y || 140 },
    ]);

    setTimeout(() => {
      setFloatingTexts((prev) => prev.filter((item) => item.id !== id));
    }, 1300);
  };

  // Sync debris dot counts in simRef when gameState.zones updates
  useEffect(() => {
    Object.entries(gameState.zones).forEach(([zoneId, zone]) => {
      const currentList = simRef.current.debrisByZone[zoneId] || [];
      const targetCount = Math.max(0, zone.debris);

      if (currentList.length < targetCount) {
        // Add new debris dots
        const toAdd = targetCount - currentList.length;
        for (let i = 0; i < toAdd; i++) {
          currentList.push({
            id: `${zoneId.toLowerCase()}-${Date.now()}-${Math.random()}`,
            theta: Math.random() * Math.PI * 2,
          });
        }
      } else if (currentList.length > targetCount) {
        // Remove excess
        currentList.length = targetCount;
      }
      simRef.current.debrisByZone[zoneId] = currentList;
    });
  }, [gameState.zones]);

  // Sync active tugs into simRef
  useEffect(() => {
    const existing = simRef.current.tugVisuals;
    const activeIds = new Set(gameState.activeTugs.map((t) => t.tugId));

    // Remove finished tugs
    for (const [id] of existing) {
      if (!activeIds.has(id)) {
        existing.delete(id);
      }
    }

    // Add new tugs
    gameState.activeTugs.forEach((tug) => {
      if (!existing.has(tug.tugId)) {
        // Assign target debris angle in that zone
        const debrisList = simRef.current.debrisByZone[tug.zoneId] || [];
        const targetTheta = debrisList.length > 0 ? debrisList[0].theta : Math.random() * Math.PI * 2;
        existing.set(tug.tugId, {
          zoneId: tug.zoneId,
          startedAt: tug.startedAt,
          duration: tug.duration,
          targetTheta,
          zapped: false,
        });
      }
    });
  }, [gameState.activeTugs]);

  // Socket state listeners
  useEffect(() => {
    if (!socket) return;

    function handleState(payload) {
      setGameState((prev) => ({
        ...prev,
        ...payload,
        zones: payload.zones || prev.zones,
        activeTugs: payload.activeTugs || prev.activeTugs,
      }));
    }

    function handleTugSuccess(payload) {
      playCashChime();
      setScreenFlashed(true);
      setTimeout(() => setScreenFlashed(false), 150);

      const payout = payload?.payout || 350;
      spawnFloatingReward(`+$${payout}`, 260 + (Math.random() - 0.5) * 60, 120, '#4CAF50');
      spawnFloatingReward(`+1 CLEARED`, 260 + (Math.random() - 0.5) * 60, 145, '#38BDF8');
    }

    function handlePurgeSuccess() {
      playPurgeAlarm();
      setScreenFlashed(true);
      setTimeout(() => setScreenFlashed(false), 350);
      spawnFloatingReward(`ORBIT PURGED!`, 250, 130, '#FF2D95');
    }

    socket.on('init_game', handleState);
    socket.on('state_update', handleState);
    socket.on('tug_success', handleTugSuccess);
    socket.on('purge_success', handlePurgeSuccess);
    socket.on('game_over', (payload) => {
      setGameState((prev) => ({
        ...prev,
        gameOver: true,
        gameOverReason: payload?.reason || 'TERMINATED',
      }));
    });

    return () => {
      socket.off('init_game', handleState);
      socket.off('state_update', handleState);
      socket.off('tug_success', handleTugSuccess);
      socket.off('purge_success', handlePurgeSuccess);
      socket.off('game_over');
    };
  }, [socket]);

  // Central Visual Canvas rendering loop (Earth + 3 Orbital Rings + Debris Dots + Flying Tugs + Zap Lasers)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId;

    const render = () => {
      animId = requestAnimationFrame(render);
      simRef.current.time += 0.016;

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      ctx.clearRect(0, 0, w, h);

      // 1. Deep Space background with subtle ambient stars
      ctx.fillStyle = '#061120';
      ctx.fillRect(0, 0, w, h);

      // Ambient faint stars
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      for (let i = 0; i < 40; i++) {
        const sx = (i * 97) % w;
        const sy = (i * 61) % h;
        ctx.fillRect(sx, sy, 1.5, 1.5);
      }

      // 2. Draw 3 Concentric Orbital Rings (LEO, MEO, GEO)
      Object.entries(RING_CONFIG).forEach(([zoneId, config]) => {
        ctx.save();
        ctx.strokeStyle = `${config.color}55`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(cx, cy, config.r, 0, Math.PI * 2);
        ctx.stroke();

        // Ring name tag
        ctx.setLineDash([]);
        ctx.fillStyle = config.color;
        ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(zoneId, cx - config.r - 6, cy + 4);
        ctx.restore();
      });

      // 3. Draw Debris Dots orbiting around Earth
      Object.entries(simRef.current.debrisByZone).forEach(([zoneId, debrisList]) => {
        const config = RING_CONFIG[zoneId];
        if (!config) return;

        debrisList.forEach((debris) => {
          debris.theta += config.speed; // rotate with orbital speed
          const dx = cx + Math.cos(debris.theta) * config.r;
          const dy = cy + Math.sin(debris.theta) * config.r;

          // Draw small glowing debris dot
          ctx.save();
          ctx.fillStyle = '#E2E8F0';
          ctx.shadowColor = config.color;
          ctx.shadowBlur = 4;
          ctx.beginPath();
          ctx.arc(dx, dy, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      });

      // 4. Draw Center Planet Earth
      const earthR = 34;
      const earthGrad = ctx.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, earthR);
      earthGrad.addColorStop(0, '#38BDF8');
      earthGrad.addColorStop(0.5, '#0284C7');
      earthGrad.addColorStop(1, '#082F49');

      // Atmosphere glow
      ctx.save();
      ctx.shadowColor = '#38BDF8';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(cx, cy, earthR + 3, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Earth body
      ctx.beginPath();
      ctx.arc(cx, cy, earthR, 0, Math.PI * 2);
      ctx.fillStyle = earthGrad;
      ctx.fill();

      // Continents
      ctx.fillStyle = '#10B981';
      ctx.beginPath();
      ctx.ellipse(cx - 6, cy - 8, 8, 12, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 8, cy + 8, 7, 10, -0.3, 0, Math.PI * 2);
      ctx.fill();

      // Earth label
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('EARTH', cx, cy + 3);
      ctx.restore();

      // 5. Draw Active Tugs Flying Earth ⇄ Ring + Laser Zap Effect
      const now = Date.now();
      simRef.current.tugVisuals.forEach((tug, tugId) => {
        const config = RING_CONFIG[tug.zoneId] || RING_CONFIG.LEO;
        const elapsed = (now - tug.startedAt) / 1000;
        const pct = Math.min(1.0, elapsed / tug.duration);

        let currentR;
        let currentAngle;
        let headingAngle;
        let isReturning = false;

        if (pct < 0.45) {
          // Outbound flight from Earth to Ring
          const t = pct / 0.45;
          currentR = earthR + (config.r - earthR) * t;
          currentAngle = tug.targetTheta;
          headingAngle = currentAngle; // facing outward
        } else if (pct < 0.55) {
          // At destination: Zap Phase!
          currentR = config.r;
          currentAngle = tug.targetTheta;
          headingAngle = currentAngle;

          // Trigger Zap sound and sparks on first frame of zap phase
          if (!tug.zapped) {
            tug.zapped = true;
            playZap();

            // Spawn laser spark particles at zap location
            const zx = cx + Math.cos(currentAngle) * currentR;
            const zy = cy + Math.sin(currentAngle) * currentR;
            for (let s = 0; s < 8; s++) {
              simRef.current.sparks.push({
                x: zx,
                y: zy,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 1.0,
                color: config.color,
              });
            }

            // Remove one debris dot visually
            const debrisList = simRef.current.debrisByZone[tug.zoneId];
            if (debrisList && debrisList.length > 0) {
              debrisList.shift();
            }
          }

          // Draw Laser Zap Beam from Tug to Debris
          const tx = cx + Math.cos(currentAngle) * currentR;
          const ty = cy + Math.sin(currentAngle) * currentR;
          ctx.save();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2.5;
          ctx.shadowColor = config.color;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx + (Math.random() - 0.5) * 12, ty + (Math.random() - 0.5) * 12);
          ctx.stroke();
          ctx.restore();
        } else {
          // Inbound flight from Ring back to Earth
          const t = (pct - 0.55) / 0.45;
          currentR = config.r - (config.r - earthR) * t;
          currentAngle = tug.targetTheta;
          headingAngle = currentAngle + Math.PI; // facing inward back to Earth
          isReturning = true;
        }

        const tugX = cx + Math.cos(currentAngle) * currentR;
        const tugY = cy + Math.sin(currentAngle) * currentR;

        // Draw Small Glowing Triangle (The Tug)
        ctx.save();
        ctx.translate(tugX, tugY);
        ctx.rotate(headingAngle);

        // Thruster glow trail
        ctx.fillStyle = isReturning ? '#FFC107' : config.color;
        ctx.shadowColor = config.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(8, 0); // nose pointing in heading direction
        ctx.lineTo(-7, -5);
        ctx.lineTo(-4, 0);
        ctx.lineTo(-7, 5);
        ctx.closePath();
        ctx.fill();

        // Tug label
        ctx.restore();
        ctx.fillStyle = config.color;
        ctx.font = '9px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(isReturning ? 'RETURNING' : 'TUG', tugX, tugY - 9);
      });

      // 6. Draw Laser Spark Particles
      for (let i = simRef.current.sparks.length - 1; i >= 0; i--) {
        const sp = simRef.current.sparks[i];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.life -= 0.04;

        if (sp.life <= 0) {
          simRef.current.sparks.splice(i, 1);
        } else {
          ctx.save();
          ctx.fillStyle = sp.color;
          ctx.globalAlpha = sp.life;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, []);

  // Actions
  const handleDeployTug = (zoneId) => {
    if (!socket || gameState.gameOver) return;
    playTugLaunch();
    socket.emit('deploy_tug', { zone: zoneId });
  };

  const handleBuyAutoTug = (zoneId) => {
    if (!socket || gameState.gameOver) return;
    playUpgradeDing();
    socket.emit('buy_auto_tug', { zoneId });
  };

  const handleUpgradeFleet = () => {
    if (!socket || gameState.gameOver) return;
    playUpgradeDing();
    socket.emit('upgrade_fleet');
  };

  const handleEmergencyPurge = (zoneId) => {
    if (!socket || gameState.gameOver) return;
    socket.emit('emergency_purge', { zone: zoneId });
  };

  const handleRestart = () => {
    if (!socket) return;
    socket.emit('restart_game');
  };

  const risk = gameState.kesslerRisk;
  const isHighRisk = risk >= 80;
  const riskColor = getKesslerColor(risk);
  const isBroke = gameState.budget < 200;
  const isNegative = gameState.budget < 0;

  return (
    <div
      className={`crt-overlay ${isHighRisk && !gameState.gameOver ? 'violent-shake' : ''}`}
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflowY: 'auto',
        backgroundColor: '#061120',
        color: '#FFFFFF',
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        padding: '1.2rem',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Screen flash on critical events */}
      {screenFlashed && (
        <div
          className="flash-hotpink"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            pointerEvents: 'none',
            zIndex: 9998,
          }}
        />
      )}

      {/* Floating Cash Reward Text Elements */}
      {floatingTexts.map((f) => (
        <div
          key={f.id}
          className="float-reward-text"
          style={{
            left: `${f.x}px`,
            top: `${f.y}px`,
            color: f.color,
            textShadow: `0 0 10px ${f.color}`,
          }}
        >
          {f.text}
        </div>
      ))}

      {/* TOP HEADER: Contractor Status, Budget & Fleet Specs */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '0.8rem',
          borderBottom: '1px solid rgba(109, 74, 255, 0.4)',
          paddingBottom: '0.8rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: systemOnline ? '#4CAF50' : '#FF2D95',
                boxShadow: `0 0 10px ${systemOnline ? '#4CAF50' : '#FF2D95'}`,
              }}
            />
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: 800,
                color: systemOnline ? '#4CAF50' : '#FF2D95',
                letterSpacing: '1px',
              }}
            >
              {systemOnline ? 'SYSTEM ONLINE' : 'DISCONNECTED'}
            </span>
          </div>

          <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>|</span>
          <span style={{ fontSize: '0.85rem', color: '#7DD3FC' }}>
            KESSLER TYCOON // CONTRACTOR #ODPO-2026-X
          </span>
          <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>|</span>
          <span style={{ fontSize: '0.85rem', color: '#4CAF50' }}>
            TOTAL DEBRIS CLEARED: {gameState.totalCleared}
          </span>
        </div>

        {/* Financial & Fleet Readout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div
            className="wireframe-box"
            style={{
              padding: '6px 14px',
              borderColor: isNegative ? '#FF2D95' : isBroke ? '#FFC107' : '#4CAF50',
            }}
          >
            <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.7)' }}>BUDGET: </span>
            <span
              style={{
                fontSize: '1.15rem',
                fontWeight: 900,
                color: isNegative ? '#FF2D95' : isBroke ? '#FFC107' : '#4CAF50',
              }}
            >
              ${gameState.budget.toLocaleString()}
            </span>
          </div>

          <div
            className="wireframe-box"
            style={{
              padding: '6px 14px',
              borderColor: '#6d4aff',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span style={{ fontSize: '0.75rem', color: '#38BDF8' }}>
              FLEET SPEED: MK-{gameState.fleetLevel} ({gameState.deployTimeSeconds}s)
            </span>
            <button
              onClick={handleUpgradeFleet}
              disabled={gameState.budget < gameState.upgradeCost || gameState.fleetLevel >= 5}
              style={{
                background: '#6d4aff',
                color: '#FFFFFF',
                border: 'none',
                padding: '4px 10px',
                fontSize: '0.75rem',
                fontWeight: 800,
                cursor: gameState.budget < gameState.upgradeCost || gameState.fleetLevel >= 5 ? 'not-allowed' : 'pointer',
                opacity: gameState.budget < gameState.upgradeCost || gameState.fleetLevel >= 5 ? 0.45 : 1,
              }}
            >
              {gameState.fleetLevel >= 5 ? 'MAX' : `UPGRADE ($${gameState.upgradeCost})`}
            </button>
          </div>

          <button
            onClick={onBackToMenu}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              color: 'rgba(255, 255, 255, 0.7)',
              padding: '6px 12px',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            MENU
          </button>
        </div>
      </div>

      {/* TOP KESSLER RISK METER */}
      <div
        className="wireframe-box"
        style={{
          padding: '12px 18px',
          marginBottom: '1rem',
          borderColor: riskColor,
          boxShadow: `0 0 20px ${riskColor}40`,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '6px',
            flexWrap: 'wrap',
            gap: '6px',
          }}
        >
          <span
            style={{
              fontSize: '0.95rem',
              fontWeight: 900,
              letterSpacing: '2px',
              color: riskColor,
            }}
          >
            GLOBAL KESSLER CASCADE RISK: {risk}%
          </span>
          <span
            style={{
              fontSize: '0.75rem',
              color: isHighRisk ? '#FF2D95' : 'rgba(255, 255, 255, 0.65)',
            }}
          >
            {isHighRisk
              ? '⚠ CRITICAL THRESHOLD: COLLAPSE IMMINENT (BLENDER PROTOCOL)'
              : 'LIMIT: 100% COLLAPSE // INSOLVENCY LIMIT: -$500'}
          </span>
        </div>

        {/* Progress bar */}
        <div
          style={{
            width: '100%',
            height: '14px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '2px',
            overflow: 'hidden',
            border: `1px solid ${riskColor}88`,
          }}
        >
          <div
            className={isHighRisk ? 'progress-active' : ''}
            style={{
              width: `${Math.min(100, risk)}%`,
              height: '100%',
              backgroundColor: riskColor,
              boxShadow: `0 0 16px ${riskColor}`,
              transition: 'width 0.3s ease, background-color 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* CENTRAL VISUAL AREA: ORBITAL RADAR CANVAS (EARTH + 3 RINGS + TUGS + ZAP LASERS) */}
      <div
        className="wireframe-box"
        style={{
          marginBottom: '1.2rem',
          padding: '6px',
          borderColor: '#6d4aff',
          boxShadow: '0 0 20px rgba(109, 74, 255, 0.3)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '4px 10px 6px 10px',
            borderBottom: '1px solid rgba(109, 74, 255, 0.3)',
            fontSize: '0.72rem',
          }}
        >
          <span style={{ color: '#38BDF8', fontWeight: 800 }}>
            [LIVE ORBITAL RADAR — EARTH LEO / MEO / GEO RINGS]
          </span>
          <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
            CLICK "DEPLOY TUG" TO LAUNCH INTERCEPTOR & CLEAR DEBRIS
          </span>
        </div>

        <canvas
          ref={canvasRef}
          width={920}
          height={300}
          style={{
            width: '100%',
            height: '300px',
            display: 'block',
            backgroundColor: '#061120',
          }}
        />
      </div>

      {/* THE 3 ORBITAL ZONE CARDS: LEO, MEO, GEO */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
          gap: '16px',
          flex: 1,
          marginBottom: '1rem',
        }}
      >
        {Object.values(gameState.zones).map((zone) => {
          const activeInZone = gameState.activeTugs.filter((t) => t.zoneId === zone.id);
          const isLeo = zone.id === 'LEO';
          const isMeo = zone.id === 'MEO';
          const accentColor = isLeo ? '#38BDF8' : isMeo ? '#818CF8' : '#FF2D95';
          const canAffordAuto = gameState.budget >= zone.autoCost;

          return (
            <div
              key={zone.id}
              className="wireframe-box"
              style={{
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                borderColor: accentColor,
                boxShadow: `0 0 15px ${accentColor}25`,
              }}
            >
              <div>
                {/* Zone Header */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    borderBottom: `1px solid ${accentColor}44`,
                    paddingBottom: '8px',
                    marginBottom: '12px',
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: '1.05rem',
                      fontWeight: 900,
                      color: '#FFFFFF',
                      letterSpacing: '1px',
                    }}
                  >
                    {zone.name}
                  </h3>
                  <span style={{ fontSize: '0.72rem', color: accentColor, fontWeight: 700 }}>
                    {zone.altitude}
                  </span>
                </div>

                {/* Simplified Stats (Clean & High Contrast) */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                      DEBRIS:
                    </span>
                    <span
                      style={{
                        fontSize: '1.6rem',
                        fontWeight: 900,
                        color: zone.debris > 20 ? '#FF2D95' : zone.debris > 10 ? '#FFC107' : '#4CAF50',
                      }}
                    >
                      {zone.debris}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: '4px',
                    }}
                  >
                    <span style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.55)' }}>
                      PAYOUT:
                    </span>
                    <span style={{ fontSize: '1rem', color: '#4CAF50', fontWeight: 800 }}>
                      +${Math.round(zone.basePayout * (1 + (gameState.fleetLevel - 1) * 0.4))}
                    </span>
                  </div>

                  {activeInZone.length > 0 && (
                    <div style={{ marginTop: '8px', fontSize: '0.72rem', color: accentColor }}>
                      ⚡ {activeInZone.length} TUG{activeInZone.length > 1 ? 'S' : ''} ACTIVE IN FLIGHT
                    </div>
                  )}
                </div>
              </div>

              {/* Actions & Progression (Tycoon Loop) */}
              <div>
                {/* Large Responsive "Deploy Tug" Button */}
                <button
                  className={
                    isLeo
                      ? 'chunky-deploy-btn'
                      : isMeo
                        ? 'chunky-deploy-btn chunky-deploy-meo'
                        : 'chunky-deploy-btn chunky-deploy-geo'
                  }
                  onClick={() => handleDeployTug(zone.id)}
                  disabled={gameState.budget < 200 || zone.debris === 0 || gameState.gameOver}
                  style={{ width: '100%', marginBottom: '8px' }}
                >
                  🚀 DEPLOY TUG ($200) [{gameState.deployTimeSeconds}s]
                </button>

                {/* Progression Display: Next Upgrade */}
                {zone.autoTug ? (
                  <div className="auto-badge-pulse">
                    ⚡ AUTO-TUG ACTIVE (AUTO-CLEARING)
                  </div>
                ) : (
                  <div className={`upgrade-goal-box ${canAffordAuto ? '' : 'locked'}`}>
                    <div style={{ fontSize: '0.72rem', marginBottom: '6px', fontWeight: 700 }}>
                      NEXT UPGRADE: AUTO-TUG (${zone.autoCost.toLocaleString()})
                    </div>
                    <button
                      className="upgrade-goal-btn"
                      onClick={() => handleBuyAutoTug(zone.id)}
                      disabled={!canAffordAuto || gameState.gameOver}
                    >
                      {canAffordAuto
                        ? `BUY AUTO-TUG ($${zone.autoCost.toLocaleString()})`
                        : `LOCKED: NEED $${zone.autoCost.toLocaleString()}`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* EMERGENCY PURGE ACTION */}
      <div
        className="wireframe-box"
        style={{
          padding: '12px 18px',
          borderColor: '#FF2D95',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 900, color: '#FF5FB0' }}>
            EMERGENCY ORBITAL PURGE
          </div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.65)' }}>
            Instantly vaporizes all debris in an orbital zone with a high-energy laser burn. Spikes Kessler Risk by +20%.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {['LEO', 'MEO', 'GEO'].map((z) => (
            <button
              key={z}
              className="action-danger-btn"
              onClick={() => handleEmergencyPurge(z)}
              disabled={gameState.budget < 1000 || gameState.gameOver}
            >
              PURGE {z} ($1,000)
            </button>
          ))}
        </div>
      </div>

      {/* GAME OVER SCREEN WITH CRT SHUTDOWN ANIMATION */}
      {gameState.gameOver && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(6, 17, 32, 0.96)',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <div className="crt-shutdown" style={{ maxWidth: '650px', width: '100%' }}>
            <div
              className="wireframe-box glitch-aberration"
              style={{
                borderColor: '#FF2D95',
                padding: '2.5rem',
                boxShadow: '0 0 30px rgba(255, 45, 149, 0.6)',
              }}
            >
              <div
                style={{
                  fontSize: '0.85rem',
                  letterSpacing: '3px',
                  color: '#FF2D95',
                  marginBottom: '1rem',
                  fontWeight: 700,
                }}
              >
                [TERMINATION PROTOCOL EXECUTED // NASA FLIGHT CONTROL]
              </div>

              <h1
                style={{
                  fontSize: '2.4rem',
                  color: '#FFFFFF',
                  margin: '0 0 1rem 0',
                  textShadow: '-2px 0 #FF2D95, 2px 0 #6d4aff',
                }}
              >
                CONTRACTOR TERMINATED
              </h1>

              <div
                style={{
                  fontSize: '1rem',
                  color: '#FFC107',
                  marginBottom: '1.2rem',
                  lineHeight: 1.5,
                }}
              >
                REASON: {gameState.gameOverReason}
              </div>

              <div
                style={{
                  fontSize: '0.85rem',
                  color: 'rgba(255, 255, 255, 0.7)',
                  marginBottom: '1.8rem',
                }}
              >
                Total Debris Cleared Before Collapse: <strong>{gameState.totalCleared}</strong>
              </div>

              <button
                className="glitch-btn"
                onClick={handleRestart}
                style={{
                  backgroundColor: '#FF2D95',
                  borderColor: '#FF2D95',
                  color: '#FFFFFF',
                  padding: '14px 28px',
                  fontSize: '1.1rem',
                }}
              >
                REAPPLY FOR CONTRACT ($1,000 SEED)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
