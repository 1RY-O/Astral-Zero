import React, { useEffect, useState } from 'react';
import '../styles/glitch.css';

export const calculateKesslerRisk = (debrisCount, successfulDeorbits) => {
  const base = Math.min(debrisCount / 100, 1) * 100;
  const reduction = Math.min(successfulDeorbits / 50, 0.3) * 100;
  return Math.max(base - reduction, 0).toFixed(1);
};

export const getKesslerColor = (risk) => {
  const val = parseFloat(risk);
  if (val < 80) return '#4CAF50';
  if (val === 80) return '#FFC107';
  return '#FF2D95';
};

export default function HUD({
  debrisCount = 7,
  successfulDeorbits = 0,
  score = 0,
  fuel = 1.0,
  currentLevel = 1,
  onResetLevel,
  onBackToMenu,
}) {
  const [systemOnline, setSystemOnline] = useState(false);
  const [healthStatus, setHealthStatus] = useState('CHECKING...');

  useEffect(() => {
    let isMounted = true;
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error('Health check failed');
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          if (data.system === 'SYSTEM ONLINE' || data.status === 'ok') {
            setSystemOnline(true);
            setHealthStatus('SYSTEM ONLINE');
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setSystemOnline(false);
          setHealthStatus('OFFLINE (RETRYING)');
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const risk = calculateKesslerRisk(debrisCount, successfulDeorbits);
  const riskColor = getKesslerColor(risk);
  const fuelPercent = Math.max(0, Math.min(100, Math.round(fuel * 100)));
  const isFuelCritical = fuelPercent < 20;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        padding: '16px 20px',
        boxSizing: 'border-box',
        pointerEvents: 'none',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        zIndex: 50,
      }}
    >
      {/* Left Wireframe: System Health & Mission Stats */}
      <div
        className="wireframe-box"
        style={{
          padding: '12px 16px',
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          minWidth: '220px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: systemOnline ? '#4CAF50' : '#FF2D95',
              boxShadow: `0 0 8px ${systemOnline ? '#4CAF50' : '#FF2D95'}`,
            }}
          />
          <span
            style={{
              fontSize: '0.8rem',
              fontWeight: 700,
              color: systemOnline ? '#4CAF50' : '#FF2D95',
              letterSpacing: '1px',
            }}
          >
            {systemOnline ? 'SYSTEM ONLINE' : healthStatus}
          </span>
        </div>

        <div style={{ fontSize: '0.75rem', color: '#7DD3FC' }}>
          SECTOR: 0{currentLevel} // CORRUPTED LEO
        </div>
        <div style={{ fontSize: '0.75rem', color: '#FFFFFF' }}>
          SCORE: <span style={{ color: '#FF2D95', fontWeight: 'bold' }}>{score}</span>
        </div>
        <div style={{ fontSize: '0.75rem', color: '#FFFFFF' }}>
          CLEANED: <span style={{ color: '#4CAF50' }}>{successfulDeorbits}</span> | ACTIVE:{' '}
          <span style={{ color: '#FFC107' }}>{debrisCount}</span>
        </div>
      </div>

      {/* Center Wireframe: Kessler Risk Meter */}
      <div
        className="wireframe-box"
        style={{
          padding: '12px 20px',
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
          minWidth: '280px',
          borderColor: riskColor,
          boxShadow: `0 0 12px ${riskColor}40`,
        }}
      >
        <div
          style={{
            fontSize: '0.75rem',
            letterSpacing: '2px',
            color: riskColor,
            fontWeight: 'bold',
          }}
        >
          KESSLER CASCADE RISK: {risk}%
        </div>

        {/* Progress Bar */}
        <div
          style={{
            width: '100%',
            height: '8px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '2px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.min(100, parseFloat(risk))}%`,
              height: '100%',
              backgroundColor: riskColor,
              boxShadow: `0 0 10px ${riskColor}`,
              transition: 'width 0.3s ease, background-color 0.3s ease',
            }}
          />
        </div>

        <div style={{ fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.6)' }}>
          {parseFloat(risk) > 80
            ? '⚠ SUPERCRITICAL DEBRIS CASCADE IMMINENT'
            : parseFloat(risk) === 80
              ? '⚡ DANGER THRESHOLD REACHED'
              : '✔ SUB-CRITICAL ORBITAL STATUS'}
        </div>
      </div>

      {/* Right Wireframe: Thruster Fuel & Actions */}
      <div
        className="wireframe-box"
        style={{
          padding: '12px 16px',
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          minWidth: '200px',
          borderColor: isFuelCritical ? '#FF2D95' : '#6d4aff',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
          <span style={{ color: isFuelCritical ? '#FF2D95' : '#38BDF8', fontWeight: 'bold' }}>
            FUEL INTEGRITY
          </span>
          <span style={{ color: isFuelCritical ? '#FF2D95' : '#FFFFFF' }}>{fuelPercent}%</span>
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
              width: `${fuelPercent}%`,
              height: '100%',
              backgroundColor: isFuelCritical ? '#FF2D95' : '#38BDF8',
              boxShadow: `0 0 8px ${isFuelCritical ? '#FF2D95' : '#38BDF8'}`,
              transition: 'width 0.15s ease',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button
            onClick={onResetLevel}
            style={{
              flex: 1,
              background: 'transparent',
              border: '1px solid #38BDF8',
              color: '#38BDF8',
              padding: '4px 8px',
              fontSize: '0.65rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            RETRY
          </button>
          <button
            onClick={onBackToMenu}
            style={{
              flex: 1,
              background: 'transparent',
              border: '1px solid #FF2D95',
              color: '#FF2D95',
              padding: '4px 8px',
              fontSize: '0.65rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            ABORT
          </button>
        </div>
      </div>
    </div>
  );
}
