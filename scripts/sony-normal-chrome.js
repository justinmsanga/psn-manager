import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const authDir = path.resolve('auth');
const debugDir = path.join(authDir, 'debug');
const profileDir = path.join(authDir, 'sony-normal-chrome-profile');
const sessionPath = path.join(authDir, 'sony-session.json');
const debugPort = process.env.SONY_CHROME_DEBUG_PORT || '9222';
const startUrl = process.env.SONY_START_URL || 'https://store.playstation.com/en-us/pages/latest';

async function waitForChromeDebug(timeoutMs = 30_000) {
  const started = Date.now();
  const endpoint = `http://127.0.0.1:${debugPort}/json/version`;

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        return;
      }
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Chrome remote debugging did not start on port ${debugPort}.`);
}

async function main() {
  await fs.mkdir(authDir, { recursive: true });
  await fs.mkdir(debugDir, { recursive: true });
  await fs.mkdir(profileDir, { recursive: true });

  console.log(`Opening normal Chrome profile: ${profileDir}`);
  console.log('I will not type, paste, click, or submit anything for you.');

  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${debugPort}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--disable-features=msForceBrowserSignIn',
    '--disable-search-engine-choice-screen',
    '--new-window',
    startUrl,
  ], {
    detached: true,
    stdio: 'ignore',
  });
  chrome.unref();

  await waitForChromeDebug();

  const rl = readline.createInterface({ input, output });
  await rl.question('Log in manually in Chrome. When you are fully signed in, press Enter here to save the session...');
  rl.close();

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find((candidate) => candidate.url().includes('playstation') || candidate.url().includes('sony')) || pages[0];

  await context.storageState({ path: sessionPath });
  console.log(`Saved Sony session to ${sessionPath}`);

  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(debugDir, 'normal-chrome-session.png'), fullPage: true }).catch(() => {});
    await fs.writeFile(path.join(debugDir, 'normal-chrome-session.html'), await page.content(), 'utf8').catch(() => {});
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
