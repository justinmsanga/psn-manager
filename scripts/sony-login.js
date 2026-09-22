import { chromium, firefox } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const pastePassword = args.includes('--paste-password');
const autoSave = args.includes('--auto-save');
const forceDirectLogin = args.includes('--direct-login');
const keepProfile = args.includes('--keep-profile');
const manualLogin = args.includes('--manual-login') || (keepProfile && !pastePassword && !autoSave);
const urlArgIndex = args.indexOf('--url');
const explicitUrl = urlArgIndex >= 0 ? args[urlArgIndex + 1] : '';
const browserArg = args.find((arg) => arg.startsWith('--browser='));
const browserName = (browserArg?.split('=')[1] || process.env.SONY_BROWSER || 'chrome').toLowerCase();
const email = args.find((arg, index) => !arg.startsWith('--') && index !== urlArgIndex + 1) || process.env.SONY_EMAIL || '';
const authDir = path.resolve('auth');
const sessionPath = path.join(authDir, 'sony-session.json');
const debugDir = path.resolve('auth', 'debug');

const freshStartUrl = explicitUrl ||
  process.env.SONY_START_URL ||
  'https://store.playstation.com/en-us/pages/latest';
const directLoginUrl = (forceDirectLogin ? process.env.SONY_LOGIN_URL : '') ||
  'https://my.account.sony.com/central/signin/?service_entity=urn%3Aservice-entity%3Apsn';

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

async function firstVisible(page, selectors, timeout = 15000) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout });
      return locator;
    } catch {
      // Try the next selector.
    }
  }
  return null;
}

async function clickLikelyContinue(page) {
  const buttons = [
    page.getByRole('button', { name: /continue|next|sign in|log in/i }).first(),
    page.locator('button:has-text("Sign In")').first(),
    page.locator('button:has-text("Sign in")').first(),
    page.locator('button:has-text("Next")').first(),
    page.locator('button:has-text("Continue")').first(),
    page.locator('[data-testid*="sign" i]').first(),
    page.locator('[data-qa*="sign" i]').first(),
    page.locator('[id*="sign" i]').first(),
    page.locator('button[type="submit"]').first(),
    page.locator('input[type="submit"]').first(),
  ];
  for (const button of buttons) {
    try {
      if (await button.isVisible({ timeout: 1500 })) {
        await button.click();
        return true;
      }
    } catch {
      // Try the next button.
    }
  }
  return false;
}

async function clickFreshStoreSignIn(page) {
  const signInTargets = [
    page.getByRole('button', { name: /^sign in$/i }).first(),
    page.getByRole('link', { name: /^sign in$/i }).first(),
    page.locator('button:has-text("Sign In")').first(),
    page.locator('a:has-text("Sign In")').first(),
    page.locator('[aria-label*="sign in" i]').first(),
    page.locator('[data-qa*="sign" i]').first(),
    page.locator('[data-testid*="sign" i]').first(),
  ];

  for (const target of signInTargets) {
    try {
      if (await target.isVisible({ timeout: 3000 })) {
        await target.click();
        return true;
      }
    } catch {
      // Try the next sign-in target.
    }
  }

  return false;
}

async function openSonyLogin(page) {
  const startUrl = forceDirectLogin ? directLoginUrl : freshStartUrl;
  console.log(`Opening Sony flow from: ${startUrl}`);
  await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  if (manualLogin) {
    console.log('Manual mode: I will not click, type, paste, or submit anything. Log in by hand in the browser.');
    return;
  }

  if (forceDirectLogin || /my\.account\.sony\.com|sonyentertainmentnetwork|signin/i.test(page.url())) {
    return;
  }

  if (!(await clickFreshStoreSignIn(page))) {
    console.log('Could not find the store Sign In button. Falling back to direct Sony login.');
    await page.goto(directLoginUrl, { waitUntil: 'domcontentloaded' });
    return;
  }

  await page.waitForURL(
    /my\.account\.sony\.com|sonyentertainmentnetwork|signin|login/i,
    { timeout: 45_000 }
  ).catch(() => {
    console.log('Sony did not redirect to login yet. Continuing from the current page.');
  });
}

async function saveDebugSnapshot(page, label) {
  await fs.mkdir(debugDir, { recursive: true });
  const cleanLabel = label.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  await page.screenshot({ path: path.join(debugDir, `${cleanLabel}.png`), fullPage: true });
  await fs.writeFile(path.join(debugDir, `${cleanLabel}.html`), await page.content(), 'utf8');
}

async function retryTransientSonyErrors(page) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const body = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
    if (!body.includes("can't connect to the server") && !body.includes('cannot connect to the server')) {
      return;
    }
    console.log(`Sony server error detected. Retrying sign in (${attempt}/3)...`);
    if (!(await clickLikelyContinue(page))) {
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(5000);
  }
}

async function main() {
  await fs.mkdir(authDir, { recursive: true });
  await fs.mkdir(debugDir, { recursive: true });

  const profileDir = keepProfile
    ? path.resolve('auth', `sony-${browserName}-profile`)
    : await fs.mkdtemp(path.join(os.tmpdir(), `sony-login-${browserName}-profile-`));
  await fs.mkdir(profileDir, { recursive: true });
  console.log(`Using ${keepProfile ? 'reusable' : 'fresh'} ${browserName} profile: ${profileDir}`);

  const browserType = browserName === 'firefox' ? firefox : chromium;
  const launchOptions = {
    headless: false,
    slowMo: 150,
    viewport: { width: 1280, height: 850 },
  };
  if (browserName !== 'firefox') {
    launchOptions.channel = 'chrome';
  }
  const context = await browserType.launchPersistentContext(profileDir, launchOptions);
  const page = await context.newPage();

  await openSonyLogin(page);

  if (manualLogin) {
    console.log('Manual login mode is active. Use the browser yourself, then return here and press Enter.');
  } else if (email) {
    const emailInput = await firstVisible(page, emailSelectors, 20000);
    if (emailInput) {
      await emailInput.fill(email);
      await clickLikelyContinue(page);
    } else {
      console.log('Email field not found. Fill it manually in the browser.');
    }
  } else {
    console.log('No email provided. Fill email manually or rerun: npm run sony:login -- your@email.com');
  }

  if (!manualLogin) {
    const passwordInput = await firstVisible(page, passwordSelectors, 30000);
    if (passwordInput) {
      await passwordInput.click();
      if (pastePassword) {
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
        console.log('Password pasted from clipboard into the browser. I did not read or print it.');
        await page.waitForTimeout(500);
        if (!(await clickLikelyContinue(page))) {
          await page.keyboard.press('Enter');
        }
        await page.waitForTimeout(5000);
        await retryTransientSonyErrors(page);
        await saveDebugSnapshot(page, 'after-password-submit');
      } else {
        console.log('Password field focused. Paste manually, or rerun with --paste-password.');
      }
    } else {
      console.log('Password field not found yet. Continue manually in the browser.');
    }
  }

  console.log('Complete Sony login manually. Solve CAPTCHA/2FA yourself if asked.');

  if (autoSave) {
    console.log('Waiting up to 5 minutes for login to complete, then I will save the session.');
    await page.waitForFunction(
      () => {
        const url = location.href.toLowerCase();
        const body = document.body?.innerText?.toLowerCase() || '';
        return (
          !url.includes('/signin') &&
          !url.includes('login') &&
          (
            body.includes('account') ||
            body.includes('profile') ||
            body.includes('security') ||
            body.includes('sign out') ||
            body.includes('logout')
          )
        );
      },
      { timeout: 300_000 }
    ).catch(() => {
      console.log('Auto-detect did not confirm login. Saving current browser session anyway.');
    });
  } else {
    console.log('When the account page is fully logged in, return here and press Enter to save the session.');
    await new Promise((resolve) => {
      process.stdin.resume();
      process.stdin.once('data', resolve);
    });
  }

  try {
    await context.storageState({ path: sessionPath });
    console.log(`Saved Sony session to ${sessionPath}`);
  } catch (error) {
    console.log(`Could not save Sony session because the browser closed first: ${error.message}`);
  }

  if (!page.isClosed()) {
    await saveDebugSnapshot(page, 'final-session-state');
  }
  await context.close().catch(() => {});
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
