import { useState, useCallback, useRef } from 'react';

export function useGlitchEffect() {
  const [isAberrationActive, setIsAberrationActive] = useState(false);
  const [isShakeActive, setIsShakeActive] = useState(false);
  const [isFlashActive, setIsFlashActive] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const aberrationTimerRef = useRef(null);
  const shakeTimerRef = useRef(null);
  const flashTimerRef = useRef(null);

  const addNotification = useCallback((text, type = 'info', durationMs = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setNotifications((prev) => [...prev, { id, text, type }]);

    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, durationMs);
  }, []);

  const triggerAberration = useCallback((durationMs = 1200) => {
    setIsAberrationActive(true);
    if (aberrationTimerRef.current) clearTimeout(aberrationTimerRef.current);
    aberrationTimerRef.current = setTimeout(() => {
      setIsAberrationActive(false);
    }, durationMs);
  }, []);

  const triggerShake = useCallback((durationMs = 600) => {
    setIsShakeActive(true);
    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = setTimeout(() => {
      setIsShakeActive(false);
    }, durationMs);
  }, []);

  const triggerHotPinkFlash = useCallback((durationMs = 400) => {
    setIsFlashActive(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      setIsFlashActive(false);
    }, durationMs);
  }, []);

  const triggerProgradeRage = useCallback(() => {
    triggerAberration(1400);
    triggerShake(800);
    triggerHotPinkFlash(500);
    addNotification('YOU JUST CREATED 14 NEW DEBRIS OBJECTS. GREAT JOB.', 'rage', 5000);
  }, [triggerAberration, triggerShake, triggerHotPinkFlash, addNotification]);

  const triggerRetrogradeSuccess = useCallback(() => {
    addNotification("Finally. Still only 0.003% progress. Don't get cocky.", 'dismissal', 4000);
  }, [addNotification]);

  const triggerFuelWarning = useCallback(() => {
    triggerAberration(600);
    addNotification('Thruster integrity critical. Try not to die before lunch.', 'warning', 4500);
  }, [triggerAberration, addNotification]);

  return {
    isAberrationActive,
    isShakeActive,
    isFlashActive,
    notifications,
    triggerAberration,
    triggerShake,
    triggerHotPinkFlash,
    triggerProgradeRage,
    triggerRetrogradeSuccess,
    triggerFuelWarning,
    addNotification,
  };
}

export default useGlitchEffect;
