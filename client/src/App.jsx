/**
 * Debris Darling — Main Client App
 * Built for the NASA International Space Apps Challenge 2026.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

import Landing from './components/Landing.jsx';
import GameCanvas from './components/GameCanvas.jsx';
import HUD from './components/HUD.jsx';
import RageNotifications from './components/RageNotifications.jsx';
import useGlitchEffect from './hooks/useGlitchEffect.js';
import useOrbitalPhysics from './hooks/useOrbitalPhysics.js';
import { initAudio, playRageAlarm } from './audio.js';
import './styles/glitch.css';

export default function App() {
  const [mode, setMode] = useState('landing');
  const socketRef = useRef(null);

  const {
    isAberrationActive,
    isShakeActive,
    isFlashActive,
    notifications,
    triggerProgradeRage,
    triggerRetrogradeSuccess,
    triggerFuelWarning,
    addNotification,
  } = useGlitchEffect();

  // Socket.io initialization & event listeners
  useEffect(() => {
    const socket = io({
      autoConnect: true,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Debris Darling] Socket connected to server:', socket.id);
      socket.emit('mission_join', { missionId: 'mission-01' });
    });

    socket.on('ai_taunt', (payload) => {
      if (payload?.message) {
        addNotification(payload.message, 'taunt', 4500);
      }
    });

    socket.on('ai_anger', (payload) => {
      playRageAlarm();
      triggerProgradeRage();
    });

    socket.on('ai_dismissal', (payload) => {
      if (payload?.comment) {
        triggerRetrogradeSuccess();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [addNotification, triggerProgradeRage, triggerRetrogradeSuccess]);

  // Throw event callback from physics engine
  const handleThrowEvent = useCallback(
    (payload) => {
      const { direction, mass, deltaV } = payload;

      if (direction === 'prograde') {
        playRageAlarm();
        triggerProgradeRage();
      } else {
        triggerRetrogradeSuccess();
      }

      if (socketRef.current?.connected) {
        socketRef.current.emit('throw_event', { direction, mass, deltaV });
      }
    },
    [triggerProgradeRage, triggerRetrogradeSuccess],
  );

  const handleFuelWarning = useCallback(() => {
    triggerFuelWarning();
  }, [triggerFuelWarning]);

  const {
    worldRef,
    initWorld,
    syncState,
    debrisCount,
    successfulDeorbits,
    score,
    fuel,
  } = useOrbitalPhysics({
    onThrowEvent: handleThrowEvent,
    onFuelWarning: handleFuelWarning,
  });

  const handleStartGame = () => {
    initAudio();
    setMode('game');
  };

  const handleResetLevel = () => {
    if (worldRef.current) {
      worldRef.current.initScenario();
      syncState();
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', margin: 0, padding: 0 }}>
      {mode === 'landing' ? (
        <Landing onStartGame={handleStartGame} />
      ) : (
        <>
          <GameCanvas
            worldRef={worldRef}
            initWorld={initWorld}
            syncState={syncState}
            isAberrationActive={isAberrationActive}
            isShakeActive={isShakeActive}
          />
          <HUD
            debrisCount={debrisCount}
            successfulDeorbits={successfulDeorbits}
            score={score}
            fuel={fuel}
            currentLevel={1}
            onResetLevel={handleResetLevel}
            onBackToMenu={() => setMode('landing')}
          />
          <RageNotifications notifications={notifications} isFlashActive={isFlashActive} />
        </>
      )}
    </div>
  );
}
