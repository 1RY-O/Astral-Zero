/**
 * ASTRAL ZERO — Acid-Wave Landing Experience.
 * Built for the NASA International Space Apps Challenge 2026.
 *
 * Design guidelines:
 * - Single hero tagline: DRIVE THE PERIGEE TO ZERO
 * - One short lore paragraph
 * - Four action-step buttons with clean inline geometric SVGs (no emojis)
 * - Zero fake/static telemetry strings
 * - Preserved purple-nebula CRT/pixel visual DNA without decorative clutter
 */

import React, { useEffect, useRef, useState } from 'react';
import { SpaceBackgroundShader } from '../render/spaceShader.js';
import { ASCII_HERO, renderAsciiHero } from '../render/ascii.js';
import { chiptuneAudio } from '../audio/chiptuneEngine.js';

export default function AsciiLandingPage({
  onStartContract = () => {},
  onWatchCredits = () => {},
}) {
  const shaderCanvasRef = useRef(null);
  const shaderRef = useRef(null);

  const [time, setTime] = useState(0);
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });

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

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
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

  const heroLines = renderAsciiHero(ASCII_HERO, time, 0, mouseOffset);

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
      {/* Layer 0: Procedural WebGL Acid-Wave Background */}
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

      {/* Layer 1: Minimal Broadcast Header */}
      <header
        style={{
          position: 'absolute',
          top: '20px',
          left: '24px',
          right: '24px',
          zIndex: 10,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#4DFFDF', letterSpacing: '0.14em' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#4DFFDF',
              boxShadow: '0 0 10px #4DFFDF',
              display: 'inline-block',
            }}
          />
          <strong>CHANNEL 73 · LIVE</strong>
        </div>

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
            fontSize: '0.76rem',
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
      </header>

      {/* Hero Section Container */}
      <main
        style={{
          position: 'relative',
          zIndex: 5,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem 1rem',
          textAlign: 'center',
        }}
      >
        {/* Animated Parallax ASCII Title */}
        <pre
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 'clamp(0.5rem, 1.25vw, 1.05rem)',
            lineHeight: 1.15,
            color: '#4DFFDF',
            textShadow: '0 0 16px rgba(77, 255, 223, 0.65), 0 0 35px rgba(255, 77, 225, 0.35)',
            margin: '0 0 1.5rem 0',
            transform: `translate(${mouseOffset.x * 12}px, ${-mouseOffset.y * 8}px)`,
            transition: 'transform 0.1s ease-out',
          }}
        >
          {heroLines.join('\n')}
        </pre>

        {/* Single Hero Tagline */}
        <h1
          style={{
            fontSize: 'clamp(1.2rem, 2.4vw, 1.8rem)',
            fontWeight: 900,
            letterSpacing: '0.24em',
            color: '#EDF2F7',
            margin: '0 0 1.2rem 0',
            textTransform: 'uppercase',
            textShadow: '0 0 20px rgba(77, 255, 223, 0.5)',
          }}
        >
          <span style={{ color: '#4DFFDF' }}>Ø</span> &nbsp;DRIVE THE PERIGEE TO ZERO.&nbsp; <span style={{ color: '#4DFFDF' }}>Ø</span>
        </h1>

        {/* One Short Lore Paragraph */}
        <p
          style={{
            color: '#A0AEC0',
            fontSize: 'clamp(0.95rem, 1.5vw, 1.12rem)',
            maxWidth: '640px',
            lineHeight: 1.6,
            margin: '0 0 2rem 0',
            letterSpacing: '0.03em',
          }}
        >
          You are an orbital scrap-rat streaming salvage runs over an illicit signal.
          Latch dead rocket stages, pump rotational momentum, and whip them into Earth's atmosphere to drive their perigee to zero.
        </p>

        {/* Four Action Steps with Clean Geometric Line SVGs */}
        <div
          style={{
            display: 'flex',
            gap: '14px',
            marginBottom: '2.5rem',
            maxWidth: '780px',
            width: '100%',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          {[
            {
              label: 'HOVER DERELICT',
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4DFFDF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 3v3m0 12v3M3 12h3m12 0h3" />
                  <circle cx="12" cy="12" r="2" fill="#4DFFDF" />
                </svg>
              ),
            },
            {
              label: 'CLICK TO LATCH',
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4DFFDF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 4v7a7 7 0 0 0 14 0V4" />
                  <path d="M5 4h4v4H5zM15 4h4v4h-4z" fill="#4DFFDF" fillOpacity="0.35" />
                </svg>
              ),
            },
            {
              label: 'SWING RETROGRADE',
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4DFFDF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 0 0-15.5-6.36L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 15.5 6.36L21 16" />
                  <path d="M21 21v-5h-5" />
                </svg>
              ),
            },
            {
              label: 'RELEASE AT ZERO',
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4DFFDF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v4m0 12v4M2 12h4m12 0h4m-3.07-6.93l-2.83 2.83m-8.2 8.2l-2.83 2.83m0-13.86l2.83 2.83m8.2 8.2l2.83 2.83" />
                  <circle cx="12" cy="12" r="2.5" fill="#4DFFDF" />
                </svg>
              ),
            },
          ].map((step, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'rgba(20, 26, 36, 0.85)',
                border: '1px solid rgba(140, 77, 255, 0.45)',
                padding: '9px 16px',
                borderRadius: '3px',
                boxShadow: '0 0 14px rgba(13, 6, 24, 0.9)',
              }}
            >
              {step.icon}
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#4DFFDF', letterSpacing: '0.08em' }}>
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Primary Action Button */}
        <button
          onClick={() => {
            chiptuneAudio.playLatchClunk();
            onStartContract();
          }}
          style={{
            padding: '16px 48px',
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
      </main>
    </div>
  );
}
