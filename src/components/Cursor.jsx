import { useEffect, useRef } from 'react';

export default function Cursor() {
  const containerRef = useRef(null);
  const ringRef = useRef(null);
  const dotRef = useRef(null);
  const posRef = useRef({ x: -100, y: -100 });
  const targetRef = useRef({ x: -100, y: -100 });
  const isHoverRef = useRef(false);
  const visibleRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    const ring = ringRef.current;
    const dot = dotRef.current;
    if (!container || !ring || !dot) return;

    let rafId = 0;

    const onPointerMove = (e) => {
      targetRef.current.x = e.clientX;
      targetRef.current.y = e.clientY;
      if (!visibleRef.current) {
        visibleRef.current = true;
        posRef.current.x = e.clientX;
        posRef.current.y = e.clientY;
        container.style.opacity = '1';
      }

      // Check if hovering over buttons, links, or debris
      const target = e.target;
      const isClickable = !!(
        target &&
        typeof target.closest === 'function' &&
        target.closest('button, a, [role="button"]')
      );
      const isDebris = typeof window !== 'undefined' && Boolean(window.__dd_debrisHover);
      const shouldScale = isClickable || isDebris;

      if (shouldScale !== isHoverRef.current) {
        isHoverRef.current = shouldScale;
        if (shouldScale) {
          ring.style.transform = 'translate(-50%, -50%) scale(1.16)';
          ring.style.borderColor = 'var(--sky)';
          ring.style.boxShadow = '0 0 16px rgba(56, 189, 248, 0.45)';
          dot.style.opacity = '1';
          dot.style.transform = 'translate(-50%, -50%) scale(1)';
        } else {
          ring.style.transform = 'translate(-50%, -50%) scale(1)';
          ring.style.borderColor = 'rgba(255, 255, 255, 0.9)';
          ring.style.boxShadow = '0 0 12px rgba(255, 255, 255, 0.2)';
          dot.style.opacity = '0';
          dot.style.transform = 'translate(-50%, -50%) scale(0)';
        }
      }
    };

    const onPointerLeave = () => {
      visibleRef.current = false;
      container.style.opacity = '0';
    };

    const loop = () => {
      if (visibleRef.current) {
        // Continuous check for debris hover state in case debris moved under cursor
        const isDebris = typeof window !== 'undefined' && Boolean(window.__dd_debrisHover);
        if (isDebris && !isHoverRef.current) {
          isHoverRef.current = true;
          ring.style.transform = 'translate(-50%, -50%) scale(1.16)';
          ring.style.borderColor = 'var(--sky)';
          ring.style.boxShadow = '0 0 16px rgba(56, 189, 248, 0.45)';
          dot.style.opacity = '1';
          dot.style.transform = 'translate(-50%, -50%) scale(1)';
        } else if (!isDebris && isHoverRef.current) {
          // Verify if still over button
          const el = document.elementFromPoint(targetRef.current.x, targetRef.current.y);
          const isButton = !!(el && typeof el.closest === 'function' && el.closest('button, a, [role="button"]'));
          if (!isButton) {
            isHoverRef.current = false;
            ring.style.transform = 'translate(-50%, -50%) scale(1)';
            ring.style.borderColor = 'rgba(255, 255, 255, 0.9)';
            ring.style.boxShadow = '0 0 12px rgba(255, 255, 255, 0.2)';
            dot.style.opacity = '0';
            dot.style.transform = 'translate(-50%, -50%) scale(0)';
          }
        }

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
      {/* 36x36px white ring with blurred backdrop */}
      <div
        ref={ringRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          border: '1.5px solid rgba(255, 255, 255, 0.9)',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          transform: 'translate(-50%, -50%) scale(1)',
          transition:
            'transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1), border-color 0.15s ease, box-shadow 0.15s ease',
          boxSizing: 'border-box',
          boxShadow: '0 0 12px rgba(255, 255, 255, 0.2)',
        }}
      />
      {/* Center dot: appears when hovering over buttons or debris */}
      <div
        ref={dotRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: 'var(--white)',
          boxShadow: '0 0 6px var(--sky)',
          transform: 'translate(-50%, -50%) scale(0)',
          opacity: 0,
          transition: 'transform 0.15s ease, opacity 0.15s ease',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}
