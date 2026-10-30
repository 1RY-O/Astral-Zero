import MicroSlats from './MicroSlats.jsx';

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
      }}
    >
      {/* Background MicroSlats */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: -1,
          opacity: 0.85,
        }}
      >
        <MicroSlats
          preset="swell"
          color="#FF2D95"
          glintColor="#38BDF8"
          backgroundColor="#060D1F"
          slatWidth={8}
          slatHeight={20}
          gap={4}
        />
      </div>

      {/* Grounding Gradient Overlay */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(6,13,31,0.2), transparent 40%, rgba(6,13,31,0.85))',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Centered Main Menu Content */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '0 20px',
        }}
      >
        {/* Headline Line 1 */}
        <h1
          style={{
            fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
            fontSize: 'clamp(48px, 7vw, 80px)',
            fontWeight: 700,
            color: 'var(--white)',
            textTransform: 'uppercase',
            letterSpacing: '-0.035em',
            lineHeight: 1,
            margin: 0,
            textShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
          }}
        >
          DEBRIS DERBY
        </h1>

        {/* Headline Line 2 */}
        <h2
          style={{
            fontFamily: 'serif',
            fontStyle: 'italic',
            fontSize: 'clamp(54px, 8vw, 92px)',
            fontWeight: 400,
            color: 'var(--pink)',
            letterSpacing: '-0.035em',
            lineHeight: 1.1,
            margin: '0 0 40px 0',
            textShadow: '0 4px 24px rgba(255, 45, 149, 0.4)',
          }}
        >
          Orbital Operations.
        </h2>

        {/* Alpha Project Frosted Glass Card */}
        <div
          style={{
            width: '440px',
            maxWidth: 'calc(100vw - 40px)',
            padding: '36px',
            background: 'rgba(6, 13, 31, 0.6)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '28px',
            boxSizing: 'border-box',
            boxShadow:
              '0 24px 64px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.15)',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-body, "Inter", sans-serif)',
              fontSize: '18px',
              color: '#FFFFFF',
              lineHeight: 1.6,
              margin: 0,
              textAlign: 'left',
              letterSpacing: '-0.01em',
            }}
          >
            You are Mission Control. Tether defunct satellites and deorbit them
            safely to comply with NASA&apos;s 25-Year Rule. Do not push them
            Prograde.
          </p>

          <button
            type="button"
            onClick={onStart}
            style={{
              width: '100%',
              marginTop: '28px',
              backgroundColor: 'var(--pink)',
              color: 'var(--white)',
              fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
              fontSize: '18px',
              fontWeight: 700,
              borderRadius: '99px',
              padding: '16px 24px',
              border: 'none',
              cursor: 'none',
              letterSpacing: '0.04em',
              transition:
                'transform 0.18s ease, filter 0.18s ease, box-shadow 0.18s ease',
              boxShadow: '0 8px 24px rgba(255, 45, 149, 0.45)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.02)';
              e.currentTarget.style.filter = 'brightness(1.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.filter = 'none';
            }}
          >
            INITIATE MISSION
          </button>
        </div>
      </div>
    </div>
  );
}
