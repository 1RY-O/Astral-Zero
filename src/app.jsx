/**
 * Debris Derby — Phase 4 Core loop and React shell.
 *
 * Fixed-step 60 Hz accumulator, rAF loop outside React render cycle.
 * Full game loop with Levels 1–3, scoring formulas, cascades,
 * and audio effects.
 */

import { useEffect, useRef } from 'react';
import { World, FIXED_DT } from './physics/world.js';
import { drawWorld } from './physics/render.js';
import { getLevelDef } from './game/levels.js';
import { initAudio } from './game/audio.js';

const MAX_SUBSTEPS = 5;
const DEFAULT_SEED = 2026;

function parseParams() {
  const params = new URLSearchParams(window.location.search);
  const seed = params.has('seed') ? Number(params.get('seed')) : DEFAULT_SEED;
  const level = params.has('level') ? Number(params.get('level')) : 1;
  return { seed, level };
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
  bottom: '12px',
  zIndex: 10,
  padding: '8px 12px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
  fontSize: '11px',
  lineHeight: '1.45',
  color: 'rgba(255, 255, 255, 0.75)',
  background: 'rgba(6, 13, 31, 0.8)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  pointerEvents: 'none',
  whiteSpace: 'pre',
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

  const def = getLevelDef(world.levelId || 1);
  const lines = [
    `Level ${world.levelId || 1}: ${def.name}  ·  FPS: ${state.fps}`,
    `Hint: ${def.hint}`,
    loopError ? `ERROR: ${loopError}` : 'Click/E: Grab  ·  Space/WASD: Thrust  ·  Q/Click: Release  ·  R: Retry  ·  N: Next',
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
  const fpsRef = useRef({ frames: 0, t: 0, fps: 60 });
  const keysRef = useRef(new Set());

  useEffect(() => {
    fpsRef.current.t = performance.now();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { seed, level } = parseParams();

    const world = new World({
      width: canvas.clientWidth || 800,
      height: canvas.clientHeight || 600,
      devicePixelRatio: window.devicePixelRatio || 1,
      seed,
      levelId: level,
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

    const onPointerUp = () => {};

    const onKeyDown = (event) => {
      initAudio();
      try {
        keysRef.current.add(event.key);
        if (event.key === ' ' || event.key.startsWith('Arrow')) {
          event.preventDefault();
        }
        if (event.key === 'e' || event.key === 'E') {
          world.grabNearest();
        } else if (event.key === 'q' || event.key === 'Q') {
          world.release();
        } else if (event.key === 'r' || event.key === 'R') {
          world.loadLevel(world.levelId || 1);
        } else if (event.key === 'n' || event.key === 'N') {
          const nextLevel = Math.min(8, (world.levelId || 1) + 1);
          world.loadLevel(nextLevel);
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
