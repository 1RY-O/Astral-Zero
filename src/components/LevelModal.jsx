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

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(6, 13, 31, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
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
          maxWidth: '100%',
          background: 'var(--night)',
          border: '2px solid var(--sky)',
          borderRadius: '24px',
          padding: '36px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8), 0 0 30px rgba(56, 189, 248, 0.25)',
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
                fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--sky)',
                letterSpacing: '0.14em',
                marginBottom: '4px',
              }}
            >
              MISSION 0{currentDef.id} :: DEORBIT COMMAND
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
                fontSize: '28px',
                fontWeight: 700,
                color: 'var(--white)',
                margin: 0,
              }}
            >
              {isEndState
                ? state === 'cleared'
                  ? 'MISSION SUCCESSFUL'
                  : 'MISSION ABORTED'
                : currentDef.name}
            </h2>
          </div>

          {!isEndState && (
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: 'var(--white)',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
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
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '16px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Operation Score</span>
              <span style={{ color: 'var(--white)', fontWeight: 700, fontSize: '18px' }}>
                {score}
              </span>
            </div>
            {state === 'cleared' && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Delta-V Fuel Bonus</span>
                <span style={{ color: 'var(--sky)', fontWeight: 700 }}>+{fuelBonus} PTS</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Rule Compliance</span>
              <span style={{ color: 'var(--sky)', fontWeight: 700 }}>NASA 25-Year Standard</span>
            </div>
          </div>
        ) : (
          <div
            style={{
              fontFamily: 'var(--font-body, "Inter", sans-serif)',
              fontSize: '14px',
              color: 'rgba(255, 255, 255, 0.85)',
              lineHeight: 1.6,
            }}
          >
            <p style={{ margin: '0 0 10px 0' }}>{currentDef.hint}</p>
            <div style={{ fontSize: '12px', color: 'var(--sky)' }}>
              Delta-V Allocation: {currentDef.fuelMax} kg/s
            </div>
          </div>
        )}

        {/* Level Select Grid */}
        <div>
          <div
            style={{
              fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
              fontSize: '11px',
              fontWeight: 700,
              color: 'rgba(255, 255, 255, 0.5)',
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
                    borderRadius: '12px',
                    border: active ? '2px solid var(--sky)' : '1px solid rgba(255, 255, 255, 0.15)',
                    background: active ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                    color: active ? 'var(--sky)' : 'var(--white)',
                    fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'none',
                    textAlign: 'center',
                    transition: 'all 0.15s ease',
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
          {isEndState && state === 'cleared' && currentLevel < 8 ? (
            <button
              type="button"
              onClick={onNextLevel}
              style={{
                flex: 1,
                padding: '14px',
                borderRadius: '99px',
                border: 'none',
                background: 'var(--pink)',
                color: 'var(--white)',
                fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'none',
                letterSpacing: '0.04em',
              }}
            >
              NEXT MISSION →
            </button>
          ) : (
            <button
              type="button"
              onClick={onRetry}
              style={{
                flex: 1,
                padding: '14px',
                borderRadius: '99px',
                border: 'none',
                background: isEndState && state === 'failed' ? 'var(--pink)' : 'var(--sky)',
                color: isEndState && state === 'failed' ? 'var(--white)' : 'var(--night)',
                fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'none',
                letterSpacing: '0.04em',
              }}
            >
              {isEndState ? 'RETRY MISSION' : 'DEPLOY TUG'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
