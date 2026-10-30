/**
 * Debris Derby — Phase 3 Zero-G Physics Sandbox.
 *
 * Bare canvas testbed for verifying zero-g tether physics:
 * - GRAB (Click / E)
 * - SWING (Hold Space / WASD)
 * - RELEASE (Q / Mouse-Up)
 * - 7 floating debris objects in zero-g Low Earth Orbit
 * - Clean plain-DOM debug text overlay (strictly tokens: #38BDF8, #FF2D95, #FFFFFF)
 * - NO mouse trail / cursor follower
 * - NO top HUD bar
 */

import { useEffect, useRef } from 'react';
import { World, FIXED_DT } from './physics/world.js';
import { drawWorld } from './physics/render.js';
import { initAudio } from './game/audio.js';

const MAX_SUBSTEPS = 5;
const DEFAULT_SEED = 2026;

function parseSeed() {
  if (typeof window === 'undefined') return DEFAULT_SEED;
  const match = location.search.match(/[?&]seed=(\d+)/);
  return match ? Number(match[1]) : DEFAULT_SEED;
}

function resize(canvas, ctx, world) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  world.setSize(rect.width, rect.height);
}

export default function App() {
  const canvasRef = useRef(null);
  const debugRef = useRef(null);
  const worldRef = useRef(null);
  const rafRef = useRef(0);
  const activeRef = useRef(false);
  const accRef = useRef(0);
  const pausedRef = useRef(false);
  const fpsRef = useRef({ frames: 0, t: 0, fps: 60 });
  const keysRef = useRef(new Set());

  useEffect(() => {
    fpsRef.current.t = performance.now();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const seed = parseSeed();
    const world = new World({
      width: canvas.clientWidth || 800,
      height: canvas.clientHeight || 600,
      devicePixelRatio: window.devicePixelRatio || 1,
      seed,
    });
    worldRef.current = world;

    resize(canvas, ctx, world);

    let last = performance.now();
    let loopError = null;

    function paintDebugOverlay(now) {
      const debug = debugRef.current;
      if (!debug) return;

      const state = fpsRef.current;
      state.frames += 1;
      const elapsed = now - state.t;
      if (elapsed >= 500) {
        state.fps = Math.round((state.frames * 1000) / elapsed);
        state.frames = 0;
        state.t = now;
      }

      const fuelPct = Math.round(world.fuel * 100);
      const fuelBarLen = 12;
      const filledBars = Math.round((fuelPct / 100) * fuelBarLen);
      const fuelBar = '█'.repeat(filledBars) + '░'.repeat(fuelBarLen - filledBars);

      const grabbedText = world.grabbed
        ? `${world.grabbed.id} (${world.grabbed.mass.toFixed(0)} kg)`
        : 'NONE';

      debug.innerHTML = `
        <div style="color: var(--sky-400); font-weight: 700; font-size: 13px; letter-spacing: 0.08em; margin-bottom: 2px;">
          DEBRIS DERBY // ZERO-G PHYSICS TESTBED
        </div>
        <div style="color: rgba(255, 255, 255, 0.55); font-size: 10px; margin-bottom: 10px;">
          built for the NASA International Space Apps Challenge 2026
        </div>
        <div style="height: 1px; background: rgba(56, 189, 248, 0.25); margin-bottom: 10px;"></div>

        <div style="display: grid; grid-template-columns: 88px 1fr; gap: 4px; font-size: 11px; line-height: 1.5;">
          <span style="color: rgba(255, 255, 255, 0.6);">FPS:</span>
          <span style="color: var(--sky-400); font-weight: 700;">${state.fps}</span>

          <span style="color: rgba(255, 255, 255, 0.6);">OBJECTS:</span>
          <span style="color: var(--white); font-weight: 700;">${world.particles.length} floating in zero-g</span>

          <span style="color: rgba(255, 255, 255, 0.6);">FUEL:</span>
          <span style="color: ${fuelPct > 25 ? 'var(--sky-400)' : 'var(--pink-500)'}; font-weight: 700;">
            ${fuelPct}% <span style="font-size: 9px; opacity: 0.85;">[${fuelBar}]</span>
          </span>

          <span style="color: rgba(255, 255, 255, 0.6);">GRABBED:</span>
          <span style="color: ${world.grabbed ? 'var(--pink-500)' : 'rgba(255, 255, 255, 0.4)'}; font-weight: 700;">
            ${grabbedText}
          </span>

          <span style="color: rgba(255, 255, 255, 0.6);">TENSION:</span>
          <span style="color: ${world.tension > 20 ? 'var(--pink-500)' : 'var(--sky-400)'};">
            ${world.tension.toFixed(1)} px
          </span>

          <span style="color: rgba(255, 255, 255, 0.6);">DEORBITS:</span>
          <span style="color: var(--sky-400);">${world.burnedCount}</span>
        </div>

        <div style="height: 1px; background: rgba(56, 189, 248, 0.25); margin: 10px 0;"></div>

        <div style="font-size: 11px; line-height: 1.6;">
          <div style="color: var(--sky-400); font-weight: 700; margin-bottom: 2px;">CONTROLS:</div>
          <div><b style="color: var(--white);">Click</b> debris / <b style="color: var(--white);">E</b> &nbsp;— Grab nearest</div>
          <div><b style="color: var(--white);">Hold Space</b> &nbsp;— Thrust & swing along normal</div>
          <div><b style="color: var(--white);">WASD</b> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;— Directional thrust vector</div>
          <div><b style="color: var(--white);">Q / Mouse-Up</b> — Release payload</div>
          <div><b style="color: var(--white);">R</b> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;— Reset & respawn swarm</div>
        </div>

        ${loopError ? `<div style="color: var(--pink-500); font-weight: 700; margin-top: 8px;">ERROR: ${loopError}</div>` : ''}
      `;
    }

    function loop(now) {
      if (!activeRef.current) return;

      try {
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;

        if (!pausedRef.current) {
          accRef.current += dt;
          let substeps = 0;
          while (accRef.current >= FIXED_DT && substeps < MAX_SUBSTEPS) {
            world.step();
            accRef.current -= FIXED_DT;
            substeps += 1;
          }
          world.substeps = substeps;
        }

        drawWorld(ctx, world, canvas.clientWidth, canvas.clientHeight);
        paintDebugOverlay(now);
      } catch (err) {
        loopError = err.message;
        console.error('[Debris Derby Loop Error]', err);
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    activeRef.current = true;
    rafRef.current = requestAnimationFrame(loop);

    const updateKeyboardThrust = () => {
      const keys = keysRef.current;
      let dx = 0;
      let dy = 0;
      let hasDirectionKey = false;
      let hasThrust = false;

      if (keys.has(' ') || keys.has('Space')) hasThrust = true;
      if (keys.has('w') || keys.has('W') || keys.has('ArrowUp')) { dy -= 1; hasDirectionKey = true; }
      if (keys.has('s') || keys.has('S') || keys.has('ArrowDown')) { dy += 1; hasDirectionKey = true; }
      if (keys.has('a') || keys.has('A') || keys.has('ArrowLeft')) { dx -= 1; hasDirectionKey = true; }
      if (keys.has('d') || keys.has('D') || keys.has('ArrowRight')) { dx += 1; hasDirectionKey = true; }

      if (hasThrust || hasDirectionKey) {
        world.setThrusting(true, hasDirectionKey ? { x: dx, y: dy } : null);
      } else {
        world.setThrusting(false, null);
      }
    };

    const onPointerDown = (event) => {
      initAudio();
      try {
        const rect = canvas.getBoundingClientRect();
        const clientX = event.clientX - rect.left;
        const clientY = event.clientY - rect.top;
        world.grab(clientX, clientY);
      } catch (err) {
        loopError = err.message;
      }
    };

    const onPointerUp = () => {
      try {
        if (world.grabbed) {
          world.release();
        }
      } catch (err) {
        loopError = err.message;
      }
    };

    const onKeyDown = (event) => {
      initAudio();
      keysRef.current.add(event.key);
      if (event.key === ' ' || event.key.startsWith('Arrow')) {
        event.preventDefault();
      }
      if (event.key === 'e' || event.key === 'E') {
        world.grabNearest();
      } else if (event.key === 'q' || event.key === 'Q') {
        world.release();
      } else if (event.key === 'r' || event.key === 'R') {
        world.resetSwarm();
      }
      updateKeyboardThrust();
    };

    const onKeyUp = (event) => {
      keysRef.current.delete(event.key);
      updateKeyboardThrust();
    };

    const onResize = () => resize(canvas, ctx, world);
    const onVisibilityChange = () => {
      pausedRef.current = document.visibilityState === 'hidden';
      last = performance.now();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('mousedown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onResize);
    window.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      activeRef.current = false;
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('visibilitychange', onVisibilityChange);
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
        background: 'var(--canvas-dark)',
        color: 'var(--white)',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100vw',
          height: '100vh',
          cursor: 'crosshair',
        }}
      />

      <div
        ref={debugRef}
        style={{
          position: 'fixed',
          top: '16px',
          left: '16px',
          zIndex: 10,
          background: 'rgba(6, 13, 31, 0.88)',
          border: '1px solid var(--sky-400)',
          borderRadius: '8px',
          padding: '14px 18px',
          color: 'var(--white)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65), 0 0 12px rgba(56, 189, 248, 0.15)',
          pointerEvents: 'none',
          maxWidth: '420px',
        }}
      />
    </div>
  );
}
