import { forwardRef } from 'react';

const ALPHA_FROSTED_PILL = {
  background: 'rgba(6, 17, 32, 0.78)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255, 255, 255, 0.25)',
  borderRadius: '9999px',
  boxShadow:
    '0 16px 40px rgba(0, 0, 0, 0.55), inset 0 1px 1px rgba(255, 255, 255, 0.2)',
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
      {/* Top Center: Alpha Project Frosted Glass HUD Pill */}
      <div
        style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '8px 22px',
          ...ALPHA_FROSTED_PILL,
          pointerEvents: 'auto',
          maxWidth: 'calc(100vw - 32px)',
          boxSizing: 'border-box',
        }}
      >
        {/* Mission Selector Button inside Pill */}
        <button
          type="button"
          onClick={onOpenLevelModal}
          title="Select Mission (1–8)"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--sky, #38BDF8)',
            fontFamily: '"Instrument Sans", "Inter", sans-serif',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            cursor: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 8px',
            borderRadius: '9999px',
            transition: 'background 0.15s ease',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <span>MISSION 0{currentLevel}</span>
          <span style={{ opacity: 0.5 }}>::</span>
          <span style={{ color: '#FFFFFF' }}>{displayLevelName}</span>
          <span style={{ fontSize: '9px', opacity: 0.7, marginLeft: '2px' }}>▼</span>
        </button>

        {/* Divider */}
        <div style={{ width: '1px', height: '16px', background: 'rgba(255, 255, 255, 0.2)' }} />

        {/* Score */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
          <span
            style={{
              fontFamily: '"Instrument Sans", "Inter", sans-serif',
              fontSize: '11px',
              fontWeight: 700,
              color: 'rgba(255, 255, 255, 0.65)',
              letterSpacing: '0.1em',
            }}
          >
            SCORE
          </span>
          <span
            ref={scoreRef}
            style={{
              fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, monospace',
              fontSize: '18px',
              fontWeight: 700,
              color: '#FFFFFF',
              letterSpacing: '-0.02em',
              minWidth: '24px',
            }}
          >
            0
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '16px', background: 'rgba(255, 255, 255, 0.2)' }} />

        {/* Fuel Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
          <span
            style={{
              fontFamily: '"Instrument Sans", "Inter", sans-serif',
              fontSize: '11px',
              fontWeight: 700,
              color: 'rgba(255, 255, 255, 0.65)',
              letterSpacing: '0.1em',
            }}
          >
            FUEL
          </span>
          <div
            style={{
              width: '100px',
              height: '8px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '9999px',
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
                background: 'var(--sky, #38BDF8)',
                boxShadow: '0 0 8px rgba(56, 189, 248, 0.6)',
                borderRadius: '9999px',
                transition: 'width 0.05s linear',
              }}
            />
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '16px', background: 'rgba(255, 255, 255, 0.2)' }} />

        {/* Hint button (?) */}
        <button
          type="button"
          onClick={onToggleHint}
          title="Toggle Mission Hint [H]"
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: showHint
              ? '1.5px solid var(--sky, #38BDF8)'
              : '1px solid rgba(255, 255, 255, 0.25)',
            background: showHint
              ? 'rgba(56, 189, 248, 0.2)'
              : 'rgba(255, 255, 255, 0.05)',
            color: showHint ? 'var(--sky, #38BDF8)' : '#FFFFFF',
            fontFamily: '"Instrument Sans", "Inter", sans-serif',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
            padding: 0,
            lineHeight: 1,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--sky, #38BDF8)';
            e.currentTarget.style.background = 'rgba(56, 189, 248, 0.25)';
          }}
          onMouseLeave={(e) => {
            if (!showHint) {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            }
          }}
        >
          ?
        </button>

        {/* Reset button (↻) */}
        <button
          type="button"
          onClick={onReset}
          title="Reset Level [R]"
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            background: 'rgba(255, 255, 255, 0.05)',
            color: '#FFFFFF',
            fontFamily: '"Instrument Sans", "Inter", sans-serif',
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
            padding: 0,
            lineHeight: 1,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--pink, #FF2D95)';
            e.currentTarget.style.background = 'rgba(255, 45, 149, 0.25)';
            e.currentTarget.style.color = 'var(--pink, #FF2D95)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.color = '#FFFFFF';
          }}
        >
          ↻
        </button>
      </div>

      {/* Retrograde / Prograde Compass Cue placed cleanly at bottom center */}
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '4px 16px',
          ...ALPHA_FROSTED_PILL,
          fontFamily: '"Instrument Sans", "Inter", sans-serif',
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          pointerEvents: 'none',
          opacity: 0.85,
        }}
      >
        <span style={{ color: 'var(--sky, #38BDF8)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>◀</span> RETROGRADE (CLEAN)
        </span>
        <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>|</span>
        <span style={{ color: 'var(--pink, #FF2D95)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          PROGRADE (HAZARD) <span>▶</span>
        </span>
      </div>

      {/* Target Data Panel: Visible only when grabbed == true */}
      <div
        ref={targetPanelRef}
        style={{
          position: 'fixed',
          bottom: '24px',
          left: '24px',
          width: '280px',
          padding: '18px 22px',
          background: 'rgba(6, 17, 32, 0.82)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.25)',
          borderRadius: '24px',
          boxSizing: 'border-box',
          boxShadow:
            '0 16px 40px rgba(0, 0, 0, 0.55), inset 0 1px 1px rgba(255, 255, 255, 0.2)',
          display: 'none',
          flexDirection: 'column',
          gap: '10px',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            fontFamily: '"Instrument Sans", "Inter", sans-serif',
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--sky, #38BDF8)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>TARGET LOCK</span>
          <span style={{ color: '#FFFFFF' }}>ACTIVE</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: '"Instrument Sans", "Inter", sans-serif', fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>
            OBJECT ID
          </span>
          <span
            ref={noradRef}
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: '13px',
              fontWeight: 700,
              color: '#FFFFFF',
            }}
          >
            SAT-01
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: '"Instrument Sans", "Inter", sans-serif', fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>
            PAYLOAD MASS
          </span>
          <span
            ref={massRef}
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--sky, #38BDF8)',
            }}
          >
            25 kg
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: '"Instrument Sans", "Inter", sans-serif', fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>
            TRAJECTORY
          </span>
          <span
            ref={lifetimeRef}
            style={{
              fontFamily: '"Instrument Sans", "Inter", sans-serif',
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--sky, #38BDF8)',
            }}
          >
            0 Years (Deorbit)
          </span>
        </div>
      </div>
    </div>
  );
});

export default HUD;
