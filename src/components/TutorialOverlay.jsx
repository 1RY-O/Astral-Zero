import { forwardRef } from 'react';

const LEVEL_HINTS = {
  1: {
    steps: [
      'GRAB PAYLOAD: Click the satellite or press [E] to connect tether',
      'CENTRIFUGAL SWING: Hold [SPACE] to fire thruster and swing in an arc',
      'RETROGRADE FLING: Release [Q / Mouse-Up] while aimed LEFT (◄) into atmosphere',
    ],
    rule: 'NASA 25-Year Rule: Prograde releases raise apogee (+penalty). Retrograde lowers perigee (+bonus).',
  },
  2: {
    title: 'TWO-BODY PROBLEM: GRAVITY ASSIST',
    text: 'Slingshot past the Moon! Grapple the first satellite, whip it retrograde, and use the recoil momentum to intercept and deorbit the second.',
    rule: 'Gravity assist transfer: conservation of angular momentum allows multi-target deorbits with minimal fuel.',
  },
  3: {
    title: 'CLEAN SWEEP',
    text: 'Dense debris swarm! Ram satellites together to trigger fragmentation and chain consecutive deorbits within 900ms.',
    rule: 'Cascade multiplier: 900ms causal impact window applies an n(n+1)/2 exponential scoring multiplier.',
  },
  4: {
    title: 'RICOCHET',
    text: 'Elastic orbital perimeter! Bank satellite payloads off the boundaries to deflect difficult angles down into the atmosphere.',
    rule: 'Orbital boundary reflections conserve kinetic energy, enabling retrograde angle redirections.',
  },
  5: {
    title: 'DOMINOES',
    text: 'Linear alignment! Precise timing is essential—fling objects in rapid sequence to trigger a continuous multi-satellite cascade.',
    rule: 'Rapid deorbits inside the 900ms chain window maintain continuous chain streaks for maximum score.',
  },
  6: {
    title: 'FRAGILE CARGO',
    text: 'Delicate high-mass payloads! High-speed transverse collisions will shatter them with zero deorbit score. Keep swings smooth.',
    rule: 'Fragile satellites exceed structural yield stress above 75 px/s relative impact velocity.',
  },
  7: {
    title: 'MOVING TARGETS',
    text: 'High-speed elliptical orbits! Lead your grab ahead of target vectors to establish a secure tether lock.',
    rule: 'Orbital velocity varies by altitude; lead the intercept point rather than clicking current positions.',
  },
  8: {
    title: 'KESSLER EVENT',
    text: 'Chaotic orbital cascade field! Tight fuel budget. Perform rapid, decisive retrograde flings before orbital collapse.',
    rule: 'The final mission: combine tether flings, cascade combos, and fuel conservation to clear the orbital plane.',
  },
};

const FROSTED_PILL = {
  background: 'rgba(6, 13, 31, 0.75)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  borderRadius: '20px',
  boxShadow:
    '0 12px 36px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.15)',
};

const TutorialOverlay = forwardRef(function TutorialOverlay(
  { levelId = 1, step = 1, visible = true, onClose },
  _ref,
) {
  if (!visible) return null;

  const info = LEVEL_HINTS[levelId] || LEVEL_HINTS[1];

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '100px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 60,
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        userSelect: 'none',
        maxWidth: 'calc(100vw - 40px)',
      }}
    >
      <div
        style={{
          ...FROSTED_PILL,
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          boxSizing: 'border-box',
        }}
      >
        {levelId === 1 ? (
          <>
            <span
              style={{
                fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                background: step === 3 ? 'var(--pink)' : 'var(--sky)',
                color: 'var(--night)',
                padding: '4px 10px',
                borderRadius: '9999px',
                whiteSpace: 'nowrap',
              }}
            >
              STEP {step} / 3
            </span>

            <span
              style={{
                fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
                fontSize: '14px',
                fontWeight: 700,
                color: '#FFFFFF',
                letterSpacing: '0.02em',
                lineHeight: 1.4,
              }}
            >
              {info.steps[step - 1]}
            </span>
          </>
        ) : (
          <>
            <span
              style={{
                fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                background: 'var(--sky)',
                color: 'var(--night)',
                padding: '4px 10px',
                borderRadius: '9999px',
                whiteSpace: 'nowrap',
              }}
            >
              MISSION 0{levelId} HINT
            </span>

            <span
              style={{
                fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
                fontSize: '14px',
                fontWeight: 600,
                color: '#FFFFFF',
                letterSpacing: '0.02em',
                lineHeight: 1.4,
              }}
            >
              {info.text}
            </span>
          </>
        )}

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: '16px',
              padding: '0 4px',
              cursor: 'none',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Dismiss hint"
          >
            ✕
          </button>
        )}
      </div>

      <div
        style={{
          fontFamily: 'var(--font-body, "Inter", sans-serif)',
          fontSize: '12px',
          color: 'rgba(255, 255, 255, 0.7)',
          textAlign: 'center',
          maxWidth: '560px',
          lineHeight: 1.4,
          textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)',
        }}
      >
        {info.rule}
      </div>
    </div>
  );
});

export default TutorialOverlay;
