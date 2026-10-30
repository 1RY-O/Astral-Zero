/**
 * Debris Derby — NASA International Space Apps Challenge 2026.
 *
 * Architecture:
 * - React mounts <canvas> once in a ref.
 * - rAF loop runs entirely outside React's render cycle (zero per-frame setState).
 * - React manages UI chrome: MainMenu, HUD, and custom Cursor.
 * - WebGL physics canvas in src/lib/physicsRenderer.ts.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { World, FIXED_DT } from './physics/world.js';
import { WebGLPhysicsRenderer } from './lib/physicsRenderer.ts';
import { initAudio } from './game/audio.js';
import Cursor from './components/Cursor.jsx';
import MainMenu from './components/MainMenu.jsx';
import HUD from './components/HUD.jsx';

const MAX_SUBSTEPS = 5;
const DEFAULT_SEED = 2026;

function parseSeed() {
  if (typeof window === 'undefined') return DEFAULT_SEED;
  const match = location.search.match(/[?&]seed=(\d+)/);
  return match ? Number(match[1]) : DEFAULT_SEED;
}

export default function App() {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const worldRef = useRef(null);
  const rafRef = useRef(0);
  const activeRef = useRef(false);
  const accRef = useRef(0);
  const keysRef = useRef(new Set());
  const startTimeRef = useRef(0);

  // HUD DOM refs for zero-overhead direct updates
  const scoreRef = useRef(null);
  const fuelBarRef = useRef(null);
  const targetPanelRef = useRef(null);
  const noradRef = useRef(null);
  const massRef = useRef(null);
  const lifetimeRef = useRef(null);

  // Check URL param or default to showing Main Menu
  const [inGame, setInGame] = useState(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('autoplay') === '1' || params.get('mode') === 'game';
  });

  const inGameRef = useRef(inGame);

  useEffect(() => {
    inGameRef.current = inGame;
  }, [inGame]);

  const handleStartMission = useCallback(() => {
    initAudio();
    inGameRef.current = true;
    setInGame(true);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const seed = parseSeed();
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    const world = new World({
      width: rect.width || 800,
      height: rect.height || 600,
      devicePixelRatio: dpr,
      seed,
    });
    worldRef.current = world;

    const renderer = new WebGLPhysicsRenderer(canvas);
    rendererRef.current = renderer;

    startTimeRef.current = performance.now();
    let last = performance.now();
    activeRef.current = true;

    function resize() {
      if (!canvas || !world) return;
      const r = canvas.getBoundingClientRect();
      const devPr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(r.width * devPr));
      canvas.height = Math.max(1, Math.floor(r.height * devPr));
      world.setSize(r.width, r.height);
    }

    function loop(now) {
      if (!activeRef.current) return;
      rafRef.current = requestAnimationFrame(loop);

      const elapsed = Math.min(0.1, (now - last) / 1000);
      last = now;
      accRef.current += elapsed;

      let substeps = 0;
      while (accRef.current >= FIXED_DT && substeps < MAX_SUBSTEPS) {
        world.step();
        accRef.current -= FIXED_DT;
        substeps += 1;
      }

      // Render WebGL frame
      const r = canvas.getBoundingClientRect();
      const timeSec = (now - startTimeRef.current) / 1000;
      renderer.render(world, r.width, r.height, timeSec);

      // Direct DOM HUD updates (bypassing React render cycle)
      if (scoreRef.current) {
        scoreRef.current.textContent = String(world.score || 0);
      }
      if (fuelBarRef.current) {
        const pct = Math.max(0, Math.min(100, Math.round(world.fuel * 100)));
        fuelBarRef.current.style.width = `${pct}%`;
      }

      // Target Data Panel: Visible only when grabbed == true
      if (targetPanelRef.current) {
        const grabbed = world.grabbed;
        if (grabbed) {
          targetPanelRef.current.style.display = 'flex';
          if (noradRef.current) {
            noradRef.current.textContent = grabbed.id || 'DEBRIS-01';
          }
          if (massRef.current) {
            massRef.current.textContent = `${grabbed.mass.toFixed(0)} kg`;
          }
          if (lifetimeRef.current) {
            const vx = (grabbed.x - grabbed.px) / FIXED_DT;
            const isPrograde = vx > 0;
            if (isPrograde) {
              lifetimeRef.current.textContent = '100+ Years (Congestion Hazard)';
              lifetimeRef.current.style.color = 'var(--pink)';
            } else {
              lifetimeRef.current.textContent = '0 Years (Safe Deorbit)';
              lifetimeRef.current.style.color = 'var(--sky)';
            }
          }
        } else {
          targetPanelRef.current.style.display = 'none';
        }
      }
    }

    rafRef.current = requestAnimationFrame(loop);

    // Input Handlers
    function canvasCoords(e) {
      const b = canvas.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    }

    function onPointerDown(e) {
      initAudio();
      const pt = canvasCoords(e);
      if (e.button === 0) {
        if (!inGameRef.current) {
          setInGame(true);
        }
        world.grab(pt.x, pt.y);
      }
    }

    function onPointerMove(e) {
      const pt = canvasCoords(e);
      world.pointer.x = pt.x;
      world.pointer.y = pt.y;
    }

    function onPointerUp(e) {
      if (e.button === 0) {
        world.release();
      }
    }

    function onKeyDown(e) {
      if (keysRef.current.has(e.code)) return;
      keysRef.current.add(e.code);

      // Auto-initiate mission on gameplay keypress
      if (!inGameRef.current && (e.code === 'KeyE' || e.code === 'Space' || e.code === 'KeyQ' || e.code === 'Enter')) {
        initAudio();
        setInGame(true);
      }

      if (e.code === 'Space') {
        world.setThrusting(true);
        e.preventDefault();
      } else if (e.code === 'KeyE') {
        initAudio();
        world.grabNearest();
        e.preventDefault();
      } else if (e.code === 'KeyQ') {
        world.release();
        e.preventDefault();
      } else if (e.code === 'Escape') {
        setInGame((prev) => !prev);
      }
    }

    function onKeyUp(e) {
      keysRef.current.delete(e.code);
      if (e.code === 'Space') {
        world.setThrusting(false);
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', resize);

    return () => {
      activeRef.current = false;
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--night)',
        color: 'var(--white)',
        userSelect: 'none',
      }}
    >
      {/* Mandatory Custom Cursor */}
      <Cursor />

      {/* Main Menu with MicroSlats Background */}
      <MainMenu onStart={handleStartMission} visible={!inGame} />

      {/* In-Game HUD */}
      <HUD
        scoreRef={scoreRef}
        fuelBarRef={fuelBarRef}
        targetPanelRef={targetPanelRef}
        noradRef={noradRef}
        massRef={massRef}
        lifetimeRef={lifetimeRef}
        visible={inGame}
      />

      {/* WebGL Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100vw',
          height: '100vh',
          opacity: inGame ? 1 : 0,
          transition: 'opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />
    </div>
  );
}
