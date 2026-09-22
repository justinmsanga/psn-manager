import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profilesRoot = path.resolve('auth', 'sony-agent-profiles');
const statePath = path.join(profilesRoot, 'state.json');
const startUrl = process.env.SONY_START_URL || 'https://store.playstation.com/en-us/pages/latest';

const shouldList = args.includes('--list');
const shouldCreateNew = args.includes('--new');
const shouldOpenNext = args.includes('--next');
const profileArgIndex = args.indexOf('--profile');
const explicitProfile = profileArgIndex >= 0 ? args[profileArgIndex + 1] : '';

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readState() {
  if (!(await pathExists(statePath))) {
    return { currentProfile: 'profile-001', lastNumber: 1 };
  }

  try {
    return JSON.parse(await fs.readFile(statePath, 'utf8'));
  } catch {
    return { currentProfile: 'profile-001', lastNumber: 1 };
  }
}

async function writeState(state) {
  await fs.mkdir(profilesRoot, { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
}

function formatProfileName(number) {
  return `profile-${String(number).padStart(3, '0')}`;
}

async function listProfiles() {
  await fs.mkdir(profilesRoot, { recursive: true });
  const entries = await fs.readdir(profilesRoot, { withFileTypes: true });
  const profiles = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('profile-'))
    .map((entry) => entry.name)
    .sort();
  const state = await readState();

  console.log(`Profiles root: ${profilesRoot}`);
  console.log(`Current profile: ${state.currentProfile}`);
  console.log(profiles.length ? profiles.join('\n') : 'No profiles created yet.');
}

async function chooseProfile() {
  const state = await readState();

  if (explicitProfile) {
    const profileName = explicitProfile.startsWith('profile-')
      ? explicitProfile
      : `profile-${explicitProfile.padStart(3, '0')}`;
    await writeState({ ...state, currentProfile: profileName });
    return profileName;
  }

  if (shouldCreateNew || shouldOpenNext) {
    const nextNumber = Number(state.lastNumber || 1) + 1;
    const nextProfile = formatProfileName(nextNumber);
    await writeState({ currentProfile: nextProfile, lastNumber: nextNumber });
    return nextProfile;
  }

  await writeState(state);
  return state.currentProfile || 'profile-001';
}

async function openProfile(profileName) {
  const profileDir = path.join(profilesRoot, profileName);
  await fs.mkdir(profileDir, { recursive: true });

  console.log(`Opening Sony agent Chrome profile: ${profileName}`);
  console.log(`Profile folder: ${profileDir}`);
  console.log('If Sony asks login, log in manually once in this window.');

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
}

async function main() {
  if (shouldList) {
    await listProfiles();
    return;
  }

  await openProfile(await chooseProfile());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
