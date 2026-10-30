/**
 * Debris Derby — NASA International Space Apps Challenge 2026.
 *
 * Full Production Architecture:
 * - Single WebGL canvas mounted in ref, driven by rAF outside React's render cycle.
 * - React handles UI chrome: MainMenu, HUD, LevelModal, Tutorial, and TouchControls.
 * - Real-time zero-g tether pendulum physics with rigid constraint and tangential swing.
 * - Socket.io live ambient catalog and server-authoritative leaderboard run submission.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { World, FIXED_DT } from './physics/world.js';
import { WebGLPhysicsRenderer } from './lib/physicsRenderer.ts';
import { initAudio } from './game/audio.js';
import { getLevelDef, LEVEL_DEFS } from './game/levels.js';

import Cursor from './components/Cursor.jsx';
import MainMenu from './components/MainMenu.jsx';
import HUD from './components/HUD.jsx';
import TutorialOverlay from './components/TutorialOverlay.jsx';
import LevelModal from './components/LevelModal.jsx';
import TouchControls from './components/TouchControls.jsx';
import SplitText from './components/SplitText.jsx';

const MAX_SUBSTEPS = 5;
const DEFAULT_SEED = 2026;

function parseParams() {
  if (typeof window === 'undefined') return { seed: DEFAULT_SEED, level: 1 };
  const params = new URLSearchParams(window.location.search);
  const seed = params.has('seed') ? Number(params.get('seed')) : DEFAULT_SEED;
  const level = params.has('level') ? Number(params.get('level')) : 1;
  const autoplay = params.get('autoplay') === '1' || params.get('mode') === 'game';
  return { seed, level, autoplay };
}

export default function App() {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const worldRef = useRef(null);
  const rafRef = useRef(0);
  const activeRef = useRef(false);
  const accRef = useRef(0);
  const keysRef = useRef(new Set());
  const socketRef = useRef(null);
  const startTimeRef = useRef(0);

  // HUD DOM refs for zero-overhead direct DOM updates
  const scoreRef = useRef(null);
  const fuelBarRef = useRef(null);
  const targetPanelRef = useRef(null);
  const noradRef = useRef(null);
  const massRef = useRef(null);
  const lifetimeRef = useRef(null);

  // High-level game state
  const [inGame, setInGame] = useState(() => {
    const { autoplay } = parseParams();
    return autoplay;
  });
  const inGameRef = useRef(inGame);

  const [currentLevel, setCurrentLevel] = useState(1);
  const [levelModalOpen, setLevelModalOpen] = useState(false);
  const [modalState, setModalState] = useState(null); // 'cleared' | 'failed' | null
  const [endScore, setEndScore] = useState(0);
  const [endFuel, setEndFuel] = useState(1);
  const [levelIntroTitle, setLevelIntroTitle] = useState('FIRST CONTACT');
  const [showIntro, setShowIntro] = useState(true);
  const [tutorialStep, setTutorialStep] = useState(1); // 1: Grab, 2: Thrust, 3: Release
  const [isTouchDevice] = useState(() => {
    return (
      typeof window !== 'undefined' &&
      (Boolean(window.matchMedia?.('(pointer: coarse)').matches) || 'ontouchstart' in window)
    );
  });

  const levelDef = getLevelDef(currentLevel) || LEVEL_DEFS[0];

  useEffect(() => {
    inGameRef.current = inGame;
  }, [inGame]);

  // Level introduction banner timeout
  useEffect(() => {
    if (!showIntro) return;
    const t = setTimeout(() => setShowIntro(false), 2200);
    return () => clearTimeout(t);
  }, [showIntro]);

  // Switch or reload level
  const loadLevel = useCallback((lvlId) => {
    const target = Math.max(1, Math.min(8, lvlId));
    setCurrentLevel(target);
    const def = getLevelDef(target);
    setLevelIntroTitle(def.name);
    setShowIntro(true);
    setModalState(null);
    setLevelModalOpen(false);
    setTutorialStep(1);

    if (worldRef.current) {
      worldRef.current.loadLevel(target);
    }
  }, []);

  const handleStartMission = useCallback(() => {
    initAudio();
    inGameRef.current = true;
    setInGame(true);
    setShowIntro(true);
    loadLevel(1);
  }, [loadLevel]);

  const handleNextLevel = useCallback(() => {
    loadLevel(currentLevel + 1);
  }, [currentLevel, loadLevel]);

  const handleRetry = useCallback(() => {
    loadLevel(currentLevel);
  }, [currentLevel, loadLevel]);

  // Mobile virtual joystick thrust callback
  const handleThrustChange = useCallback((thrusting, dir = null) => {
    if (worldRef.current) {
      worldRef.current.setThrusting(thrusting, dir);
    }
  }, []);

  const handleGrabNearest = useCallback(() => {
    initAudio();
    if (worldRef.current) {
      worldRef.current.grabNearest();
    }
  }, []);

  const handleRelease = useCallback(() => {
    if (worldRef.current) {
      worldRef.current.release();
    }
  }, []);

  // Socket.io initialization
  useEffect(() => {
    const socket = io({
      autoConnect: true,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 3,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      // connected to server
    });

    socket.on('ambient_catalog', (payload) => {
      if (worldRef.current && payload?.debris) {
        worldRef.current.ambientDebris = payload.debris;
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Main canvas and physics loop mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { seed, level } = parseParams();
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    const world = new World({
      width: rect.width || 800,
      height: rect.height || 600,
      devicePixelRatio: dpr,
      seed,
      levelId: level,
    });
    world.loadLevel(level);
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

    let reportedOutcome = false;

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

      // Check win / lose condition
      if (world.state === 'cleared' && !reportedOutcome) {
        reportedOutcome = true;
        setEndScore(world.score);
        setEndFuel(world.fuel);
        setModalState('cleared');
        setLevelModalOpen(true);

        // Submit run to server
        if (socketRef.current) {
          const runPayload = {
            levelId: world.levelId,
            callsign: 'Mission Commander',
            seed: world.seed,
            durationMs: Math.round(world.gameTime * 1000),
            fuelUsed: Math.round((1 - world.fuel) * world.fuelMax),
            deorbits: world.deorbits,
            lingers: world.lingers,
            clientScore: world.score,
          };
          socketRef.current.emit('run_submit', runPayload);
        }
      } else if (world.state === 'failed' && !reportedOutcome) {
        reportedOutcome = true;
        setEndScore(world.score);
        setEndFuel(0);
        setModalState('failed');
        setLevelModalOpen(true);
      } else if (world.state === 'playing') {
        reportedOutcome = false;
      }

      // Render WebGL frame
      const r = canvas.getBoundingClientRect();
      const timeSec = (now - startTimeRef.current) / 1000;
      renderer.render(world, r.width, r.height, timeSec);

      // Direct DOM HUD updates
      if (scoreRef.current) {
        scoreRef.current.textContent = String(world.score || 0);
      }
      if (fuelBarRef.current) {
        const pct = Math.max(0, Math.min(100, Math.round(world.fuel * 100)));
        fuelBarRef.current.style.width = `${pct}%`;
      }

      // Update Level 1 tutorial step
      if (world.levelId === 1) {
        if (!world.grabbed) {
          setTutorialStep(1);
        } else if (!world.thrusting) {
          setTutorialStep(2);
        } else {
          setTutorialStep(3);
        }
      }

      // Target Data Panel: Visible only when grabbed == true
      if (targetPanelRef.current) {
        const grabbed = world.grabbed;
        if (grabbed) {
          targetPanelRef.current.style.display = 'flex';
          if (noradRef.current) {
            noradRef.current.textContent = grabbed.id || 'SAT-01';
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
          inGameRef.current = true;
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

      // Auto-start on game controls
      if (!inGameRef.current && (e.code === 'KeyE' || e.code === 'Space' || e.code === 'KeyQ' || e.code === 'Enter')) {
        initAudio();
        inGameRef.current = true;
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
        setLevelModalOpen((prev) => !prev);
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
      {/* Custom Cursor */}
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
        currentLevel={currentLevel}
        levelName={levelDef.name}
        onOpenLevelModal={() => setLevelModalOpen(true)}
        visible={inGame}
      />

      {/* Level 1 Step-by-Step Tutorial Overlay */}
      <TutorialOverlay
        levelId={currentLevel}
        step={tutorialStep}
        visible={inGame && currentLevel === 1}
      />

      {/* Level Intro Typography Banner */}
      {inGame && showIntro && (
        <div
          style={{
            position: 'fixed',
            top: '84px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 45,
            pointerEvents: 'none',
            textAlign: 'center',
          }}
        >
          <SplitText
            text={`MISSION 0${currentLevel}: ${levelIntroTitle.toUpperCase()}`}
            className="level-intro-text"
            effect="wave"
            style={{
              fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--sky)',
              letterSpacing: '0.12em',
              textShadow: '0 4px 16px rgba(0, 0, 0, 0.9)',
            }}
          />
        </div>
      )}

      {/* Level Select / Cleared / Aborted Modal */}
      <LevelModal
        currentLevel={currentLevel}
        state={modalState}
        score={endScore}
        fuel={endFuel}
        onSelectLevel={loadLevel}
        onNextLevel={handleNextLevel}
        onRetry={handleRetry}
        onClose={() => setLevelModalOpen(false)}
        visible={levelModalOpen}
      />

      {/* Mobile Touch Controls */}
      {inGame && isTouchDevice && (
        <TouchControls
          onThrustChange={handleThrustChange}
          onGrabNearest={handleGrabNearest}
          onRelease={handleRelease}
        />
      )}

      {/* WebGL Physics Canvas */}
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
