import { useEffect, useRef } from 'react';

export default function Cursor() {
  const containerRef = useRef(null);
  const ringRef = useRef(null);
  const dotRef = useRef(null);
  const labelRef = useRef(null);

  const posRef = useRef({ x: -100, y: -100 });
  const targetRef = useRef({ x: -100, y: -100 });
  const isHoverRef = useRef(false);
  const visibleRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    const ring = ringRef.current;
    const dot = dotRef.current;
    const label = labelRef.current;
    if (!container || !ring || !dot || !label) return;

    let rafId = 0;

    const setHoverState = (shouldHover) => {
      if (shouldHover === isHoverRef.current) return;
      isHoverRef.current = shouldHover;

      if (shouldHover) {
        // Alpha Project: scale ring to 1.16 and show "Enter" label
        ring.style.transform = 'translate(-50%, -50%) scale(1.16)';
        ring.style.borderColor = 'rgba(255, 255, 255, 0.75)';
        ring.style.backgroundColor = 'rgba(6, 17, 32, 0.65)';
        dot.style.opacity = '0';
        dot.style.transform = 'translate(-50%, -50%) scale(0.2)';
        label.style.opacity = '1';
        label.style.transform = 'scale(1)';
      } else {
        // Alpha Project: default 36x36px ring and 12x12px dot
        ring.style.transform = 'translate(-50%, -50%) scale(1)';
        ring.style.borderColor = 'rgba(255, 255, 255, 0.4)';
        ring.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
        dot.style.opacity = '1';
        dot.style.transform = 'translate(-50%, -50%) scale(1)';
        label.style.opacity = '0';
        label.style.transform = 'scale(0.8)';
      }
    };

    const onPointerMove = (e) => {
      targetRef.current.x = e.clientX;
      targetRef.current.y = e.clientY;

      if (!visibleRef.current) {
        visibleRef.current = true;
        posRef.current.x = e.clientX;
        posRef.current.y = e.clientY;
        container.style.opacity = '1';
      }

      const target = e.target;
      const isClickable = !!(
        target &&
        typeof target.closest === 'function' &&
        target.closest('button, a, [role="button"]')
      );
      const isDebris = typeof window !== 'undefined' && Boolean(window.__dd_debrisHover);

      setHoverState(isClickable || isDebris);
    };

    const onPointerLeave = () => {
      visibleRef.current = false;
      container.style.opacity = '0';
      setHoverState(false);
    };

    const loop = () => {
      if (visibleRef.current) {
        // Continuous check for debris hover state in case debris floats under cursor
        const isDebris = typeof window !== 'undefined' && Boolean(window.__dd_debrisHover);
        let isClickable = false;
        if (targetRef.current.x >= 0 && targetRef.current.y >= 0) {
          const el = document.elementFromPoint(targetRef.current.x, targetRef.current.y);
          if (el && typeof el.closest === 'function' && el.closest('button, a, [role="button"]')) {
            isClickable = true;
          }
        }
        setHoverState(isClickable || isDebris);

        // Alpha Project cursor smoothing 0.2 lerp
        const smoothing = 0.2;
        posRef.current.x += (targetRef.current.x - posRef.current.x) * smoothing;
        posRef.current.y += (targetRef.current.y - posRef.current.y) * smoothing;

        container.style.transform = `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0)`;
      }

      rafId = requestAnimationFrame(loop);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('mouseleave', onPointerLeave);
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('mouseleave', onPointerLeave);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        pointerEvents: 'none',
        zIndex: 9999,
        opacity: 0,
        transition: 'opacity 0.2s ease',
        willChange: 'transform',
      }}
    >
      {/* 36x36px ring with backdrop-filter: blur(3px), border rgba(255,255,255,0.4), border-radius 50% */}
      <div
        ref={ringRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          border: '1px solid rgba(255, 255, 255, 0.4)',
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          transform: 'translate(-50%, -50%) scale(1)',
          transition:
            'transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.18s ease, background-color 0.18s ease',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {/* "Enter" label shown on hover over buttons, links, or debris */}
        <span
          ref={labelRef}
          style={{
            fontFamily: '"Instrument Sans", "Inter", sans-serif',
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: '#FFFFFF',
            opacity: 0,
            transform: 'scale(0.8)',
            transition: 'opacity 0.15s ease, transform 0.15s ease',
            pointerEvents: 'none',
            userSelect: 'none',
            lineHeight: 1,
          }}
        >
          Enter
        </span>
      </div>

      {/* 12x12px inner dot */}
      <div
        ref={dotRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          backgroundColor: '#FFFFFF',
          boxShadow: '0 0 6px rgba(255, 255, 255, 0.6)',
          transform: 'translate(-50%, -50%) scale(1)',
          opacity: 1,
          transition:
            'transform 0.15s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.15s ease',
          boxSizing: 'border-box',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
