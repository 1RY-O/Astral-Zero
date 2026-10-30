/**
 * Debris Derby — Phase 3 Canvas 2D renderer.
 *
 * Colours are read exclusively from design tokens (src/ui/tokens.js).
 * Draws atmospheric kill-zone, player anchor, tether, 90-step dashed trajectory,
 * release velocity vector arrow, and debris particles.
 */

import { PALETTE } from '../ui/tokens.js';

const TAU = Math.PI * 2;

/**
 * Draw a prominent velocity arrow starting at (x, y) in the direction of
 * (vx, vy), scaled by `scale`. Helps the player judge the release
 * trajectory before letting go.
 */
function drawVelocityArrow(ctx, x, y, vx, vy, scale = 0.16, headLen = 9) {
  const speed = Math.hypot(vx, vy);
  if (speed < 1) return;

  const dx = vx / speed;
  const dy = vy / speed;
  const len = Math.min(speed * scale, 120);

  ctx.save();
  ctx.strokeStyle = PALETTE.sky400;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx * len, y + dy * len);
  ctx.stroke();

  // Arrow head
  const ax = x + dx * len;
  const ay = y + dy * len;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax - dx * headLen + dy * (headLen * 0.5), ay - dy * headLen - dx * (headLen * 0.5));
  ctx.lineTo(ax - dx * headLen - dy * (headLen * 0.5), ay - dy * headLen + dx * (headLen * 0.5));
  ctx.closePath();
  ctx.fillStyle = PALETTE.sky400;
  ctx.fill();

  ctx.restore();
}

/**
 * Draw 90-step forward simulation trajectory preview as a dashed line.
 */
function drawTrajectory(ctx, points) {
  if (!points || points.length < 2) return;

  ctx.save();
  ctx.strokeStyle = PALETTE.sky300;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * Draw the planet atmospheric limb kill-zone at the bottom.
 */
function drawPlanetLimb(ctx, world, width, height) {
  const limb = world.getPlanetLimb();

  ctx.save();
  // Fill atmospheric zone
  ctx.beginPath();
  ctx.arc(limb.cx, limb.cy, limb.r, 0, TAU);
  ctx.fillStyle = PALETTE.planetFill;
  ctx.fill();
  ctx.strokeStyle = PALETTE.planetStroke;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Atmospheric haze gradient / label indicator
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ATMOSPHERIC RE-ENTRY KILL-ZONE (ZERO-G VOID ABOVE)', width * 0.5, height - 12);

  ctx.restore();
}

export function drawWorld(ctx, world, width, height) {
  const { anchor, particles, grabbed } = world;

  ctx.save();

  // Background (substrate dark, zero-g void).
  ctx.fillStyle = PALETTE.canvasDark;
  ctx.fillRect(0, 0, width, height);

  // Planet atmospheric limb at the bottom
  drawPlanetLimb(ctx, world, width, height);

  // Trajectory preview (90 steps forward) when object is grabbed
  if (grabbed) {
    const trajectory = world.getTrajectory(90);
    drawTrajectory(ctx, trajectory);
  }

  // Anchor (player cleanup tug).
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, anchor.radius, 0, TAU);
  ctx.fillStyle = PALETTE.player;
  ctx.fill();
  ctx.strokeStyle = PALETTE.white;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Tether: drawn beneath the grabbed body
  if (world.tether && grabbed) {
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(grabbed.x, grabbed.y);
    ctx.strokeStyle = PALETTE.tether;
    ctx.lineWidth = 2 + Math.max(0, world.tension) * 0.04;
    ctx.stroke();

    // Release velocity vector arrow
    const vx = (grabbed.x - grabbed.px) / (1 / 60);
    const vy = (grabbed.y - grabbed.py) / (1 / 60);
    drawVelocityArrow(ctx, grabbed.x, grabbed.y, vx, vy);
  }

  // Debris masses
  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, TAU);
    ctx.fillStyle = p === grabbed ? PALETTE.pressed : p.color;
    ctx.fill();

    // Highlight ring around grabbed body
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
