/**
 * Astral Zero — netcode debug readout test.
 * ============================================================
 * The `?debug` overlay is the only way to SEE a reconciliation fault, because a
 * soft correction is deliberately imperceptible by feel. That makes it easy to
 * break silently, so this test executes the REAL method body (extracted from
 * ArenaScene.js, not retyped) against real Prediction + SnapshotBuffer objects.
 *
 * Run with: npm run test:netdebug
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { Prediction } from '../src/net/Prediction.js';
import { SnapshotBuffer } from '../src/net/SnapshotBuffer.js';

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures += 1;
};

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '../src/scenes/ArenaScene.js'), 'utf8');

// Pull the real method out of the class source and compile it standalone, so we
// are testing shipped code rather than a hand-copied paraphrase of it.
const match = source.match(/\n {2}_updateNetDebug\(\) \{[\s\S]*?\n {2}\}\n/);
if (!match) {
  console.error('Could not locate _updateNetDebug in ArenaScene.js — test needs updating.');
  process.exit(1);
}
// Class method shorthand is not valid standalone function syntax, so convert
// `foo() { ... }` into `function foo() { ... }` before compiling.
const _updateNetDebug = new Function(
  `return ${match[0].trim().replace('_updateNetDebug()', 'function _updateNetDebug()')}`,
)();

// --- Build a fake scene with the real subsystems attached -------------------
const prediction = new Prediction();
prediction.reconcile({ x: 140, y: 600, clientX: 100, clientY: 600 }); // soft
prediction.reconcile({ x: 700, y: 600, clientX: 100, clientY: 600 }); // snap

const snapshots = new SnapshotBuffer();
const now = 10_000;
snapshots.push({ id: 'me', x: 700, y: 600, time: now - 90 });
snapshots.push({ id: 'bot1', x: 300, y: 600, time: now - 80, isBot: true });

let rendered = null;
const scene = {
  netDebugText: { setText: (t) => { rendered = t; } },
  prediction,
  stream: { snapshots, now: () => now, isServerDriving: () => true },
  localId: 'me',
  _lastReconciledSeq: 7,
};

_updateNetDebug.call(scene);

ok(rendered !== null, 'the readout renders text');
ok(rendered.includes('snaps 1'), `snap telemetry survives reset() (got "${rendered.split('\n')[0]}")`);
ok(rendered.includes('maxErr 600.0px'), 'largest error is reported');
ok(rendered.includes('tracked 2'), 'tracked-entity count is reported');
ok(rendered.includes('age 90ms'), 'snapshot age is reported');
ok(rendered.includes('SERVER'), 'bot ownership source is reported');

// --- Guards: must never throw when subsystems are absent ---------------------
let threw = false;
try {
  _updateNetDebug.call({});
  _updateNetDebug.call({ netDebugText: { setText() {} } }); // no prediction/stream
} catch {
  threw = true;
}
ok(!threw, 'the readout is a no-op (never throws) before a match starts');

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
process.exit(failures ? 1 : 0);
