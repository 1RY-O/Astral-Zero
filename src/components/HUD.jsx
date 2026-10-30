import { forwardRef } from 'react';

const FROSTED_PILL = {
  background: 'rgba(6, 13, 31, 0.6)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  borderRadius: '9999px',
  boxShadow:
    '0 8px 32px rgba(0, 0, 0, 0.45), inset 0 1px 1px rgba(255, 255, 255, 0.12)',
};

const HUD = forwardRef(function HUD(
  {
    scoreRef,
    fuelBarRef,
    targetPanelRef,
    noradRef,
    massRef,
    lifetimeRef,
    currentLevel = 1,
    levelName = 'First Contact',
    onOpenLevelModal,
    onReset,
    onToggleHint,
    showHint = false,
    visible = true,
  },
  _ref,
) {
  const displayLevelName =
    currentLevel === 2
      ? 'TWO-BODY PROBLEM: GRAVITY ASSIST'
      : levelName.toUpperCase();

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
      {/* Top-Left: Score, Mission Selector, Reset, Hint Pills */}
      <div
        style={{
          position: 'fixed',
          top: '28px',
          left: '32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          alignItems: 'flex-start',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Score Pill */}
          <div
            style={{
              ...FROSTED_PILL,
              padding: '6px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
                fontSize: '11px',
                fontWeight: 700,
                color: 'rgba(255, 255, 255, 0.6)',
                letterSpacing: '0.12em',
              }}
            >
              SCORE
            </span>
            <span
              ref={scoreRef}
              style={{
                fontFamily: 'var(--font-numeric, monospace)',
                fontSize: '20px',
                fontWeight: 700,
                color: '#FFFFFF',
                letterSpacing: '-0.02em',
              }}
            >
              0
            </span>
          </div>

          {/* Mission Selector Pill */}
          <button
            type="button"
            onClick={onOpenLevelModal}
            style={{
              ...FROSTED_PILL,
              pointerEvents: 'auto',
              padding: '8px 16px',
              color: 'var(--sky)',
              fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              cursor: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'border-color 0.15s ease, background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--sky)';
              e.currentTarget.style.background = 'rgba(56, 189, 248, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.background = 'rgba(6, 13, 31, 0.6)';
            }}
          >
            <span>
              MISSION 0{currentLevel}: {displayLevelName}
            </span>
            <span style={{ fontSize: '9px', opacity: 0.8 }}>▼</span>
          </button>
        </div>

        {/* Action Controls: Reset & Hint Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Reset Icon Button Pill */}
          <button
            type="button"
            onClick={onReset}
            title="Reset Mission [R]"
            style={{
              ...FROSTED_PILL,
              pointerEvents: 'auto',
              padding: '6px 14px',
              color: 'var(--white)',
              fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              cursor: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'border-color 0.15s ease, background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--pink)';
              e.currentTarget.style.background = 'rgba(255, 45, 149, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.background = 'rgba(6, 13, 31, 0.6)';
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ display: 'block' }}
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <span>RESET</span>
            <span style={{ opacity: 0.5, fontSize: '10px' }}>[R]</span>
          </button>

          {/* Hint Icon Button Pill */}
          <button
            type="button"
            onClick={onToggleHint}
            title="Toggle Mission Hint [H]"
            style={{
              ...FROSTED_PILL,
              pointerEvents: 'auto',
              padding: '6px 14px',
              color: showHint ? 'var(--sky)' : 'var(--white)',
              borderColor: showHint ? 'var(--sky)' : 'rgba(255, 255, 255, 0.15)',
              background: showHint
                ? 'rgba(56, 189, 248, 0.16)'
                : 'rgba(6, 13, 31, 0.6)',
              fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              cursor: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--sky)';
            }}
            onMouseLeave={(e) => {
              if (!showHint) {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
              }
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ display: 'block' }}
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>HINT</span>
            <span style={{ opacity: 0.5, fontSize: '10px' }}>[H]</span>
          </button>
        </div>
      </div>

      {/* Center-Screen: Frosted Subtle Compass UI */}
      <div
        style={{
          position: 'fixed',
          top: '28px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '8px 24px',
          ...FROSTED_PILL,
          fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.08em',
        }}
      >
        <span
          style={{
            color: 'var(--sky)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>◀</span> RETROGRADE (-X)
        </span>
        <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>|</span>
        <span
          style={{
            color: 'var(--pink)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          PROGRADE (+X) <span>▶</span>
        </span>
      </div>

      {/* Top-Right: Delta-V Budget Frosted Pill */}
      <div
        style={{
          position: 'fixed',
          top: '28px',
          right: '32px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '8px 20px',
          ...FROSTED_PILL,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
            fontSize: '11px',
            fontWeight: 700,
            color: 'rgba(255, 255, 255, 0.8)',
            letterSpacing: '0.1em',
          }}
        >
          DELTA-V
        </div>
        <div
          style={{
            width: '140px',
            height: '8px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '9999px',
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.12)',
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
              borderRadius: '9999px',
              transition: 'width 0.05s linear',
            }}
          />
        </div>
      </div>

      {/* Bottom-Left: Target Data Panel (Frosted Glass Card) */}
      <div
        ref={targetPanelRef}
        style={{
          position: 'fixed',
          bottom: '36px',
          left: '32px',
          width: '290px',
          padding: '20px 24px',
          background: 'rgba(6, 13, 31, 0.6)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '24px',
          boxSizing: 'border-box',
          boxShadow:
            '0 16px 40px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.15)',
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
              color: '#FFFFFF',
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
              color: '#FFFFFF',
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
