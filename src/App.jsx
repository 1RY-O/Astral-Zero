/**
 * ASTRAL ZERO — Cockpit HUD Rebuild: Option A + C ("Show, Don't Tell").
 * Built for the NASA International Space Apps Challenge 2026.
 *
 * Core Principles:
 * - Read at a glance in < 1 second from visual instruments, not paragraphs.
 * - Solid glowing Trajectory Ribbon that sags toward Earth's atmospheric haze as swing pumps.
 * - Ghost arrow burn-direction teacher that pulses with W-hold timing and fades after 2 successful pumps.
 * - Wrong-direction prograde feedback: ribbon rises/dims with soft descending audio buzz.
 * - Concentric spin-match rings: outer (magenta hulk) & inner (cyan tug) snapping green on lock.
 * - Vertical Fuel Bar on left edge (amber/red flash under 25%/10%).
 * - Vertical Perigee Gauge on right edge with sliding hulk marker & glowing Capture Zone.
 * - Objective Chips: max 4 words at top-center with highlight pulse on change.
 * - Zero stylistic // separators across all rendered UI.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  CONSTANTS,
  createBody,
  integrateBody,
  applyImpulseAtOffset,
  solveTetherConstraint,
  evaluateDeorbit,
  predictOrbitalPath,
  checkCollision,
} from './engine/physics.js';
import { Vec } from './engine/vector.js';
import { FixedLoop } from './engine/loop.js';
import { chiptuneAudio } from './audio/chiptuneEngine.js';
import { megNarrator } from './game/megNarrator.js';
import AsciiLandingPage from './ui/AsciiLandingPage.jsx';
import PixelBootPreloader from './ui/PixelBootPreloader.jsx';
import CampaignCredits from './ui/CampaignCredits.jsx';
import './styles/globals.css';

const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

// 4 Contracts: Contract 0 (Tutorial) + 3 Active Campaign Missions (Zero // separators)
export const HULK_MANIFEST = [
  {
    id: 0,
    isTutorial: true,
    act: 'ACT 1 · TRAINING',
    name: 'CONTRACT 0 — LEO PROVING GROUND (TUTORIAL)',
    shortName: 'CONTRACT 0 · DRILL',
    targetName: 'TRAINING TARGET · SIM-00',
    designation: 'ORBITAL RIGGER DRILL · SIM-00',
    orbitShell: '350 KM LEO TRAINING SHELL',
    briefingLine1: 'TARGET: SIM-00 DOCKING TARGET · ORBIT: 350 KM LEO',
    briefingLine2: 'MISSION: LATCH DOCKING PIN, MATCH ROTATION, SWING AND RELEASE INTO RETROGRADE ARC.',
    mass: 380,
    radius: 32,
    spin: 0.75,
    conjunctionLimit: null,
  },
  {
    id: 1,
    isTutorial: false,
    act: 'ACT 2 · CONTRACT 01',
    name: 'MISSION 01 — SL-16 BOOSTER',
    shortName: 'MISSION 01 · SL-16',
    targetName: 'SL-16 BOOSTER',
    designation: 'SL-16 DEBRIS #4182',
    orbitShell: '450 KM LEO ORBIT',
    briefingLine1: 'TARGET: SL-16 BOOSTER · ORBIT: 450 KM LEO',
    briefingLine2: 'MISSION: LATCH TUMBLING STAGE, PUMP ANGULAR MOMENTUM, DRIVE PERIGEE UNDER 100 KM.',
    mass: 450,
    radius: 34,
    spin: 0.85,
    conjunctionLimit: null,
  },
  {
    id: 2,
    isTutorial: false,
    act: 'ACT 2 · CONTRACT 02',
    name: 'MISSION 02 — DELTA-K UPPER STAGE',
    shortName: 'MISSION 02 · DELTA-K',
    targetName: 'DELTA-K UPPER STAGE',
    designation: 'DELTA-K HULL #8821',
    orbitShell: '620 KM SSO ORBIT',
    briefingLine1: 'TARGET: DELTA-K UPPER STAGE · ORBIT: 620 KM SSO',
    briefingLine2: 'MISSION: HEAVY ANGULAR SPIN. USE SCROLL WHEEL TO REEL IN CABLE AND ACCELERATE ROTATION.',
    mass: 740,
    radius: 42,
    spin: 1.55,
    conjunctionLimit: null,
  },
  {
    id: 3,
    isTutorial: false,
    act: 'ACT 2 · CONTRACT 03',
    name: 'MISSION 03 — COSMOS RESIDUAL',
    shortName: 'MISSION 03 · COSMOS',
    targetName: 'COSMOS RESIDUAL',
    designation: 'COSMOS RESIDUAL #0944',
    orbitShell: '780 KM POLAR ORBIT',
    briefingLine1: 'TARGET: COSMOS RESIDUAL · ORBIT: 780 KM POLAR',
    briefingLine2: 'MISSION: CASCADE THREAT DETECTED. COMPLETE RETROGRADE DEORBIT BEFORE 75S CONJUNCTION.',
    mass: 890,
    radius: 46,
    spin: 1.88,
    conjunctionLimit: 75.0, // 75s per feel pass
  },
];

export default function App() {
  // Navigation: 'landing' ➔ 'boot' ➔ 'game'
  const [appMode, setAppMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'game' ? 'game' : 'landing';
  });

  const canvasRef = useRef(null);
  const loopRef = useRef(null);

  // Contract progression
  const [gameStatus, setGameStatus] = useState('playing'); // playing | hulk_burned | contract_complete | failed
  const [hulkIndex, setHulkIndex] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const contractParam = params.get('contract');
    if (contractParam !== null) return parseInt(contractParam, 10);
    const tutorialDone = localStorage.getItem('astral_tutorial_completed') === 'true' || localStorage.getItem('perigee_tutorial_completed') === 'true';
    return tutorialDone ? 1 : 0;
  });

  const [failReason, setFailReason] = useState(null);
  const [finalScore, setFinalScore] = useState(null);
  const [campaignScore, setCampaignScore] = useState(null);
  const [isAudioMuted, setIsAudioMuted] = useState(chiptuneAudio.isMuted);

  // Campaign flow states: Briefing Card & Interstitial Black Card
  const [activeBriefing, setActiveBriefing] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const contractParam = params.get('contract');
    const startIdx = contractParam !== null ? parseInt(contractParam, 10) : (
      (localStorage.getItem('astral_tutorial_completed') === 'true' || localStorage.getItem('perigee_tutorial_completed') === 'true') ? 1 : 0
    );
    // Show briefing card on Missions 1, 2, 3 (not Contract 0 tutorial)
    return startIdx > 0 ? HULK_MANIFEST[startIdx] : null;
  });
  const [missionInterstitial, setMissionInterstitial] = useState(null);
  const [winFlairState, setWinFlairState] = useState(null);

  // MEG broadcast streamer state
  const [megChat, setMegChat] = useState({
    line: 'Channel 73 pirate feed active. Standing by for salvage mooring...',
    viewers: 14892,
    tag: 'idle',
  });

  // Dynamic aesthetic states
  const [isFailing, setIsFailing] = useState(false);
  const [isStreakActive, setIsStreakActive] = useState(false);
  const [isDeathCollapsing, setIsDeathCollapsing] = useState(false);

  // Visual instrument metrics
  const [hud, setHud] = useState({
    fuel: CONSTANTS.INITIAL_DELTA_V,
    maxFuel: CONSTANTS.INITIAL_DELTA_V,
    projectedPerigeeKm: 450,
    isReEntryWindow: false,
    distanceToHulk: 260,
    isSpinMatched: false,
    hulkAngle: 0,
    tugAngle: 0,
    tetherTension: 0,
    conjunctionTime: null,
    objectiveChipText: 'APPROACH TARGET',
    isNearBoundary: false,
    offscreenIndicator: null,
    isLatched: false,
    isDeorbiting: false,
  });

  // Simulation state for 60Hz loop
  const simRef = useRef({
    width: 1200,
    height: 800,
    tug: null,
    hulk: null,
    conjunctionObj: null,
    anchorOffsetLocal: new Vec(26, 0),
    anchorOffsetWorld: new Vec(26, 0),
    isLatched: false,
    tetherTension: 0,
    tetherRestLength: CONSTANTS.TETHER_REST_LENGTH,
    hulkIndex: 0,
    hulkDeorbiting: false,
    hulkBurnProgress: 0,
    conjunctionTimer: null,
    totalTime: 0,
    deltaVUsed: 0,
    missionStartTime: 0,
    missionDeltaVStart: 0,
    isBriefingPaused: false,
    winFlair: null,
    perigeeHistory: [],
    keys: { thrust: false, left: false, right: false },
    mouse: { x: 0, y: 0, isDown: false },
    isMouseHoveringHulk: false,
    isNearBoundary: false,
    offscreenIndicator: null,
    // Option C Physical Teacher tracking
    successfulPumpCount: 0,
    lastPerigee: 450,
    progradeWarnTimer: 0,
    hasCapturedAtmosphere: false,
    perigeeLabelAlpha: 1.0,
    captureLabelTimer: 0,
    isSpinMatched: false,
    // Visual trail & particle buffers
    trail: [],
    particles: [],
    spaceDust: [],
    hazeSparks: [],
    supernovaActive: false,
    comboStreak: 0,
    // Audio & boundary throttling timers
    lastThrustAudioTime: 0,
    lastStrainAudioTime: 0,
    lastKlaxonAudioTime: 0,
    lastBuzzAudioTime: 0,
    lastRingLockTime: 0,
    lastBoundaryWarningTime: 0,
  });

  // Wire MEG narrator listener
  useEffect(() => {
    megNarrator.setListener(({ text, eventTag, viewers }) => {
      setMegChat({
        line: text,
        viewers,
        tag: eventTag,
      });
    });
  }, []);

  // Background space dust
  const initSpaceDust = (w, h) => {
    const dust = [];
    for (let i = 0; i < 65; i++) {
      dust.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() * 1.8 + 0.6,
        speed: Math.random() * 0.35 + 0.1,
        alpha: Math.random() * 0.6 + 0.2,
      });
    }
    return dust;
  };

  // Spawn Target Hulk
  const spawnHulk = useCallback((index, showBriefing = true) => {
    const sim = simRef.current;
    const config = HULK_MANIFEST[index] || HULK_MANIFEST[0];
    const cx = sim.width * 0.5;
    const cy = sim.height * 0.44;

    sim.hulk = createBody({
      x: cx,
      y: cy,
      vx: 0,
      vy: 0,
      angle: 0,
      av: config.spin,
      mass: config.mass,
      radius: config.radius,
    });

    sim.anchorOffsetLocal.set(config.radius * 0.75, 0);

    // Initial tug position
    sim.tug = createBody({
      x: cx - 170,
      y: cy + 40,
      vx: 0,
      vy: -15,
      angle: -Math.PI * 0.5,
      av: 0,
      mass: CONSTANTS.TUG_MASS,
      radius: CONSTANTS.TUG_RADIUS,
    });

    sim.tug.fuel = CONSTANTS.INITIAL_DELTA_V - sim.deltaVUsed;

    sim.isLatched = false;
    sim.tetherTension = 0;
    sim.tetherRestLength = CONSTANTS.TETHER_REST_LENGTH;
    sim.hulkDeorbiting = false;
    sim.hulkBurnProgress = 0;
    sim.supernovaActive = false;
    sim.winFlair = null;
    setWinFlairState(null);
    sim.conjunctionTimer = config.conjunctionLimit;
    sim.trail = [];
    sim.particles = [];
    sim.hazeSparks = [];
    sim.hulkIndex = index;
    sim.isSpinMatched = false;
    sim.hasCapturedAtmosphere = false;
    sim.captureLabelTimer = 0;
    sim.missionStartTime = sim.totalTime;
    sim.missionDeltaVStart = sim.deltaVUsed;

    const urlParams = new URLSearchParams(window.location.search);
    const mockP = urlParams.get('phase');
    const mockFuel = urlParams.get('fuel');

    if (mockFuel === 'low') {
      sim.tug.fuel = 190;
    } else if (mockFuel === 'crit') {
      sim.tug.fuel = 65;
    }

    if (mockP === 'swing') {
      sim.isLatched = true;
      sim.tetherTension = 180;
      sim.hulk.vel.x = -45;
      sim.hulk.vel.y = 12;
      sim.isSpinMatched = true;
    } else if (mockP === 'window') {
      sim.isLatched = true;
      sim.tetherTension = 285;
      sim.hulk.vel.x = -94; // Retrograde velocity -> Perigee 78 km
      sim.hulk.vel.y = 38;
      sim.isSpinMatched = true;
    } else if (mockP === 'deorbit') {
      sim.hulkDeorbiting = true;
      sim.hulkBurnProgress = 0.45;
      sim.hulk.vel.x = -96;
      sim.hulk.vel.y = 80;
    } else if (mockP === 'mooring') {
      sim.tug.pos.x = cx - 120;
      sim.tug.pos.y = cy + 18;
    }

    if (config.conjunctionLimit !== null) {
      sim.conjunctionObj = {
        x: sim.width + 80,
        y: cy + 20,
        vx: -(sim.width + 160) / config.conjunctionLimit,
        vy: 0,
        radius: 20,
      };
      megNarrator.trigger('conjunction_warning');
      chiptuneAudio.playConjunctionKlaxon();
    } else {
      sim.conjunctionObj = null;
    }

    setHulkIndex(index);
    setGameStatus('playing');
    setIsFailing(false);
    setIsStreakActive(false);

    if (showBriefing && index > 0) {
      setActiveBriefing(config);
      sim.isBriefingPaused = true;
    } else {
      setActiveBriefing(null);
      sim.isBriefingPaused = false;
    }
  }, []);

  // T-Skip Tutorial: Persist to localStorage and roll directly into Mission 1
  const skipTutorial = useCallback(() => {
    localStorage.setItem('astral_tutorial_completed', 'true');
    localStorage.setItem('perigee_tutorial_completed', 'true');
    chiptuneAudio.playUiBeep();
    setMegChat({
      line: 'Proving ground skipped! Rolling straight into Contract 1 live on stream!',
      viewers: 15400,
      tag: 'tutorial_skip',
    });
    spawnHulk(1, true);
  }, [spawnHulk]);

  // Full contract restart
  const restartContract = useCallback(() => {
    const sim = simRef.current;
    sim.totalTime = 0;
    sim.deltaVUsed = 0;
    sim.perigeeHistory = [];
    sim.comboStreak = 0;
    sim.successfulPumpCount = 0;
    sim.perigeeLabelAlpha = 1.0;
    sim.winFlair = null;
    setWinFlairState(null);
    setFailReason(null);
    setFinalScore(null);
    setMissionInterstitial(null);
    setIsDeathCollapsing(false);

    const tutorialDone = localStorage.getItem('astral_tutorial_completed') === 'true' || localStorage.getItem('perigee_tutorial_completed') === 'true';
    const startIdx = tutorialDone ? 1 : 0;
    spawnHulk(startIdx, startIdx > 0);
    chiptuneAudio.startSpaceDrone();
  }, [spawnHulk]);

  // Audio mute toggle
  const toggleAudio = () => {
    const muted = chiptuneAudio.toggleMute();
    setIsAudioMuted(muted);
    if (!muted && appMode === 'game') {
      chiptuneAudio.startSpaceDrone();
    } else {
      chiptuneAudio.stopSpaceDrone();
    }
  };

  // Keyboard and Mouse input listeners
  useEffect(() => {
    if (appMode !== 'game') return;

    const onKeyDown = (e) => {
      const sim = simRef.current;
      if (e.code === 'Space') {
        if (activeBriefing) {
          e.preventDefault();
          chiptuneAudio.playUiBeep();
          setActiveBriefing(null);
          sim.isBriefingPaused = false;
          sim.missionStartTime = sim.totalTime;
          sim.missionDeltaVStart = sim.deltaVUsed;
          return;
        }
        if (missionInterstitial) {
          e.preventDefault();
          const next = missionInterstitial.nextIndex;
          setMissionInterstitial(null);
          spawnHulk(next, true);
          return;
        }
      }

      if (e.code === 'KeyW' || e.code === 'ArrowUp' || e.code === 'Space') {
        sim.keys.thrust = true;
      }
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') sim.keys.left = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') sim.keys.right = true;
      if (e.code === 'KeyE') toggleLatch();
      if (e.code === 'KeyQ') releaseTether();
      if (e.code === 'KeyR') restartContract();
      if (e.code === 'KeyM') toggleAudio();
      if (e.code === 'KeyT') {
        if (sim.hulkIndex === 0) skipTutorial();
      }
      if (e.code === 'Escape') setAppMode('landing');
    };

    const onKeyUp = (e) => {
      const sim = simRef.current;
      if (e.code === 'KeyW' || e.code === 'ArrowUp' || e.code === 'Space') {
        sim.keys.thrust = false;
      }
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') sim.keys.left = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') sim.keys.right = false;
    };

    const onMouseDown = (e) => {
      const sim = simRef.current;
      if (e.button === 0) {
        sim.mouse.isDown = true;
        sim.keys.thrust = true;
      } else if (e.button === 2) {
        releaseTether();
      }
    };

    const onMouseUp = (e) => {
      const sim = simRef.current;
      if (e.button === 0) {
        sim.mouse.isDown = false;
        sim.keys.thrust = false;
      }
    };

    const onMouseMove = (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      simRef.current.mouse.x = mx;
      simRef.current.mouse.y = my;

      if (simRef.current.hulk) {
        const d = Math.hypot(mx - simRef.current.hulk.pos.x, my - simRef.current.hulk.pos.y);
        simRef.current.isMouseHoveringHulk = d < 65;
      }
    };

    // Mission 2 mouse-wheel reel-in mechanic
    const onWheel = (e) => {
      const sim = simRef.current;
      if (!sim.isLatched || sim.hulkDeorbiting) return;
      const step = e.deltaY > 0 ? 8 : -8;
      sim.tetherRestLength = clamp(sim.tetherRestLength + step, 65, 150);
    };

    const onContextMenu = (e) => e.preventDefault();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('contextmenu', onContextMenu);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('contextmenu', onContextMenu);
    };
  }, [appMode, restartContract, skipTutorial, activeBriefing, missionInterstitial, spawnHulk]);

  // Interstitial countdown ticker
  useEffect(() => {
    if (!missionInterstitial) return;
    const timer = setInterval(() => {
      setMissionInterstitial((prev) => {
        if (!prev) return null;
        if (prev.countdown <= 1) {
          clearInterval(timer);
          spawnHulk(prev.nextIndex, true);
          return null;
        }
        return { ...prev, countdown: prev.countdown - 1 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [missionInterstitial, spawnHulk]);

  // Toggle Mooring Latch (Contract 0 assist: 350m latch envelope)
  const toggleLatch = () => {
    const sim = simRef.current;
    if (sim.hulkDeorbiting) return;

    if (sim.isLatched) {
      releaseTether();
    } else {
      const dist = sim.tug.pos.dist(sim.hulk.pos);
      const latchEnvelope = sim.hulkIndex === 0 ? 350 : 260;
      if (dist <= latchEnvelope) {
        sim.isLatched = true;
        chiptuneAudio.playLatchClunk();
        megNarrator.trigger('latch');
      }
    }
  };

  // Release Tether Swing
  const releaseTether = () => {
    const sim = simRef.current;
    if (!sim.isLatched || sim.hulkDeorbiting) return;

    sim.isLatched = false;
    sim.tetherTension = 0;

    const evalResult = evaluateDeorbit(sim.hulk.vel);

    if (evalResult.isDeorbit) {
      // SUCCESSFUL DEORBIT: Start Win Flair countdown to 0 KM
      sim.hulkDeorbiting = true;
      sim.supernovaActive = false;
      sim.perigeeHistory.push(evalResult.estimatedPerigeeKm);
      sim.comboStreak += 1;

      sim.winFlair = {
        active: true,
        startKm: evalResult.estimatedPerigeeKm,
        currentKm: evalResult.estimatedPerigeeKm,
        timer: 0,
        duration: 0.9,
        zeroed: false,
      };
      setWinFlairState({ currentKm: evalResult.estimatedPerigeeKm, zeroed: false });

      megNarrator.trigger('clean_deorbit');
      setGameStatus('hulk_burned');
    } else {
      // Prograde Miss
      sim.comboStreak = 0;
      megNarrator.trigger('prograde_miss');
    }
  };

  // 60Hz Physical Simulation Loop
  const updatePhysics = (dt) => {
    const sim = simRef.current;
    if (typeof window !== 'undefined') {
      window.__sim = sim;
      window.__dismissBriefing = () => {
        setActiveBriefing(null);
        sim.isBriefingPaused = false;
        sim.missionStartTime = sim.totalTime;
        sim.missionDeltaVStart = sim.deltaVUsed;
      };
      window.__advanceInterstitial = () => {
        if (missionInterstitial) {
          const next = missionInterstitial.nextIndex;
          setMissionInterstitial(null);
          spawnHulk(next, true);
        }
      };
    }
    if (sim.isBriefingPaused || gameStatus === 'failed' || gameStatus === 'contract_complete') return;

    const { tug, hulk, keys } = sim;
    if (!tug || !hulk) return;

    const now = performance.now();
    sim.totalTime += dt;

    // 1. Conjunction Timer countdown
    if (sim.conjunctionTimer !== null && !sim.hulkDeorbiting) {
      sim.conjunctionTimer -= dt;
      if (sim.conjunctionObj) {
        sim.conjunctionObj.x += sim.conjunctionObj.vx * dt;
      }

      if (sim.conjunctionTimer <= 12 && now - sim.lastKlaxonAudioTime > 1600) {
        sim.lastKlaxonAudioTime = now;
        chiptuneAudio.playConjunctionKlaxon();
      }

      if (sim.conjunctionTimer <= 0) {
        triggerDeathCollapse('CONJUNCTION TIMER EXPIRED · HYPERVELOCITY IMPACT DESTROYED SHELL');
        return;
      }
    }

    // 2. Steer Tug (Keyboard-first, zero mouse-following torque)
    if (keys.left) tug.angle -= CONSTANTS.TUG_TURN_SPEED * dt;
    if (keys.right) tug.angle += CONSTANTS.TUG_TURN_SPEED * dt;

    // 3. RCS Burn & Delta-V Propellant Consumption (Fires strictly along Tug nose direction)
    tug.thrusting = keys.thrust;
    if (tug.thrusting) {
      const burnCost = CONSTANTS.DELTA_V_BURN_RATE * dt;
      if (tug.fuel <= 0) {
        triggerDeathCollapse('DELTA-V EXHAUSTED · TUG STRANDED IN DECAYING ORBITAL SHELL');
        return;
      }

      tug.fuel = Math.max(0, tug.fuel - burnCost);
      sim.deltaVUsed += burnCost;

      const thrustDir = new Vec(Math.cos(tug.angle), Math.sin(tug.angle));
      tug.vel.x += thrustDir.x * CONSTANTS.TUG_THRUST_ACCEL * dt;
      tug.vel.y += thrustDir.y * CONSTANTS.TUG_THRUST_ACCEL * dt;

      // Audio & Thruster Particle Jet
      if (now - sim.lastThrustAudioTime > 115) {
        sim.lastThrustAudioTime = now;
        chiptuneAudio.playThrusterPulse();
      }

      // Thruster exhaust sparks
      for (let i = 0; i < 2; i++) {
        const spread = (Math.random() - 0.5) * 0.45;
        const pSpd = Math.random() * 120 + 80;
        sim.particles.push({
          x: tug.pos.x - Math.cos(tug.angle) * 12,
          y: tug.pos.y - Math.sin(tug.angle) * 12,
          vx: -Math.cos(tug.angle + spread) * pSpd + (Math.random() - 0.5) * 20,
          vy: -Math.sin(tug.angle + spread) * pSpd + (Math.random() - 0.5) * 20,
          color: Math.random() > 0.4 ? '#FF9E3D' : '#B8FF4D',
          size: Math.random() * 2.8 + 1.2,
          life: 0.35,
          decay: 2.2,
        });
      }

      if (tug.fuel < 300) {
        megNarrator.trigger('low_fuel');
      }

      // Option C: Check if burning prograde (wrong direction while latched)
      if (sim.isLatched) {
        const currentPerigee = evaluateDeorbit(hulk.vel).estimatedPerigeeKm;
        if (currentPerigee > sim.lastPerigee + 1.5) {
          // Perigee is rising: wrong-direction burn!
          sim.progradeWarnTimer = 0.8;
          if (now - sim.lastBuzzAudioTime > 650) {
            sim.lastBuzzAudioTime = now;
            chiptuneAudio.playDescendingBuzz();
          }
        } else if (currentPerigee < sim.lastPerigee - 2.0) {
          // Good pump!
          sim.successfulPumpCount += 1;
        }
        sim.lastPerigee = currentPerigee;
      }
    } else {
      if (sim.progradeWarnTimer > 0) sim.progradeWarnTimer -= dt;
    }

    // Magnetic docking guidance assist in Contract 0 (< 350m)
    const distToHulk = tug.pos.dist(hulk.pos);
    if (!sim.isLatched && distToHulk <= 350 && sim.hulkIndex === 0) {
      const anchorX = hulk.pos.x + sim.anchorOffsetWorld.x;
      const anchorY = hulk.pos.y + sim.anchorOffsetWorld.y;
      const mDx = anchorX - tug.pos.x;
      const mDy = anchorY - tug.pos.y;
      const mDist = Math.hypot(mDx, mDy) || 1;
      const magnetForce = 180;
      tug.vel.x += (mDx / mDist) * magnetForce * dt;
      tug.vel.y += (mDy / mDist) * magnetForce * dt;
    }

    // Soft Boundary Protection (Ship cannot fly off into empty black space)
    const marginX = 85;
    const marginY = 80;
    const isNearEdge =
      tug.pos.x < marginX + 90 ||
      tug.pos.x > sim.width - marginX - 90 ||
      tug.pos.y < marginY + 70 ||
      tug.pos.y > sim.height - marginY - 70;
    sim.isNearBoundary = isNearEdge;

    if (isNearEdge && now - sim.lastBoundaryWarningTime > 8000) {
      sim.lastBoundaryWarningTime = now;
      megNarrator.trigger('boundary_warning');
    }

    // Past hard boundary limit: apply mild auto-thrust back toward playfield center
    if (
      tug.pos.x < marginX ||
      tug.pos.x > sim.width - marginX ||
      tug.pos.y < marginY ||
      tug.pos.y > sim.height - marginY
    ) {
      const cx = sim.width * 0.5;
      const cy = sim.height * 0.44;
      const toCx = cx - tug.pos.x;
      const toCy = cy - tug.pos.y;
      const dCenter = Math.hypot(toCx, toCy) || 1;
      const autoThrustReturn = 720;
      tug.vel.x += (toCx / dCenter) * autoThrustReturn * dt;
      tug.vel.y += (toCy / dCenter) * autoThrustReturn * dt;
      tug.vel.x *= 0.985;
      tug.vel.y *= 0.985;

      tug.pos.x = clamp(tug.pos.x, 25, sim.width - 25);
      tug.pos.y = clamp(tug.pos.y, 30, sim.height - 30);
    }

    // Ship off-screen indicator
    let offscreen = null;
    const isOutside =
      tug.pos.x < 45 ||
      tug.pos.x > sim.width - 45 ||
      tug.pos.y < 45 ||
      tug.pos.y > sim.height - 45;
    if (isOutside) {
      const edgeX = clamp(tug.pos.x, 60, sim.width - 60);
      const edgeY = clamp(tug.pos.y, 60, sim.height - 60);
      const distFromHulk = Math.round(distToHulk);
      offscreen = { x: edgeX, y: edgeY, dist: distFromHulk };
    }
    sim.offscreenIndicator = offscreen;

    // 4. Hull Breach Collision Detection (active when not deorbiting)
    if (!sim.hulkDeorbiting && checkCollision(tug, hulk)) {
      triggerDeathCollapse('HULL BREACH · TUG SHREDDED BY DERELICT TUMBLE');
      return;
    }

    // 5. Integrate Velocities
    integrateBody(tug, dt);
    integrateBody(hulk, dt);

    // Record afterimage trail point
    sim.trail.push({
      x: tug.pos.x,
      y: tug.pos.y,
      angle: tug.angle,
      isStreak: sim.comboStreak > 1,
    });
    if (sim.trail.length > 14) sim.trail.shift();

    // 6. Tether Distance Constraint & Momentum Transfer
    const cosA = Math.cos(hulk.angle);
    const sinA = Math.sin(hulk.angle);
    sim.anchorOffsetWorld.x = cosA * sim.anchorOffsetLocal.x - sinA * sim.anchorOffsetLocal.y;
    sim.anchorOffsetWorld.y = sinA * sim.anchorOffsetLocal.x + cosA * sim.anchorOffsetLocal.y;

    if (sim.isLatched) {
      let maxTension = 0;
      for (let i = 0; i < CONSTANTS.CONSTRAINT_ITERATIONS; i++) {
        const t = solveTetherConstraint(tug, hulk, sim.anchorOffsetWorld, sim.tetherRestLength);
        maxTension = Math.max(maxTension, t);
      }
      sim.tetherTension = maxTension;

      // Transfer rotational torque from tether tension to hulk tumble
      const anchorX = hulk.pos.x + sim.anchorOffsetWorld.x;
      const anchorY = hulk.pos.y + sim.anchorOffsetWorld.y;
      const pullX = tug.pos.x - anchorX;
      const pullY = tug.pos.y - anchorY;
      const torque = sim.anchorOffsetWorld.x * pullY - sim.anchorOffsetWorld.y * pullX;
      hulk.av += torque * hulk.invInertia * 0.04;

      // Tangential thrust pump transfer (converts player swing burn directly into retrograde delta-v)
      if (tug.thrusting) {
        const toTugX = tug.pos.x - hulk.pos.x;
        const toTugY = tug.pos.y - hulk.pos.y;
        const rDist = Math.hypot(toTugX, toTugY) || 1;
        const spinDir = Math.sign(hulk.av) || 1;
        const tanX = (-toTugY / rDist) * spinDir;
        const tanY = (toTugX / rDist) * spinDir;

        const thrustX = Math.cos(tug.angle);
        const thrustY = Math.sin(tug.angle);
        const dotTangent = thrustX * tanX + thrustY * tanY;

        if (dotTangent > 0.12) {
          // Accelerate swing tumble
          hulk.av += spinDir * 0.35 * dt;

          // Pump retrograde velocity into the hulk (visible perigee drop every pump!)
          const pumpStrength = sim.hulkIndex === 0 ? 45.0 : 26.0;
          hulk.vel.x -= pumpStrength * dotTangent * dt;
          sim.successfulPumpCount += 1;
        } else if (dotTangent < -0.35) {
          hulk.vel.x += 16.0 * dt;
          sim.progradeWarnTimer = 0.8;
        }
      }

      // Play audio strain whine
      if (maxTension > 140 && now - sim.lastStrainAudioTime > 130) {
        sim.lastStrainAudioTime = now;
        chiptuneAudio.playTetherStrain(maxTension);
      }

      // Check spin-matching rings alignment with wide tolerance & hysteresis
      const toTugX = tug.pos.x - hulk.pos.x;
      const toTugY = tug.pos.y - hulk.pos.y;
      const rDist = Math.hypot(toTugX, toTugY) || 1;
      const tugOmega = Math.hypot(tug.vel.x, tug.vel.y) / rDist;
      const spinDiff = Math.abs(hulk.av - tugOmega);

      const lockTol = sim.hulkIndex === 0 ? 0.85 : 0.50;
      const keepTol = sim.hulkIndex === 0 ? 1.40 : 0.75;
      const spinMatched = sim.isSpinMatched ? spinDiff < keepTol : spinDiff < lockTol;

      if (spinMatched && !sim.isSpinMatched && now - sim.lastRingLockTime > 2000) {
        sim.lastRingLockTime = now;
        chiptuneAudio.playRingLockTick();
      }
      sim.isSpinMatched = spinMatched;

      // Spin-match assist damping & alignment in Contract 0
      if (sim.hulkIndex === 0) {
        const targetVx = -hulk.av * toTugY;
        const targetVy = hulk.av * toTugX;
        tug.vel.x += (targetVx - tug.vel.x) * 0.40 * dt;
        tug.vel.y += (targetVy - tug.vel.y) * 0.40 * dt;

        // Tether towing alignment assist (gently keeps tug aligned with swing tangent)
        const spinDir = Math.sign(hulk.av) || 1;
        const tanX = (-toTugY / rDist) * spinDir;
        const tanY = (toTugX / rDist) * spinDir;
        const tangentAngle = Math.atan2(tanY, tanX);
        const aDiff = Math.atan2(Math.sin(tangentAngle - tug.angle), Math.cos(tangentAngle - tug.angle));
        tug.angle += aDiff * Math.min(1.0, 5.0 * dt);
      }
    } else {
      sim.tetherTension = 0;
      sim.isSpinMatched = false;
    }

    // 7. Update Particles
    for (let i = sim.particles.length - 1; i >= 0; i--) {
      const p = sim.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0) sim.particles.splice(i, 1);
    }

    // Update atmospheric haze sparks
    for (let i = sim.hazeSparks.length - 1; i >= 0; i--) {
      const s = sim.hazeSparks[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt * 1.5;
      if (s.life <= 0) sim.hazeSparks.splice(i, 1);
    }

    // 7b. Win Flair Perigee Ticker (ticks down to 0 KM)
    if (sim.winFlair && sim.winFlair.active) {
      sim.winFlair.timer += dt;
      const progress = Math.min(1.0, sim.winFlair.timer / sim.winFlair.duration);
      sim.winFlair.currentKm = Math.max(0, Math.round(sim.winFlair.startKm * (1.0 - progress)));

      if (progress >= 1.0 && !sim.winFlair.zeroed) {
        sim.winFlair.zeroed = true;
        sim.supernovaActive = true;
        chiptuneAudio.playDeorbitFanfare();

        // 60 colorful celebration particles
        const colors = ['#4DFFDF', '#FF9E3D', '#FF4DE1', '#8C4DFF', '#B8FF4D'];
        for (let i = 0; i < 60; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = Math.random() * 260 + 60;
          sim.particles.push({
            x: sim.hulk.pos.x,
            y: sim.hulk.pos.y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            color: colors[i % colors.length],
            size: Math.random() * 4 + 2,
            life: 1.0,
            decay: Math.random() * 0.7 + 0.5,
          });
        }
      }
      setWinFlairState({ currentKm: sim.winFlair.currentKm, zeroed: sim.winFlair.zeroed });
    }

    // 8. Atmospheric Deorbit Progression
    if (sim.hulkDeorbiting) {
      sim.hulkBurnProgress += dt * 0.75;
      hulk.vel.y += 260 * dt; // Gravity well pull

      if (sim.hulkBurnProgress >= 1.0) {
        sim.hulkDeorbiting = false;
        sim.winFlair = null;
        setWinFlairState(null);
        if (sim.hulkIndex === 0) {
          localStorage.setItem('astral_tutorial_completed', 'true');
          localStorage.setItem('perigee_tutorial_completed', 'true');
          setMegChat({
            line: 'PROVING GROUND CERTIFIED! Clean deorbit! Rolling straight into Mission 1 live on stream!',
            viewers: 16200,
            tag: 'tutorial_complete',
          });
          spawnHulk(1, true);
        } else if (sim.hulkIndex === 1 || sim.hulkIndex === 2) {
          const missionTime = sim.totalTime - sim.missionStartTime;
          const missionDv = sim.deltaVUsed - sim.missionDeltaVStart;
          const config = HULK_MANIFEST[sim.hulkIndex];
          const rank = missionDv < 250 && missionTime < 45 ? 'S' : missionDv < 420 ? 'A' : 'B';

          setMissionInterstitial({
            missionId: sim.hulkIndex,
            missionName: config.name,
            targetName: config.targetName,
            rank,
            deltaVUsed: Math.round(missionDv),
            time: missionTime.toFixed(1),
            nextIndex: sim.hulkIndex + 1,
            countdown: 3,
          });
        } else {
          // Mission 3 completed: Campaign Won!
          computeContractGrade();
          setAppMode('credits');
        }
      }
    }

    const evalResult = evaluateDeorbit(hulk.vel);
    const danger = tug.fuel < 220 || (sim.conjunctionTimer !== null && sim.conjunctionTimer < 14);
    setIsFailing(danger);
    setIsStreakActive(evalResult.isDeorbit || sim.comboStreak > 1);

    if (evalResult.isDeorbit && sim.isLatched) {
      megNarrator.trigger('swing_peak');
    }
  };

  // Trigger death static collapse
  const triggerDeathCollapse = (reason) => {
    chiptuneAudio.playFailureCrash();
    megNarrator.trigger('collision');
    setIsDeathCollapsing(true);
    setFailReason(reason);
    setGameStatus('failed');
  };

  // Calculate final mission score & grade (Contracts 1-3)
  const computeContractGrade = () => {
    const sim = simRef.current;
    const time = sim.totalTime;
    const dv = sim.deltaVUsed;
    const avgPerigee = sim.perigeeHistory.reduce((a, b) => a + b, 0) / (sim.perigeeHistory.length || 1);

    const rawScore = Math.round(Math.max(0, 3500 - time * 16 - dv * 1.3 + (100 - avgPerigee) * 8));

    let rank = 'C';
    if (rawScore >= 2200) rank = 'S';
    else if (rawScore >= 1700) rank = 'A';
    else if (rawScore >= 1200) rank = 'B';

    setFinalScore({
      score: rawScore,
      rank,
      totalTime: time.toFixed(1),
      deltaVUsed: Math.round(dv),
      avgPerigee: Math.round(avgPerigee),
    });
    setGameStatus('contract_complete');
    chiptuneAudio.playDeorbitFanfare();
  };

  // Render Terminal Riot Canvas Viewport
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sim = simRef.current;
    const { tug, hulk, isLatched, anchorOffsetWorld, tetherTension } = sim;
    if (!tug || !hulk) return;

    const w = canvas.width;
    const h = canvas.height;

    // 1. Deep Vacuum Indigo-Black (#0D0618)
    ctx.fillStyle = '#0D0618';
    ctx.fillRect(0, 0, w, h);

    // 2. Drifting Space Dust
    ctx.save();
    sim.spaceDust.forEach((d) => {
      d.y += d.speed;
      if (d.y > h) d.y = 0;
      ctx.fillStyle = `rgba(140, 77, 255, ${d.alpha})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // 3. Grid Violet Coordinate Ticks (#8C4DFF)
    ctx.save();
    ctx.strokeStyle = 'rgba(140, 77, 255, 0.16)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 100) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 100) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();

    // 4. PART C — ANCHORED PERMANENT CURVED EARTH LIMB & ATMOSPHERIC ENTRY HAZE
    ctx.save();
    const earthCx = w * 0.5;
    const earthCy = h + 680;
    const rEarth = 820; // Surface crests at h - 140 (permanently visible above footer)
    const rAtmosphere = rEarth + 45; // Karman Line entry threshold crests at h - 185
    const rExosphere = rAtmosphere + 65; // Aurora exosphere haze crests at h - 250

    // 4a. Outer Exospheric Aurora Glow (Radial Bloom)
    const exoGrad = ctx.createRadialGradient(earthCx, earthCy, rEarth, earthCx, earthCy, rExosphere);
    exoGrad.addColorStop(0, 'rgba(77, 255, 223, 0.32)');
    exoGrad.addColorStop(0.35, 'rgba(140, 77, 255, 0.22)');
    exoGrad.addColorStop(0.75, 'rgba(255, 77, 225, 0.08)');
    exoGrad.addColorStop(1, 'rgba(13, 6, 24, 0)');
    ctx.fillStyle = exoGrad;
    ctx.beginPath();
    ctx.arc(earthCx, earthCy, rExosphere, 0, Math.PI * 2);
    ctx.fill();

    // 4b. Atmospheric Stratosphere / Mesosphere Layer
    const mesoGrad = ctx.createRadialGradient(earthCx, earthCy, rEarth, earthCx, earthCy, rAtmosphere);
    mesoGrad.addColorStop(0, 'rgba(255, 158, 61, 0.55)');
    mesoGrad.addColorStop(0.65, 'rgba(77, 255, 223, 0.38)');
    mesoGrad.addColorStop(1, 'rgba(184, 255, 77, 0.18)');
    ctx.fillStyle = mesoGrad;
    ctx.beginPath();
    ctx.arc(earthCx, earthCy, rAtmosphere, 0, Math.PI * 2);
    ctx.fill();

    // 4c. The Karman Line (100 km Atmospheric Entry Boundary)
    ctx.strokeStyle = '#4DFFDF';
    ctx.lineWidth = 2.2;
    ctx.shadowColor = '#4DFFDF';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(earthCx, earthCy, rAtmosphere, Math.PI * 1.18, Math.PI * 1.82);
    ctx.stroke();

    // Karman Line Atmospheric Boundary Label
    ctx.fillStyle = 'rgba(77, 255, 223, 0.85)';
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 6;
    ctx.fillText('EARTH ATMOSPHERE · 100 KM ENTRY BOUNDARY', earthCx, h - 192);

    // 4d. Solid Planet Earth Body
    const earthBodyGrad = ctx.createRadialGradient(earthCx, earthCy - 100, 200, earthCx, earthCy, rEarth);
    earthBodyGrad.addColorStop(0, '#091530'); // Deep orbital ocean navy
    earthBodyGrad.addColorStop(0.7, '#070f24');
    earthBodyGrad.addColorStop(1, '#030611');
    ctx.fillStyle = earthBodyGrad;
    ctx.beginPath();
    ctx.arc(earthCx, earthCy, rEarth, 0, Math.PI * 2);
    ctx.fill();

    // Earth limb rim glow
    ctx.strokeStyle = '#FF9E3D';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#FF9E3D';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(earthCx, earthCy, rEarth, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // City lights clusters on the night side of Earth
    ctx.fillStyle = 'rgba(255, 158, 61, 0.75)';
    const cityNodes = [
      { x: earthCx - 220, y: h - 110, r: 2.0 },
      { x: earthCx - 180, y: h - 100, r: 1.5 },
      { x: earthCx - 90, y: h - 120, r: 2.5 },
      { x: earthCx + 40, y: h - 105, r: 2.0 },
      { x: earthCx + 160, y: h - 115, r: 2.2 },
      { x: earthCx + 240, y: h - 95, r: 1.8 },
      { x: earthCx - 40, y: h - 112, r: 1.6 },
    ];
    cityNodes.forEach((cn) => {
      ctx.beginPath();
      ctx.arc(cn.x, cn.y, cn.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    const anchorX = hulk.pos.x + anchorOffsetWorld.x;
    const anchorY = hulk.pos.y + anchorOffsetWorld.y;

    const evalResult = evaluateDeorbit(hulk.vel);
    const isReEntryReady = evalResult.isDeorbit;
    const distToHulk = tug.pos.dist(hulk.pos);

    // 5. PART C — SOLID GLOWING TRAJECTORY RIBBON (Visibly sags toward atmosphere)
    if (isLatched || sim.hulkDeorbiting) {
      ctx.save();
      const projectedPoints = predictOrbitalPath(hulk.pos, hulk.vel, 54, 0.04);

      // Find the lowest point along the ribbon path (maximum y in canvas coordinates)
      let lowestPoint = projectedPoints[0];
      projectedPoints.forEach((pt) => {
        if (pt.y > lowestPoint.y) lowestPoint = pt;
      });

      const isPrograde = sim.progradeWarnTimer > 0;

      // Outer Bloom Ribbon
      ctx.beginPath();
      projectedPoints.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });

      if (isPrograde) {
        ctx.strokeStyle = 'rgba(220, 50, 50, 0.45)';
        ctx.lineWidth = 3.5;
        ctx.shadowColor = '#DC2626';
        ctx.shadowBlur = 6;
      } else if (isReEntryReady) {
        ctx.strokeStyle = '#B8FF4D';
        ctx.lineWidth = 7.5;
        ctx.shadowColor = '#B8FF4D';
        ctx.shadowBlur = 18;
      } else {
        ctx.strokeStyle = '#FF4DE1';
        ctx.lineWidth = 5.0;
        ctx.shadowColor = '#FF4DE1';
        ctx.shadowBlur = 14;
      }
      ctx.stroke();

      // Inner Core Ribbon Line
      ctx.beginPath();
      projectedPoints.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.strokeStyle = isReEntryReady ? '#EDF2F7' : 'rgba(237, 242, 247, 0.85)';
      ctx.lineWidth = 2.0;
      ctx.shadowBlur = 0;
      ctx.stroke();

      // ATMOSPHERE HAZE IGNITION & CAPTURE LABEL
      // Lowest point touches/crosses the atmospheric haze threshold (rAtmosphere)
      const distToEarthCenter = Math.hypot(lowestPoint.x - earthCx, lowestPoint.y - earthCy);
      const touchesHaze = distToEarthCenter <= rAtmosphere || lowestPoint.y >= h - 185;
      if (touchesHaze) {
        if (!sim.hasCapturedAtmosphere) {
          sim.hasCapturedAtmosphere = true;
          chiptuneAudio.playHazeCaptureRumble();

          // Spawn orange ignition sparks
          for (let i = 0; i < 18; i++) {
            sim.hazeSparks.push({
              x: lowestPoint.x,
              y: lowestPoint.y,
              vx: (Math.random() - 0.5) * 140,
              vy: -Math.random() * 80 - 20,
              life: 1.0,
            });
          }
        }

        // Pinned glowing "CAPTURE" label at the contact point
        ctx.save();
        ctx.fillStyle = '#B8FF4D';
        ctx.font = 'bold 12px "JetBrains Mono", monospace';
        ctx.shadowColor = '#B8FF4D';
        ctx.shadowBlur = 12;
        ctx.textAlign = 'center';
        ctx.fillText('CAPTURE', lowestPoint.x, lowestPoint.y - 14);
        ctx.restore();
      }

      // Word "perigee" appears exactly once pinned to the lowest point, fading after capture
      if (sim.perigeeLabelAlpha > 0.05) {
        if (touchesHaze) {
          sim.perigeeLabelAlpha = Math.max(0, sim.perigeeLabelAlpha - 0.015);
        }
        ctx.save();
        ctx.globalAlpha = sim.perigeeLabelAlpha;
        ctx.fillStyle = '#FF9E3D';
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#FF9E3D';
        ctx.shadowBlur = 8;
        ctx.fillText("PERIGEE — ORBIT'S LOWEST POINT", lowestPoint.x, lowestPoint.y + 18);
        ctx.restore();
      }

      ctx.restore();
    }

    // Render haze sparks
    ctx.save();
    sim.hazeSparks.forEach((s) => {
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillStyle = '#FF9E3D';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // 6. PART A — TENSION = TETHER GLOW (Thickens & brightens with tension)
    if (isLatched) {
      ctx.save();
      const strainRatio = Math.min(1.0, tetherTension / 420);

      // Jitter when under intense tension
      const jitterX = strainRatio > 0.6 ? (Math.random() - 0.5) * 2.2 : 0;
      const jitterY = strainRatio > 0.6 ? (Math.random() - 0.5) * 2.2 : 0;

      const tetherColor = strainRatio > 0.6 ? '#FF4DE1' : strainRatio > 0.25 ? '#FF9E3D' : '#4DFFDF';
      const tetherWidth = 1.8 + strainRatio * 4.2; // 1.8px (dim wire) -> 6px (hot cable)

      ctx.strokeStyle = tetherColor;
      ctx.lineWidth = tetherWidth;
      ctx.shadowColor = tetherColor;
      ctx.shadowBlur = 6 + strainRatio * 16;

      ctx.beginPath();
      ctx.moveTo(tug.pos.x + jitterX, tug.pos.y + jitterY);
      ctx.lineTo(anchorX + jitterX, anchorY + jitterY);
      ctx.stroke();

      // Traveling pulse node along the cable
      const pulseTime = (performance.now() * 0.003) % 1.0;
      const nodeX = tug.pos.x + (anchorX - tug.pos.x) * pulseTime;
      const nodeY = tug.pos.y + (anchorY - tug.pos.y) * pulseTime;
      ctx.fillStyle = '#EDF2F7';
      ctx.beginPath();
      ctx.arc(nodeX, nodeY, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Optional tiny N readout beside tether midpoint (no text walls)
      const midX = (tug.pos.x + anchorX) * 0.5;
      const midY = (tug.pos.y + anchorY) * 0.5;
      ctx.fillStyle = '#EDF2F7';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.shadowBlur = 0;
      ctx.fillText(`${Math.round(tetherTension)} N`, midX, midY - 8);
      ctx.restore();
    }

    // 7. Derelict Hulk (Chunky faceted hull with crawling static hash)
    ctx.save();
    ctx.translate(hulk.pos.x, hulk.pos.y);
    ctx.rotate(hulk.angle);

    if (sim.hulkDeorbiting) {
      const alpha = Math.max(0, 1.0 - sim.hulkBurnProgress);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#FF4DE1';
      ctx.shadowColor = '#FF9E3D';
      ctx.shadowBlur = 24;
    } else {
      ctx.fillStyle = '#170E28';
    }

    ctx.strokeStyle = isReEntryReady ? '#B8FF4D' : '#8C4DFF';
    ctx.lineWidth = 2.5;

    const r = hulk.radius;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Crawling static hash scanlines on hulk hull
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(77, 255, 223, 0.15)';
    ctx.lineWidth = 1;
    const scanOffset = (performance.now() * 0.05) % 12;
    for (let y = -r; y < r; y += 8) {
      ctx.beginPath();
      ctx.moveTo(-r, y + scanOffset);
      ctx.lineTo(r, y + scanOffset);
      ctx.stroke();
    }
    ctx.restore();

    // Mooring pin & reticle
    ctx.fillStyle = isLatched ? '#4DFFDF' : '#FF9E3D';
    ctx.beginPath();
    ctx.arc(sim.anchorOffsetLocal.x, sim.anchorOffsetLocal.y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = isLatched ? '#4DFFDF' : '#FF9E3D';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sim.anchorOffsetLocal.x, sim.anchorOffsetLocal.y, 9, 0, Math.PI * 2);
    ctx.stroke();

    // Mouse aiming aid highlight reticle
    if (sim.isMouseHoveringHulk && !isLatched) {
      ctx.strokeStyle = '#4DFFDF';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(sim.anchorOffsetLocal.x, sim.anchorOffsetLocal.y, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();

    // 8. Player Tug & Afterimage Wake
    ctx.save();
    sim.trail.forEach((t, i) => {
      const alpha = (i / sim.trail.length) * 0.45;
      ctx.fillStyle = t.isStreak ? `rgba(184, 255, 77, ${alpha})` : `rgba(77, 255, 223, ${alpha})`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // PART C — GHOST ARROW (Burn Direction Teacher)
    // Shown at latch time perpendicular to tether along the swing, pulses with W-hold rhythm
    if (isLatched && sim.successfulPumpCount < 2 && !sim.hulkDeorbiting) {
      ctx.save();
      const toTugX = tug.pos.x - anchorX;
      const toTugY = tug.pos.y - anchorY;
      const rDist = Math.hypot(toTugX, toTugY) || 1;
      const spinDir = Math.sign(hulk.av) || 1;
      const tanX = (-toTugY / rDist) * spinDir;
      const tanY = (toTugX / rDist) * spinDir;

      // Pulse rhythm (~1.2s wave)
      const pulse = Math.sin(performance.now() * 0.005) * 0.5 + 0.5;
      const arrowLength = 32 + pulse * 14;

      ctx.strokeStyle = '#4DFFDF';
      ctx.fillStyle = '#4DFFDF';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#4DFFDF';
      ctx.shadowBlur = 10;

      const arrowTipX = tug.pos.x + tanX * arrowLength;
      const arrowTipY = tug.pos.y + tanY * arrowLength;

      ctx.beginPath();
      ctx.moveTo(tug.pos.x, tug.pos.y);
      ctx.lineTo(arrowTipX, arrowTipY);
      ctx.stroke();

      // Arrow head
      const headAngle = Math.atan2(tanY, tanX);
      ctx.beginPath();
      ctx.moveTo(arrowTipX, arrowTipY);
      ctx.lineTo(arrowTipX - Math.cos(headAngle - 0.45) * 10, arrowTipY - Math.sin(headAngle - 0.45) * 10);
      ctx.lineTo(arrowTipX - Math.cos(headAngle + 0.45) * 10, arrowTipY - Math.sin(headAngle + 0.45) * 10);
      ctx.closePath();
      ctx.fill();

      // Tiny prompt "PUMP [W]"
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PUMP [W]', arrowTipX + tanX * 12, arrowTipY + tanY * 12);
      ctx.restore();
    }

    // Tug Hull
    ctx.save();
    ctx.translate(tug.pos.x, tug.pos.y);
    ctx.rotate(tug.angle);

    // Thruster Jet Flame
    if (tug.thrusting) {
      ctx.fillStyle = '#FF9E3D';
      ctx.shadowColor = '#FF9E3D';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(-8, 6);
      ctx.lineTo(-26 - Math.random() * 10, 0);
      ctx.lineTo(-8, -6);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#4DFFDF';
      ctx.beginPath();
      ctx.moveTo(-7, 3);
      ctx.lineTo(-17 - Math.random() * 5, 0);
      ctx.lineTo(-7, -3);
      ctx.closePath();
      ctx.fill();
    }

    // Angular Tug Hull
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#EDF2F7';
    ctx.strokeStyle = '#4DFFDF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-11, -9);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-11, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FF4DE1';
    ctx.beginPath();
    ctx.arc(2, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    // Small Ø brand mark on tug hull
    ctx.fillStyle = '#4DFFDF';
    ctx.font = 'bold 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Ø', -2, 3);
    ctx.restore();

    // 9. Secondary Conjunction Hazard Object
    if (sim.conjunctionObj) {
      ctx.save();
      const conj = sim.conjunctionObj;
      ctx.fillStyle = '#FF4DE1';
      ctx.strokeStyle = '#EDF2F7';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#FF4DE1';
      ctx.shadowBlur = 18;

      ctx.beginPath();
      ctx.arc(conj.x, conj.y, conj.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#FF4DE1';
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.fillText('⚠ INBOUND CONJUNCTION HAZARD', conj.x - 85, conj.y - 28);
      ctx.restore();
    }

    // 10. Active Particles
    ctx.save();
    sim.particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // Compute Single Objective Chip (Max 4 words)
    let chipText = 'APPROACH TARGET';
    if (sim.hulkDeorbiting) {
      chipText = 'CAPTURE CONFIRMED';
    } else if (isLatched && isReEntryReady) {
      chipText = 'RELEASE IN WINDOW [Q]';
    } else if (isLatched && sim.isSpinMatched) {
      chipText = 'LOWER PERIGEE';
    } else if (isLatched) {
      chipText = 'MATCH SPIN';
    } else if (distToHulk <= (sim.hulkIndex === 0 ? 350 : 260)) {
      chipText = 'LATCH [E]';
    }

    // Update HUD React State (Visual gauges)
    setHud({
      fuel: Math.round(tug.fuel),
      maxFuel: CONSTANTS.INITIAL_DELTA_V,
      projectedPerigeeKm: evalResult.estimatedPerigeeKm,
      isReEntryWindow: isReEntryReady,
      distanceToHulk: Math.round(distToHulk),
      isSpinMatched: sim.isSpinMatched,
      hulkAngle: hulk.angle,
      tugAngle: tug.angle,
      tetherTension: Math.round(tetherTension),
      conjunctionTime: sim.conjunctionTimer !== null ? Math.max(0, sim.conjunctionTimer).toFixed(1) : null,
      objectiveChipText: chipText,
      isNearBoundary: sim.isNearBoundary,
      offscreenIndicator: sim.offscreenIndicator,
      isLatched: sim.isLatched,
      isDeorbiting: sim.hulkDeorbiting,
    });
  };

  // Canvas Lifecycle & Loop Engine
  useEffect(() => {
    if (appMode !== 'game') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      simRef.current.width = canvas.width;
      simRef.current.height = canvas.height;
      simRef.current.spaceDust = initSpaceDust(canvas.width, canvas.height);
      if (!simRef.current.tug) {
        spawnHulk(hulkIndex);
      }
    };

    resize();
    window.addEventListener('resize', resize);

    const loop = new FixedLoop(updatePhysics, renderCanvas);
    loopRef.current = loop;
    loop.start();

    chiptuneAudio.startSpaceDrone();

    return () => {
      loop.stop();
      chiptuneAudio.stopSpaceDrone();
      window.removeEventListener('resize', resize);
    };
  }, [appMode, spawnHulk, hulkIndex]);

  // LANDING PAGE VIEW
  if (appMode === 'landing') {
    return (
      <AsciiLandingPage
        onStartContract={() => {
          chiptuneAudio.init();
          setAppMode('boot');
        }}
        onWatchCredits={() => {
          setAppMode('credits');
        }}
      />
    );
  }

  // ACT 3 CREDITS VIEW
  if (appMode === 'credits') {
    return (
      <CampaignCredits
        score={campaignScore}
        onReturn={() => {
          setAppMode('landing');
        }}
      />
    );
  }

  // PIXEL BOOT VIEW
  if (appMode === 'boot') {
    return (
      <PixelBootPreloader
        onComplete={() => {
          setAppMode('game');
        }}
      />
    );
  }

  const currentHulkConfig = HULK_MANIFEST[hulkIndex] || HULK_MANIFEST[0];

  // Visual Gauge calculations
  const fuelPct = Math.min(100, Math.max(0, (hud.fuel / hud.maxFuel) * 100));
  const isFuelLowAmber = fuelPct < 25 && fuelPct >= 10;
  const isFuelCritRed = fuelPct < 10;

  // Perigee Gauge slider position: top 0% (450km) down to bottom 78% (100km) and 100% (0km)
  const perigeePct = Math.min(100, Math.max(0, (hud.projectedPerigeeKm / 450) * 78));

  // Determine current active objective chip text (or mock query param override)
  const urlParams = new URLSearchParams(window.location.search);
  const mockPhase = urlParams.get('phase');

  let activeChipText = hud.objectiveChipText;
  if (mockPhase === 'approach') activeChipText = 'APPROACH TARGET';
  else if (mockPhase === 'mooring') activeChipText = 'LATCH [E]';
  else if (mockPhase === 'spin') activeChipText = 'MATCH SPIN';
  else if (mockPhase === 'swing') activeChipText = 'LOWER PERIGEE';
  else if (mockPhase === 'window') activeChipText = 'RELEASE IN WINDOW [Q]';
  else if (mockPhase === 'deorbit') activeChipText = 'CAPTURE CONFIRMED';

  const isWindowActive = mockPhase === 'window' || (mockPhase === 'deorbit' ? true : hud.isReEntryWindow);

  // GAMEPLAY VIEW — Option A + C Minimalist Cockpit HUD
  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: 'var(--vacuum)',
      }}
      className={`
        ${hud.conjunctionTime !== null && Number(hud.conjunctionTime) < 14 ? 'bezel-alert' : ''}
        ${isFailing ? 'failing-desat' : ''}
        ${isStreakActive ? 'popping-off-sat' : ''}
        ${isDeathCollapsing ? 'death-static-burst' : ''}
      `}
    >
      {/* CRT Scanline Overlay */}
      <div className="crt-overlay" />

      {/* Main Physics Canvas */}
      <canvas id="raw-tether-canvas" ref={canvasRef} />

      {/* Sleek Top Header Bar (Zero // separators) */}
      <header
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '8px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(13, 6, 24, 0.88)',
          borderBottom: '1px solid var(--grid-violet)',
          zIndex: 35,
          fontSize: '0.80rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span className="live-pill">
            <span className="live-dot" /> LIVE FEED
          </span>
          <span style={{ color: 'var(--signal-cyan)', fontWeight: 800, letterSpacing: '0.15em' }}>
            ASTRAL ZERO · Ø
          </span>
          <span style={{ color: 'var(--telemetry-muted)' }}>|</span>
          <span style={{ color: 'var(--titanium-white)' }}>
            CHANNEL 73 | PIRATE SALVAGE BROADCAST
          </span>
          <span style={{ color: 'var(--telemetry-muted)' }}>|</span>
          <span style={{ color: 'var(--solar-flare)', fontWeight: 700 }}>
            {currentHulkConfig.shortName}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {!currentHulkConfig.isTutorial && (
            <button
              onClick={() => spawnHulk(0, false)}
              style={{
                background: 'transparent',
                border: '1px solid var(--grid-violet)',
                color: 'var(--telemetry-muted)',
                fontFamily: 'inherit',
                fontSize: '0.72rem',
                padding: '3px 8px',
                cursor: 'pointer',
              }}
              title="Replay Contract 0 Tutorial Drill"
            >
              DRILL [C0]
            </button>
          )}

          <button
            onClick={toggleAudio}
            style={{
              background: 'transparent',
              border: '1px solid var(--grid-violet)',
              color: isAudioMuted ? 'var(--telemetry-muted)' : 'var(--signal-cyan)',
              fontFamily: 'inherit',
              fontSize: '0.72rem',
              padding: '3px 8px',
              cursor: 'pointer',
            }}
          >
            {isAudioMuted ? 'AUDIO: MUTED [M]' : 'AUDIO: ON [M]'}
          </button>

          <button
            onClick={() => setAppMode('landing')}
            style={{
              background: 'transparent',
              border: '1px solid var(--grid-violet)',
              color: 'var(--telemetry-muted)',
              fontFamily: 'inherit',
              fontSize: '0.72rem',
              padding: '3px 8px',
              cursor: 'pointer',
            }}
          >
            LANDING [ESC]
          </button>
        </div>
      </header>

      {/* PART A.1 — FUEL BAR (Left Screen Edge) */}
      <div className={`fuel-gauge ${isFuelCritRed ? 'fuel-crit-red' : isFuelLowAmber ? 'fuel-low-amber' : ''}`}>
        <div className="fuel-gauge-readout">{hud.fuel} Δv</div>
        <div className="fuel-gauge-fill" style={{ height: `${fuelPct}%` }} />
        <div className="fuel-gauge-icon">
          <svg width="12" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C9.5 7 5 10 5 15a7 7 0 0014 0c0-5-4.5-8-7-13zm0 18a5 5 0 01-5-5c0-3 2.5-5 5-8.5 2.5 3.5 5 5.5 5 8.5a5 5 0 01-5 5z" />
          </svg>
          <span>Δv</span>
        </div>
      </div>

      {/* PART A.2 — PERIGEE GAUGE (Right Screen Edge) */}
      <div className="perigee-gauge">
        {/* Glowing Capture Zone (< 100 km) */}
        <div className={`perigee-capture-zone ${isWindowActive ? 'capture-zone-active' : ''}`}>
          <div className="perigee-capture-zone-label">&lt;100 KM · Ø</div>
        </div>

        {/* Sliding Hulk Marker */}
        <div className={`perigee-marker ${isWindowActive ? 'in-capture-zone' : ''}`} style={{ top: `${perigeePct}%` }}>
          <div className="perigee-marker-dot" />
          <div className="perigee-marker-tag">
            {mockPhase === 'window' ? '78 km' : `${hud.projectedPerigeeKm} km`}
          </div>
        </div>

        {/* Floating Release Ready Chip */}
        {isWindowActive && (
          <div className="release-ready-chip">
            RELEASE READY [Q]
          </div>
        )}
      </div>

      {/* Soft Boundary Edge Warning Glow */}
      {hud.isNearBoundary && <div className="boundary-warning-vignette" />}

      {/* Ship Off-Screen Edge Arrow Indicator */}
      {hud.offscreenIndicator && (
        <div
          className="ship-offscreen-arrow"
          style={{
            left: `${hud.offscreenIndicator.x}px`,
            top: `${hud.offscreenIndicator.y}px`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <span>▲ TUG [{hud.offscreenIndicator.dist}m]</span>
        </div>
      )}

      {/* PART A.3 — SPIN-MATCH CONCENTRIC RINGS (Top-Right) */}
      <div className="spin-rings-widget" title="Concentric Spin-Match Alignment">
        <svg width="56" height="56" viewBox="0 0 56 56">
          {/* Outer Ring: Hulk Rotation (Magenta, turns Green on match) */}
          <circle
            cx="28"
            cy="28"
            r="23"
            fill="none"
            stroke={hud.isSpinMatched ? '#B8FF4D' : '#FF4DE1'}
            strokeWidth="2.5"
            strokeDasharray="18 8"
            strokeLinecap="round"
            transform={`rotate(${(hud.hulkAngle * 180) / Math.PI} 28 28)`}
          />

          {/* Inner Ring: Tug Relative Velocity / Attitude (Cyan, turns Green on match) */}
          <circle
            cx="28"
            cy="28"
            r="14"
            fill="none"
            stroke={hud.isSpinMatched ? '#B8FF4D' : '#4DFFDF'}
            strokeWidth="2.5"
            strokeDasharray="12 6"
            strokeLinecap="round"
            transform={`rotate(${(hud.tugAngle * 180) / Math.PI} 28 28)`}
          />

          {/* Center Lock Dot */}
          <circle
            cx="28"
            cy="28"
            r="3"
            fill={hud.isSpinMatched ? '#B8FF4D' : '#EDF2F7'}
          />
        </svg>
      </div>

      {/* PART A.4 — OBJECTIVE CHIP (Max 4 words, Top-Center) */}
      <div className={`objective-chip ${isWindowActive ? 'window-ready' : ''}`} key={activeChipText}>
        <span>{activeChipText}</span>
        {currentHulkConfig.isTutorial && (
          <button
            onClick={skipTutorial}
            className="objective-chip-skip"
            title="Skip tutorial and roll into Contract 1"
          >
            [T] SKIP
          </button>
        )}
      </div>

      {/* Conjunction Countdown Hazard Banner (Only active on Target 3) */}
      {hud.conjunctionTime !== null && (
        <div
          style={{
            position: 'absolute',
            top: '100px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255, 77, 225, 0.16)',
            border: '1px solid var(--plasma-magenta)',
            color: 'var(--plasma-magenta)',
            padding: '3px 14px',
            borderRadius: '3px',
            fontSize: '0.74rem',
            fontWeight: 800,
            letterSpacing: '0.1em',
            zIndex: 35,
          }}
        >
          ⚠ CONJUNCTION IN: {hud.conjunctionTime}s
        </div>
      )}

      {/* MEG Streamer AI Card (Top-Right under rings) */}
      <div
        className="stream-overlay-card"
        style={{
          position: 'absolute',
          top: '122px',
          right: '54px',
          maxWidth: '300px',
          padding: '8px 12px',
          fontSize: '0.75rem',
          zIndex: 30,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ fontWeight: 800, color: 'var(--signal-cyan)', fontSize: '0.70rem' }}>
            MEG | STREAM
          </span>
          <span style={{ fontSize: '0.68rem', color: 'var(--telemetry-muted)' }}>
            👁 {megChat.viewers.toLocaleString()}
          </span>
        </div>
        <div style={{ color: 'var(--titanium-white)', lineHeight: 1.4 }}>
          "{megChat.line}"
        </div>
      </div>

      {/* WIN CONDITION FLAIR (Perigee countdown ticking down to 0 KM) */}
      {winFlairState && (
        <div className="win-flair-container">
          <div className="win-flair-sub">ATMOSPHERIC RE-ENTRY CONFIRMED</div>
          <div className="win-flair-ticker">
            {winFlairState.currentKm} <span className="win-flair-unit">KM</span>
          </div>
          {winFlairState.zeroed && (
            <div className="win-flair-zeroed-badge">
              ORBIT ZEROED · Ø
            </div>
          )}
        </div>
      )}

      {/* Mission 2 Reel-In Tooltip (exactly 6 words) */}
      {hulkIndex === 2 && hud.isLatched && !hud.isDeorbiting && (
        <div className="reel-in-tooltip">
          SCROLL WHEEL: REEL IN CABLE TENSION
        </div>
      )}

      {/* 2-LINE MISSION BRIEFING CARD OVERLAY */}
      {activeBriefing && (
        <div className="briefing-card-overlay">
          <div className="briefing-card">
            <div className="briefing-header">
              <span className="briefing-badge">{activeBriefing.act}</span>
              <span className="briefing-shell">{activeBriefing.orbitShell}</span>
            </div>
            <h2 className="briefing-title">{activeBriefing.name}</h2>
            <div className="briefing-lines">
              <div className="line-target">{activeBriefing.briefingLine1}</div>
              <div className="line-mission">{activeBriefing.briefingLine2}</div>
            </div>
            <button
              onClick={() => {
                chiptuneAudio.playUiBeep();
                setActiveBriefing(null);
                simRef.current.isBriefingPaused = false;
                simRef.current.missionStartTime = simRef.current.totalTime;
                simRef.current.missionDeltaVStart = simRef.current.deltaVUsed;
              }}
              className="briefing-btn"
            >
              ENGAGE TARGET [SPACE / CLICK]
            </button>
          </div>
        </div>
      )}

      {/* 3-SECOND INTERSTITIAL BLACK CARD BETWEEN MISSIONS */}
      {missionInterstitial && (
        <div className="interstitial-card-overlay">
          <div className="interstitial-card">
            <div style={{ color: 'var(--signal-cyan)', fontSize: '0.80rem', letterSpacing: '0.2em', marginBottom: '8px' }}>
              DEORBIT CONFIRMED · ORBIT ZEROED
            </div>
            <h2 style={{ fontSize: '2.2rem', color: 'var(--titanium-white)', margin: '0 0 12px 0' }}>
              {missionInterstitial.targetName}
            </h2>
            <div style={{ fontSize: '3.5rem', fontWeight: 900, color: 'var(--riot-lime)', margin: '8px 0 20px 0' }}>
              RANK {missionInterstitial.rank}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '400px', margin: '0 auto 24px auto' }}>
              <div style={{ padding: '12px', background: 'rgba(23, 14, 40, 0.7)', border: '1px solid var(--grid-violet)' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--telemetry-muted)' }}>MISSION TIME</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--titanium-white)', marginTop: '2px' }}>
                  {missionInterstitial.time}s
                </div>
              </div>
              <div style={{ padding: '12px', background: 'rgba(23, 14, 40, 0.7)', border: '1px solid var(--grid-violet)' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--telemetry-muted)' }}>ΔV CONSUMED</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--solar-flare)', marginTop: '2px' }}>
                  {missionInterstitial.deltaVUsed} m/s
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                const next = missionInterstitial.nextIndex;
                setMissionInterstitial(null);
                spawnHulk(next, true);
              }}
              className="briefing-btn"
              style={{ maxWidth: '360px', margin: '0 auto' }}
            >
              PROCEED TO NEXT TARGET [SPACE] ({missionInterstitial.countdown}s)
            </button>
          </div>
        </div>
      )}

      {/* Contract Complete Screen */}
      {gameStatus === 'contract_complete' && finalScore && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(13, 6, 24, 0.94)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div style={{ color: 'var(--signal-cyan)', fontSize: '0.85rem', letterSpacing: '0.2em' }}>
            [TRANSMISSION COMPLETE · ALL DERELICTS DEORBITED]
          </div>
          <h1 style={{ fontSize: '3rem', color: 'var(--titanium-white)', margin: '0.5rem 0' }}>
            ASTRAL ZERO ACHIEVED · Ø
          </h1>
          <div
            style={{
              fontSize: '5rem',
              fontWeight: 900,
              color: 'var(--riot-lime)',
              margin: '0.5rem 0 1.5rem 0',
              textShadow: '0 0 30px rgba(184, 255, 77, 0.5)',
            }}
          >
            RANK {finalScore.rank}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '16px',
              maxWidth: '560px',
              width: '100%',
              marginBottom: '1.5rem',
              textAlign: 'center',
            }}
          >
            <div style={{ padding: '14px', border: '1px solid var(--grid-violet)', background: 'rgba(23, 14, 40, 0.6)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--telemetry-muted)' }}>TOTAL TIME</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--titanium-white)', marginTop: '4px' }}>
                {finalScore.totalTime}s
              </div>
            </div>

            <div style={{ padding: '14px', border: '1px solid var(--grid-violet)', background: 'rgba(23, 14, 40, 0.6)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--telemetry-muted)' }}>ΔV EXPENDED</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--solar-flare)', marginTop: '4px' }}>
                {finalScore.deltaVUsed} m/s
              </div>
            </div>

            <div style={{ padding: '14px', border: '1px solid var(--grid-violet)', background: 'rgba(23, 14, 40, 0.6)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--telemetry-muted)' }}>AVG ENTRY PERIGEE</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--riot-lime)', marginTop: '4px' }}>
                {finalScore.avgPerigee} km
              </div>
            </div>
          </div>

          <div
            style={{
              maxWidth: '600px',
              textAlign: 'center',
              color: 'var(--signal-cyan)',
              fontSize: '0.85rem',
              lineHeight: 1.5,
              marginBottom: '1.5rem',
              padding: '8px 16px',
              background: 'rgba(77, 255, 223, 0.08)',
              border: '1px solid rgba(77, 255, 223, 0.3)',
              borderRadius: '4px',
            }}
          >
            "Perigee is an orbit's lowest point. Below ~100 km, atmospheric drag guarantees re-entry — drive the hulk's perigee under the line and gravity does the rest."
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <button
              onClick={() => setAppMode('credits')}
              className="term-btn term-btn-streak"
            >
              PROCEED TO ACT 3 CREDITS ➔
            </button>
            <button onClick={restartContract} className="term-btn">
              RE-ENGAGE SALVAGE CONTRACT [R]
            </button>
          </div>
        </div>
      )}

      {/* Mission Failed Screen */}
      {gameStatus === 'failed' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(13, 6, 24, 0.96)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div style={{ color: 'var(--plasma-magenta)', fontSize: '0.85rem', letterSpacing: '0.2em' }}>
            [SIGNAL LOSS · PIRATE TRANSMISSION SEVERED]
          </div>
          <h1 style={{ fontSize: '2.8rem', color: 'var(--plasma-magenta)', margin: '0.5rem 0 1rem 0' }}>
            BROADCAST ABORTED
          </h1>
          <div
            style={{
              color: 'var(--titanium-white)',
              fontSize: '0.95rem',
              marginBottom: '1.5rem',
              maxWidth: '540px',
              textAlign: 'center',
            }}
          >
            {failReason}
          </div>
          <div style={{ color: 'var(--telemetry-muted)', fontSize: '0.82rem', marginBottom: '2rem' }}>
            DERELICTS DEORBITED BEFORE LOSS: {hulkIndex} OF 3
          </div>

          <button onClick={restartContract} className="term-btn term-btn-danger">
            RE-TRANSMIT SALVAGE FEED [R]
          </button>
        </div>
      )}

      {/* Clean Bottom Keybindings Bar (Zero // separators) */}
      <div className="controls-banner">
        <div>
          <strong>[W / SPACE / MOUSE-HOLD]</strong> THRUST NOSE &nbsp;|&nbsp;
          <strong>[A / D / ← / →]</strong> ROTATE &nbsp;|&nbsp;
          <strong>[E]</strong> LATCH &nbsp;|&nbsp;
          <strong>[Q]</strong> RELEASE &nbsp;|&nbsp;
          {currentHulkConfig.isTutorial && <span><strong>[T]</strong> SKIP &nbsp;|&nbsp;</span>}
          <strong>[R]</strong> RESET &nbsp;|&nbsp;
          <strong>[M]</strong> MUTE
        </div>
      </div>
    </div>
  );
}
