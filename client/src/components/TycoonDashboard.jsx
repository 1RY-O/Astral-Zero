/**
 * HELIOS PROTOCOL: Space Weather Superhero Tycoon
 * TycoonDashboard.jsx — Master Corrupted CRT Dashboard & Cash Inc Visual Feedback
 * Built for the NASA International Space Apps Challenge 2026.
 */

import React, { useState, useEffect, useRef } from 'react';
import ScienceAndSources from './ScienceAndSources.jsx';
import {
  playCashChime,
  playHeroLaunch,
  playFlareAbsorption,
  playUpgradeDing,
  playShieldOvercharge,
} from '../audio.js';
import '../styles/glitch.css';

export const getIntegrityColor = (integrity) => {
  const val = parseFloat(integrity);
  if (val > 65) return '#4CAF50';
  if (val >= 35) return '#FFC107';
  return '#FF2D95';
};

export default function TycoonDashboard({
  socket,
  systemOnline = true,
  onBackToMenu,
}) {
  const [gameState, setGameState] = useState({
    budget: 1000,
    fundingCredits: 1000,
    magnetosphereIntegrity: 100.0,
    departments: {
      solar_obs: {
        id: 'solar_obs',
        name: 'Solar Observation Centre',
        role: 'Rapid Flare Interception & Manual Response',
        classification: 'LIVE OBSERVATION',
        scienceSource: 'NASA SDO AIA',
        threatName: 'X-Class & M-Class Solar Flares',
        threatCount: 6,
        level: 1,
        automated: false,
        baseCost: 150,
        basePayout: 320,
        baseIntegrityRestore: 2.8,
        baseDuration: 3.0,
        autoCost: 600,
        upgradeCost: 400,
      },
      research_lab: {
        id: 'research_lab',
        name: 'Space Weather Research Lab',
        role: 'Automated CME Trajectory & Plasma Analysis',
        classification: 'SCIENTIFIC FORECAST',
        scienceSource: 'NASA DONKI / Enlil Model',
        threatName: 'Coronal Mass Ejections (CMEs)',
        threatCount: 4,
        level: 1,
        automated: false,
        baseCost: 350,
        basePayout: 750,
        baseIntegrityRestore: 5.5,
        baseDuration: 5.0,
        autoCost: 1200,
        upgradeCost: 800,
      },
      sat_defense: {
        id: 'sat_defense',
        name: 'Satellite Protection Division',
        role: 'Geomagnetic Deflection & Orbital Grid Defense',
        classification: 'SIMULATED HERO MISSION',
        scienceSource: 'NOAA SWPC K-Index',
        threatName: 'Geomagnetic Storm Shockwaves',
        threatCount: 3,
        level: 1,
        automated: false,
        baseCost: 700,
        basePayout: 1600,
        baseIntegrityRestore: 10.0,
        baseDuration: 7.0,
        autoCost: 2500,
        upgradeCost: 1500,
      },
    },
    activeMissions: [],
    gameOver: false,
    gameOverReason: null,
    totalEventsMitigated: 0,
    totalCreditsEarned: 1000,
    solarTelemetry: {
      sdoFlareClass: 'M5.4',
      donkiCmeSpeed: '1,320 km/s',
      noaaKpIndex: 6.4,
      stormStatus: 'G3 (STRONG STORM)',
      solarWindSpeed: '590 km/s',
      cyclePhase: 'Solar Cycle 25 Maximum',
    },
  });

  const [localMissionProgress, setLocalMissionProgress] = useState({});
  const [screenFlashed, setScreenFlashed] = useState(false);
  const [showScienceModal, setShowScienceModal] = useState(false);
  const [floatingTexts, setFloatingTexts] = useState([]);
  const [absorbedMissions, setAbsorbedMissions] = useState(new Set());
  const canvasRef = useRef(null);

  // Floating text spawn helper
  const spawnFloatingReward = (text, color = '#4CAF50') => {
    const id = `float-${Date.now()}-${Math.random()}`;
    const xOffset = (Math.random() - 0.5) * 80;
    setFloatingTexts((prev) => [
      ...prev,
      { id, text, color, x: 140 + xOffset, y: 110 },
    ]);

    setTimeout(() => {
      setFloatingTexts((prev) => prev.filter((item) => item.id !== id));
    }, 1400);
  };

  // Socket state listeners
  useEffect(() => {
    if (!socket) return;

    function handleState(payload) {
      setGameState((prev) => {
        const nextBudget = payload.fundingCredits !== undefined ? payload.fundingCredits : payload.budget;
        const nextIntegrity = payload.magnetosphereIntegrity !== undefined
          ? payload.magnetosphereIntegrity
          : (payload.kesslerRisk !== undefined ? Math.max(0, 100 - payload.kesslerRisk) : prev.magnetosphereIntegrity);

        return {
          ...prev,
          ...payload,
          budget: nextBudget !== undefined ? nextBudget : prev.budget,
          fundingCredits: nextBudget !== undefined ? nextBudget : prev.fundingCredits,
          magnetosphereIntegrity: nextIntegrity,
          departments: payload.departments || prev.departments,
          activeMissions: payload.activeMissions || payload.activeTugs || prev.activeMissions,
          totalEventsMitigated: payload.totalEventsMitigated !== undefined ? payload.totalEventsMitigated : prev.totalEventsMitigated,
        };
      });
    }

    function handleMissionSuccess(payload) {
      playCashChime();
      setScreenFlashed(true);
      setTimeout(() => setScreenFlashed(false), 200);

      const payout = payload.payout || 320;
      const integrity = payload.integrityGain || 2.5;
      spawnFloatingReward(`+${payout} CREDITS`, '#4CAF50');
      spawnFloatingReward(`+${integrity}% SHIELD`, '#38BDF8');
    }

    function handleShieldSuccess() {
      playShieldOvercharge();
      setScreenFlashed(true);
      setTimeout(() => setScreenFlashed(false), 400);
      spawnFloatingReward(`+20% DIPOLE SHIELD`, '#7DD3FC');
    }

    socket.on('init_game', handleState);
    socket.on('state_update', handleState);
    socket.on('mission_success', handleMissionSuccess);
    socket.on('tug_success', handleMissionSuccess); // compatibility
    socket.on('shield_success', handleShieldSuccess);
    socket.on('purge_success', handleShieldSuccess);
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
      socket.off('mission_success', handleMissionSuccess);
      socket.off('tug_success', handleMissionSuccess);
      socket.off('shield_success', handleShieldSuccess);
      socket.off('purge_success', handleShieldSuccess);
      socket.off('game_over');
    };
  }, [socket]);

  // Client-side visual progress timer for active hero missions & solar flare absorption check
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const nextProgress = {};

      for (const m of gameState.activeMissions) {
        const id = m.missionId || m.tugId;
        const elapsed = (now - m.startedAt) / 1000;
        const pct = Math.min(100, Math.round((elapsed / m.duration) * 100));
        nextProgress[id] = pct;

        // When hero reaches 50% (the Sun), trigger solar flare absorption sound & effect
        if (pct >= 50 && !absorbedMissions.has(id)) {
          absorbedMissions.add(id);
          playFlareAbsorption();
        }
      }

      setLocalMissionProgress(nextProgress);
    }, 50);

    return () => clearInterval(interval);
  }, [gameState.activeMissions, absorbedMissions]);

  // Canvas visual rendering for interplanetary Earth-to-Sun corridor
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId;
    let particleTime = 0;

    const render = () => {
      animId = requestAnimationFrame(render);
      particleTime += 0.025;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // 1. Draw Starfield & Space Background
      ctx.fillStyle = '#061120';
      ctx.fillRect(0, 0, w, h);

      // Subtle solar wind stream particles flowing from Sun (right) to Earth (left)
      ctx.fillStyle = 'rgba(255, 184, 0, 0.25)';
      for (let i = 0; i < 28; i++) {
        const px = ((1000 - (particleTime * 120 + i * 36)) % (w - 180)) + 90;
        const py = (Math.sin(particleTime + i) * 0.5 + 0.5) * (h - 40) + 20;
        ctx.fillRect(px, py, 2.5, 1.5);
      }

      // 2. Draw Earth (Left side at x = 70, y = h/2)
      const earthX = 70;
      const earthY = h / 2;
      const earthR = 32;

      // Earth Body
      const earthGrad = ctx.createRadialGradient(earthX - 8, earthY - 8, 4, earthX, earthY, earthR);
      earthGrad.addColorStop(0, '#38BDF8');
      earthGrad.addColorStop(0.5, '#0284C7');
      earthGrad.addColorStop(1, '#0C4A6E');
      ctx.beginPath();
      ctx.arc(earthX, earthY, earthR, 0, Math.PI * 2);
      ctx.fillStyle = earthGrad;
      ctx.fill();

      // Earth Continent accents
      ctx.fillStyle = '#10B981';
      ctx.beginPath();
      ctx.ellipse(earthX - 4, earthY - 6, 8, 12, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(earthX + 8, earthY + 6, 6, 9, -0.3, 0, Math.PI * 2);
      ctx.fill();

      // Magnetosphere Shield (Dynamic Dipole Field Lines)
      const integrity = gameState.magnetosphereIntegrity;
      const shieldColor = getIntegrityColor(integrity);
      const pulse = Math.sin(particleTime * 4) * 3;

      ctx.save();
      ctx.strokeStyle = shieldColor;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = shieldColor;
      ctx.shadowBlur = 12 + pulse;

      // Bow Shock curve facing the Sun
      ctx.beginPath();
      ctx.arc(earthX, earthY, earthR + 16 + pulse, -Math.PI * 0.45, Math.PI * 0.45);
      ctx.stroke();

      // Dipole field line loops
      ctx.strokeStyle = `${shieldColor}66`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(earthX, earthY, earthR + 24, earthR + 12, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Earth Label
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('EARTH', earthX, earthY + earthR + 20);
      ctx.fillStyle = shieldColor;
      ctx.fillText(`${integrity}% SHIELD`, earthX, earthY + earthR + 32);

      // 3. Draw The Sun (Right side at x = w - 75, y = h/2)
      const sunX = w - 75;
      const sunY = h / 2;
      const sunR = 44;

      // Pulsing Solar Corona
      const coronaGrad = ctx.createRadialGradient(sunX, sunY, sunR * 0.6, sunX, sunY, sunR + 35 + pulse);
      coronaGrad.addColorStop(0, 'rgba(255, 215, 0, 0.9)');
      coronaGrad.addColorStop(0.4, 'rgba(255, 87, 34, 0.6)');
      coronaGrad.addColorStop(0.8, 'rgba(255, 45, 149, 0.3)');
      coronaGrad.addColorStop(1, 'rgba(255, 45, 149, 0)');

      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR + 35 + pulse, 0, Math.PI * 2);
      ctx.fillStyle = coronaGrad;
      ctx.fill();

      // Sun Body
      const sunBodyGrad = ctx.createRadialGradient(sunX - 10, sunY - 10, 8, sunX, sunY, sunR);
      sunBodyGrad.addColorStop(0, '#FFFFFF');
      sunBodyGrad.addColorStop(0.3, '#FDE047');
      sunBodyGrad.addColorStop(0.7, '#EA580C');
      sunBodyGrad.addColorStop(1, '#991B1B');

      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
      ctx.fillStyle = sunBodyGrad;
      ctx.fill();

      // Solar flare prominences / CME loops
      ctx.save();
      ctx.strokeStyle = '#FDE047';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#FF2D95';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(sunX - sunR + 4, sunY - 18, 14, 0, Math.PI * 1.5);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(sunX - sunR + 6, sunY + 16, 18, -Math.PI * 0.4, Math.PI * 0.8);
      ctx.stroke();
      ctx.restore();

      // Sun Label
      ctx.fillStyle = '#FDE047';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SOLAR CORONA', sunX, sunY + sunR + 20);
      ctx.fillStyle = '#FF5FB0';
      ctx.fillText(`FLARE: ${gameState.solarTelemetry.sdoFlareClass}`, sunX, sunY + sunR + 32);

      // 4. Draw Active Hero Ships Flying Earth ⇄ Sun
      const corridorStart = earthX + earthR + 10;
      const corridorEnd = sunX - sunR - 10;
      const corridorDist = corridorEnd - corridorStart;

      gameState.activeMissions.forEach((m, idx) => {
        const id = m.missionId || m.tugId;
        const pct = localMissionProgress[id] || 0;

        // Position: 0% to 50% = Earth to Sun; 50% to 100% = Sun to Earth
        let shipX;
        let isReturning = false;
        if (pct < 50) {
          // Outbound
          const subPct = pct / 50;
          shipX = corridorStart + corridorDist * subPct;
          isReturning = false;
        } else {
          // Returning with absorbed solar flare
          const subPct = (pct - 50) / 50;
          shipX = corridorEnd - corridorDist * subPct;
          isReturning = true;
        }

        // Distinct flight corridor lane based on index
        const laneOffset = ((idx % 3) - 1) * 22;
        const shipY = earthY + laneOffset;

        // Draw Ship Thruster Trail
        ctx.save();
        ctx.strokeStyle = isReturning ? '#FDE047' : '#38BDF8';
        ctx.lineWidth = 3;
        ctx.shadowColor = isReturning ? '#FF5722' : '#0284C7';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(shipX + (isReturning ? 14 : -14), shipY);
        ctx.lineTo(shipX + (isReturning ? 30 : -30), shipY);
        ctx.stroke();

        // Draw Hero Ship Icon
        ctx.fillStyle = isReturning ? '#FBBF24' : '#FFFFFF';
        ctx.beginPath();
        if (!isReturning) {
          // Facing Right (towards Sun)
          ctx.moveTo(shipX + 12, shipY);
          ctx.lineTo(shipX - 8, shipY - 7);
          ctx.lineTo(shipX - 3, shipY);
          ctx.lineTo(shipX - 8, shipY + 7);
        } else {
          // Facing Left (towards Earth) carrying absorbed flare
          ctx.moveTo(shipX - 12, shipY);
          ctx.lineTo(shipX + 8, shipY - 7);
          ctx.lineTo(shipX + 3, shipY);
          ctx.lineTo(shipX + 8, shipY + 7);
        }
        ctx.closePath();
        ctx.fill();

        // If returning, draw captured glowing plasma orb
        if (isReturning) {
          ctx.fillStyle = '#FF2D95';
          ctx.shadowColor = '#FF2D95';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(shipX, shipY, 5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Ship text label
        ctx.fillStyle = isReturning ? '#FDE047' : '#7DD3FC';
        ctx.font = '9px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          isReturning ? 'PLASMA CONTAINED' : m.heroName || 'HERO CRAFT',
          shipX,
          shipY - 12
        );
        ctx.restore();
      });
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [gameState.magnetosphereIntegrity, gameState.activeMissions, localMissionProgress, gameState.solarTelemetry]);

  // Actions
  const handleDeployMission = (deptId) => {
    if (!socket || gameState.gameOver) return;
    playHeroLaunch();
    socket.emit('deploy_mission', { deptId });
  };

  const handleUpgradeDept = (deptId) => {
    if (!socket || gameState.gameOver) return;
    playUpgradeDing();
    socket.emit('upgrade_department', { deptId });
  };

  const handleBuyAutomation = (deptId) => {
    if (!socket || gameState.gameOver) return;
    playUpgradeDing();
    socket.emit('buy_automation', { deptId });
  };

  const handleEmergencyShield = () => {
    if (!socket || gameState.gameOver) return;
    socket.emit('emergency_shield');
  };

  const handleRestart = () => {
    if (!socket) return;
    socket.emit('restart_game');
  };

  const integrity = gameState.magnetosphereIntegrity;
  const isCriticalIntegrity = integrity <= 35;
  const integrityColor = getIntegrityColor(integrity);
  const credits = gameState.fundingCredits !== undefined ? gameState.fundingCredits : gameState.budget;
  const isBroke = credits < 150;
  const isNegative = credits < 0;

  return (
    <div
      className={`crt-overlay ${isCriticalIntegrity && !gameState.gameOver ? 'violent-shake' : ''}`}
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

      {/* Floating Cash Reward Elements */}
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

      {/* TOP HEADER: Director Identity, Telemetry Feed & Science Modal Trigger */}
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
              {systemOnline ? 'HELIOS ONLINE' : 'DISCONNECTED'}
            </span>
          </div>

          <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>|</span>
          <span style={{ fontSize: '0.85rem', color: '#7DD3FC' }}>
            DIRECTOR ROLE: SPACE WEATHER DEFENSE
          </span>
          <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>|</span>
          <span style={{ fontSize: '0.85rem', color: '#4CAF50' }}>
            SOLAR THREATS MITIGATED: {gameState.totalEventsMitigated}
          </span>
        </div>

        {/* Financial Readout & Science Modal Trigger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div
            className="wireframe-box"
            style={{
              padding: '6px 14px',
              borderColor: isNegative ? '#FF2D95' : isBroke ? '#FFC107' : '#4CAF50',
            }}
          >
            <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.7)' }}>
              FUNDING CREDITS:{' '}
            </span>
            <span
              style={{
                fontSize: '1.15rem',
                fontWeight: 900,
                color: isNegative ? '#FF2D95' : isBroke ? '#FFC107' : '#4CAF50',
              }}
            >
              ${credits.toLocaleString()}
            </span>
          </div>

          <button
            onClick={() => setShowScienceModal(true)}
            className="chunky-tactile-btn"
            style={{
              padding: '6px 14px',
              fontSize: '0.75rem',
              borderColor: '#38BDF8',
              letterSpacing: '1px',
            }}
          >
            🛰 NASA DATA & SOURCES
          </button>

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

      {/* LIVE SCIENTIFIC TELEMETRY TICKER */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'rgba(6, 17, 32, 0.85)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          padding: '6px 14px',
          marginBottom: '0.8rem',
          fontSize: '0.72rem',
          color: 'rgba(255, 255, 255, 0.8)',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div>
          <span style={{ color: '#38BDF8', fontWeight: 700 }}>[SDO AIA 131Å]: </span>
          <span>FLARE CLASS {gameState.solarTelemetry.sdoFlareClass} (ACTIVE REGION 3664)</span>
        </div>
        <div>
          <span style={{ color: '#FBBF24', fontWeight: 700 }}>[DONKI CME]: </span>
          <span>SPEED {gameState.solarTelemetry.donkiCmeSpeed} // 1 AU SHOCK FRONT</span>
        </div>
        <div>
          <span style={{ color: '#FF5FB0', fontWeight: 700 }}>[NOAA SWPC]: </span>
          <span>Kp-INDEX {gameState.solarTelemetry.noaaKpIndex} — {gameState.solarTelemetry.stormStatus}</span>
        </div>
      </div>

      {/* MASSIVE MAGNETOSPHERE INTEGRITY METER */}
      <div
        className="wireframe-box"
        style={{
          padding: '14px 20px',
          marginBottom: '1rem',
          borderColor: integrityColor,
          boxShadow: `0 0 20px ${integrityColor}40`,
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
              fontSize: '0.98rem',
              fontWeight: 900,
              letterSpacing: '2px',
              color: integrityColor,
            }}
          >
            EARTH MAGNETOSPHERE INTEGRITY: {integrity}%
          </span>
          <span
            style={{
              fontSize: '0.75rem',
              color: isCriticalIntegrity ? '#FF2D95' : 'rgba(255, 255, 255, 0.65)',
            }}
          >
            {isCriticalIntegrity
              ? '⚠ CRITICAL ALERT: BOW SHOCK BREACH IMMINENT (0% = PLANETARY COLLAPSE)'
              : 'DEFENSE TARGET: > 65% // INSOLVENCY LIMIT: -$500 CREDITS'}
          </span>
        </div>

        {/* Magnetosphere integrity progress bar */}
        <div
          style={{
            width: '100%',
            height: '14px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '2px',
            overflow: 'hidden',
            border: `1px solid ${integrityColor}88`,
          }}
        >
          <div
            className={isCriticalIntegrity ? 'progress-active' : ''}
            style={{
              width: `${Math.min(100, integrity)}%`,
              height: '100%',
              backgroundColor: integrityColor,
              boxShadow: `0 0 16px ${integrityColor}`,
              transition: 'width 0.3s ease, background-color 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* CASH INC VISUAL UPGRADE: INTERPLANETARY FLIGHT ARENA (EARTH ⇄ SUN) */}
      <div
        className="wireframe-box"
        style={{
          marginBottom: '1.2rem',
          padding: '8px',
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
            padding: '2px 8px 6px 8px',
            borderBottom: '1px solid rgba(109, 74, 255, 0.3)',
            fontSize: '0.72rem',
          }}
        >
          <span style={{ color: '#38BDF8', fontWeight: 800 }}>
            [HELIOS 1-AU INTERPLANETARY DEFENSE CORRIDOR]
          </span>
          <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
            HEROES FLY TO SUN → ABSORB SOLAR FLARES → RETURN WITH CREDITS
          </span>
        </div>
        <canvas
          ref={canvasRef}
          width={920}
          height={180}
          style={{
            width: '100%',
            height: '180px',
            display: 'block',
            backgroundColor: '#061120',
          }}
        />
      </div>

      {/* THE THREE HEROES & DEPARTMENTS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
          gap: '16px',
          flex: 1,
          marginBottom: '1rem',
        }}
      >
        {Object.values(gameState.departments).map((dept) => {
          const activeInDept = gameState.activeMissions.filter(
            (m) => m.deptId === dept.id || m.zoneId === dept.id
          );
          const isSolar = dept.id === 'solar_obs';
          const isResearch = dept.id === 'research_lab';
          const accentColor = isSolar ? '#38BDF8' : isResearch ? '#FBBF24' : '#FF2D95';

          return (
            <div
              key={dept.id}
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
                {/* Department Header & NASA Classification Label */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    borderBottom: `1px solid ${accentColor}44`,
                    paddingBottom: '8px',
                    marginBottom: '10px',
                  }}
                >
                  <div>
                    <span
                      className={
                        isSolar
                          ? 'badge-live-obs'
                          : isResearch
                            ? 'badge-scientific-forecast'
                            : 'badge-hero-mission'
                      }
                      style={{ display: 'inline-block', marginBottom: '4px' }}
                    >
                      {dept.classification}
                    </span>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: '1rem',
                        fontWeight: 900,
                        color: '#FFFFFF',
                        letterSpacing: '1px',
                      }}
                    >
                      {dept.name}
                    </h3>
                  </div>

                  {/* Level & Automation Status */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.75rem', color: accentColor, fontWeight: 800 }}>
                      MK-{dept.level}
                    </div>
                    {dept.automated ? (
                      <div className="auto-badge-active">⚙ AUTO ACTIVE</div>
                    ) : (
                      <button
                        className="auto-upgrade-btn"
                        onClick={() => handleBuyAutomation(dept.id)}
                        disabled={credits < dept.autoCost || gameState.gameOver}
                      >
                        ⚙ AUTOMATE (${dept.autoCost})
                      </button>
                    )}
                  </div>
                </div>

                {/* Science Source & Threat Readout */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.55)', marginBottom: '4px' }}>
                    DATA SOURCE: {dept.scienceSource}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginTop: '6px' }}>
                    <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>{dept.threatName}:</span>
                    <span
                      style={{
                        fontSize: '1.15rem',
                        fontWeight: 900,
                        color: dept.threatCount > 8 ? '#FF2D95' : '#FFC107',
                      }}
                    >
                      {dept.threatCount}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '4px' }}>
                    <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>MISSION PAYOUT:</span>
                    <span style={{ color: '#4CAF50', fontWeight: 800 }}>
                      +${Math.round(dept.basePayout * (1 + (dept.level - 1) * 0.45))} (+{dept.baseIntegrityRestore}% SHIELD)
                    </span>
                  </div>
                </div>

                {/* Active Hero Deployments */}
                {activeInDept.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '0.7rem', color: accentColor, marginBottom: '4px' }}>
                      ACTIVE HERO CRAFT IN FLIGHT ({activeInDept.length}):
                    </div>
                    {activeInDept.map((m) => {
                      const id = m.missionId || m.tugId;
                      const pct = localMissionProgress[id] || 0;
                      return (
                        <div key={id} style={{ marginBottom: '6px' }}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: '0.65rem',
                              color: 'rgba(255, 255, 255, 0.8)',
                            }}
                          >
                            <span>{pct < 50 ? 'TRANSIT TO SUN' : 'FLARE CONTAINED // RETURNING'}</span>
                            <span>{pct}%</span>
                          </div>
                          <div
                            style={{
                              width: '100%',
                              height: '6px',
                              backgroundColor: 'rgba(255, 255, 255, 0.1)',
                              borderRadius: '2px',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                backgroundColor: accentColor,
                                boxShadow: `0 0 8px ${accentColor}`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Action Buttons (Chunky & Tactile) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                <button
                  className={
                    isSolar
                      ? 'chunky-tactile-btn'
                      : isResearch
                        ? 'chunky-tactile-btn chunky-gold-btn'
                        : 'chunky-tactile-btn chunky-pink-btn'
                  }
                  onClick={() => handleDeployMission(dept.id)}
                  disabled={credits < dept.baseCost || gameState.gameOver}
                >
                  ⚡ DEPLOY MISSION (${dept.baseCost}) [{Math.max(1, dept.baseDuration - (dept.level - 1) * 0.4)}s]
                </button>

                <button
                  onClick={() => handleUpgradeDept(dept.id)}
                  disabled={credits < dept.upgradeCost || dept.level >= 5 || gameState.gameOver}
                  style={{
                    background: 'rgba(109, 74, 255, 0.2)',
                    border: '1px solid #6d4aff',
                    color: '#FFFFFF',
                    padding: '6px 12px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: credits < dept.upgradeCost || dept.level >= 5 ? 'not-allowed' : 'pointer',
                    opacity: credits < dept.upgradeCost || dept.level >= 5 ? 0.45 : 1,
                  }}
                >
                  {dept.level >= 5 ? 'MAX HARDWARE (MK-5)' : `UPGRADE HARDWARE ($${dept.upgradeCost})`}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* EMERGENCY PLANETARY DEFENSE BAR */}
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
            EMERGENCY DIPOLE COIL OVERCHARGE
          </div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.65)' }}>
            Instantly restores +20% Magnetosphere Integrity & clears 50% of active solar threats.
          </div>
        </div>

        <button
          className="action-danger-btn"
          onClick={handleEmergencyShield}
          disabled={credits < 800 || gameState.gameOver}
        >
          ⚡ OVERCHARGE DIPOLE ($800)
        </button>
      </div>

      {/* SCIENCE AND SOURCES MODAL */}
      <ScienceAndSources isOpen={showScienceModal} onClose={() => setShowScienceModal(false)} />

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
                [MISSION FAILED // PROTOCOL TERMINATED]
              </div>

              <h1
                style={{
                  fontSize: '2.2rem',
                  color: '#FFFFFF',
                  margin: '0 0 1rem 0',
                  textShadow: '-2px 0 #FF2D95, 2px 0 #6d4aff',
                }}
              >
                {gameState.gameOverReason?.includes('MAGNETOSPHERE')
                  ? 'MAGNETOSPHERE COLLAPSE'
                  : 'AGENCY INSOLVENCY'}
              </h1>

              <div
                style={{
                  fontSize: '0.95rem',
                  color: '#FFC107',
                  marginBottom: '1.2rem',
                  lineHeight: 1.5,
                }}
              >
                {gameState.gameOverReason}
              </div>

              <div
                style={{
                  fontSize: '0.85rem',
                  color: 'rgba(255, 255, 255, 0.7)',
                  marginBottom: '1.8rem',
                }}
              >
                Total Solar Events Mitigated: <strong>{gameState.totalEventsMitigated}</strong>
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
                REBOOT HELIOS PROTOCOL ($1,000 SEED)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
