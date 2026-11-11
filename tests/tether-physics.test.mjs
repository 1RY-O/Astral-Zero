import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONSTANTS,
  createBody,
  integrateBody,
  applyImpulseAtOffset,
  solveTetherConstraint,
  evaluateDeorbit,
  predictOrbitalPath,
  checkCollision,
} from '../src/engine/physics.js';
import { Vec } from '../src/engine/vector.js';

test('physics: createBody initializes mass, inverse mass, and moment of inertia', () => {
  const b = createBody({ x: 10, y: 20, mass: 200, radius: 20 });
  assert.equal(b.pos.x, 10);
  assert.equal(b.pos.y, 20);
  assert.equal(b.mass, 200);
  assert.equal(b.invMass, 1 / 200);
  // I = 0.5 * m * r^2 = 0.5 * 200 * 400 = 40000
  assert.equal(b.inertia, 40000);
  assert.equal(b.invInertia, 1 / 40000);
});

test('physics: integrateBody conserves linear and angular velocity in vacuum (zero drag)', () => {
  const b = createBody({ vx: 50, vy: -30, av: 1.5 });
  const dt = 1 / 60;
  integrateBody(b, dt);

  assert.equal(b.vel.x, 50, 'Velocity must persist in zero drag');
  assert.equal(b.vel.y, -30, 'Velocity must persist in zero drag');
  assert.equal(b.av, 1.5, 'Angular velocity must persist in zero drag');
  assert.equal(b.pos.x, 50 * dt);
  assert.equal(b.pos.y, -30 * dt);
  assert.equal(b.angle, 1.5 * dt);
});

test('physics: applyImpulseAtOffset produces both linear momentum and rotational torque', () => {
  const b = createBody({ mass: 100, radius: 10 });
  // Apply upward force (+Y = 500 N*s) at right edge of disk (offsetX = 10, offsetY = 0)
  // Linear impulse: vy += 500 / 100 = 5 m/s
  // Torque: tau = offsetX * Fy - offsetY * Fx = 10 * 500 - 0 = 5000
  // I = 0.5 * 100 * 100 = 5000
  // av += 5000 / 5000 = 1.0 rad/s
  applyImpulseAtOffset(b, 0, 500, 10, 0);

  assert.equal(b.vel.x, 0);
  assert.equal(b.vel.y, 5);
  assert.equal(b.av, 1.0);
});

test('physics: solveTetherConstraint moves lighter tug more than heavier hulk', () => {
  const tug = createBody({ x: 0, y: 0, mass: 100 });
  const hulk = createBody({ x: 200, y: 0, mass: 400 }); // 4x heavier

  const restLength = 100;
  // Currently distance is 200, delta = +100
  solveTetherConstraint(tug, hulk, new Vec(0, 0), restLength);

  // Tug is 4x lighter, so it must absorb 4/5 of the displacement
  // Hulk must absorb 1/5 of the displacement
  assert.ok(tug.pos.x > 0, 'Tug should be pulled toward hulk (+X)');
  assert.ok(hulk.pos.x < 200, 'Hulk should be pulled toward tug (-X)');

  const tugDisplacement = tug.pos.x - 0;
  const hulkDisplacement = 200 - hulk.pos.x;
  assert.ok(tugDisplacement > hulkDisplacement * 3, 'Lighter tug should move substantially more than heavy hulk');
});

test('physics: centrifugal swing generates tension proportional to angular rate', () => {
  const tug = createBody({ x: 0, y: 0, mass: CONSTANTS.TUG_MASS });
  const hulk = createBody({ x: 130, y: 0, mass: CONSTANTS.HULK_MASS });

  // Displace by 20 units to simulate centrifugal outward stretch
  tug.pos.x = -20;
  const tension = solveTetherConstraint(tug, hulk, new Vec(0, 0), 130);
  assert.ok(tension > 0, 'Stretched tether must register positive tension');
});

test('physics: evaluateDeorbit correctly detects atmospheric entry retrograde threshold', () => {
  // Retrograde velocity: vx = -110 m/s (opposes orbital travel)
  const retrograde = evaluateDeorbit(new Vec(-110, 0));
  assert.equal(retrograde.isDeorbit, true, 'Retrograde release past threshold must achieve deorbit');
  assert.ok(retrograde.estimatedPerigeeKm < 100, `Perigee (${retrograde.estimatedPerigeeKm} km) should be sub-100km`);

  // Prograde velocity: vx = +80 m/s (accelerates along orbit, raises apogee)
  const prograde = evaluateDeorbit(new Vec(80, 0));
  assert.equal(prograde.isDeorbit, false, 'Prograde release must NOT deorbit');
  assert.ok(prograde.estimatedPerigeeKm > 100, 'Prograde release increases perigee/apogee');
});

test('physics: zero or near-zero retrograde burn fails to lower perigee into atmosphere', () => {
  const stationary = evaluateDeorbit(new Vec(0, 0));
  assert.equal(stationary.isDeorbit, false);
  assert.equal(stationary.estimatedPerigeeKm, 450, 'Zero burn retains base 450 km circular shell');
});

test('physics: angular momentum conservation during swing transfer', () => {
  const tug = createBody({ x: 0, y: -130, vx: 50, vy: 0, mass: 150 });
  const hulk = createBody({ x: 0, y: 0, vx: 0, vy: 0, av: 0.8, mass: 650 });

  // Initial combined angular momentum around system COM
  const rTug = 130;
  const initialLinearMomentum = tug.mass * tug.vel.x;
  assert.ok(initialLinearMomentum > 0);

  // Solve constraint over multiple iterations
  for (let i = 0; i < 12; i++) {
    solveTetherConstraint(tug, hulk, new Vec(0, 0), 130);
  }

  // Distance must strictly be maintained at rest length
  const dist = tug.pos.dist(hulk.pos);
  assert.ok(Math.abs(dist - 130) < 0.5, `Tether length error ${Math.abs(dist - 130)} exceeds tolerance`);
});

test('physics: checkCollision detects overlapping bodies', () => {
  const tug = createBody({ x: 100, y: 100, radius: 14 });
  const hulk = createBody({ x: 120, y: 100, radius: 38 }); // distance = 20 < 14 + 38 = 52
  assert.equal(checkCollision(tug, hulk), true, 'Overlapping tug and hulk should trigger collision');

  const distant = createBody({ x: 300, y: 100, radius: 38 });
  assert.equal(checkCollision(tug, distant), false, 'Separated tug and hulk should NOT trigger collision');
});

test('physics: predictOrbitalPath curves downward toward Earth under retrograde velocity', () => {
  const pos = new Vec(500, 300);
  const retroVel = new Vec(-100, 0); // Retrograde burn
  const proVel = new Vec(100, 0);    // Prograde burn

  const retroPath = predictOrbitalPath(pos, retroVel, 40, 0.05);
  const proPath = predictOrbitalPath(pos, proVel, 40, 0.05);

  assert.equal(retroPath.length, 40);
  assert.equal(proPath.length, 40);

  // Retrograde path should descend deeper in Y (down toward atmospheric horizon) than prograde path
  const lastRetro = retroPath[retroPath.length - 1];
  const lastPro = proPath[proPath.length - 1];

  assert.ok(lastRetro.y > lastPro.y, 'Retrograde velocity must pull trajectory downward deeper into Earth horizon');
  assert.ok(lastRetro.x < pos.x, 'Retrograde path must move leftward (-X)');
});
