import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profilesRoot = path.resolve('auth', 'sony-agent-profiles');
const statePath = path.join(profilesRoot, 'state.json');
const debugDir = path.resolve('auth', 'debug');
const startUrl = process.env.SONY_START_URL || 'https://store.playstation.com/en-us/pages/latest';
const debugPort = process.env.SONY_CHROME_DEBUG_PORT || String(9333 + Math.floor(Math.random() * 500));
const pastePassword = args.includes('--paste-password');
const rotateOnError = args.includes('--rotate-on-error');
const stopBeforeSubmit = args.includes('--stop-before-submit');
const humanInput = args.includes('--human-input');
const manualPassword = args.includes('--manual-password') || humanInput;
const useEadolProfile = args.includes('--eadol');
const profileArgIndex = args.indexOf('--profile');
const explicitProfile = profileArgIndex >= 0 ? args[profileArgIndex + 1] : '';
const email = args.find((arg, index) => !arg.startsWith('--') && index !== profileArgIndex + 1) || process.env.SONY_EMAIL || '';

const emailSelectors = [
  'input[type="email"]',
  'input[type="text"]',
  'input[name="email"]',
  'input[name="signinId"]',
  'input[name="id"]',
  'input[autocomplete="username"]',
  'input[placeholder*="email" i]',
  'input[placeholder*="sign-in" i]',
  'input[id*="email" i]',
  'input[id*="signin" i]',
  'input[id*="id" i]',
];

const passwordSelectors = [
  'input[type="password"]',
  'input[name="password"]',
  'input[autocomplete="current-password"]',
  'input[placeholder*="password" i]',
  'input[id*="password" i]',
];

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readCurrentProfile() {
  if (explicitProfile) {
    return explicitProfile.startsWith('profile-') ? explicitProfile : `profile-${explicitProfile.padStart(3, '0')}`;
  }
  if (!(await pathExists(statePath))) {
    return 'profile-001';
  }
  try {
    const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
    return state.currentProfile || 'profile-001';
  } catch {
    return 'profile-001';
  }
}

async function writeCurrentProfile(profileName) {
  await fs.mkdir(profilesRoot, { recursive: true });
  const profileNumber = Number(profileName.replace('profile-', '')) || 1;
  await fs.writeFile(
    statePath,
    JSON.stringify({ currentProfile: profileName, lastNumber: profileNumber }, null, 2),
    'utf8'
  );
}

async function nextProfileName() {
  let current = await readCurrentProfile();
  const currentNumber = Number(current.replace('profile-', '')) || 1;
  const nextName = `profile-${String(currentNumber + 1).padStart(3, '0')}`;
  await writeCurrentProfile(nextName);
  return nextName;
}

async function waitForChromeDebug(timeoutMs = 30_000) {
  const endpoint = `http://127.0.0.1:${debugPort}/json/version`;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Chrome remote debugging did not start on port ${debugPort}.`);
}

async function firstVisible(page, selectors, timeout = 15000) {
  const deadline = Date.now() + timeout;
  for (const selector of selectors) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      break;
    }
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout: Math.min(remaining, 1500) });
      return locator;
    } catch {
      // Try next selector.
    }
  }
  return null;
}

async function clickFirstVisible(locators, timeout = 1500) {
  for (const locator of locators) {
    try {
      if (await locator.isVisible({ timeout })) {
        if (humanInput) {
          await mouseClickLocator(locator);
        } else {
          await locator.click();
        }
        return true;
      }
    } catch {
      // Try next locator.
    }
  }
  return false;
}

async function mouseClickLocator(locator) {
  const box = await locator.boundingBox();
  if (!box) {
    await locator.click();
    return;
  }

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await locator.page().mouse.move(x - 20, y - 8, { steps: 8 });
  await locator.page().waitForTimeout(200 + Math.floor(Math.random() * 300));
  await locator.page().mouse.move(x, y, { steps: 6 });
  await locator.page().waitForTimeout(120 + Math.floor(Math.random() * 250));
  await locator.page().mouse.click(x, y, { delay: 80 + Math.floor(Math.random() * 120) });
}

async function fillText(locator, value) {
  if (!humanInput) {
    await locator.fill(value);
    return;
  }

  await mouseClickLocator(locator);
  await locator.page().keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await locator.page().keyboard.press('Backspace');
  for (const character of value) {
    await locator.page().keyboard.type(character, { delay: 65 + Math.floor(Math.random() * 95) });
  }
}

async function clickStoreSignIn(page) {
  return clickFirstVisible([
    page.getByRole('button', { name: /^sign in$/i }).first(),
    page.getByRole('link', { name: /^sign in$/i }).first(),
    page.locator('button:has-text("Sign In")').first(),
    page.locator('a:has-text("Sign In")').first(),
    page.locator('[aria-label*="sign in" i]').first(),
    page.locator('[data-qa*="sign" i]').first(),
    page.locator('[data-testid*="sign" i]').first(),
  ], 3000);
}

async function clickContinue(page) {
  return clickFirstVisible([
    page.getByRole('button', { name: /continue|next|sign in|log in/i }).first(),
    page.locator('button:has-text("Sign In")').first(),
    page.locator('button:has-text("Sign in")').first(),
    page.locator('button:has-text("Next")').first(),
    page.locator('button:has-text("Continue")').first(),
    page.locator('button[type="submit"]').first(),
    page.locator('input[type="submit"]').first(),
  ]);
}

async function detectState(page) {
  const body = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
  const url = page.url().toLowerCase();
  const codeInputVisible = await page.locator('input[inputmode="numeric"], input[autocomplete="one-time-code"], input[maxlength="6"], input[maxlength="8"]').first().isVisible({ timeout: 1500 }).catch(() => false);

  if (
    codeInputVisible ||
    body.includes('verification code') ||
    body.includes('security code') ||
    body.includes('authenticator') ||
    body.includes('2-step') ||
    body.includes('two-step') ||
    body.includes('enter the code')
  ) {
    return '2fa';
  }

  if (body.includes("can't connect to the server") || body.includes('cannot connect to the server')) {
    return 'server-error';
  }

  if (body.includes('something went wrong')) {
    return 'something-went-wrong';
  }

  if (body.includes('incorrect') || body.includes('invalid') || body.includes('wrong password')) {
    return 'credential-error';
  }

  if (!url.includes('signin') && !url.includes('login') && (body.includes('sign out') || body.includes('account') || body.includes('profile'))) {
    return 'signed-in';
  }

  return 'unknown';
}

async function saveDebug(page, label) {
  await fs.mkdir(debugDir, { recursive: true });
  if (!page || page.isClosed()) {
    await fs.writeFile(path.join(debugDir, `${label}-page-closed.txt`), 'Page was already closed before debug capture.', 'utf8').catch(() => {});
    return;
  }
  const cleanLabel = label.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  await page.screenshot({ path: path.join(debugDir, `${cleanLabel}.png`), fullPage: true }).catch(() => {});
  await fs.writeFile(path.join(debugDir, `${cleanLabel}.html`), await page.content(), 'utf8').catch(() => {});
}

async function main() {
  if (!email) {
    throw new Error('Missing email. Example: npm run sony:reach2fa -- msakagta-30@outlook.com');
  }

  let profileName = await readCurrentProfile();
  if (rotateOnError) {
    profileName = await nextProfileName();
    console.log(`Rotated to fresh profile: ${profileName}`);
  }
  const chromeUserDataDir = path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
  const profileDir = useEadolProfile ? chromeUserDataDir : path.join(profilesRoot, profileName);
  const chromeProfileDirectory = useEadolProfile ? 'Profile 13' : '';
  await fs.mkdir(profileDir, { recursive: true });

  console.log(`Using Sony ${useEadolProfile ? 'eadol Chrome profile' : `agent profile: ${profileName}`}`);
  console.log(`Profile folder: ${profileDir}`);
  console.log('Goal: reach the 2FA screen only. I will not bypass or answer 2FA.');

  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${debugPort}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profileDir}`,
    ...(chromeProfileDirectory ? [`--profile-directory=${chromeProfileDirectory}`] : []),
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
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  const context = browser.contexts()[0];
  let page = context.pages().find((candidate) => candidate.url().includes('playstation') || candidate.url().includes('sony')) || context.pages()[0];
  if (!page) {
    page = await context.newPage();
    await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
  }
  page.on('close', () => {
    console.log('Chrome page closed during run.');
  });

  await page.bringToFront();
  await page.waitForTimeout(4000);
  console.log(`Active URL before sign-in: ${page.url()}`);

  if (!/my\.account\.sony\.com|sonyentertainmentnetwork|signin|login/i.test(page.url())) {
    const clickedSignIn = await clickStoreSignIn(page);
    console.log(`Clicked store Sign In: ${clickedSignIn}`);
    await page.waitForURL(/my\.account\.sony\.com|sonyentertainmentnetwork|signin|login/i, { timeout: 45_000 }).catch(() => {});
  }
  console.log(`Active URL before email lookup: ${page.url()}`);

  const emailInput = await firstVisible(page, emailSelectors, 20_000);
  if (emailInput) {
    await fillText(emailInput, email);
    await clickContinue(page);
  } else {
    console.log('Email input was not found. Screenshot saved.');
    await saveDebug(page, 'reach-2fa-email-not-found');
    await browser.close();
    process.exitCode = 2;
    return;
  }

  const passwordInput = await firstVisible(page, passwordSelectors, 30_000);
  if (passwordInput) {
    if (humanInput) {
      await mouseClickLocator(passwordInput);
    } else {
      await passwordInput.click();
    }
    if (manualPassword) {
      console.log('Password field is focused. Type the password manually in Chrome, then click Sony Sign In yourself.');
      await saveDebug(page, 'reach-2fa-password-manual-ready');
      process.exit(0);
    }
    if (pastePassword) {
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
      console.log('Password pasted from clipboard. I did not read or print it.');
      await page.waitForTimeout(700);
      if (stopBeforeSubmit) {
        console.log('Stopped before clicking Sony Sign In. Click it manually in Chrome to test whether 2FA appears.');
        await saveDebug(page, 'reach-2fa-ready-for-manual-submit');
        process.exit(0);
      }
      await clickContinue(page);
    } else {
      console.log('Password field is focused. Rerun with --paste-password or type manually.');
      await saveDebug(page, 'reach-2fa-password-ready');
      await browser.close();
      return;
    }
  } else {
    console.log('Password input was not found. Screenshot saved.');
    await saveDebug(page, 'reach-2fa-password-not-found');
    await browser.close();
    process.exitCode = 2;
    return;
  }

  let state = 'unknown';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.waitForTimeout(2000);
    state = await detectState(page);
    if (state !== 'unknown') break;
  }

  await saveDebug(page, `reach-2fa-${state}`);
  console.log(`Final state: ${state}`);
  console.log(`Screenshot folder: ${debugDir}`);
  await browser.close();

  if (state !== '2fa' && state !== 'signed-in') {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
