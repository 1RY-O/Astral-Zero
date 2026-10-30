import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHAIN_WINDOW_MS,
  LEVELS,
  RUN_SUBMIT_ERRORS,
  scoreRun,
  validateRunSubmit,
} from '../src/game/runValidation.js';

function makeRun(overrides = {}) {
  return {
    levelId: 1,
    callsign: 'TEST PILOT',
    seed: 12345,
    durationMs: 10_000,
    fuelUsed: 10,
    lingers: 0,
    deorbits: [
      { objectId: '25544', massKg: 10, releaseDot: -1, atMs: 0 },
    ],
    clientScore: 580,
    ...overrides,
  };
}

function scored(run) {
  const validated = validateRunSubmit(run);
  assert.equal(validated.ok, true, validated.message);
  return scoreRun(validated.value);
}

test('eight locked levels in order', () => {
  assert.equal(LEVELS.length, 8);
  assert.deepEqual(
    LEVELS.map((level) => level.name),
    [
      'First Contact',
      'Two-Body Problem',
      'Clean Sweep',
      'Ricochet',
      'Dominoes',
      'Fragile Cargo',
      'Moving Targets',
      'Kessler Event',
    ],
  );
});

test('score: one retrograde deorbit uses the locked formulas', () => {
  // 50 * clamp(10/10) = 50; chain 1 => x1; +80; fuel 90/100 => +450.
  const { score, breakdown } = scored(makeRun());
  assert.equal(score, 580);
  assert.equal(breakdown.objectScore, 50);
  assert.equal(breakdown.deorbitBonus, 80);
  assert.equal(breakdown.fuelBonus, 450);
  assert.deepEqual(breakdown.chainLengths, [1]);
});

test('chain window is 900 ms inclusive', () => {
  const within = scored(
    makeRun({
      fuelUsed: 20,
      deorbits: [
        { objectId: 'a', massKg: 10, releaseDot: -1, atMs: 0 },
        {
          objectId: 'b',
          massKg: 10,
          releaseDot: -1,
          atMs: CHAIN_WINDOW_MS,
        },
      ],
    }),
  );
  assert.deepEqual(within.breakdown.chainLengths, [1, 2]);
  // 50*1 + 50*3 + 160 + 400 = 760
  assert.equal(within.score, 760);

  const outside = scored(
    makeRun({
      fuelUsed: 20,
      deorbits: [
        { objectId: 'a', massKg: 10, releaseDot: -1, atMs: 0 },
        {
          objectId: 'b',
          massKg: 10,
          releaseDot: -1,
          atMs: CHAIN_WINDOW_MS + 1,
        },
      ],
    }),
  );
  assert.deepEqual(outside.breakdown.chainLengths, [1, 1]);
  // 50 + 50 + 160 + 400 = 660
  assert.equal(outside.score, 660);
});

test('prograde release earns no deorbit bonus', () => {
  const { score, breakdown } = scored(
    makeRun({
      deorbits: [
        { objectId: '25544', massKg: 10, releaseDot: 1, atMs: 0 },
      ],
    }),
  );
  assert.equal(breakdown.deorbitBonus, 0);
  assert.equal(score, 500);
});

test('linger penalty is 150 per lingering object', () => {
  const { score, breakdown } = scored(makeRun({ lingers: 1 }));
  assert.equal(breakdown.lingerPenalty, -150);
  assert.equal(score, 430);
});

test('mass clamping: light and heavy objects', () => {
  const light = scored(
    makeRun({
      deorbits: [
        { objectId: 'a', massKg: 1, releaseDot: -1, atMs: 0 },
      ],
    }),
  );
  // 50 * 0.5 = 25
  assert.equal(light.breakdown.objectScore, 25);

  const heavy = scored(
    makeRun({
      deorbits: [
        { objectId: 'a', massKg: 100, releaseDot: -1, atMs: 0 },
      ],
    }),
  );
  // 50 * 4 = 200
  assert.equal(heavy.breakdown.objectScore, 200);
});

test('callsign defaults to Anonymous', () => {
  const validated = validateRunSubmit(makeRun({ callsign: undefined }));
  assert.equal(validated.ok, true);
  assert.equal(validated.value.callsign, 'Anonymous');
});

test('invalid payloads are rejected with the documented codes', () => {
  const cases = [
    [null, RUN_SUBMIT_ERRORS.BAD_PAYLOAD],
    [makeRun({ levelId: 0 }), RUN_SUBMIT_ERRORS.BAD_LEVEL],
    [makeRun({ levelId: 9 }), RUN_SUBMIT_ERRORS.BAD_LEVEL],
    [makeRun({ levelId: '1' }), RUN_SUBMIT_ERRORS.BAD_LEVEL],
    [makeRun({ seed: -1 }), RUN_SUBMIT_ERRORS.BAD_SEED],
    [makeRun({ seed: 1.5 }), RUN_SUBMIT_ERRORS.BAD_SEED],
    [makeRun({ seed: 0x1_0000_0000 }), RUN_SUBMIT_ERRORS.BAD_SEED],
    [makeRun({ fuelUsed: 101 }), RUN_SUBMIT_ERRORS.BAD_PAYLOAD],
    [makeRun({ fuelUsed: Number.NaN }), RUN_SUBMIT_ERRORS.BAD_PAYLOAD],
    [makeRun({ durationMs: -1 }), RUN_SUBMIT_ERRORS.BAD_PAYLOAD],
    [makeRun({ lingers: -1 }), RUN_SUBMIT_ERRORS.BAD_PAYLOAD],
    [makeRun({ lingers: 1.5 }), RUN_SUBMIT_ERRORS.BAD_PAYLOAD],
    [makeRun({ callsign: '<script>' }), RUN_SUBMIT_ERRORS.BAD_PAYLOAD],
    [makeRun({ callsign: 'x'.repeat(25) }), RUN_SUBMIT_ERRORS.BAD_PAYLOAD],
    [makeRun({ deorbits: 'nope' }), RUN_SUBMIT_ERRORS.BAD_PAYLOAD],
    [
      makeRun({
        deorbits: [
          { objectId: 'a', massKg: 10, releaseDot: -1, atMs: 0 },
          { objectId: 'b', massKg: 10, releaseDot: -1, atMs: 0 },
        ].concat(
          Array.from({ length: 64 }, (_, i) => ({
            objectId: `x${i}`,
            massKg: 10,
            releaseDot: -1,
            atMs: 100,
          })),
        ),
      }),
      RUN_SUBMIT_ERRORS.BAD_PAYLOAD,
    ],
    [
      makeRun({
        deorbits: [
          { objectId: 'a', massKg: 10, releaseDot: -1, atMs: 100 },
          { objectId: 'b', massKg: 10, releaseDot: -1, atMs: 50 },
        ],
      }),
      RUN_SUBMIT_ERRORS.BAD_PAYLOAD,
    ],
    [
      makeRun({
        deorbits: [
          { objectId: 'a', massKg: Number.NaN, releaseDot: -1, atMs: 0 },
        ],
      }),
      RUN_SUBMIT_ERRORS.BAD_PAYLOAD,
    ],
    [
      makeRun({
        deorbits: [
          { objectId: 'a', massKg: 10, releaseDot: 2, atMs: 0 },
        ],
      }),
      RUN_SUBMIT_ERRORS.BAD_PAYLOAD,
    ],
    [
      makeRun({
        deorbits: [
          { objectId: '', massKg: 10, releaseDot: -1, atMs: 0 },
        ],
      }),
      RUN_SUBMIT_ERRORS.BAD_PAYLOAD,
    ],
    [makeRun({ clientScore: Number.NaN }), RUN_SUBMIT_ERRORS.BAD_PAYLOAD],
    [makeRun({ clientScore: -1 }), RUN_SUBMIT_ERRORS.BAD_PAYLOAD],
  ];

  for (const [payload, expectedCode] of cases) {
    const result = validateRunSubmit(payload);
    assert.equal(result.ok, false, `expected rejection for ${JSON.stringify(payload)}`);
    assert.equal(result.code, expectedCode);
  }
});
