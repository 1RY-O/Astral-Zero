/**
 * Debris Darling — GameCanvas Component
 * Mounts canvas once in ref, driven by 60Hz rAF physics loop outside React render cycle.
 * Renders zero-g orbital tether physics with damaged CRT aesthetic.
 * Built for the NASA International Space Apps Challenge 2026.
 */

import React, { useRef, useEffect } from 'react';
import { FIXED_DT, MAX_SUBSTEPS } from '../hooks/useOrbitalPhysics.js';
import '../styles/glitch.css';

const TAU = Math.PI * 2;

function drawPlanetLimb(ctx, world, width, height) {
  const limb = world.getPlanetLimb();

  ctx.save();
  ctx.beginPath();
  ctx.arc(limb.cx, limb.cy, limb.r, 0, TAU);
  ctx.fillStyle = '#061120';
  ctx.fill();
  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Glow line
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
  ctx.lineWidth = 8;
  ctx.stroke();

  ctx.fillStyle = '#7DD3FC';
  ctx.font = '600 11px ui-monospace, SFMono-Regular, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('▼ ATMOSPHERIC RE-ENTRY KILL-ZONE (ZERO-G VOID ABOVE) ▼', width * 0.5, height - 16);

  ctx.restore();
}

function drawVelocityArrow(ctx, x, y, vx, vy) {
  const speed = Math.hypot(vx, vy);
  if (speed < 1) return;

  const dx = vx / speed;
  const dy = vy / speed;
  const len = Math.min(speed * 0.2, 110);

  ctx.save();
  ctx.strokeStyle = '#FF2D95';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx * len, y + dy * len);
  ctx.stroke();

  // Arrowhead
  const headLen = 8;
  const ax = x + dx * len;
  const ay = y + dy * len;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax - dx * headLen + dy * (headLen * 0.5), ay - dy * headLen - dx * (headLen * 0.5));
  ctx.lineTo(ax - dx * headLen - dy * (headLen * 0.5), ay - dy * headLen + dx * (headLen * 0.5));
  ctx.closePath();
  ctx.fillStyle = '#FF2D95';
  ctx.fill();

  ctx.restore();
}

export default function GameCanvas({
  worldRef,
  initWorld,
  syncState,
  isAberrationActive = false,
  isShakeActive = false,
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const accRef = useRef(0);
  const activeRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    const world = initWorld(rect.width, rect.height);

    function resize() {
      if (!canvas || !world) return;
      const r = canvas.getBoundingClientRect();
      const devPr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(r.width * devPr));
      canvas.height = Math.max(1, Math.floor(r.height * devPr));
      world.setSize(r.width, r.height);
    }

    window.addEventListener('resize', resize);

    activeRef.current = true;
    let last = performance.now();
    let syncCounter = 0;

    function render(ctx, width, height) {
      ctx.save();

      // Screen shake translation
      if (world.shakeX || world.shakeY) {
        ctx.translate(world.shakeX, world.shakeY);
      }

      // Background
      ctx.fillStyle = '#061120';
      ctx.fillRect(0, 0, width, height);

      // Deep space grid
      ctx.save();
      ctx.strokeStyle = 'rgba(109, 74, 255, 0.08)';
      ctx.lineWidth = 1;
      const step = 64;
      for (let x = 0; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.restore();

      // Atmospheric kill-zone
      drawPlanetLimb(ctx, world, width, height);

      // Tether
      if (world.tether && world.anchor && world.grabbed) {
        const a = world.anchor;
        const b = world.grabbed;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = world.tension > 2 ? '#FF2D95' : '#38BDF8';
        ctx.lineWidth = world.tension > 2 ? 3 : 2;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.restore();
      }

      // Particles (Debris)
      for (const p of world.particles) {
        if (p.fixed) continue;
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, TAU);
        ctx.fillStyle = p.color || '#FFFFFF';
        ctx.fill();

        if (world.grabbed === p) {
          ctx.strokeStyle = '#FF2D95';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Draw velocity vector
          const vx = (p.x - p.px) / FIXED_DT;
          const vy = (p.y - p.py) / FIXED_DT;
          drawVelocityArrow(ctx, p.x, p.y, vx, vy);
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();
      }

      // Anchor (Tug ship)
      if (world.anchor) {
        const a = world.anchor;
        ctx.save();
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.radius, 0, TAU);
        ctx.fillStyle = '#38BDF8';
        ctx.shadowColor = '#38BDF8';
        ctx.shadowBlur = 10;
        ctx.fill();

        // Ship hull ring
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }

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

      // Sync React state at ~15Hz
      syncCounter += 1;
      if (syncCounter % 4 === 0) {
        syncState();
      }

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(dpr, dpr);
        render(ctx, rect.width, rect.height);
        ctx.restore();
      }
    }

    rafRef.current = requestAnimationFrame(loop);

    // Pointer handlers
    function onPointerDown(e) {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      world.grabNearest(x, y);
    }

    function onPointerUp() {
      world.release();
    }

    // Keyboard handlers
    function onKeyDown(e) {
      if (e.code === 'Space') {
        world.setThrusting(true);
      } else if (e.code === 'KeyE') {
        if (world.anchor) {
          world.grabNearest(world.anchor.x, world.anchor.y + 120);
        }
      } else if (e.code === 'KeyQ') {
        world.release();
      } else if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
        world.setThrusting(true, { x: -1, y: 0 });
      } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
        world.setThrusting(true, { x: 1, y: 0 });
      }
    }

    function onKeyUp(e) {
      if (
        e.code === 'Space' ||
        e.code === 'KeyA' ||
        e.code === 'KeyD' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight'
      ) {
        world.setThrusting(false);
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      activeRef.current = false;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [initWorld, syncState]);

  return (
    <div
      className={`crt-overlay ${isAberrationActive ? 'glitch-aberration' : ''} ${
        isShakeActive ? 'violent-shake' : ''
      }`}
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#061120',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          touchAction: 'none',
        }}
      />
    </div>
  );
}
