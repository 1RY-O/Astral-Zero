/**
 * ASTRAL ZERO — "CATHODE SALVAGE" Acid-Wave Landing Experience.
 * Layer 0: Procedural WebGL Acid-Wave Hybrid noise shader (Signal Cyan into Plasma Magenta).
 * Layer 1: Massive animated ASCII hero title with brand glyph Ø, tagline, and How to Play strip.
 * Built for the NASA International Space Apps Challenge 2026.
 */

import React, { useEffect, useRef, useState } from 'react';
import { SpaceBackgroundShader } from '../render/spaceShader.js';
import { ASCII_HERO, ASCII_SUBTITLE, renderAsciiHero } from '../render/ascii.js';
import { chiptuneAudio } from '../audio/chiptuneEngine.js';

export default function AsciiLandingPage({
  onStartContract = () => {},
  onWatchCredits = () => {},
}) {
  const shaderCanvasRef = useRef(null);
  const shaderRef = useRef(null);
  const containerRef = useRef(null);

  const [time, setTime] = useState(0);
  const [scrollRatio, setScrollRatio] = useState(0);
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });
  const [signalQuality, setSignalQuality] = useState('98.4%');

  // Mount WebGL Space Background Shader
  useEffect(() => {
    const canvas = shaderCanvasRef.current;
    if (!canvas) return;

    const shader = new SpaceBackgroundShader(canvas);
    shaderRef.current = shader;

    const resize = () => {
      shader.resize(window.innerWidth, window.innerHeight);
    };

    resize();
    window.addEventListener('resize', resize);

    let animId;
    const loop = (now) => {
      animId = requestAnimationFrame(loop);
      shader.render(now);
      setTime(now / 1000);
    };
    animId = requestAnimationFrame(loop);

    // Ticking broadcast telemetry
    const sigInterval = setInterval(() => {
      const q = (96.5 + Math.random() * 3.2).toFixed(1);
      setSignalQuality(`${q}%`);
    }, 2400);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      clearInterval(sigInterval);
    };
  }, []);

  // Auto-scroll if requested via URL hash or param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('scroll') === 'laws' || window.location.hash === '#laws') {
      setTimeout(() => {
        const lawsEl = document.getElementById('laws');
        if (lawsEl) {
          lawsEl.scrollIntoView({ behavior: 'auto' });
        }
      }, 100);
    }
  }, []);

  // Handle Mouse Parallax
  const handleMouseMove = (e) => {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = -(e.clientY / window.innerHeight) * 2 + 1;
    setMouseOffset({ x: nx, y: ny });

    if (shaderRef.current) {
      shaderRef.current.setMouse(e.clientX, e.clientY);
    }
  };

  // Handle Scroll Dissolution
  const handleScroll = (e) => {
    const el = e.target;
    const maxScroll = el.scrollHeight - el.clientHeight || 1;
    const ratio = Math.min(1.0, el.scrollTop / (maxScroll * 0.45));
    setScrollRatio(ratio);
  };

  const heroLines = renderAsciiHero(ASCII_HERO, time, scrollRatio, mouseOffset);

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        backgroundColor: '#0D0618',
        overflow: 'hidden',
        userSelect: 'none',
        fontFamily: '"JetBrains Mono", monospace',
        color: '#EDF2F7',
      }}
      onMouseMove={handleMouseMove}
    >
      {/* Layer 0: Procedural WebGL Acid-Wave Hybrid Background */}
      <canvas
        ref={shaderCanvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      {/* Layer 1: Top Broadcast Corner Telemetry */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          left: '24px',
          zIndex: 10,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          fontSize: '0.74rem',
          letterSpacing: '0.12em',
          color: '#4DFFDF',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#FF4DE1',
              boxShadow: '0 0 10px #FF4DE1',
              display: 'inline-block',
            }}
          />
          <strong>PIRATE BROADCAST FEED · CHANNEL 73 LIVE</strong>
        </div>
        <div style={{ color: '#7E8B9F' }}>
          SIGNAL STRENGTH: <span style={{ color: '#B8FF4D' }}>{signalQuality}</span> · CONGESTION SHELL 44 · VIEWERS: 14,892
        </div>
      </div>

      {/* Top Right Quick Actions: Watch Credits */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          right: '24px',
          zIndex: 10,
          display: 'flex',
          gap: '12px',
        }}
      >
        <button
          onClick={() => {
            chiptuneAudio.playUiBeep();
            onWatchCredits();
          }}
          style={{
            background: 'rgba(20, 26, 36, 0.75)',
            border: '1px solid #8C4DFF',
            color: '#4DFFDF',
            fontFamily: 'inherit',
            fontSize: '0.74rem',
            padding: '6px 14px',
            cursor: 'pointer',
            letterSpacing: '0.1em',
            borderRadius: '2px',
            transition: 'border-color 0.2s, background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#4DFFDF';
            e.currentTarget.style.backgroundColor = 'rgba(77, 255, 223, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#8C4DFF';
            e.currentTarget.style.backgroundColor = 'rgba(20, 26, 36, 0.75)';
          }}
        >
          WATCH CREDITS [ACT 3]
        </button>
      </div>

      {/* Scrollable Container for Layer 1 ASCII Over Acid-Wave */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          position: 'relative',
          zIndex: 5,
          width: '100%',
          height: '100%',
          overflowY: 'auto',
          scrollBehavior: 'smooth',
        }}
      >
        {/* Hero Section */}
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '5.5rem 1rem 2.5rem 1rem',
            textAlign: 'center',
          }}
        >
          {/* Subtitle Telemetry Banner */}
          <div
            style={{
              color: '#FF9E3D',
              fontSize: '0.8rem',
              letterSpacing: '0.18em',
              marginBottom: '1.2rem',
              textTransform: 'uppercase',
            }}
          >
            {ASCII_SUBTITLE[0]}
          </div>

          {/* Massive Animated Parallax ASCII Title */}
          <pre
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 'clamp(0.45rem, 1.15vw, 0.95rem)',
              lineHeight: 1.15,
              color: '#4DFFDF',
              textShadow: '0 0 16px rgba(77, 255, 223, 0.65), 0 0 35px rgba(255, 77, 225, 0.35)',
              margin: '0 0 1.25rem 0',
              transform: `translate(${mouseOffset.x * 12}px, ${-mouseOffset.y * 8}px)`,
              transition: 'transform 0.1s ease-out',
            }}
          >
            {heroLines.join('\n')}
          </pre>

          {/* REQUIRED TAGLINE */}
          <div
            style={{
              fontSize: 'clamp(1.1rem, 2.2vw, 1.6rem)',
              fontWeight: 900,
              letterSpacing: '0.22em',
              color: '#EDF2F7',
              marginBottom: '1rem',
              textTransform: 'uppercase',
              textShadow: '0 0 20px rgba(77, 255, 223, 0.5)',
            }}
          >
            <span style={{ color: '#4DFFDF' }}>Ø</span> &nbsp;DRIVE THE PERIGEE TO ZERO.&nbsp; <span style={{ color: '#4DFFDF' }}>Ø</span>
          </div>

          {/* Narrative Pitch */}
          <div
            style={{
              color: '#EDF2F7',
              fontSize: 'clamp(0.95rem, 1.6vw, 1.15rem)',
              maxWidth: '680px',
              lineHeight: 1.6,
              marginBottom: '0.75rem',
              letterSpacing: '0.04em',
            }}
          >
            You are an orbital scrap-rat streaming recovery runs over an illicit signal.
            Tether dead rocket stages, match rotational momentum, and whip them into Earth's atmospheric furnace.
          </div>

          <div
            style={{
              color: '#7E8B9F',
              fontSize: '0.82rem',
              maxWidth: '560px',
              lineHeight: 1.5,
              marginBottom: '2rem',
            }}
          >
            Built for the <strong>NASA International Space Apps Challenge 2026</strong>.
            True Newtonian momentum transfer. Zero fantasy lasers. Zero orbital leftovers.
          </div>

          {/* HOW TO PLAY STRIP — 4 icons, <= 3 words each */}
          <div
            style={{
              display: 'flex',
              gap: '16px',
              marginBottom: '2.5rem',
              maxWidth: '720px',
              width: '100%',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            {[
              { icon: '🎯', label: 'HOVER DERELICT' },
              { icon: '🧲', label: 'CLICK TO LATCH' },
              { icon: '🔄', label: 'SWING RETROGRADE' },
              { icon: '💥', label: 'RELEASE AT ZERO' },
            ].map((step, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(20, 26, 36, 0.85)',
                  border: '1px solid rgba(140, 77, 255, 0.5)',
                  padding: '8px 14px',
                  borderRadius: '3px',
                  boxShadow: '0 0 12px rgba(13, 6, 24, 0.8)',
                }}
              >
                <span style={{ fontSize: '1.2rem' }}>{step.icon}</span>
                <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#4DFFDF', letterSpacing: '0.08em' }}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          {/* Action CTA Button */}
          <button
            onClick={() => {
              chiptuneAudio.playLatchClunk();
              onStartContract();
            }}
            style={{
              padding: '16px 44px',
              backgroundColor: '#4DFFDF',
              border: '2px solid #FFFFFF',
              color: '#0D0618',
              fontFamily: 'inherit',
              fontSize: '1.1rem',
              fontWeight: 900,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              boxShadow: '0 0 25px #4DFFDF, 0 0 50px rgba(140, 77, 255, 0.5)',
              transform: 'skewX(-6deg)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
            onMouseEnter={(e) => {
              chiptuneAudio.playUiBeep();
              e.currentTarget.style.transform = 'skewX(-6deg) scale(1.05)';
              e.currentTarget.style.boxShadow = '0 0 35px #4DFFDF, 0 0 70px #FF4DE1';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'skewX(-6deg) scale(1)';
              e.currentTarget.style.boxShadow = '0 0 25px #4DFFDF, 0 0 50px rgba(140, 77, 255, 0.5)';
            }}
          >
            LAUNCH SALVAGE RUN ➔
          </button>

          {/* Scroll Down Indicator */}
          <div
            style={{
              marginTop: '3.5rem',
              fontSize: '0.72rem',
              color: '#8C4DFF',
              letterSpacing: '0.2em',
              animation: 'bounce 2s infinite',
            }}
          >
            ▼ SCROLL DOWN TO DISSOLVE STREAM · MISSION BRIEFING ▼
          </div>
        </div>

        {/* Section 2: The Three Laws of Active Debris Removal */}
        <div
          id="laws"
          style={{
            minHeight: '75vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '3rem 2rem',
            backgroundColor: 'rgba(13, 6, 24, 0.92)',
            borderTop: '2px solid #8C4DFF',
          }}
        >
          <div style={{ color: '#FF4DE1', fontSize: '0.78rem', letterSpacing: '0.2em', marginBottom: '0.5rem' }}>
            ORBITAL SALVAGE PROTOCOL
          </div>

          <h2 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.5rem)', color: '#EDF2F7', margin: '0 0 1rem 0' }}>
            THE THREE LAWS OF CATHODE SALVAGE
          </h2>

          <div
            style={{
              maxWidth: '840px',
              textAlign: 'center',
              color: '#4DFFDF',
              fontSize: '1rem',
              lineHeight: 1.6,
              marginBottom: '2rem',
              border: '1px solid rgba(77, 255, 223, 0.35)',
              background: 'rgba(77, 255, 223, 0.08)',
              padding: '12px 20px',
              borderRadius: '4px',
            }}
          >
            "Perigee is an orbit's lowest point. Below ~100 km, atmospheric drag guarantees re-entry — drive the hulk's perigee under the line and gravity does the rest."
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '20px',
              maxWidth: '1000px',
              width: '100%',
            }}
          >
            <div style={{ backgroundColor: '#141A24', border: '1px solid #4DFFDF', padding: '24px' }}>
              <div style={{ color: '#4DFFDF', fontSize: '0.75rem', fontWeight: 700 }}>LAW 01 · RETROGRADE OR BUST</div>
              <h3 style={{ margin: '0.4rem 0 0.8rem 0', color: '#EDF2F7', fontSize: '1.2rem' }}>
                DRIVE PERIGEE TO ZERO
              </h3>
              <p style={{ color: '#7E8B9F', fontSize: '0.85rem', lineHeight: 1.6 }}>
                Every kilogram in orbit is falling. Release your swing along the retrograde vector (vx &lt; -85 m/s) to drop perigee into Earth's atmospheric furnace (&lt; 100 km). Prograde cuts raise apogee and burn precious fuel.
              </p>
            </div>

            <div style={{ backgroundColor: '#141A24', border: '1px solid #FF9E3D', padding: '24px' }}>
              <div style={{ color: '#FF9E3D', fontSize: '0.75rem', fontWeight: 700 }}>LAW 02 · ANGULAR MOMENTUM</div>
              <h3 style={{ margin: '0.4rem 0 0.8rem 0', color: '#EDF2F7', fontSize: '1.2rem' }}>
                MATCH ROTATION, BUILD SWING
              </h3>
              <p style={{ color: '#7E8B9F', fontSize: '0.85rem', lineHeight: 1.6 }}>
                The hulk is 4x to 6x heavier than your tug. Match its tumbling direction, ignite tangential RCS thrust, and pump centrifugal tension into the cable. Time the release when the vector points dead retrograde.
              </p>
            </div>

            <div style={{ backgroundColor: '#141A24', border: '1px solid #FF4DE1', padding: '24px' }}>
              <div style={{ color: '#FF4DE1', fontSize: '0.75rem', fontWeight: 700 }}>LAW 03 · THE 25-YEAR WINDOW</div>
              <h3 style={{ margin: '0.4rem 0 0.8rem 0', color: '#EDF2F7', fontSize: '1.2rem' }}>
                CONJUNCTION CASUALTIES ARE FOREVER
              </h3>
              <p style={{ color: '#7E8B9F', fontSize: '0.85rem', lineHeight: 1.6 }}>
                NASA guidelines target deorbiting derelicts within 25 years. In the congestion corridor, rogue chunks cross your shell on a tight timer. Hesitate, and hypervelocity shrapnel shreds both your tug and the stream.
              </p>
            </div>
          </div>

          <div style={{ marginTop: '3rem', display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => {
                chiptuneAudio.playLatchClunk();
                onStartContract();
              }}
              style={{
                padding: '14px 36px',
                backgroundColor: 'transparent',
                border: '2px solid #FF4DE1',
                color: '#FF4DE1',
                fontFamily: 'inherit',
                fontSize: '0.95rem',
                fontWeight: 800,
                letterSpacing: '0.12em',
                cursor: 'pointer',
              }}
            >
              LAUNCH PILOT TUG · TRANSMIT TO CHANNEL 73 ➔
            </button>
            <button
              onClick={() => {
                chiptuneAudio.playUiBeep();
                onWatchCredits();
              }}
              style={{
                padding: '14px 28px',
                backgroundColor: 'transparent',
                border: '1px solid #8C4DFF',
                color: '#4DFFDF',
                fontFamily: 'inherit',
                fontSize: '0.95rem',
                fontWeight: 700,
                letterSpacing: '0.12em',
                cursor: 'pointer',
              }}
            >
              WATCH CREDITS [ACT 3]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
