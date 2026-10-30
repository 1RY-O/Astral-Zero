/**
 * Debris Derby — Mobile Touch Controls.
 *
 * Provides an on-screen thrust stick and verb controls for touch/mobile devices.
 * Respects 44px minimum touch targets and safe area insets.
 */

import { useState, useRef, useEffect, useCallback } from 'react';

export default function TouchControls({ onThrustChange, onGrabNearest, onRelease }) {
  const [active, setActive] = useState(false);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const stickRef = useRef(null);
  const touchIdRef = useRef(null);

  const STICK_RADIUS = 50; // px
  const KNOB_MAX = 40; // px

  const handleTouchStart = useCallback((e) => {
    e.preventDefault();
    if (touchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    touchIdRef.current = touch.identifier;
    setActive(true);

    const rect = stickRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = touch.clientX - centerX;
    const dy = touch.clientY - centerY;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, KNOB_MAX);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clampedDist;
    const ky = Math.sin(angle) * clampedDist;

    setKnobPos({ x: kx, y: ky });
    onThrustChange(true, { x: kx / KNOB_MAX, y: ky / KNOB_MAX });
  }, [onThrustChange]);

  const handleTouchMove = useCallback((e) => {
    if (touchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i += 1) {
      const touch = e.changedTouches[i];
      if (touch.identifier === touchIdRef.current) {
        const rect = stickRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const dx = touch.clientX - centerX;
        const dy = touch.clientY - centerY;
        const dist = Math.hypot(dx, dy);
        const clampedDist = Math.min(dist, KNOB_MAX);
        const angle = Math.atan2(dy, dx);
        const kx = Math.cos(angle) * clampedDist;
        const ky = Math.sin(angle) * clampedDist;

        setKnobPos({ x: kx, y: ky });
        onThrustChange(true, { x: kx / KNOB_MAX, y: ky / KNOB_MAX });
        break;
      }
    }
  }, [onThrustChange]);

  const handleTouchEnd = useCallback((e) => {
    for (let i = 0; i < e.changedTouches.length; i += 1) {
      if (e.changedTouches[i].identifier === touchIdRef.current) {
        touchIdRef.current = null;
        setActive(false);
        setKnobPos({ x: 0, y: 0 });
        onThrustChange(false, null);
        break;
      }
    }
  }, [onThrustChange]);

  useEffect(() => {
    const onWindowTouchEnd = (e) => handleTouchEnd(e);
    window.addEventListener('touchend', onWindowTouchEnd);
    window.addEventListener('touchcancel', onWindowTouchEnd);
    return () => {
      window.removeEventListener('touchend', onWindowTouchEnd);
      window.removeEventListener('touchcancel', onWindowTouchEnd);
    };
  }, [handleTouchEnd]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        left: 'calc(16px + env(safe-area-inset-left, 0px))',
        right: 'calc(16px + env(safe-area-inset-right, 0px))',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        pointerEvents: 'none',
        zIndex: 'var(--z-hud)',
      }}
    >
      {/* On-screen Thrust Stick */}
      <div
        ref={stickRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          pointerEvents: 'auto',
          width: `${STICK_RADIUS * 2}px`,
          height: `${STICK_RADIUS * 2}px`,
          borderRadius: '50%',
          background: active ? 'rgba(56, 189, 248, 0.18)' : 'rgba(6, 13, 31, 0.65)',
          border: `2px solid ${active ? 'var(--sky-400)' : 'var(--border)'}`,
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          touchAction: 'none',
        }}
        aria-label="Thrust Virtual Stick"
      >
        <div
          style={{
            position: 'absolute',
            fontSize: '9px',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            color: 'var(--text-muted)',
            letterSpacing: '0.08em',
            top: '8px',
          }}
        >
          THRUST
        </div>
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: active ? 'var(--sky-400)' : 'var(--surface-strong)',
            border: '2px solid var(--white)',
            transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
            transition: active ? 'none' : 'transform 0.16s ease-out',
            boxShadow: active ? 'var(--glow-player)' : 'none',
          }}
        />
      </div>

      {/* Action Touch Buttons */}
      <div
        style={{
          pointerEvents: 'auto',
          display: 'flex',
          gap: '12px',
        }}
      >
        <button
          onClick={onGrabNearest}
          style={{
            minWidth: '56px',
            minHeight: '56px',
            borderRadius: '50%',
            background: 'var(--surface-strong)',
            border: '2px solid var(--sky-400)',
            color: 'var(--text)',
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: '11px',
            cursor: 'pointer',
            touchAction: 'manipulation',
          }}
          aria-label="Grab nearest debris"
        >
          GRAB
        </button>

        <button
          onClick={onRelease}
          style={{
            minWidth: '56px',
            minHeight: '56px',
            borderRadius: '50%',
            background: 'var(--surface-strong)',
            border: '2px solid var(--pink-500)',
            color: 'var(--pink-500)',
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: '11px',
            cursor: 'pointer',
            touchAction: 'manipulation',
          }}
          aria-label="Release tether"
        >
          DROP
        </button>
      </div>
    </div>
  );
}
