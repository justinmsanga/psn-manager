import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const authDir = path.resolve('auth');
const debugDir = path.join(authDir, 'debug');
const sessionPath = path.join(authDir, 'sony-session.json');
const screenshotPath = path.join(debugDir, 'sony-session-check.png');
const htmlPath = path.join(debugDir, 'sony-session-check.html');
const startUrl = process.env.SONY_START_URL || 'https://store.playstation.com/en-us/pages/latest';

async function main() {
  await fs.access(sessionPath);
  await fs.mkdir(debugDir, { recursive: true });

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    slowMo: 100,
  });
  const context = await browser.newContext({
    storageState: sessionPath,
    viewport: { width: 1280, height: 850 },
  });
  const page = await context.newPage();

  await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);

  const text = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
  const url = page.url();
  const signInVisible = await page.getByRole('button', { name: /^sign in$/i }).first().isVisible({ timeout: 2000 }).catch(() => false);
  const accountSignals = [
    'my playstation',
    'account',
    'profile',
    'wishlist',
    'cart',
    'sign out',
    'log out',
  ];
  const foundSignals = accountSignals.filter((signal) => text.includes(signal));

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await fs.writeFile(htmlPath, await page.content(), 'utf8');

  console.log(`URL: ${url}`);
  console.log(`Sign In button visible: ${signInVisible}`);
  console.log(`Account signals: ${foundSignals.join(', ') || 'none'}`);
  console.log(`Screenshot: ${screenshotPath}`);

  await browser.close();

  if (signInVisible && foundSignals.length === 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
