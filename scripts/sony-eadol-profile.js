import { spawn } from 'node:child_process';
import path from 'node:path';

const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = process.env.CHROME_USER_DATA_DIR ||
  path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
const profileDirectory = process.env.CHROME_PROFILE_DIR || 'Profile 13';
const startUrl = process.env.SONY_START_URL || 'https://store.playstation.com/en-us/pages/latest';

console.log(`Opening Chrome profile "${profileDirectory}" from: ${userDataDir}`);
console.log('This is the normal Chrome profile named eadol. Log in manually if Sony asks.');

const chrome = spawn(chromePath, [
  `--user-data-dir=${userDataDir}`,
  `--profile-directory=${profileDirectory}`,
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
