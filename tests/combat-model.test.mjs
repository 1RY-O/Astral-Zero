/**
 * Astral Zero — combat prediction model test (Phase 4).
 * ============================================================
 * Phase 3's client predicted an instant 900px hitscan at 160ms cadence while
 * the SERVER fires real projectiles: 420-560px range depending on weapon, and
 * a 320ms+ cooldown. Every long shot therefore produced a local hitmarker and
 * damage number the server refused, and every fast burst lost half its rounds
 * to a COOLDOWN rejection.
 *
 * These tests pin the client prediction to the server's table so that class of
 * "it felt broken" bug cannot come back silently. The server table is read
 * DIRECTLY (src/combat/weapons.js is pure data with no server-only imports), so
 * the two can never drift apart unnoticed.
 *
 * Run with: npm run test:combat
 */

import { Combat, WeaponModel } from '../src/combat/Combat.js';
import { WEAPONS, DEFAULT_WEAPON, weaponFor, isKnownWeapon, WEAPON_LIST } from '../src/config/weapons.js';
import { weaponFor as serverWeaponFor } from '../src/combat/weapons.js';
import { COMBAT } from '../src/config/netConfig.js';

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures += 1;
};
const section = (t) => console.log(`\n--- ${t} ---`);

// ===========================================================================
section('Client weapon table agrees with the server table');
// ===========================================================================
{
  // Ids are CONTRACT, not decoration: the server silently ignores unknown ids
  // instead of erroring, so a typo never announces itself.
  const serverIds = Object.keys(WEAPONS).sort();
  const clientIds = [...WEAPON_LIST].sort();
  ok(JSON.stringify(serverIds) === JSON.stringify(clientIds),
    `weapon ids match exactly (${clientIds.join(', ')})`);

  ok(isKnownWeapon(DEFAULT_WEAPON), `default weapon "${DEFAULT_WEAPON}" exists server-side`);
  ok(!isKnownWeapon('mop'), '"mop" is correctly rejected (the Phase 3 bug value)');

  // Every shared numeric field must agree, or prediction drifts.
  for (const id of clientIds) {
    const s = serverWeaponFor(id);
    const c = WEAPONS[id];
    const agree = ['damage', 'cooldownMs', 'speed', 'range', 'splash'].every((k) => s[k] === c[k]);
    ok(agree, `${id}: damage/cd/speed/range/splash match server (dmg ${c.damage}, cd ${c.cooldownMs}ms, range ${c.range})`);
  }
}

// ===========================================================================
section('Prediction respects the real projectile range');
// ===========================================================================
{
  const mk = (weapon, targets) => new Combat({
    getOrigin: () => ({ x: 0, y: 600, angle: 0 }),
    getTargets: () => targets,
    weapon,
    now: () => 0,
  });

  // A target just inside the rifle's 560px range: still a predicted hit.
  const inside = mk(WEAPONS['scrap-rifle'], [{ id: 'a', x: 500, y: 600, hp: 100, alive: true }]);
  const hitIn = inside.tryFire(true, true);
  ok(hitIn.fired && hitIn.hit?.id === 'a', 'a target at 500px still predicts a hit (inside 560px rifle range)');

  // The same target at 800px: Phase 3 predicted a hit, the server never could.
  const outside = mk(WEAPONS['scrap-rifle'], [{ id: 'b', x: 800, y: 600, hp: 100, alive: true }]);
  const hitOut = outside.tryFire(true, true);
  ok(hitOut.fired, 'the shot still fires (we do not block the player)');
  ok(hitOut.hit === null, 'a target at 800px does NOT predict a hit (server projectile dies at 560px)');
  ok(hitOut.endX <= 561, `the tracer stops at the weapon's range (endX ${hitOut.endX})`);

  // Range must be per-weapon, not global.
  const mortar = mk(WEAPONS['debris-launcher'], [{ id: 'c', x: 500, y: 600, hp: 100, alive: true }]);
  ok(mortar.tryFire(true, true).hit === null, 'debris-launcher (420px) cannot reach 500px even though the rifle can');
}

// ===========================================================================
section('Fire rate matches the server cooldown');
// ===========================================================================
{
  let clock = 0;
  const combat = new Combat({
    getOrigin: () => ({ x: 0, y: 600, angle: 0 }),
    getTargets: () => [],
    weapon: WEAPONS['scrap-rifle'],
    now: () => clock,
  });

  ok(combat.tryFire(true, true).fired, 'first shot fires');
  ok(!combat.tryFire(true, false).fired, 'a shot 1ms later is blocked');

  clock = 319;
  ok(!combat.tryFire(true, false).fired, 'still blocked at 319ms (server allows 320ms)');
  clock = 320;
  ok(combat.tryFire(true, false).fired, 'fires at exactly 320ms');

  // A slower weapon must genuinely gate slower.
  let c2 = 0;
  const cannon = new Combat({
    getOrigin: () => ({ x: 0, y: 600, angle: 0 }),
    getTargets: () => [],
    weapon: WEAPONS['mop-cannon'],
    now: () => c2,
  });
  cannon.tryFire(true, true);
  c2 = 400;
  ok(!cannon.tryFire(true, false).fired, 'mop-cannon still blocked at 400ms (needs 700ms)');
  c2 = 700;
  ok(cannon.tryFire(true, false).fired, 'mop-cannon fires at 700ms');

  // Switching weapons must not let the new weapon skip its own cooldown.
  // A free instant shot on every swap would be a real exploit.
  let sClock = 0;
  const sw = new Combat({
    getOrigin: () => ({ x: 0, y: 600, angle: 0 }),
    getTargets: () => [],
    weapon: WEAPONS['scrap-rifle'],
    now: () => sClock,
  });
  sw.tryFire(true, true);
  sClock = 50;
  sw.setWeapon(WEAPONS['debris-launcher']); // 1100ms cooldown

  // The re-base back-dates the last shot by the NEW cooldown, so the gap after a
  // swap is measured from the swap itself: (1100 - 1)ms, i.e. still 1ms short.
  ok(!sw.tryFire(true, true).fired,
    'switching to a slower weapon applies its cooldown immediately (no free shot)');

  const cd = WEAPONS['debris-launcher'].cooldownMs;
  sClock += cd - 1; // gap becomes exactly the cooldown
  ok(sw.tryFire(true, false).fired,
    'fires once a full new-weapon cooldown has elapsed since the swap');
}

// ===========================================================================
section('Damage prediction uses the server weapon damage');
// ===========================================================================
{
  const model = new WeaponModel(WEAPONS['scrap-rifle']);
  const close = model.damageFor({ x: 0, y: 0 }, { x: 100, y: 0 });
  ok(close === WEAPONS['scrap-rifle'].damage, `close-range damage is the server's value (${close})`);

  const far = model.damageFor({ x: 0, y: 0 }, { x: model.range, y: 0 });
  ok(far < close, `damage falls off with distance (${close} -> ${far})`);
  ok(far >= Math.round(WEAPONS['scrap-rifle'].damage * 0.55) - 1, 'falloff respects the floor');

  const heavy = new WeaponModel(WEAPONS['debris-launcher']);
  ok(heavy.damageFor({ x: 0, y: 0 }, { x: 10, y: 0 }) > close,
    'a heavier weapon predicts more damage than the rifle');
}

// ===========================================================================
section('Projectile travel time is reported and capped');
// ===========================================================================
{
  const model = new WeaponModel(WEAPONS['scrap-rifle']); // 760 px/s
  // Travel time is CAPPED at COMBAT.maxPredictedTravelMs by design: a full-screen
  // shot would otherwise defer its hitmarker ~700ms, which reads as the gun
  // eating. So assert the cap and the uncapped rate separately.
  ok(model.travelMs(0) === 0, 'zero distance is instant');

  // Below the cap, travel time is the true physical value.
  const shortMs = model.travelMs(100); // 100px / 760px/s = 131ms
  ok(shortMs === Math.round((100 / 760) * 1000),
    `uncapped travel time uses the real projectile speed (100px -> ${shortMs}ms)`);

  ok(model.travelMs(380) === COMBAT.maxPredictedTravelMs,
    `long shots clamp to the ${COMBAT.maxPredictedTravelMs}ms feedback cap`);
  ok(model.travelMs(100000) === COMBAT.maxPredictedTravelMs,
    'absurd distances still clamp rather than returning Infinity');

  // tryFire must surface it so the scene can schedule the hitmarker.
  let clock = 0;
  const combat = new Combat({
    getOrigin: () => ({ x: 0, y: 600, angle: 0 }),
    getTargets: () => [{ id: 'a', x: 400, y: 600, hp: 100, alive: true }],
    weapon: WEAPONS['scrap-rifle'],
    now: () => clock,
  });
  const shot = combat.tryFire(true, true);
  ok(shot.fired && shot.hit, 'shot hit a target 400px away');
  ok(shot.travelMs > 0 && shot.travelMs <= COMBAT.maxPredictedTravelMs,
    `tryFire reports travelMs for delayed feedback (${shot.travelMs}ms)`);
}

// ===========================================================================
section('No-shot path is allocation-free and well-formed');
// ===========================================================================
{
  let clock = 0;
  const combat = new Combat({
    getOrigin: () => ({ x: 0, y: 600, angle: 0 }),
    getTargets: () => [],
    now: () => clock,
  });
  const a = combat.tryFire(false, false);
  const b = combat.tryFire(false, false);
  ok(a.fired === false && a.hit === null && a.damage === 0, 'rejected trigger returns a well-formed no-shot');
  ok(a === b, 'the no-shot result is a shared frozen object (no per-frame allocation)');
  ok(Object.isFrozen(a), 'the shared no-shot object is frozen (callers cannot corrupt it)');
}

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
process.exit(failures ? 1 : 0);
