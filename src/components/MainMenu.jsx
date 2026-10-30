export default function MainMenu({ onStart, visible = true }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        userSelect: 'none',
        background:
          'radial-gradient(circle at center, rgba(6, 17, 32, 0.3) 0%, rgba(6, 17, 32, 0.75) 100%)',
      }}
    >
      {/* Alpha Project Frosted Glass Panel */}
      <div
        style={{
          width: '520px',
          maxWidth: 'calc(100vw - 40px)',
          padding: '44px 40px',
          background: 'rgba(6, 17, 32, 0.82)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.25)',
          borderRadius: '28px',
          boxSizing: 'border-box',
          boxShadow:
            '0 24px 64px rgba(0, 0, 0, 0.65), inset 0 1px 1px rgba(255, 255, 255, 0.2)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* Challenge Eyebrow */}
        <div
          style={{
            fontFamily: '"Instrument Sans", "Inter", sans-serif',
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--sky, #38BDF8)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            marginBottom: '12px',
          }}
        >
          built for the NASA International Space Apps Challenge 2026.
        </div>

        {/* Large Clean Headline with Tight Tracking */}
        <h1
          style={{
            fontFamily: '"Instrument Sans", "Inter", sans-serif',
            fontSize: 'clamp(46px, 6vw, 68px)',
            fontWeight: 800,
            color: '#FFFFFF',
            textTransform: 'uppercase',
            letterSpacing: '-0.04em',
            lineHeight: 1.02,
            margin: '0 0 8px 0',
            textShadow: '0 6px 24px rgba(0, 0, 0, 0.6)',
          }}
        >
          DEBRIS DERBY
        </h1>

        <div
          style={{
            fontFamily: '"Instrument Sans", "Inter", sans-serif',
            fontSize: '18px',
            fontWeight: 500,
            color: 'var(--sky, #38BDF8)',
            letterSpacing: '-0.02em',
            marginBottom: '22px',
          }}
        >
          Orbital Kinetic Remediation
        </div>

        {/* Briefing Copy */}
        <p
          style={{
            fontFamily: '"Instrument Sans", "Inter", sans-serif',
            fontSize: '15px',
            color: 'rgba(255, 255, 255, 0.85)',
            lineHeight: 1.6,
            letterSpacing: '-0.01em',
            margin: '0 0 32px 0',
            textAlign: 'center',
          }}
        >
          You are Mission Control. Tether defunct space debris and release it onto a
          retrograde deorbit trajectory to comply with NASA&apos;s 25-Year Rule. Three
          verbs: <strong>GRAB</strong>, <strong>THRUST</strong>, <strong>RELEASE</strong>.
          Never push prograde.
        </p>

        {/* Alpha Project Hot Pink Primary Button */}
        <button
          type="button"
          onClick={onStart}
          style={{
            width: '100%',
            backgroundColor: '#FF2D95',
            color: '#FFFFFF',
            fontFamily: '"Instrument Sans", "Inter", sans-serif',
            fontSize: '17px',
            fontWeight: 700,
            borderRadius: '9999px',
            padding: '16px 32px',
            border: 'none',
            cursor: 'none',
            letterSpacing: '-0.01em',
            transition:
              'transform 0.18s ease, filter 0.18s ease, box-shadow 0.18s ease',
            boxShadow: '0 8px 28px rgba(255, 45, 149, 0.45)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.02)';
            e.currentTarget.style.filter = 'brightness(1.1)';
            e.currentTarget.style.boxShadow =
              '0 12px 36px rgba(255, 45, 149, 0.65)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.filter = 'none';
            e.currentTarget.style.boxShadow =
              '0 8px 28px rgba(255, 45, 149, 0.45)';
          }}
        >
          INITIATE MISSION
        </button>
      </div>
    </div>
  );
}
