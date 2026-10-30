/**
 * Debris Derby — Phase 3 React shell.
 *
 * React mounts a single <canvas> in a ref once. The requestAnimationFrame
 * loop is started in an effect and never touches React's render cycle:
 * no per-frame setState, no React state for physics.
 * Fixed-step 60 Hz accumulator, max 5 substeps per frame.
 * Pointer events (down/up/click) and keyboard (E, Q, Space, WASD) are bound.
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
  userSelect: 'none',
};

const canvasStyle = {
  display: 'block',
  width: '100vw',
  height: '100vh',
  touchAction: 'none',
};

const debugStyle = {
  position: 'fixed',
  left: '12px',
  top: '12px',
  zIndex: 10,
  padding: '10px 14px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
  fontSize: '12px',
  lineHeight: '1.55',
  color: 'var(--white)',
  background: 'rgba(6, 13, 31, 0.75)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  pointerEvents: 'none',
  whiteSpace: 'pre',
  maxWidth: '38vw',
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
  const elapsed = now - state.t;
  if (elapsed >= 500) {
    state.fps = Math.round((state.frames * 1000) / elapsed);
    state.frames = 0;
    state.t = now;
  }

  const lines = [
    `seed: ${world.seed}`,
    `fps: ${state.fps}`,
    `substeps: ${world.substeps}/${MAX_SUBSTEPS}`,
    `fuel: ${(world.fuel * 100).toFixed(0)}%`,
    `tension: ${world.tension.toFixed(1)} px`,
    `grabbed: ${world.grabbed ? world.grabbed.id : 'none'}`,
    `objects: ${world.particles.length} (burned: ${world.burnedCount})`,
    '',
    loopError ? `ERROR: ${loopError}` : 'Click/E: Grab  ·  Space/WASD: Thrust  ·  Q/Click payload: Release',
    'Trajectory preview: 90-step dashed line  ·  Atmosphere: kill-zone',
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
  // Initialize with 60 fps to eliminate initial "fps: 0" display
  const fpsRef = useRef({ frames: 0, t: 0, fps: 60 });
  const keysRef = useRef(new Set());

  useEffect(() => {
    fpsRef.current.t = performance.now();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const world = new World({
      width: canvas.clientWidth || 800,
      height: canvas.clientHeight || 600,
      devicePixelRatio: window.devicePixelRatio || 1,
      seed: parseSeed(),
    });
    worldRef.current = world;

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

    const updateKeyboardThrust = () => {
      const keys = keysRef.current;
      let dx = 0;
      let dy = 0;
      let hasThrustKey = false;

      if (keys.has(' ') || keys.has('Space')) hasThrustKey = true;
      if (keys.has('w') || keys.has('W') || keys.has('ArrowUp')) { dy -= 1; hasThrustKey = true; }
      if (keys.has('s') || keys.has('S') || keys.has('ArrowDown')) { dy += 1; hasThrustKey = true; }
      if (keys.has('a') || keys.has('A') || keys.has('ArrowLeft')) { dx -= 1; hasThrustKey = true; }
      if (keys.has('d') || keys.has('D') || keys.has('ArrowRight')) { dx += 1; hasThrustKey = true; }

      if (hasThrustKey) {
        world.setThrusting(true, (dx !== 0 || dy !== 0) ? { x: dx, y: dy } : null);
      } else {
        world.setThrusting(false, null);
      }
    };

    const onPointerDown = (event) => {
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
      // Optional: keep tether attached on click, or release on pointerup if desired
    };

    const onKeyDown = (event) => {
      try {
        keysRef.current.add(event.key);
        if (event.key === ' ' || event.key.startsWith('Arrow')) {
          event.preventDefault();
        }
        if (event.key === 'e' || event.key === 'E') {
          world.grabNearest();
        } else if (event.key === 'q' || event.key === 'Q') {
          world.release();
        }
        updateKeyboardThrust();
      } catch (err) {
        loopError = err.message;
      }
    };

    const onKeyUp = (event) => {
      try {
        keysRef.current.delete(event.key);
        updateKeyboardThrust();
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
