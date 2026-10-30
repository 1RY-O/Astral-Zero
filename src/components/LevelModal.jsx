import { LEVEL_DEFS } from '../game/levels.js';

export default function LevelModal({
  currentLevel = 1,
  state = null, // 'cleared' | 'failed' | null
  score = 0,
  fuel = 1,
  onSelectLevel,
  onNextLevel,
  onRetry,
  onClose,
  visible = false,
}) {
  if (!visible) return null;

  const currentDef = LEVEL_DEFS.find((l) => l.id === currentLevel) || LEVEL_DEFS[0];
  const isEndState = state === 'cleared' || state === 'failed';
  const fuelBonus = Math.round(500 * fuel);
  const displayName =
    currentDef.id === 2 ? 'Two-Body Problem: Gravity Assist' : currentDef.name;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(6, 17, 32, 0.75)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          width: '520px',
          maxWidth: 'calc(100vw - 32px)',
          background: 'rgba(6, 17, 32, 0.88)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.25)',
          borderRadius: '28px',
          padding: '36px',
          boxShadow:
            '0 24px 64px rgba(0, 0, 0, 0.7), inset 0 1px 1px rgba(255, 255, 255, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div
              style={{
                fontFamily: '"Instrument Sans", "Inter", sans-serif',
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--sky, #38BDF8)',
                letterSpacing: '0.14em',
                marginBottom: '4px',
              }}
            >
              MISSION 0{currentDef.id} :: DEORBIT COMMAND
            </div>
            <h2
              style={{
                fontFamily: '"Instrument Sans", "Inter", sans-serif',
                fontSize: '26px',
                fontWeight: 800,
                color: '#FFFFFF',
                letterSpacing: '-0.03em',
                margin: 0,
              }}
            >
              {isEndState
                ? state === 'cleared'
                  ? 'MISSION SUCCESSFUL'
                  : 'MISSION ABORTED'
                : displayName}
            </h2>
          </div>

          {!isEndState && (
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                color: '#FFFFFF',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                transition: 'border-color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Status / Mission Details */}
        {isEndState ? (
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '20px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              fontFamily: '"Instrument Sans", "Inter", sans-serif',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Operation Score</span>
              <span style={{ color: '#FFFFFF', fontWeight: 700, fontSize: '18px' }}>
                {score}
              </span>
            </div>
            {state === 'cleared' && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Delta-V Fuel Bonus</span>
                <span style={{ color: 'var(--sky, #38BDF8)', fontWeight: 700 }}>+{fuelBonus} PTS</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Rule Compliance</span>
              <span style={{ color: 'var(--sky, #38BDF8)', fontWeight: 700 }}>NASA 25-Year Standard</span>
            </div>
          </div>
        ) : (
          <div
            style={{
              fontFamily: '"Instrument Sans", "Inter", sans-serif',
              fontSize: '14px',
              color: 'rgba(255, 255, 255, 0.85)',
              lineHeight: 1.6,
            }}
          >
            <p style={{ margin: '0 0 10px 0' }}>{currentDef.hint}</p>
            <div style={{ fontSize: '12px', color: 'var(--sky, #38BDF8)', fontWeight: 600 }}>
              Delta-V Allocation: {currentDef.fuelMax} kg/s
            </div>
          </div>
        )}

        {/* Level Select Grid */}
        <div>
          <div
            style={{
              fontFamily: '"Instrument Sans", "Inter", sans-serif',
              fontSize: '11px',
              fontWeight: 700,
              color: 'rgba(255, 255, 255, 0.65)',
              letterSpacing: '0.08em',
              marginBottom: '10px',
            }}
          >
            SELECT MISSION (1–8)
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '8px',
            }}
          >
            {LEVEL_DEFS.map((lvl) => {
              const active = lvl.id === currentLevel;
              return (
                <button
                  key={lvl.id}
                  type="button"
                  onClick={() => onSelectLevel(lvl.id)}
                  style={{
                    padding: '10px 8px',
                    borderRadius: '16px',
                    border: active ? '1.5px solid var(--sky, #38BDF8)' : '1px solid rgba(255, 255, 255, 0.2)',
                    background: active ? 'rgba(56, 189, 248, 0.22)' : 'rgba(255, 255, 255, 0.04)',
                    color: active ? 'var(--sky, #38BDF8)' : '#FFFFFF',
                    fontFamily: '"Instrument Sans", "Inter", sans-serif',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'none',
                    textAlign: 'center',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                  }}
                >
                  0{lvl.id}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          {isEndState ? (
            <>
              <button
                type="button"
                onClick={onRetry}
                style={{
                  flex: 1,
                  padding: '14px',
                  borderRadius: '9999px',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  background: 'rgba(255, 255, 255, 0.06)',
                  color: '#FFFFFF',
                  fontFamily: '"Instrument Sans", "Inter", sans-serif',
                  fontSize: '15px',
                  fontWeight: 700,
                  cursor: 'none',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                }}
              >
                RETRY
              </button>
              {state === 'cleared' && currentLevel < 8 && (
                <button
                  type="button"
                  onClick={onNextLevel}
                  style={{
                    flex: 1,
                    padding: '14px',
                    borderRadius: '9999px',
                    border: 'none',
                    background: '#FF2D95',
                    color: '#FFFFFF',
                    fontFamily: '"Instrument Sans", "Inter", sans-serif',
                    fontSize: '15px',
                    fontWeight: 700,
                    cursor: 'none',
                    boxShadow: '0 8px 24px rgba(255, 45, 149, 0.45)',
                    transition: 'transform 0.15s ease, filter 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.02)';
                    e.currentTarget.style.filter = 'brightness(1.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.filter = 'none';
                  }}
                >
                  NEXT MISSION
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '9999px',
                border: 'none',
                background: '#FF2D95',
                color: '#FFFFFF',
                fontFamily: '"Instrument Sans", "Inter", sans-serif',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'none',
                boxShadow: '0 8px 24px rgba(255, 45, 149, 0.45)',
                transition: 'transform 0.15s ease, filter 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.02)';
                e.currentTarget.style.filter = 'brightness(1.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.filter = 'none';
              }}
            >
              RESUME MISSION
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
