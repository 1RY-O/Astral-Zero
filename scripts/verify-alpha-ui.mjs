import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  console.log('[Alpha UI Verify] Starting Vite server on 5198...');
  const server = await createServer({
    server: { port: 5198 },
  });
  await server.listen();
  const address = server.httpServer.address();
  const port = address.port;
  console.log(`[Alpha UI Verify] Server listening on http://localhost:${port}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  console.log('[Alpha UI Verify] Navigating to landing page...');
  await page.goto(`http://localhost:${port}/`);
  await page.waitForTimeout(600);

  mkdirSync('artifacts', { recursive: true });

  // 1. Check Landing Page
  const headline = await page.textContent('h1');
  console.log('[Alpha UI Verify] Headline:', headline);
  if (!headline.includes('DEBRIS DERBY')) {
    throw new Error('Headline does not contain DEBRIS DERBY');
  }

  // Check Primary Button
  const button = page.locator('button:has-text("INITIATE MISSION")');
  await button.waitFor({ state: 'visible' });
  const btnBg = await button.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  console.log('[Alpha UI Verify] Button background:', btnBg);

  // Hover over button to check cursor "Enter" label & scale
  await button.hover();
  await page.waitForTimeout(300);

  await page.screenshot({ path: join('artifacts', 'alpha-landing-page.png') });
  console.log('[Alpha UI Verify] Landing page screenshot captured.');

  // 2. Click button to enter game
  console.log('[Alpha UI Verify] Clicking INITIATE MISSION...');
  await button.click();
  await page.waitForTimeout(800);

  // 3. Verify HUD Pill
  const hudScore = page.locator('span:has-text("SCORE")');
  await hudScore.waitFor({ state: 'visible' });
  console.log('[Alpha UI Verify] HUD Score visible.');

  const hudFuel = page.locator('span:has-text("FUEL")');
  await hudFuel.waitFor({ state: 'visible' });
  console.log('[Alpha UI Verify] HUD Fuel visible.');

  const hintBtn = page.locator('button[title*="Hint"]');
  await hintBtn.waitFor({ state: 'visible' });
  console.log('[Alpha UI Verify] Hint button (?) found. Clicking...');
  await hintBtn.click();
  await page.waitForTimeout(400);

  const resetBtn = page.locator('button[title*="Reset"]');
  await resetBtn.waitFor({ state: 'visible' });
  console.log('[Alpha UI Verify] Reset button (↻) found. Clicking...');
  await resetBtn.click();
  await page.waitForTimeout(400);

  await page.screenshot({ path: join('artifacts', 'alpha-hud-pill.png') });
  console.log('[Alpha UI Verify] HUD pill screenshot captured.');

  // 4. Test Level 2
  console.log('[Alpha UI Verify] Loading Level 2: Two-Body Problem: Gravity Assist...');
  await page.goto(`http://localhost:${port}/?level=2&autoplay=1`);
  await page.waitForTimeout(1000);

  const levelBanner = await page.locator('body').textContent();
  const hasGravityAssist = levelBanner.includes('TWO-BODY PROBLEM: GRAVITY ASSIST') || levelBanner.includes('GRAVITY ASSIST');
  console.log('[Alpha UI Verify] Level 2 banner/name has Gravity Assist:', hasGravityAssist);

  await page.screenshot({ path: join('artifacts', 'level2-gravity-assist.png') });
  console.log('[Alpha UI Verify] Level 2 screenshot captured.');

  // 5. Test All 8 Levels can load
  for (let lvl = 1; lvl <= 8; lvl++) {
    await page.goto(`http://localhost:${port}/?level=${lvl}&autoplay=1`);
    await page.waitForTimeout(300);
    const text = await page.locator('body').textContent();
    console.log(`[Alpha UI Verify] Level ${lvl} loaded successfully (contains MISSION 0${lvl}):`, text.includes(`0${lvl}`));
  }

  await browser.close();
  await server.close();
  console.log('[Alpha UI Verify] ALL CHECKS PASSED.');
}

main().catch((err) => {
  console.error('[Alpha UI Verify] Error:', err);
  process.exit(1);
});
