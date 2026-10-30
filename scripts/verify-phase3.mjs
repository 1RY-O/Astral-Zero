/**
 * Playwright verification script for Phase 3:
 * Loads the page, simulates grabbing an object, thrusts for 1s, releases it,
 * and takes a screenshot saved to artifacts/phase3-verification.png.
 */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  console.log('[Phase 3 Verification] Starting Vite server...');
  const server = await createServer({
    server: { port: 5199 },
  });
  await server.listen();
  const address = server.httpServer.address();
  const port = address.port;
  console.log(`[Phase 3 Verification] Server listening on http://localhost:${port}`);

  console.log('[Phase 3 Verification] Launching Chromium...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  console.log(`[Phase 3 Verification] Navigating to http://localhost:${port}/?seed=2026...`);
  await page.goto(`http://localhost:${port}/?seed=2026`);
  await page.waitForSelector('canvas');

  // Let simulation settle for a few frames
  await page.waitForTimeout(500);

  console.log('[Phase 3 Verification] Simulating GRAB (Key E)...');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);

  console.log('[Phase 3 Verification] Simulating THRUST for 1 second (Space down)...');
  await page.keyboard.down('Space');
  await page.waitForTimeout(1000);
  await page.keyboard.up('Space');
  console.log('[Phase 3 Verification] Thrust completed.');

  console.log('[Phase 3 Verification] Simulating RELEASE (Key Q)...');
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(400);

  mkdirSync('artifacts', { recursive: true });
  const screenshotPath = join('artifacts', 'phase3-verification.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`[Phase 3 Verification] Screenshot captured at ${screenshotPath}`);

  await browser.close();
  await server.close();
  console.log('[Phase 3 Verification] Done.');
}

main().catch((err) => {
  console.error('[Phase 3 Verification] Error:', err);
  process.exit(1);
});
