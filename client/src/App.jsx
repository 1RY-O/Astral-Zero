/**
 * HELIOS PROTOCOL: Space Weather Superhero Tycoon — Main Client App
 * Built for the NASA International Space Apps Challenge 2026.
 */

import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

import Landing from './components/Landing.jsx';
import TycoonDashboard from './components/TycoonDashboard.jsx';
import RageNotifications from './components/RageNotifications.jsx';
import useGlitchEffect from './hooks/useGlitchEffect.js';
import { initAudio, playRageAlarm } from './audio.js';
import './styles/glitch.css';

export default function App() {
  const [mode, setMode] = useState('landing');
  const [systemOnline, setSystemOnline] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const socketRef = useRef(null);

  const {
    isFlashActive,
    notifications,
    triggerAberration,
    triggerShake,
    triggerHotPinkFlash,
    addNotification,
  } = useGlitchEffect();

  // Check health endpoint on load
  useEffect(() => {
    let isMounted = true;
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error('Health check error');
        return res.json();
      })
      .then((data) => {
        if (isMounted && (data.status === 'ok' || data.system === 'SYSTEM ONLINE')) {
          setSystemOnline(true);
        }
      })
      .catch(() => {
        if (isMounted) setSystemOnline(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Socket.io initialization & boss taunt listener
  useEffect(() => {
    const socket = io({
      autoConnect: true,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[HELIOS PROTOCOL] Connected to space weather AI server:', socket.id);
      setSocketConnected(true);
      setSystemOnline(true);
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('boss_taunt', (payload) => {
      if (payload?.message) {
        const isCritical = payload.intensity === 'high' || payload.intensity === 'critical';
        if (isCritical) {
          playRageAlarm();
          triggerAberration(1200);
          triggerShake(600);
          triggerHotPinkFlash(400);
        }
        addNotification(payload.message, isCritical ? 'rage' : 'taunt', 4800);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [addNotification, triggerAberration, triggerShake, triggerHotPinkFlash]);

  const handleStartGame = () => {
    initAudio();
    setMode('tycoon');
  };

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', margin: 0, padding: 0 }}>
      {mode === 'landing' ? (
        <Landing onStartGame={handleStartGame} />
      ) : (
        <TycoonDashboard
          socket={socketRef.current}
          systemOnline={systemOnline || socketConnected}
          onBackToMenu={() => setMode('landing')}
        />
      )}

      {/* Corrupted NASA AI Hostile Taunts Popup Overlay */}
      <RageNotifications notifications={notifications} isFlashActive={isFlashActive} />
    </div>
  );
}
