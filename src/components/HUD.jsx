import { forwardRef } from 'react';

const HUD = forwardRef(function HUD(
  {
    scoreRef,
    fuelBarRef,
    targetPanelRef,
    noradRef,
    massRef,
    lifetimeRef,
    visible = true,
  },
  _ref,
) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 50,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.4s ease',
        userSelect: 'none',
      }}
    >
      {/* Top-Left: Score */}
      <div
        style={{
          position: 'fixed',
          top: '32px',
          left: '36px',
          fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
          fontSize: '24px',
          fontWeight: 700,
          color: 'var(--white)',
          letterSpacing: '-0.02em',
          textShadow: '0 2px 10px rgba(0, 0, 0, 0.8)',
        }}
      >
        SCORE: <span ref={scoreRef}>0</span>
      </div>

      {/* Center-Screen: Subtle Compass UI */}
      <div
        style={{
          position: 'fixed',
          top: '32px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '8px 20px',
          background: 'rgba(6, 13, 31, 0.65)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '99px',
          fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '0.06em',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
        }}
      >
        <span style={{ color: 'var(--sky)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>◀</span> RETROGRADE (-X)
        </span>
        <span style={{ color: 'rgba(255, 255, 255, 0.25)' }}>|</span>
        <span style={{ color: 'var(--pink)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          PROGRADE (+X) <span>▶</span>
        </span>
      </div>

      {/* Top-Right: Delta-V Budget */}
      <div
        style={{
          position: 'fixed',
          top: '32px',
          right: '36px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '8px',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--white)',
            letterSpacing: '0.08em',
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)',
          }}
        >
          DELTA-V BUDGET
        </div>
        <div
          style={{
            width: '200px',
            height: '8px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '99px',
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxSizing: 'border-box',
          }}
        >
          <div
            ref={fuelBarRef}
            style={{
              width: '100%',
              height: '100%',
              background: 'var(--sky)',
              boxShadow: '0 0 10px var(--sky)',
              borderRadius: '99px',
              transition: 'width 0.05s linear',
            }}
          />
        </div>
      </div>

      {/* Bottom-Left: Target Data Panel (Visible only when grabbed == true) */}
      <div
        ref={targetPanelRef}
        style={{
          position: 'fixed',
          bottom: '36px',
          left: '36px',
          width: '290px',
          padding: '20px 24px',
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.25)',
          borderRadius: '24px',
          boxSizing: 'border-box',
          boxShadow: '0 16px 36px rgba(0, 0, 0, 0.5)',
          display: 'none',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--sky)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>TARGET TELEMETRY</span>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--sky)',
              boxShadow: '0 0 8px var(--sky)',
            }}
          />
        </div>

        <div
          style={{
            height: '1px',
            background: 'rgba(255, 255, 255, 0.12)',
          }}
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '90px 1fr',
            rowGap: '8px',
            fontFamily: 'var(--font-body, "Inter", sans-serif)',
            fontSize: '13px',
          }}
        >
          <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>NORAD ID</span>
          <span
            ref={noradRef}
            style={{
              color: 'var(--white)',
              fontWeight: 600,
              fontFamily: 'var(--font-numeric, monospace)',
            }}
          >
            -
          </span>

          <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Mass</span>
          <span
            ref={massRef}
            style={{
              color: 'var(--white)',
              fontWeight: 600,
              fontFamily: 'var(--font-numeric, monospace)',
            }}
          >
            -
          </span>

          <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Lifetime</span>
          <span
            ref={lifetimeRef}
            style={{
              color: 'var(--sky)',
              fontWeight: 700,
            }}
          >
            0 Years
          </span>
        </div>
      </div>
    </div>
  );
});

export default HUD;
