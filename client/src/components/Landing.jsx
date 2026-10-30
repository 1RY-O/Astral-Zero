import React, { useState, useEffect } from 'react';
import MicroSlats from './MicroSlats.jsx';
import '../styles/glitch.css';

export function LandingPageWrapper({ children }) {
  return (
    <div
      className="crt-overlay"
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#061120',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </div>
  );
}

export function ContentOverlay({ children }) {
  return (
    <div
      style={{
        position: 'relative',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        textAlign: 'center',
        maxWidth: '800px',
      }}
    >
      <div
        style={{
          color: '#38BDF8',
          fontSize: '0.85rem',
          letterSpacing: '3px',
          marginBottom: '1rem',
          fontFamily: 'ui-monospace, monospace',
          textTransform: 'uppercase',
          borderBottom: '1px solid rgba(56, 189, 248, 0.3)',
          paddingBottom: '4px',
        }}
      >
        [SYSTEM: CORRUPTED NASA MISSION CONTROL AI // PROTOCOL 2026]
      </div>
      {children}
      <div
        style={{
          marginTop: '1.5rem',
          color: 'rgba(255, 255, 255, 0.45)',
          fontSize: '0.75rem',
          fontFamily: 'ui-monospace, monospace',
          letterSpacing: '1px',
        }}
      >
        BUILT FOR THE NASA INTERNATIONAL SPACE APPS CHALLENGE 2026
      </div>
    </div>
  );
}

export function GlitchTitle({
  variants = ['DEBRIS DARLING', 'MISSION FAILURE', 'KESSLER IMMINENT'],
  primaryColor = '#FF2D95',
  secondaryColor = '#6d4aff',
}) {
  const [index, setIndex] = useState(0);
  const [glitching, setGlitching] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setGlitching(true);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % variants.length);
        setGlitching(false);
      }, 150);
    }, 2800);
    return () => clearInterval(interval);
  }, [variants]);

  const currentText = variants[index] || variants[0];

  return (
    <h1
      className={glitching ? 'glitch-aberration' : 'glitch-text'}
      style={{
        fontSize: 'clamp(2.5rem, 7vw, 4.8rem)',
        fontWeight: 900,
        letterSpacing: '4px',
        color: '#FFFFFF',
        margin: '0 0 1.5rem 0',
        fontFamily: 'ui-monospace, monospace',
        textTransform: 'uppercase',
        textShadow: `-3px 0 ${primaryColor}, 3px 0 ${secondaryColor}`,
        userSelect: 'none',
      }}
    >
      {currentText}
    </h1>
  );
}

export function CTAButton({ glitchOnHover = true, onClick, children }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      className={`glitch-btn ${isHovered && glitchOnHover ? 'glitch-aberration' : ''}`}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        fontSize: '1.1rem',
        marginTop: '1rem',
      }}
    >
      {children}
    </button>
  );
}

export default function Landing({ onStartGame }) {
  return (
    <LandingPageWrapper>
      {/* Background Layer - MicroSlats */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100vh',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      >
        <MicroSlats
          preset="swell"
          color="#6d4aff"
          glintColor="#FF2D95"
          backgroundColor="#061120"
          slatWidth={15}
          slatHeight={35}
          gap={5}
          roundness={0.85}
          interactive={true}
          cursorStrength={2.5}
          cursorSize={60}
          swirl={0.3}
          trail={2.2}
          lean={15}
          intro={true}
          scale={2}
          speed={0.8}
          direction={225}
          chop={0.75}
          stretch={0.2}
          glint={0.9}
          contrast={1.5}
          perspective={0.7}
          fog={0.65}
          introDuration={3}
          paused={false}
        />
      </div>
      {/* Foreground - Glitch Content */}
      <ContentOverlay>
        <GlitchTitle
          variants={['DEBRIS DARLING', 'MISSION FAILURE', 'KESSLER IMMINENT']}
          primaryColor="#FF2D95"
          secondaryColor="#6d4aff"
        />
        <CTAButton glitchOnHover={true} onClick={onStartGame}>
          INITIATE DEORBIT SEQUENCE
        </CTAButton>
      </ContentOverlay>
    </LandingPageWrapper>
  );
}
