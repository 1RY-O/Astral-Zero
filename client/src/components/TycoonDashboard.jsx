/**
 * Kessler Tycoon — Dashboard Component
 * Corrupted CRT terminal for high-stakes orbital debris contractor management.
 * Built for the NASA International Space Apps Challenge 2026.
 */

import React, { useState, useEffect } from 'react';
import '../styles/glitch.css';

export const getKesslerColor = (risk) => {
  const val = parseFloat(risk);
  if (val < 80) return '#4CAF50';
  if (val === 80) return '#FFC107';
  return '#FF2D95';
};

export default function TycoonDashboard({
  socket,
  systemOnline = true,
  onBackToMenu,
  onTriggerTaunt,
}) {
  const [gameState, setGameState] = useState({
    budget: 1000,
    kesslerRisk: 10.0,
    fleetLevel: 1,
    deployTimeSeconds: 5,
    upgradeCost: 500,
    zones: {
      LEO: { id: 'LEO', name: 'Low Earth Orbit (LEO)', altitude: '160 - 2,000 km', debris: 12, basePayout: 350 },
      MEO: { id: 'MEO', name: 'Medium Earth Orbit (MEO)', altitude: '2,000 - 35,786 km', debris: 18, basePayout: 550 },
      GEO: { id: 'GEO', name: 'Geostationary Orbit (GEO)', altitude: '35,786 km', debris: 25, basePayout: 900 },
    },
    activeTugs: [],
    gameOver: false,
    gameOverReason: null,
    totalCleared: 0,
  });

  const [localTugProgress, setLocalTugProgress] = useState({});
  const [screenFlashed, setScreenFlashed] = useState(false);

  // Socket state listeners
  useEffect(() => {
    if (!socket) return;

    function handleState(payload) {
      setGameState((prev) => ({
        ...prev,
        ...payload,
      }));
    }

    function handleTugSuccess(payload) {
      setScreenFlashed(true);
      setTimeout(() => setScreenFlashed(false), 200);
    }

    function handlePurgeSuccess(payload) {
      setScreenFlashed(true);
      setTimeout(() => setScreenFlashed(false), 400);
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

  // Client-side visual progress timer for active tugs
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const nextProgress = {};

      for (const tug of gameState.activeTugs) {
        const elapsed = (now - tug.startedAt) / 1000;
        const pct = Math.min(100, Math.round((elapsed / tug.duration) * 100));
        nextProgress[tug.tugId] = pct;
      }

      setLocalTugProgress(nextProgress);
    }, 100);

    return () => clearInterval(interval);
  }, [gameState.activeTugs]);

  // Actions
  const handleDeployTug = (zoneId) => {
    if (!socket || gameState.gameOver) return;
    socket.emit('deploy_tug', { zone: zoneId });
  };

  const handleUpgradeFleet = () => {
    if (!socket || gameState.gameOver) return;
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
  const isBroke = gameState.budget < 100;
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

      {/* TOP HEADER: System Online, Budget & Fleet Spec */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '1rem',
          borderBottom: '1px solid rgba(109, 74, 255, 0.4)',
          paddingBottom: '0.8rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
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
                fontWeight: 700,
                color: systemOnline ? '#4CAF50' : '#FF2D95',
                letterSpacing: '1px',
              }}
            >
              {systemOnline ? 'SYSTEM ONLINE' : 'DISCONNECTED'}
            </span>
          </div>

          <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>|</span>
          <span style={{ fontSize: '0.85rem', color: '#7DD3FC' }}>
            CONTRACTOR ID: #ODPO-2026-X
          </span>
          <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>|</span>
          <span style={{ fontSize: '0.85rem', color: '#4CAF50' }}>
            TOTAL DEBRIS CLEARED: {gameState.totalCleared}
          </span>
        </div>

        {/* Financial & Fleet Readout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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
                fontSize: '1.1rem',
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
              FLEET TUG MK-{gameState.fleetLevel} ({gameState.deployTimeSeconds}s SPEED)
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
                fontWeight: 700,
                cursor: gameState.budget < gameState.upgradeCost ? 'not-allowed' : 'pointer',
                opacity: gameState.budget < gameState.upgradeCost ? 0.5 : 1,
              }}
            >
              UPGRADE (${gameState.upgradeCost})
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

      {/* MASSIVE KESSLER RISK METER (Top Center) */}
      <div
        className="wireframe-box"
        style={{
          padding: '16px 20px',
          marginBottom: '1.2rem',
          borderColor: riskColor,
          boxShadow: `0 0 20px ${riskColor}40`,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
          }}
        >
          <span
            style={{
              fontSize: '0.95rem',
              fontWeight: 800,
              letterSpacing: '2px',
              color: riskColor,
            }}
          >
            GLOBAL KESSLER CASCADE RISK: {risk}%
          </span>
          <span style={{ fontSize: '0.75rem', color: isHighRisk ? '#FF2D95' : 'rgba(255, 255, 255, 0.6)' }}>
            {isHighRisk
              ? '⚠ CRITICAL THRESHOLD: DESTRUCTION IMMINENT (BLENDER PROTOCOL)'
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

      {/* THE GRID: 3 ORBITAL ZONES (LEO, MEO, GEO) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
          flex: 1,
        }}
      >
        {Object.values(gameState.zones).map((zone) => {
          const activeTugsInZone = gameState.activeTugs.filter((t) => t.zoneId === zone.id);
          const isLeo = zone.id === 'LEO';
          const isGeo = zone.id === 'GEO';
          const accentColor = isLeo ? '#38BDF8' : isGeo ? '#FF2D95' : '#6d4aff';

          return (
            <div
              key={zone.id}
              className="wireframe-box"
              style={{
                padding: '18px',
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
                      fontWeight: 800,
                      color: '#FFFFFF',
                      letterSpacing: '1px',
                    }}
                  >
                    {zone.name}
                  </h3>
                  <span style={{ fontSize: '0.7rem', color: accentColor, fontWeight: 700 }}>
                    {zone.altitude}
                  </span>
                </div>

                {/* Debris Status */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>ACTIVE DEBRIS OBJECTS:</span>
                    <span
                      style={{
                        fontSize: '1.25rem',
                        fontWeight: 900,
                        color: zone.debris > 20 ? '#FF2D95' : '#FFC107',
                      }}
                    >
                      {zone.debris}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '4px' }}>
                    <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>CONTRACT PAYOUT / CLEAR:</span>
                    <span style={{ color: '#4CAF50', fontWeight: 700 }}>
                      +${Math.round(zone.basePayout * (1 + (gameState.fleetLevel - 1) * 0.35))}
                    </span>
                  </div>
                </div>

                {/* Active Tug Deployments in Zone */}
                {activeTugsInZone.length > 0 && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '0.7rem', color: '#38BDF8', marginBottom: '4px' }}>
                      DEPLOYED TUGS ({activeTugsInZone.length}):
                    </div>
                    {activeTugsInZone.map((tug) => {
                      const pct = localTugProgress[tug.tugId] || 0;
                      return (
                        <div key={tug.tugId} style={{ marginBottom: '6px' }}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: '0.65rem',
                              color: 'rgba(255, 255, 255, 0.8)',
                            }}
                          >
                            <span>TUG EN ROUTE</span>
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
                                backgroundColor: '#38BDF8',
                                boxShadow: '0 0 8px #38BDF8',
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                {/* Safe Action: Deploy Tug ($200) */}
                <button
                  className="action-safe-btn"
                  onClick={() => handleDeployTug(zone.id)}
                  disabled={zone.debris === 0 || gameState.gameOver}
                >
                  DEPLOY TUG ($200) [{gameState.deployTimeSeconds}s]
                </button>

                {/* Dangerous Action: Emergency Purge ($1000) */}
                <button
                  className="action-danger-btn"
                  onClick={() => handleEmergencyPurge(zone.id)}
                  disabled={gameState.budget < 1000 || zone.debris === 0 || gameState.gameOver}
                >
                  EMERGENCY PURGE ($1,000) [+20% RISK]
                </button>
              </div>
            </div>
          );
        })}
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
