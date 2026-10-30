/**
 * Debris Derby — Phase 3 Canvas 2D renderer.
 *
 * Colours are read exclusively from the design tokens
 * (src/ui/tokens.js). No raw colour literals live here.
 */

import { PALETTE } from '../ui/tokens.js';

const TAU = Math.PI * 2;

/**
 * Draw a small velocity arrow starting at (x, y) in the direction of
 * (vx, vy), scaled by `scale`. Helps the player judge the release
 * trajectory before letting go.
 */
function drawVelocityArrow(ctx, x, y, vx, vy, scale = 0.12, headLen = 8) {
  const speed = Math.hypot(vx, vy);
  if (speed < 1) return;

  const dx = vx / speed;
  const dy = vy / speed;
  const len = speed * scale;

  ctx.save();
  ctx.strokeStyle = PALETTE.white;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx * len, y + dy * len);

  // Arrow head.
  const ax = x + dx * len;
  const ay = y + dy * len;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax - dx * headLen + dy * (headLen * 0.5), ay - dy * headLen - dx * (headLen * 0.5));
  ctx.lineTo(ax - dx * headLen - dy * (headLen * 0.5), ay - dy * headLen + dx * (headLen * 0.5));
  ctx.closePath();
  ctx.fillStyle = PALETTE.white;
  ctx.fill();

  ctx.restore();
}

export function drawWorld(ctx, world, width, height) {
  const { anchor, particles, grabbed } = world;

  ctx.save();

  // Background (substrate dark, zero-g void).
  ctx.fillStyle = PALETTE.canvasDark;
  ctx.fillRect(0, 0, width, height);

  // Anchor (player tug).
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, anchor.radius, 0, TAU);
  ctx.fillStyle = PALETTE.player;
  ctx.fill();
  ctx.strokeStyle = PALETTE.white;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Tether: drawn beneath the grabbed body.
  if (world.tether && grabbed) {
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(grabbed.x, grabbed.y);
    ctx.strokeStyle = PALETTE.tether;
    ctx.lineWidth = 2 + Math.max(0, world.tension) * 0.04;
    ctx.stroke();

    // Velocity vector: shows the release trajectory.
    // Implicit Verlet velocity = current - previous position.
    const vx = grabbed.x - grabbed.px;
    const vy = grabbed.y - grabbed.py;
    drawVelocityArrow(ctx, grabbed.x, grabbed.y, vx, vy);
  }

  // Debris masses.
  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, TAU);
    ctx.fillStyle = p === grabbed ? PALETTE.pressed : p.color;
    ctx.fill();

    // Highlight ring around the grabbed body so the player can see
    // exactly what is tethered.
    if (p === grabbed) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 4, 0, TAU);
      ctx.strokeStyle = PALETTE.pressed;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  ctx.restore();
}