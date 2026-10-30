import { useEffect, useRef } from 'react';

export default function Cursor() {
  const containerRef = useRef(null);
  const ringRef = useRef(null);
  const posRef = useRef({ x: -100, y: -100 });
  const targetRef = useRef({ x: -100, y: -100 });
  const isHoverRef = useRef(false);
  const visibleRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    const ring = ringRef.current;
    if (!container || !ring) return;

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

      // Check if hovering over a clickable button or anchor
      const target = e.target;
      const isClickable = !!(
        target &&
        typeof target.closest === 'function' &&
        target.closest('button, a, [role="button"]')
      );

      if (isClickable !== isHoverRef.current) {
        isHoverRef.current = isClickable;
        if (isClickable) {
          ring.style.transform = 'translate(-50%, -50%) scale(1.16)';
          ring.style.borderColor = 'var(--sky)';
        } else {
          ring.style.transform = 'translate(-50%, -50%) scale(1)';
          ring.style.borderColor = 'var(--white)';
        }
      }
    };

    const onPointerLeave = () => {
      visibleRef.current = false;
      container.style.opacity = '0';
    };

    const loop = () => {
      if (visibleRef.current) {
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
      {/* 36x36px ring */}
      <div
        ref={ringRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          border: '1px solid var(--white)',
          backgroundColor: 'transparent',
          transform: 'translate(-50%, -50%) scale(1)',
          transition: 'transform 0.15s ease-out, border-color 0.15s ease-out',
          boxSizing: 'border-box',
        }}
      />
      {/* 12x12px dot in the center */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          backgroundColor: 'var(--white)',
          transform: 'translate(-50%, -50%)',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}
