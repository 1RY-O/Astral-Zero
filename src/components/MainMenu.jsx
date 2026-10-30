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
        transition: 'opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
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
            'linear-gradient(180deg, rgba(6,13,31,0.2), transparent 40%, rgba(6,13,31,0.9))',
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
          }}
        >
          Orbital Operations.
        </h2>

        {/* Solid Dark Navy Card with Sky Blue Borders */}
        <div
          style={{
            width: '400px',
            maxWidth: 'calc(100vw - 40px)',
            padding: '32px',
            background: 'var(--night)',
            border: '2px solid var(--sky)',
            borderRadius: '28px',
            boxSizing: 'border-box',
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8), 0 0 24px rgba(56, 189, 248, 0.25)',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-body, "Inter", sans-serif)',
              fontSize: '18px',
              color: 'var(--white)',
              lineHeight: 1.5,
              margin: 0,
              textAlign: 'left',
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
              marginTop: '24px',
              backgroundColor: 'var(--pink)',
              color: 'var(--white)',
              fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
              fontSize: '18px',
              fontWeight: 700,
              borderRadius: '99px',
              padding: '16px',
              border: 'none',
              cursor: 'none',
              letterSpacing: '0.02em',
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
            INITIATE MISSION
          </button>
        </div>
      </div>
    </div>
  );
}
