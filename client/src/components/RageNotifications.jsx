import React from 'react';
import '../styles/glitch.css';

export default function RageNotifications({ notifications = [], isFlashActive = false }) {
  return (
    <>
      {/* Fullscreen Hot Pink Flash overlay on rage event */}
      {isFlashActive && (
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

      {/* Rage-Bait AI Taunt Popups */}
      <div
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxWidth: '420px',
          pointerEvents: 'none',
        }}
      >
        {notifications.map((n) => {
          const isRage = n.type === 'rage' || n.type === 'anger';
          const isWarning = n.type === 'warning';
          const borderColor = isRage ? '#FF2D95' : isWarning ? '#FFC107' : '#6d4aff';
          const textColor = isRage ? '#FF2D95' : isWarning ? '#FFC107' : '#38BDF8';

          return (
            <div
              key={n.id}
              className={`wireframe-box ${isRage ? 'glitch-aberration violent-shake' : ''}`}
              style={{
                borderColor,
                padding: '14px 18px',
                pointerEvents: 'auto',
                boxShadow: `0 0 15px ${borderColor}55`,
                backgroundColor: 'rgba(6, 17, 32, 0.95)',
              }}
            >
              <div
                style={{
                  fontSize: '0.7rem',
                  letterSpacing: '2px',
                  color: textColor,
                  marginBottom: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>[AI_MALFUNCTION // FLIGHT_DIRECTOR]</span>
                <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                  {isRage ? 'CRITICAL_RAGE' : 'TELEMETRY_LOG'}
                </span>
              </div>
              <div
                style={{
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  color: '#FFFFFF',
                  lineHeight: '1.4',
                }}
              >
                {n.text}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
