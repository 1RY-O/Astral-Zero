/**
 * Debris Derby — Phase 4 Canvas 2D renderer.
 *
 * Renders the zero-g physics world, atmospheric kill-zone, screen shake,
 * 90-step trajectory preview, velocity vectors, floating score feedback,
 * and HUD (Score, Multiplier, Fuel).
 *
 * Colours read exclusively from design tokens (src/ui/tokens.js).
 */

import { PALETTE } from '../ui/tokens.js';

const TAU = Math.PI * 2;

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

function drawPlanetLimb(ctx, world, width, height) {
  const limb = world.getPlanetLimb();

  ctx.save();
  ctx.beginPath();
  ctx.arc(limb.cx, limb.cy, limb.r, 0, TAU);
  ctx.fillStyle = PALETTE.planetFill;
  ctx.fill();
  ctx.strokeStyle = PALETTE.planetStroke;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = PALETTE.muted;
  ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ATMOSPHERIC RE-ENTRY KILL-ZONE (ZERO-G VOID ABOVE)', width * 0.5, height - 12);

  ctx.restore();
}

function drawHUD(ctx, world, width) {
  ctx.save();
  ctx.font = '600 14px "Space Grotesk", sans-serif';

  // Score
  ctx.fillStyle = PALETTE.white;
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE: ${world.score.toLocaleString()}`, 24, 34);

  // Multiplier / Chain
  const mult = (world.chain * (world.chain + 1)) / 2;
  if (mult > 1) {
    ctx.fillStyle = PALETTE.pink500;
    ctx.fillText(`CASCADE: ${world.chain}x (x${mult} MULTIPLIER)`, 24, 56);
  }

  // Fuel Bar
  const barWidth = 140;
  const barHeight = 8;
  const barX = width - barWidth - 24;
  const barY = 24;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.fillRect(barX, barY, barWidth, barHeight);

  const fuelPct = Math.max(0, Math.min(1, world.fuel));
  ctx.fillStyle = fuelPct > 0.25 ? PALETTE.sky400 : PALETTE.pink500;
  ctx.fillRect(barX, barY, barWidth * fuelPct, barHeight);

  ctx.strokeStyle = PALETTE.white;
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barWidth, barHeight);

  ctx.fillStyle = PALETTE.white;
  ctx.textAlign = 'right';
  ctx.font = '11px ui-monospace, SFMono-Regular, monospace';
  ctx.fillText(`FUEL: ${(fuelPct * 100).toFixed(0)}%`, width - 24, 48);

  // Level Clear or Failed Banner
  if (world.state === 'cleared') {
    ctx.textAlign = 'center';
    ctx.font = '700 24px "Space Grotesk", sans-serif';
    ctx.fillStyle = PALETTE.sky400;
    ctx.fillText('MISSION COMPLETE — ORBIT SECURED', width * 0.5, 90);
  } else if (world.state === 'failed') {
    ctx.textAlign = 'center';
    ctx.font = '700 24px "Space Grotesk", sans-serif';
    ctx.fillStyle = PALETTE.pink500;
    ctx.fillText('FUEL EXHAUSTED — MISSION FAILED', width * 0.5, 90);
  }

  ctx.restore();
}

function drawFloatingTexts(ctx, world) {
  ctx.save();
  ctx.font = '700 13px "Space Grotesk", sans-serif';
  ctx.textAlign = 'center';

  for (const ft of world.floatingTexts) {
    const alpha = Math.max(0, ft.life / ft.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
  }
  ctx.restore();
}

export function drawWorld(ctx, world, width, height) {
  const { anchor, particles, grabbed } = world;

  ctx.save();

  // Background
  ctx.fillStyle = PALETTE.canvasDark;
  ctx.fillRect(0, 0, width, height);

  // Apply screen shake
  if (world.shakeX !== 0 || world.shakeY !== 0) {
    ctx.translate(world.shakeX, world.shakeY);
  }

  // Planet atmospheric limb at bottom
  drawPlanetLimb(ctx, world, width, height);

  // Trajectory preview
  if (grabbed) {
    const trajectory = world.getTrajectory(90);
    drawTrajectory(ctx, trajectory);
  }

  // Anchor (player cleanup tug)
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, anchor.radius, 0, TAU);
  ctx.fillStyle = PALETTE.player;
  ctx.fill();
  ctx.strokeStyle = PALETTE.white;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Tether
  if (world.tether && grabbed) {
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(grabbed.x, grabbed.y);
    ctx.strokeStyle = PALETTE.tether;
    ctx.lineWidth = 2 + Math.max(0, world.tension) * 0.04;
    ctx.stroke();

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

    if (p === grabbed) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 4, 0, TAU);
      ctx.strokeStyle = PALETTE.pressed;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Floating score popups
  drawFloatingTexts(ctx, world);

  // Restore screen shake transform before drawing static HUD
  ctx.restore();

  // HUD
  drawHUD(ctx, world, width);
}
