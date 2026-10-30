import { forwardRef } from 'react';

const TutorialOverlay = forwardRef(function TutorialOverlay(
  { levelId = 1, step = 1, visible = true },
  _ref,
) {
  if (!visible || levelId !== 1) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '120px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 60,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          background: 'rgba(6, 13, 31, 0.92)',
          border: '1.5px solid var(--sky)',
          borderRadius: '16px',
          padding: '12px 28px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7), 0 0 20px rgba(56, 189, 248, 0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            background: step === 3 ? 'var(--pink)' : 'var(--sky)',
            color: 'var(--night)',
            padding: '3px 8px',
            borderRadius: '6px',
          }}
        >
          STEP {step} / 3
        </span>

        <span
          style={{
            fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--white)',
            letterSpacing: '0.02em',
          }}
        >
          {step === 1 && 'GRAB PAYLOAD: Click the satellite or press [E] to connect tether'}
          {step === 2 && 'CENTRIFUGAL SWING: Hold [SPACE] to fire thruster and swing in an arc'}
          {step === 3 && 'RETROGRADE FLING: Release [Q / Mouse-Up] while aimed LEFT (◄) into atmosphere'}
        </span>
      </div>

      <div
        style={{
          fontFamily: 'var(--font-body, "Inter", sans-serif)',
          fontSize: '12px',
          color: 'rgba(255, 255, 255, 0.65)',
        }}
      >
        NASA 25-Year Rule: Prograde releases raise apogee (+penalty). Retrograde lowers perigee (+bonus).
      </div>
    </div>
  );
});

export default TutorialOverlay;
