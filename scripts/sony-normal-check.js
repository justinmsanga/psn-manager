import { spawn } from 'node:child_process';
import path from 'node:path';

const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = path.resolve('auth', 'sony-normal-chrome-profile');
const startUrl = process.env.SONY_START_URL || 'https://store.playstation.com/en-us/pages/latest';

const chrome = spawn(chromePath, [
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
console.log(`Opened normal Chrome with profile: ${profileDir}`);
console.log('If this opens already signed in, the agent must use this profile directly instead of storageState cookies.');
