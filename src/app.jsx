/**
 * Debris Derby — React UI Chrome and Physics Mount.
 *
 * Architecture rules:
 * - React mounts <canvas> once in a ref.
 * - rAF loop runs entirely outside React's render cycle (zero per-frame setState).
 * - React manages UI chrome: menus, HUD, level select, reports, theme.
 * - ReactBits integration:
 *   - Main menu: SpotlightCard, Magnet
 *   - Score/Fuel: CountUp
 *   - Level Intro: SplitText
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { World, FIXED_DT } from './physics/world.js';
import { drawWorld } from './physics/render.js';
import { getLevelDef, LEVEL_DEFS } from './game/levels.js';
import { initAudio, isMuted, toggleMute } from './game/audio.js';

import SpotlightCard from './components/SpotlightCard.jsx';
import Magnet from './components/Magnet.jsx';
import CountUp from './components/CountUp.jsx';
import SplitText from './components/SplitText.jsx';
import TouchControls from './components/TouchControls.jsx';

const MAX_SUBSTEPS = 5;
const DEFAULT_SEED = 2026;

function parseParams() {
  if (typeof window === 'undefined') return { seed: DEFAULT_SEED, level: 1 };
  const params = new URLSearchParams(window.location.search);
  const seed = params.has('seed') ? Number(params.get('seed')) : DEFAULT_SEED;
  const level = params.has('level') ? Number(params.get('level')) : 1;
  return { seed, level };
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
  const worldRef = useRef(null);
  const rafRef = useRef(0);
  const activeRef = useRef(false);
  const accRef = useRef(0);
  const pausedRef = useRef(false);
  const fpsRef = useRef({ frames: 0, t: 0, fps: 60 });
  const keysRef = useRef(new Set());

  // React Chrome State (low-frequency updates only)
  const [levelId, setLevelId] = useState(1);
  const [theme, setTheme] = useState('dark');
  const [muted, setMutedState] = useState(() => isMuted());
  const [menuOpen, setMenuOpen] = useState(false);
  const [levelSelectOpen, setLevelSelectOpen] = useState(false);
  const [levelIntro, setLevelIntro] = useState(true);
  const [report, setReport] = useState(null); // { state, score, deorbits, fuelBonus }
  const [hudState, setHudState] = useState({ score: 0, fuel: 100, chain: 0 });
  const [catalogStatus, setCatalogStatus] = useState('live');
  const [isTouch] = useState(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window)
  );

  const currentLevelDef = getLevelDef(levelId);

  // Toggle dark/light theme
  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  }, [theme]);

  // Audio toggle
  const handleToggleMute = useCallback(() => {
    const m = toggleMute();
    setMutedState(m);
  }, []);

  // Level switch
  const switchLevel = useCallback((id) => {
    const target = Math.max(1, Math.min(8, id));
    setLevelId(target);
    setLevelIntro(true);
    setReport(null);
    setLevelSelectOpen(false);
    setMenuOpen(false);
    if (worldRef.current) {
      worldRef.current.loadLevel(target);
    }
  }, []);

  useEffect(() => {
    fpsRef.current.t = performance.now();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { seed, level } = parseParams();
    setLevelId(level);

    const socket = io({
      autoConnect: true,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 3,
    });

    socket.on('connected', (payload) => {
      if (payload?.catalog?.catalogStatus) {
        setCatalogStatus(payload.catalog.catalogStatus);
      }
    });

    socket.on('ambient_catalog', (payload) => {
      if (payload?.catalogStatus) {
        setCatalogStatus(payload.catalogStatus);
      }
    });

    const world = new World({
      width: canvas.clientWidth || 800,
      height: canvas.clientHeight || 600,
      devicePixelRatio: window.devicePixelRatio || 1,
      seed,
      levelId: level,
    });
    worldRef.current = world;

    resize(canvas, ctx, world);

    let last = performance.now();
    let hudTimer = 0;

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

        // Check if level ended
        if (world.state === 'cleared' || world.state === 'failed') {
          if (!report) {
            setReport({
              state: world.state,
              score: world.score,
              deorbits: world.deorbits.length,
              fuelPct: Math.round(world.fuel * 100),
            });
            if (world.state === 'cleared' && socket && world.deorbits.length > 0) {
              const payload = {
                levelId: world.levelId || 1,
                callsign: 'TUG PILOT',
                seed: world.seed,
                durationMs: Math.min(3600000, Math.round(world.gameTime * 1000)),
                fuelUsed: Math.max(0, Math.min(1000000, Math.round((1 - world.fuel) * world.fuelMax))),
                lingers: world.lingers,
                deorbits: world.deorbits,
                clientScore: world.score,
              };
              socket.emit('run_submit', payload, (res) => {
                if (res?.ok) {
                  console.log('[Run Submitted to Leaderboard]', res);
                }
              });
            }
          }
        }

        // Throttle React HUD updates to 4 Hz
        hudTimer += dt;
        if (hudTimer >= 0.25) {
          hudTimer = 0;
          setHudState({
            score: world.score,
            fuel: Math.round(world.fuel * 100),
            chain: world.chain,
          });
        }
      } catch (err) {
        console.error('[Debris Derby Render Loop Error]', err);
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

    let isTouchingPayload = false;

    const onPointerDown = (event) => {
      initAudio();
      try {
        const rect = canvas.getBoundingClientRect();
        const clientX = event.clientX - rect.left;
        const clientY = event.clientY - rect.top;
        const grabbed = world.grab(clientX, clientY);
        if (grabbed) {
          isTouchingPayload = true;
        }
      } catch (err) {
        console.error(err);
      }
    };

    const onPointerMove = (event) => {
      if (isTouchingPayload && world.grabbed) {
        const rect = canvas.getBoundingClientRect();
        world.pointer.x = event.clientX - rect.left;
        world.pointer.y = event.clientY - rect.top;
      }
    };

    const onPointerUp = (event) => {
      if (isTouchingPayload && world.grabbed) {
        if (event.pointerType === 'touch' || isTouch) {
          world.release();
        }
      }
      isTouchingPayload = false;
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
        world.loadLevel(world.levelId || 1);
        setReport(null);
      } else if (event.key === 'Escape') {
        setMenuOpen((prev) => !prev);
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
    canvas.addEventListener('pointermove', onPointerMove);
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
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('visibilitychange', onVisibilityChange);
      socket.disconnect();
    };
  }, [report, isTouch]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: 'var(--font-body)',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {/* 60Hz Physics Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100vw',
          height: '100vh',
        }}
      />

      {/* Top React Navigation Chrome */}
      <header
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          pointerEvents: 'none',
          zIndex: 'var(--z-hud)',
        }}
      >
        <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Magnet padding={40}>
            <button
              onClick={() => setMenuOpen(true)}
              style={{
                minHeight: 'var(--touch-target-min)',
                padding: '8px 18px',
                background: 'var(--surface-strong)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-pill)',
                color: 'var(--text)',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 'var(--text-sm)',
                letterSpacing: '0.04em',
                cursor: 'pointer',
              }}
              aria-label="Open mission control menu"
            >
              MENU
            </button>
          </Magnet>

          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: 'var(--tracking-eyebrow)' }}>
              MISSION {levelId} / 8
            </div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text)' }}>
              {currentLevelDef.name}
            </div>
          </div>
        </div>

        {/* Live Counters with CountUp */}
        <div
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            padding: '8px 20px',
            borderRadius: 'var(--radius-pill)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginRight: '8px' }}>SCORE</span>
            <span style={{ fontSize: 'var(--text-base)', fontWeight: 700, fontFamily: 'var(--font-numeric)', color: 'var(--sky-400)' }}>
              <CountUp to={hudState.score} />
            </span>
          </div>

          <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />

          <div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginRight: '8px' }}>FUEL</span>
            <span
              style={{
                fontSize: 'var(--text-base)',
                fontWeight: 700,
                fontFamily: 'var(--font-numeric)',
                color: hudState.fuel > 25 ? 'var(--sky-400)' : 'var(--pink-500)',
              }}
            >
              <CountUp to={hudState.fuel} />%
            </span>
          </div>

          <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title="Celestrak live ambient TLE feed (2 Hz)">
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: catalogStatus === 'live' ? 'var(--sky-400)' : 'var(--pink-500)',
                display: 'inline-block',
              }}
            />
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-numeric)' }}>
              CELESTRAK {catalogStatus.toUpperCase()}
            </span>
          </div>

          <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />

          <button
            onClick={toggleTheme}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 'var(--text-sm)',
              minHeight: 'var(--touch-target-min)',
              minWidth: 'var(--touch-target-min)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Toggle dark/light theme"
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>

          <button
            onClick={handleToggleMute}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 'var(--text-sm)',
              minHeight: 'var(--touch-target-min)',
              minWidth: 'var(--touch-target-min)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Toggle audio sound"
          >
            {muted ? 'MUTED' : 'AUDIO'}
          </button>
        </div>
      </header>

      {/* Level Intro Modal with SplitText */}
      {levelIntro && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(6, 13, 31, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 'var(--z-modal)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <SpotlightCard
            style={{
              maxWidth: '560px',
              width: '90%',
              padding: '40px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--sky-400)', letterSpacing: 'var(--tracking-eyebrow)', marginBottom: '12px' }}>
              LEVEL {levelId} OPERATION
            </div>

            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-3xl)',
                fontWeight: 800,
                color: 'var(--text)',
                margin: '0 0 16px 0',
                lineHeight: 1.1,
              }}
            >
              <SplitText text={currentLevelDef.name} />
            </h1>

            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base)', lineHeight: 1.6, marginBottom: '28px' }}>
              {currentLevelDef.hint}
            </p>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Magnet padding={50}>
                <button
                  onClick={() => setLevelIntro(false)}
                  style={{
                    minHeight: 'var(--touch-target-min)',
                    padding: '14px 36px',
                    background: 'var(--sky-400)',
                    color: 'var(--ink)',
                    border: 'none',
                    borderRadius: 'var(--radius-pill)',
                    fontWeight: 700,
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--text-base)',
                    cursor: 'pointer',
                  }}
                >
                  ENGAGE TETHER
                </button>
              </Magnet>
            </div>
          </SpotlightCard>
        </div>
      )}

      {/* Mission Complete / Report Modal */}
      {report && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(6, 13, 31, 0.88)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 'var(--z-modal)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <SpotlightCard
            style={{
              maxWidth: '520px',
              width: '90%',
              padding: '36px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: report.state === 'cleared' ? 'var(--sky-400)' : 'var(--pink-500)',
                letterSpacing: 'var(--tracking-eyebrow)',
                marginBottom: '8px',
              }}
            >
              {report.state === 'cleared' ? 'ORBIT PURIFIED' : 'TETHER SEVERED'}
            </div>

            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-2xl)',
                fontWeight: 800,
                color: 'var(--text)',
                margin: '0 0 24px 0',
              }}
            >
              {report.state === 'cleared' ? 'MISSION REPORT' : 'OPERATION FAILED'}
            </h2>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
                marginBottom: '28px',
                textAlign: 'left',
                background: 'var(--surface)',
                padding: '20px',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>DEORBITS</div>
                <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, fontFamily: 'var(--font-numeric)' }}>
                  <CountUp to={report.deorbits} />
                </div>
              </div>

              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>FUEL REMAINING</div>
                <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, fontFamily: 'var(--font-numeric)' }}>
                  <CountUp to={report.fuelPct} />%
                </div>
              </div>

              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>TOTAL RECOVERY SCORE</div>
                <div
                  style={{
                    fontSize: 'var(--text-3xl)',
                    fontWeight: 800,
                    fontFamily: 'var(--font-numeric)',
                    color: 'var(--sky-400)',
                  }}
                >
                  <CountUp to={report.score} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <Magnet padding={40}>
                <button
                  onClick={() => {
                    if (worldRef.current) worldRef.current.loadLevel(levelId);
                    setReport(null);
                  }}
                  style={{
                    minHeight: 'var(--touch-target-min)',
                    padding: '12px 24px',
                    background: 'var(--surface-strong)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-pill)',
                    color: 'var(--text)',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  RETRY LEVEL
                </button>
              </Magnet>

              {report.state === 'cleared' && levelId < 8 && (
                <Magnet padding={40}>
                  <button
                    onClick={() => switchLevel(levelId + 1)}
                    style={{
                      minHeight: 'var(--touch-target-min)',
                      padding: '12px 28px',
                      background: 'var(--sky-400)',
                      color: 'var(--ink)',
                      border: 'none',
                      borderRadius: 'var(--radius-pill)',
                      fontFamily: 'var(--font-display)',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    NEXT LEVEL →
                  </button>
                </Magnet>
              )}
            </div>
          </SpotlightCard>
        </div>
      )}

      {/* Main Menu Modal with SpotlightCard */}
      {menuOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(6, 13, 31, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 'var(--z-modal)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <SpotlightCard
            style={{
              maxWidth: '480px',
              width: '90%',
              padding: '36px',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--sky-400)', letterSpacing: 'var(--tracking-eyebrow)' }}>
                NASA SPACE APPS CHALLENGE 2026
              </div>
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--text-3xl)',
                  fontWeight: 800,
                  margin: '4px 0 8px 0',
                  color: 'var(--text)',
                }}
              >
                DEBRIS DERBY
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>
                Zero weapons. Just mass, momentum, and a tether. Clear Earth&apos;s orbits before Kessler Syndrome closes the skies.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Magnet padding={30}>
                <button
                  onClick={() => setMenuOpen(false)}
                  style={{
                    width: '100%',
                    minHeight: 'var(--touch-target-min)',
                    background: 'var(--sky-400)',
                    color: 'var(--ink)',
                    border: 'none',
                    borderRadius: 'var(--radius-pill)',
                    fontWeight: 700,
                    fontFamily: 'var(--font-display)',
                    cursor: 'pointer',
                  }}
                >
                  RESUME MISSION
                </button>
              </Magnet>

              <Magnet padding={30}>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setLevelSelectOpen(true);
                  }}
                  style={{
                    width: '100%',
                    minHeight: 'var(--touch-target-min)',
                    background: 'var(--surface-strong)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-pill)',
                    color: 'var(--text)',
                    fontWeight: 700,
                    fontFamily: 'var(--font-display)',
                    cursor: 'pointer',
                  }}
                >
                  SELECT MISSION (1–8)
                </button>
              </Magnet>

              <Magnet padding={30}>
                <button
                  onClick={() => {
                    if (worldRef.current) worldRef.current.loadLevel(levelId);
                    setMenuOpen(false);
                  }}
                  style={{
                    width: '100%',
                    minHeight: 'var(--touch-target-min)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-pill)',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-display)',
                    cursor: 'pointer',
                  }}
                >
                  RESTART LEVEL
                </button>
              </Magnet>
            </div>
          </SpotlightCard>
        </div>
      )}

      {/* Level Select Modal */}
      {levelSelectOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(6, 13, 31, 0.88)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 'var(--z-modal)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <SpotlightCard
            style={{
              maxWidth: '680px',
              width: '92%',
              padding: '36px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--sky-400)', letterSpacing: 'var(--tracking-eyebrow)' }}>
                  MISSION MANIFEST
                </div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 800, margin: 0 }}>
                  CHOOSE LEVEL
                </h2>
              </div>

              <button
                onClick={() => setLevelSelectOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 'var(--text-xl)',
                  cursor: 'pointer',
                  minHeight: 'var(--touch-target-min)',
                  minWidth: 'var(--touch-target-min)',
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                gap: '12px',
              }}
            >
              {LEVEL_DEFS.map((lvl) => (
                <Magnet key={lvl.id} padding={20}>
                  <button
                    onClick={() => switchLevel(lvl.id)}
                    style={{
                      width: '100%',
                      minHeight: '64px',
                      background: lvl.id === levelId ? 'var(--sky-400)' : 'var(--surface)',
                      color: lvl.id === levelId ? 'var(--ink)' : 'var(--text)',
                      border: `1px solid ${lvl.id === levelId ? 'var(--sky-400)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-md)',
                      padding: '10px',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: 'var(--text-xs)', opacity: 0.75 }}>LEVEL {lvl.id}</div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                      {lvl.name}
                    </div>
                  </button>
                </Magnet>
              ))}
            </div>
          </SpotlightCard>
        </div>
      )}

      {/* Mobile Touch Controls */}
      {isTouch && (
        <TouchControls
          onThrustChange={(thrusting, dir) => worldRef.current?.setThrusting(thrusting, dir)}
          onGrabNearest={() => worldRef.current?.grabNearest()}
          onRelease={() => worldRef.current?.release()}
        />
      )}
    </div>
  );
}
