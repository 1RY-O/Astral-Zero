/**
 * Debris Derby — Phase 3 Canvas 2D renderer.
 *
 * Colours are read exclusively from the design tokens
 * (src/ui/tokens.js). No raw colour literals live here.
 */

import { PALETTE } from '../ui/tokens.js';

const TAU = Math.PI * 2;

export function drawWorld(ctx, world, width, height) {
  const { anchor, planet, particles, grabbed } = world;

  ctx.save();

  // Background (substrate dark).
  ctx.fillStyle = PALETTE.canvasDark;
  ctx.fillRect(0, 0, width, height);

  // Planet limb.
  ctx.beginPath();
  ctx.arc(planet.x, planet.y, planet.radius, 0, TAU);
  ctx.fillStyle = PALETTE.planetFill;
  ctx.fill();
  ctx.strokeStyle = PALETTE.planetStroke;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Tether: drawn beneath the grabbed body.
  if (world.tether && grabbed) {
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(grabbed.x, grabbed.y);
    ctx.strokeStyle = PALETTE.tether;
    ctx.lineWidth = 2 + Math.max(0, world.tension) * 0.04;
    ctx.stroke();
  }

  // Anchor (player tug).
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, anchor.radius, 0, TAU);
  ctx.fillStyle = PALETTE.player;
  ctx.fill();
  ctx.strokeStyle = PALETTE.white;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Debris masses.
  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, TAU);
    ctx.fillStyle = p === grabbed ? PALETTE.pressed : p.color;
    ctx.fill();
  }

  ctx.restore();
}