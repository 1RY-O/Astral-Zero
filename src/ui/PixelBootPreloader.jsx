/**
 * ASTRAL ZERO — Pixel Boot Loading Screen (Retro-Arcade Pirate Stream Assembly).
 * Chunky pixel tug assembling part-by-part with scrolling system POST log,
 * segmented LED cells, and a signal acquire flare at 100%.
 * Built for the NASA International Space Apps Challenge 2026.
 */

import React, { useEffect, useState, useRef } from 'react';
import { chiptuneAudio } from '../audio/chiptuneEngine.js';

const POST_LOG_ENTRIES = [
  'INITIALIZING PIRATE BROADCAST TRANSMITTER (FREQ: 1420.405 MHz)...',
  'CALIBRATING 130M MAGNETIC WINCH SERVO... OK',
  'CHECKING REACTION CONTROL SYSTEM (RCS) NOZZLES... OK',
  'ANTENNA POINTING AT EARTH... LIES DETECTED',
  'ESTABLISHING LOW-LATENCY CHIP-AUDIO FEED... OK',
  'CONNECTING TO ORBITAL CONJUNCTION WARNING NETWORK... OK',
  'MEG STREAM CHAT RIGGED TO CHANNEL 73... 14,892 VIEWERS CONNECTED',
  'CHECKING 25-YEAR RULE COMPLIANCE MATRIX... OK',
  'HARDWARE VERIFIED · PIRATE STREAM READY FOR TRANSMISSION',
];

const ASSEMBLY_STAGES = [
  { progress: 20, name: 'STRUCTURAL TITANIUM KEEL', clunk: 'Titanium keel mounted' },
  { progress: 45, name: 'TWIN RCS IMPULSE NOZZLES', clunk: 'RCS thruster pods locked' },
  { progress: 70, name: '130M HIGH-TENSILE MAG-SPOOL', clunk: 'Tether spool calibrated' },
  { progress: 95, name: 'STREAM COCKPIT & BROADCAST DISH', clunk: 'Broadcast dish active' },
];

export default function PixelBootPreloader({ onComplete = () => {} }) {
  const [progress, setProgress] = useState(0);
  const [logIndex, setLogIndex] = useState(0);
  const [currentClunk, setCurrentClunk] = useState('System boot initiated...');
  const [flareActive, setFlareActive] = useState(false);
  const canvasRef = useRef(null);

  // Progressive simulated boot step
  useEffect(() => {
    let current = 0;
    const interval = setInterval(() => {
      current += Math.floor(Math.random() * 8 + 6);
      if (current >= 100) {
        current = 100;
        clearInterval(interval);
        setFlareActive(true);
        chiptuneAudio.playDeorbitFanfare();
        setTimeout(() => {
          onComplete();
        }, 420);
      } else {
        chiptuneAudio.playUiBeep();

        // Update Assembly stages
        const stage = ASSEMBLY_STAGES.find((s) => current >= s.progress && current < s.progress + 25);
        if (stage) {
          setCurrentClunk(stage.clunk);
        }

        // Update POST log
        const lIdx = Math.min(
          POST_LOG_ENTRIES.length - 1,
          Math.floor((current / 100) * POST_LOG_ENTRIES.length)
        );
        setLogIndex(lIdx);
      }
      setProgress(Math.min(100, current));
    }, 110);

    return () => clearInterval(interval);
  }, [onComplete]);

  // Render Pixel Tug Assembly on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // Draw grid bounds
    ctx.strokeStyle = '#242E3E';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    // Stage 1 (0%+): Titanium Keel (White/Graphite pixel blocks)
    ctx.fillStyle = '#EDF2F7';
    ctx.fillRect(cx - 6, cy - 14, 12, 28);
    ctx.fillStyle = '#141A24';
    ctx.fillRect(cx - 3, cy - 10, 6, 20);

    // Stage 2 (25%+): RCS Thruster Pods (Solar Gold)
    if (progress >= 25) {
      ctx.fillStyle = '#FF9E3D';
      ctx.fillRect(cx - 16, cy + 4, 8, 12);
      ctx.fillRect(cx + 8, cy + 4, 8, 12);

      // Small pixel flame
      ctx.fillStyle = '#B8FF4D';
      ctx.fillRect(cx - 14, cy + 16, 4, 4);
      ctx.fillRect(cx + 10, cy + 16, 4, 4);
    }

    // Stage 3 (50%+): Tether Spool (Grid Violet #8C4DFF / Signal Cyan #4DFFDF)
    if (progress >= 50) {
      ctx.fillStyle = '#8C4DFF';
      ctx.fillRect(cx - 8, cy - 4, 16, 10);
      ctx.fillStyle = '#4DFFDF';
      ctx.fillRect(cx - 4, cy - 2, 8, 6);
    }

    // Stage 4 (75%+): Cockpit Canopy & Broadcast Dish (Plasma Magenta #FF4DE1)
    if (progress >= 75) {
      ctx.fillStyle = '#FF4DE1';
      ctx.fillRect(cx - 5, cy - 22, 10, 8);
      ctx.fillStyle = '#4DFFDF';
      ctx.fillRect(cx - 2, cy - 20, 4, 4);

      // Antenna stem
      ctx.fillStyle = '#EDF2F7';
      ctx.fillRect(cx - 1, cy - 28, 2, 6);
      ctx.fillStyle = '#FF9E3D';
      ctx.fillRect(cx - 3, cy - 30, 6, 2);
    }

    // 100% Fully Powered Aura
    if (progress >= 100) {
      ctx.strokeStyle = '#4DFFDF';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 20, cy - 34, 40, 56);
    }
  }, [progress]);

  const totalLedCells = 16;
  const filledCells = Math.floor((progress / 100) * totalLedCells);

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        backgroundColor: '#0D0618',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"JetBrains Mono", monospace',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Signal Acquire Flare at 100% */}
      {flareActive && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: '#4DFFDF',
            opacity: 0.9,
            transition: 'opacity 0.4s ease-out',
            zIndex: 10000,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Header telemetry badge */}
      <div
        style={{
          color: '#4DFFDF',
          fontSize: '0.8rem',
          letterSpacing: '0.22em',
          marginBottom: '1rem',
          textTransform: 'uppercase',
        }}
      >
        ASTRAL ZERO · PIRATE STREAM BOOT · CHANNEL 73
      </div>

      {/* Chunky Pixel Canvas Viewport */}
      <canvas
        ref={canvasRef}
        width={160}
        height={120}
        style={{
          width: '240px',
          height: '180px',
          imageRendering: 'pixelated',
          backgroundColor: '#141A24',
          border: '2px solid #8C4DFF',
          boxShadow: '0 0 25px rgba(140, 77, 255, 0.4)',
          marginBottom: '1.25rem',
        }}
      />

      {/* Assembly Pop Status Text */}
      <div
        style={{
          color: '#FF9E3D',
          fontSize: '0.82rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          marginBottom: '1.25rem',
          minHeight: '22px',
        }}
      >
        {currentClunk}
      </div>

      {/* Segmented LED Progress Bar */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          width: 'min(80vw, 360px)',
          marginBottom: '1.25rem',
        }}
      >
        {Array.from({ length: totalLedCells }).map((_, idx) => {
          const isFilled = idx < filledCells;
          return (
            <div
              key={idx}
              style={{
                flex: 1,
                height: '12px',
                backgroundColor: isFilled ? '#4DFFDF' : '#242E3E',
                boxShadow: isFilled ? '0 0 8px #4DFFDF' : 'none',
                transition: 'background-color 0.1s ease',
              }}
            />
          );
        })}
      </div>

      {/* Progress percentage & POST log */}
      <div
        style={{
          width: 'min(85vw, 480px)',
          backgroundColor: 'rgba(20, 26, 36, 0.85)',
          border: '1px solid #384152',
          padding: '10px 14px',
          fontSize: '0.74rem',
          lineHeight: 1.5,
          color: '#7E8B9F',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#EDF2F7', marginBottom: '4px' }}>
          <span>SYSTEM POST INITIALIZATION</span>
          <span style={{ color: '#4DFFDF', fontWeight: 800 }}>{progress}%</span>
        </div>
        <div style={{ color: '#B8FF4D' }}>&gt; {POST_LOG_ENTRIES[logIndex]}</div>
      </div>
    </div>
  );
}
