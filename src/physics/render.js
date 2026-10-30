/**
 * Debris Derby — Phase 3 Canvas 2D renderer.
 *
 * Renders the zero-g physics sandbox:
 * - Fixed anchor (player cleanup tug)
 * - Tether (taut line to grabbed payload)
 * - 7 zero-g floating debris objects
 * - Velocity vector on grabbed payload
 * - Atmospheric re-entry limb at bottom
 * - NO mouse trail / cursor follower
 * - NO top HUD bar (handled by plain-DOM debug overlay)
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

function drawPlanetLimb(ctx, world, width, height) {
  const limb = world.getPlanetLimb();

  ctx.save();
  ctx.beginPath();
  ctx.arc(limb.cx, limb.cy, limb.r, 0, TAU);
  ctx.fillStyle = PALETTE.planetFill;
  ctx.fill();
  ctx.strokeStyle = PALETTE.sky400;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = PALETTE.sky300;
  ctx.font = '600 11px ui-monospace, SFMono-Regular, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('▼ ATMOSPHERIC RE-ENTRY KILL-ZONE (ZERO-G VOID ABOVE) ▼', width * 0.5, height - 16);

  ctx.restore();
}

export function drawWorld(ctx, world, width, height) {
  const { anchor, particles, grabbed } = world;

  ctx.save();

  // Dark substrate background (#060D1F)
  ctx.fillStyle = PALETTE.canvasDark;
  ctx.fillRect(0, 0, width, height);

  // Subtle zero-g space grid for visual depth in deep space
  ctx.save();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)';
  ctx.lineWidth = 1;
  const step = 80;
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

  // Planet atmospheric limb at bottom
  drawPlanetLimb(ctx, world, width, height);

  // Tether reach indicator (subtle dashed circle showing TETHER_MAX = 300px)
  if (anchor) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, 300, 0, TAU);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Anchor (player cleanup tug)
  if (anchor) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, anchor.radius, 0, TAU);
    ctx.fillStyle = PALETTE.sky400;
    ctx.fill();
    ctx.strokeStyle = PALETTE.white;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner anchor core
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, 3, 0, TAU);
    ctx.fillStyle = PALETTE.canvasDark;
    ctx.fill();

    // Tug label
    ctx.fillStyle = PALETTE.sky300;
    ctx.font = '700 10px ui-monospace, SFMono-Regular, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CLEANUP TUG', anchor.x, anchor.y - 14);
    ctx.restore();
  }

  // Tether: drawn between anchor and grabbed body ONLY
  if (world.tether && grabbed && anchor) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(grabbed.x, grabbed.y);
    ctx.strokeStyle = world.tension > 20 ? PALETTE.pink500 : PALETTE.sky400;
    ctx.lineWidth = 2.5 + Math.min(10, Math.max(0, world.tension) * 0.05);
    ctx.stroke();
    ctx.restore();

    // Velocity vector arrow on grabbed object
    const vx = (grabbed.x - grabbed.px) / (1 / 60);
    const vy = (grabbed.y - grabbed.py) / (1 / 60);
    drawVelocityArrow(ctx, grabbed.x, grabbed.y, vx, vy);
  }

  // Floating zero-g debris masses
  for (const p of particles) {
    ctx.save();
    const isGrabbed = p === grabbed;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, TAU);
    ctx.fillStyle = isGrabbed ? PALETTE.pink500 : PALETTE.white;
    ctx.fill();
    ctx.strokeStyle = isGrabbed ? PALETTE.sky400 : PALETTE.sky300;
    ctx.lineWidth = isGrabbed ? 2.5 : 1.5;
    ctx.stroke();

    // Highlight ring when grabbed
    if (isGrabbed) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 6, 0, TAU);
      ctx.strokeStyle = PALETTE.pink500;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Mass indicator
    ctx.fillStyle = isGrabbed ? PALETTE.pink500 : PALETTE.sky300;
    ctx.font = '9px ui-monospace, SFMono-Regular, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${p.mass.toFixed(0)}kg`, p.x, p.y + p.radius + 12);

    ctx.restore();
  }

  ctx.restore();
}
