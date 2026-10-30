/**
 * Debris Derby — Phase 3 React shell.
 *
 * React mounts a single <canvas> in a ref once. The requestAnimationFrame
 * loop is started in an effect and never touches React's render cycle:
 * no per-frame setState, no React state for physics. The debug overlay is
 * plain DOM, updated imperatively from the loop (not product UI).
 */

import { useEffect, useRef } from 'react';
import { World, FIXED_DT } from './physics/world.js';
import { drawWorld } from './physics/render.js';

const MAX_SUBSTEPS = 5;
const DEFAULT_SEED = 2026;

function parseSeed() {
  const match = location.search.match(/[?&]seed=(\d+)/);
  return match ? Number(match[1]) : DEFAULT_SEED;
}

const shellStyle = {
  position: 'fixed',
  inset: 0,
  margin: 0,
  width: '100vw',
  height: '100vh',
  overflow: 'hidden',
  background: 'var(--canvas-dark)',
  color: 'var(--white)',
  touchAction: 'none',
};

const canvasStyle = {
  display: 'block',
  width: '100vw',
  height: '100vh',
};

const debugStyle = {
  position: 'fixed',
  left: '12px',
  top: '12px',
  zIndex: 10,
  padding: '10px 12px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
  fontSize: '12px',
  lineHeight: '1.55',
  color: 'var(--white)',
  background: 'rgba(6, 13, 31, 0.65)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  pointerEvents: 'none',
  whiteSpace: 'pre',
  maxWidth: '34vw',
};

function resize(canvas, ctx, world) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  world.setSize(rect.width, rect.height);
}

function paintDebug(debug, world, fpsRef, now, loopError) {
  const state = fpsRef.current;
  state.frames += 1;
  if (now - state.t >= 1000) {
    state.fps = state.frames;
    state.frames = 0;
    state.t = now;
  }

  const lines = [
    `seed: ${world.seed}`,
    `fps: ${state.fps}`,
    `substeps: ${world.substeps}/${MAX_SUBSTEPS}`,
    `fuel: ${(world.fuel * 100).toFixed(0)}%`,
    `tension: ${world.tension.toFixed(1)} px`,
    `grabbed: ${world.grabbed ? 'yes' : 'no'}`,
    `objects: ${world.particles.length}`,
    '',
    loopError ? `ERROR: ${loopError}` : 'click / E   grab   ·   hold Space   thrust   ·   Q / release',
    '?seed=   rerolls the debris swarm',
  ];
  debug.textContent = lines.join('\n');
}

export default function App() {
  const canvasRef = useRef(null);
  const debugRef = useRef(null);
  const worldRef = useRef(null);
  const rafRef = useRef(0);
  const activeRef = useRef(false);
  const accRef = useRef(0);
  const pausedRef = useRef(false);
  const fpsRef = useRef({ frames: 0, t: 0, fps: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const world = new World({
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      seed: parseSeed(),
    });
    worldRef.current = world;

    // Plain-DOM debug overlay (not product UI).
    const debug = document.createElement('div');
    Object.assign(debug.style, debugStyle);
    document.body.appendChild(debug);
    debugRef.current = debug;

    resize(canvas, ctx, world);

    let last = performance.now();
    let loopError = null;
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
        paintDebug(debug, world, fpsRef, now, loopError);
      } catch (err) {
        loopError = err.message;
        paintDebug(debug, world, fpsRef, now, loopError);
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    activeRef.current = true;
    rafRef.current = requestAnimationFrame(loop);

    const onPointerDown = (event) => {
      try {
        const rect = canvas.getBoundingClientRect();
        world.grab(event.clientX - rect.left, event.clientY - rect.top);
      } catch (err) {
        loopError = err.message;
      }
    };
    const onPointerUp = () => {
      try { world.release(); } catch (err) { loopError = err.message; }
    };
    const onKeyDown = (event) => {
      try {
        if (event.key === ' ') {
          event.preventDefault();
          world.setThrusting(true);
        } else if (event.key === 'e' || event.key === 'E') {
          world.grabNearest();
        } else if (event.key === 'q' || event.key === 'Q') {
          world.release();
        }
      } catch (err) {
        loopError = err.message;
      }
    };
    const onKeyUp = (event) => {
      try {
        if (event.key === ' ') {
          event.preventDefault();
          world.setThrusting(false);
        }
      } catch (err) {
        loopError = err.message;
      }
    };
    const onResize = () => resize(canvas, ctx, world);
    const onVisibilityChange = () => {
      pausedRef.current = document.visibilityState === 'hidden';
      last = performance.now();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onResize);
    window.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      activeRef.current = false;
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('visibilitychange', onVisibilityChange);
      if (debugRef.current && debugRef.current.parentElement) {
        debugRef.current.parentElement.removeChild(debugRef.current);
      }
    };
  }, []);

  return (
    <div style={shellStyle}>
      <canvas ref={canvasRef} style={canvasStyle} />
      <div ref={debugRef} />
    </div>
  );
}