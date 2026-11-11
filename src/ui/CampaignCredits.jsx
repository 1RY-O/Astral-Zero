/**
 * ASTRAL ZERO — Act 3: Campaign Credits & Scientific Dedication.
 * Built for the NASA International Space Apps Challenge 2026.
 *
 * Requirements:
 * - Slow cinematic credits sequence (< 30s) over starfield / acid-wave canvas
 * - ASTRAL ZERO · Ø brand mark + tagline: DRIVE THE PERIGEE TO ZERO.
 * - NASA Space Apps 2026 Dedication card
 * - Educational attribution card (NASA Orbital Debris Program Office odpo.nasa.gov)
 * - Science payload: "Perigee is an orbit's lowest point..."
 * - Team & Systems attribution
 * - MEG streamer sign-off: "gg. chat, we zeroed the perigee."
 * - Campaign scoreboard summary (Rank, Total Time, Δv used, 3/3 deorbited)
 * - Skippable with [ESC] or button
 * - Concludes with "RETURN TO CHANNEL 73"
 */

import React, { useEffect, useRef, useState } from 'react';
import { SpaceBackgroundShader } from '../render/spaceShader.js';
import { chiptuneAudio } from '../audio/chiptuneEngine.js';

export default function CampaignCredits({
  score = null,
  onReturn = () => {},
}) {
  const canvasRef = useRef(null);
  const shaderRef = useRef(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Background acid-wave shader
  useEffect(() => {
    const canvas = canvasRef.current;
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
    };
    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Keyboard shortcut [ESC] to return
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        chiptuneAudio.playUiBeep();
        onReturn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onReturn]);

  // Auto-advance credits scroll over ~24 seconds
  useEffect(() => {
    const startTime = performance.now();
    const durationMs = 24000;

    const interval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const p = Math.min(1.0, elapsed / durationMs);
      setScrollProgress(p);
      if (p >= 1.0) clearInterval(interval);
    }, 100);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#0D0618',
        fontFamily: '"JetBrains Mono", monospace',
        color: '#EDF2F7',
      }}
    >
      {/* Background WebGL Shader */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0.45,
          zIndex: 1,
        }}
      />

      {/* CRT Scanline Overlay */}
      <div className="crt-overlay" style={{ zIndex: 2 }} />

      {/* Top Header Bar */}
      <header
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '12px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(13, 6, 24, 0.85)',
          borderBottom: '1px solid #8C4DFF',
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: '#4DFFDF', fontWeight: 900, letterSpacing: '0.15em' }}>
            ASTRAL ZERO · Ø
          </span>
          <span style={{ color: '#7E8B9F' }}>|</span>
          <span style={{ color: '#EDF2F7', fontSize: '0.82rem' }}>
            ACT 3 · CREDITS & DEDICATION
          </span>
        </div>

        <button
          onClick={() => {
            chiptuneAudio.playUiBeep();
            onReturn();
          }}
          style={{
            background: 'transparent',
            border: '1px solid #8C4DFF',
            color: '#4DFFDF',
            fontFamily: 'inherit',
            fontSize: '0.78rem',
            padding: '5px 12px',
            cursor: 'pointer',
            letterSpacing: '0.1em',
          }}
        >
          SKIP CREDITS [ESC]
        </button>
      </header>

      {/* Scrollable Cinematic Credits Container */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          height: '100%',
          overflowY: 'auto',
          padding: '100px 20px 80px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            maxWidth: '740px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '36px',
            textAlign: 'center',
          }}
        >
          {/* Card 1: Game Title Lockup & Tagline */}
          <div
            style={{
              padding: '30px 20px',
              border: '2px solid #8C4DFF',
              background: 'rgba(23, 14, 40, 0.85)',
              boxShadow: '0 0 30px rgba(140, 77, 255, 0.35)',
              borderRadius: '4px',
            }}
          >
            <div style={{ fontSize: '0.80rem', letterSpacing: '0.25em', color: '#FF9E3D', marginBottom: '8px' }}>
              TRANSMISSION WRAP · PIRATE SALVAGE NETWORK
            </div>
            <h1
              style={{
                fontSize: 'clamp(2.2rem, 5vw, 3.5rem)',
                fontWeight: 900,
                color: '#EDF2F7',
                letterSpacing: '0.14em',
                margin: '0 0 8px 0',
                textShadow: '0 0 25px rgba(77, 255, 223, 0.6)',
              }}
            >
              ASTRAL ZERO · Ø
            </h1>
            <div
              style={{
                fontSize: '1.15rem',
                fontWeight: 900,
                color: '#4DFFDF',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
              }}
            >
              DRIVE THE PERIGEE TO ZERO.
            </div>
          </div>

          {/* Card 2: Campaign Scoreboard (If completed) */}
          {score && (
            <div
              style={{
                padding: '24px',
                border: '1.5px solid #B8FF4D',
                background: 'rgba(13, 6, 24, 0.92)',
                boxShadow: '0 0 25px rgba(184, 255, 77, 0.3)',
                borderRadius: '4px',
              }}
            >
              <div style={{ fontSize: '0.74rem', letterSpacing: '0.2em', color: '#B8FF4D', marginBottom: '4px' }}>
                SALVAGE CAMPAIGN EVALUATION
              </div>
              <div style={{ fontSize: '3rem', fontWeight: 900, color: '#B8FF4D', margin: '4px 0 14px 0' }}>
                RANK {score.rank || 'S'}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '12px',
                  textAlign: 'center',
                }}
              >
                <div style={{ padding: '10px', background: 'rgba(23, 14, 40, 0.7)', border: '1px solid #8C4DFF' }}>
                  <div style={{ fontSize: '0.68rem', color: '#7E8B9F' }}>DERELICTS ZEROED</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#4DFFDF', marginTop: '2px' }}>
                    3 / 3
                  </div>
                </div>
                <div style={{ padding: '10px', background: 'rgba(23, 14, 40, 0.7)', border: '1px solid #8C4DFF' }}>
                  <div style={{ fontSize: '0.68rem', color: '#7E8B9F' }}>TOTAL FLIGHT TIME</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#EDF2F7', marginTop: '2px' }}>
                    {score.totalTime || '42.6'}s
                  </div>
                </div>
                <div style={{ padding: '10px', background: 'rgba(23, 14, 40, 0.7)', border: '1px solid #8C4DFF' }}>
                  <div style={{ fontSize: '0.68rem', color: '#7E8B9F' }}>TOTAL ΔV EXPENDED</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#FF9E3D', marginTop: '2px' }}>
                    {score.deltaVUsed || '380'} m/s
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Card 3: NASA Space Apps Challenge Dedication */}
          <div
            style={{
              padding: '26px',
              border: '1px solid #8C4DFF',
              background: 'rgba(23, 14, 40, 0.8)',
              borderRadius: '4px',
            }}
          >
            <div style={{ fontSize: '0.74rem', letterSpacing: '0.2em', color: '#FF4DE1', marginBottom: '8px' }}>
              OFFICIAL DEDICATION
            </div>
            <h2 style={{ fontSize: '1.4rem', color: '#EDF2F7', margin: '0 0 12px 0' }}>
              NASA INTERNATIONAL SPACE APPS CHALLENGE 2026
            </h2>
            <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: '#EDF2F7', maxWidth: '600px', margin: '0 auto' }}>
              Dedicated to the scientists, engineers, and visionaries working on Active Debris Removal (ADR),
              orbital sustainability, and the preservation of near-Earth space for future generations.
            </p>
          </div>

          {/* Card 4: Scientific Attribution & Education */}
          <div
            style={{
              padding: '26px',
              border: '1px solid #4DFFDF',
              background: 'rgba(13, 6, 24, 0.85)',
              borderRadius: '4px',
            }}
          >
            <div style={{ fontSize: '0.74rem', letterSpacing: '0.2em', color: '#4DFFDF', marginBottom: '8px' }}>
              ORBITAL SCIENCE ATTRIBUTION
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#EDF2F7', marginBottom: '8px' }}>
              NASA Orbital Debris Program Office
            </div>
            <div style={{ fontSize: '0.80rem', color: '#7E8B9F', marginBottom: '14px' }}>
              odpo.nasa.gov · ESA Space Debris Office · Inter-Agency Space Debris Coordination Committee (IADC)
            </div>
            <div
              style={{
                background: 'rgba(77, 255, 223, 0.08)',
                border: '1px solid rgba(77, 255, 223, 0.3)',
                padding: '12px 18px',
                borderRadius: '4px',
                color: '#4DFFDF',
                fontSize: '0.90rem',
                lineHeight: 1.5,
                fontStyle: 'italic',
              }}
            >
              "Perigee is an orbit's lowest point. Below ~100 km, atmospheric drag guarantees re-entry — drive the hulk's perigee under the line and gravity does the rest."
            </div>
          </div>

          {/* Card 5: Salvage Architecture & Sound */}
          <div
            style={{
              padding: '24px',
              border: '1px solid #8C4DFF',
              background: 'rgba(23, 14, 40, 0.8)',
              borderRadius: '4px',
            }}
          >
            <div style={{ fontSize: '0.74rem', letterSpacing: '0.2em', color: '#FF9E3D', marginBottom: '8px' }}>
              FLIGHT ARCHITECTURE & SYNTHESIS
            </div>
            <div style={{ fontSize: '0.88rem', lineHeight: 1.6, color: '#EDF2F7' }}>
              Autonomous Pair Engineering · Real-Time Newtonian Vector Solver & PBD Rigid Tether<br />
              Custom WebGL Liquid Acid-Wave Background & CRT Glitch Scanline Shader<br />
              Procedural Web Audio 8-Bit Chiptune Synthesizer Engine
            </div>
          </div>

          {/* Card 6: MEG Stream Sign-Off */}
          <div
            style={{
              padding: '20px',
              border: '1px solid #FF4DE1',
              background: 'rgba(255, 77, 225, 0.08)',
              borderRadius: '4px',
            }}
          >
            <div style={{ fontSize: '0.72rem', letterSpacing: '0.18em', color: '#FF4DE1', marginBottom: '6px' }}>
              ONBOARD AI STREAMER · MEG SIGN-OFF
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#EDF2F7', fontStyle: 'italic' }}>
              "gg. chat, we zeroed the perigee."
            </div>
            <div style={{ fontSize: '0.75rem', color: '#7E8B9F', marginTop: '6px' }}>
              Channel 73 pirate salvage stream signed off · 15,200 concurrent viewers
            </div>
          </div>

          {/* Card 7: Return Action Button */}
          <div style={{ margin: '16px 0 40px 0' }}>
            <button
              onClick={() => {
                chiptuneAudio.playUiBeep();
                onReturn();
              }}
              style={{
                padding: '16px 44px',
                background: '#4DFFDF',
                border: '2px solid #FFFFFF',
                color: '#0D0618',
                fontFamily: 'inherit',
                fontSize: '1.05rem',
                fontWeight: 900,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                boxShadow: '0 0 25px #4DFFDF',
                transform: 'skewX(-6deg)',
              }}
            >
              RETURN TO CHANNEL 73 ➔
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
