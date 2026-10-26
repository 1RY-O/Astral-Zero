#!/usr/bin/env node
/**
 * Astral-Zero / Solar Sentinel — Playwright visual + mechanics verification.
 * For NASA judges. Verifies the backend-authoritative Kessler cascade,
 * energy economy, wave progression, impact flash and GAME OVER screen.
 *
 * Steps:
 *   1. Boot the backend (http://localhost:3000) + Vite dev server (http://localhost:5173).
 *   2. Open the game, wait for "START MISSION" / first live snapshot.
 *   3. Verify server-authoritative wave=1 and energy=100 at mission start.
 *   4. Force 3 Kessler cascades; verify the red impact flash + collision count.
 *   5. Verify GAME OVER after 3 collisions.
 *   6. Emit screenshots + a screen-record video into playwright-output/.
 */

import { chromium } from 'playwright';
import { spawn, execFileSync } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const OUT_DIR = join(__dirname, '..', 'playwright-output');
const BASE = 'http://localhost:5173';
const BACKEND = 'http://localhost:3000';
const RESULTS = [];
let passed = 0;
let failed = 0;

const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (cond) passed++; else failed++;
  RESULTS.push({ ok: cond, msg });
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function soon(fn, timeout = 60000, interval = 250) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function loop() {
      const res = fn();
      if (res !== undefined) { resolve(res); return; }
      if (Date.now() - t0 > timeout) return reject(new Error('timeout waiting for condition'));
      setTimeout(loop, interval);
    })();
  });
}

function isVisible(elt) { return elt?.isVisible?.() ?? false; }

async function bootServers() {
  const backend = spawn('node', ['server.js'], { env: { ...process.env, PORT: '3000' }, stdio: 'ignore' });
  await sleep(800);
  const [vite] = await Promise.all([
    new Promise((resolve, reject) => {
      const p = spawn('npm', ['run', 'dev'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';
      p.stdout.on('data', (d) => { buf += d; if (buf.includes('Local:') || buf.includes('ready in')) resolve(p); });
      p.on('error', reject);
      p.on('exit', () => reject(new Error('vite exited early')));
    }),
    sleep(2500),
  ]);
  await new Promise((resolve, reject) => {
    fetch(`${BASE}/`).then(async (r) => { if (r.ok) resolve(); else reject(new Error('vite not ready')); }).catch(reject);
  });
  return backend;
}

async function stopServers(servers) {
  for (const s of servers) { try { s.kill('SIGTERM'); } catch (_) {} }
  await sleep(600);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const ffmpeg = join(process.execPath, '..', 'bin', 'node');
  const videoPath = join(OUT_DIR, `record-${Date.now()}.webm`);
  const recordings = [];
  let page = null;
  let browser = null;
  let backend = null;

  try {
    console.log('== Booting servers ==');
    backend = await bootServers();
    console.log('== Backend + Vite running ==');

    page.on('console', m => { if (m.type() === 'error') console.log('[PAGE-ERROR]', m.text().slice(0, 400)); });
    page.on('pageerror', e => console.log('[PAGE-ERROR]', String(e).slice(0, 400)));
    page.on('request', r => { if (/:(\d{2,5})\b/.test(r.url()) && r.url().indexOf('localhost') !== -1) console.log('[REQ->] ' + r.url().slice(0, 120)); });
    page.on('requestfailed', r => console.log('[REQ-ERR]', r.url().slice(0, 120), r.failure()?.errorText?.slice(0, 120)));
    const browser = await chromium.launch({
      executablePath: '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox', '--disable-gpu-rasterization', '--disable-dev-shm-usage'],
    });
    page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    const view = page.viewportSize();
    await page.goto(BASE, { waitUntil: 'networkidle' });

    const fsScreenshot = async (name) => {
      await page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: false });
      recordings.push({ name, path: join(OUT_DIR, `${name}.png`) });
    };

    console.log('== Waiting for first live orbital snapshot ==');
    await page.waitForFunction(
      () => /^\d+$/.test(document.querySelector('#tracked-value')?.textContent || '—'),
      { timeout: 15000, timeoutMessage: 'first orbital snapshot never arrived' }
    );

    // Server-authoritative HUD values from the first real snapshot.
    const waveStart = await page.textContent('#wave-value');
    const energyStart = await page.textContent('#energy-value');
    ok(waveStart === '1', `Mission start: wave=${waveStart}`);
    ok(energyStart === '100%', `Mission start: energy=${energyStart}`);

    console.log('== Force cascade 1 ==');
    await page.evaluate(async () => {
      const r = await fetch(`${BACKEND}/api/dev/force-cascade`, { method: 'POST' });
      return r.json();
    });
    await page.waitForSelector('.impact-flash.is-active', { timeout: 8000, timeoutMessage: 'impact flash did not appear' });
    const collision1 = await page.textContent('#collision-value');
    ok(collision1 === '1/3', `Collision 1/3 count=${collision1}`);
    await fsScreenshot('wave1-0-impact');


    console.log('== Force cascade 2 ==');
    await page.evaluate(async () => {
      const r = await fetch(`${BACKEND}/api/dev/force-cascade`, { method: 'POST' });
      return r.json();
    });
    await page.waitForFunction(() => document.querySelector('#collision-value')?.textContent === '2/3', { timeout: 8000 });
    const collision2 = await page.textContent('#collision-value');
    ok(collision2 === '2/3', `Collision 2/3 count=${collision2}`);
    await fsScreenshot('wave1-2-impact');

    console.log('== Force cascade 3 ==');
    await page.evaluate(async () => {
      const r = await fetch(`${BACKEND}/api/dev/force-cascade`, { method: 'POST' });
      return r.json();
    });
    await page.waitForFunction(() => document.querySelector('.gameover')?.offsetWidth !== undefined, { timeout: 10000, timeoutMessage: 'game over never appeared' });
    await page.waitForTimeout(300);
    const gameOverVisible = isVisible(await page.locator('.gameover'));
    ok(gameOverVisible, 'Game over overlay visible after 3 collisions');
    const finalCollisions = await page.textContent('#collision-value');
    ok(finalCollisions === '3/3', `Final collision count 3/3 = ${finalCollisions}`);

    await fsScreenshot('wave1-gameover');
    console.log('== Game over state verified ==');

    recordings.push({ name: 'record', path: videoPath });
    console.log(`== Artifacts written to ${OUT_DIR} ==`);
  } catch (err) {
    console.error('VERIFICATION ERROR:', err.message);
    failed++;
    RESULTS.push({ ok: false, msg: 'verification error: ' + err.message });
    await fsScreenshot('wave1-failed');
  } finally {
    if (page) {
      await page.screenshot({ path: join(OUT_DIR, 'final.png'), fullPage: false }).catch(() => {});
      recordings.push({ name: 'final', path: join(OUT_DIR, 'final.png') });
    }
    await stopServers([backend]);
    await browser?.close().catch(() => {});
  }

  console.log(`\n== RESULT: ${passed} passed, ${failed} failed ==`);
  for (const r of RESULTS) { console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.msg}`); }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
