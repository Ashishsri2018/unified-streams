'use strict';

const path = require('path');
const {
  seedFromBundle,
  createUpdater,
  ensureNodeModulesLink,
  DEFAULT_SOURCE_REPO,
  DEFAULT_SOURCE_BRANCH,
  DEFAULT_INTERVAL_HOURS,
} = require('./updater');

const bundledDir = path.join(__dirname, 'vendor', 'cb-providers');
const dataDir = process.env.SA7_DATA_DIR || '/data/sa7';
const rootDir = path.join(dataDir, 'cb-providers');
const statePath = path.join(dataDir, 'state.json');

let usingData = true;
try {
  const seeded = seedFromBundle({ bundledDir, rootDir, statePath });
  if (seeded) {
    console.log(`[sa7] seeded providers from bundle into ${rootDir}`);
  }
} catch (error) {
  usingData = false;
  console.error(`[sa7] failed to seed providers into ${rootDir}: ${error.message}`);
}

let providerManifest;
let providerDir;
if (usingData) {
  providerManifest = path.join(rootDir, 'manifest.json');
  providerDir = path.join(rootDir, 'providers');
} else {
  providerManifest = path.join(bundledDir, 'manifest.json');
  providerDir = path.join(bundledDir, 'providers');
}

process.env.PROVIDER_MANIFEST = providerManifest;
process.env.PROVIDER_DIR = providerDir;

if (usingData) {
  try {
    ensureNodeModulesLink({ dataDir, modulesDir: path.join(__dirname, 'node_modules') });
  } catch (error) {
    console.warn(`[sa7] node_modules link failed: ${error.message}`);
  }
}

const providers = require('./providers');

let updater = null;
if (usingData) {
  updater = createUpdater({
    bundledDir,
    rootDir,
    statePath,
    sourceRepo: process.env.SA7_SOURCE_REPO || DEFAULT_SOURCE_REPO,
    sourceBranch: process.env.SA7_SOURCE_BRANCH || DEFAULT_SOURCE_BRANCH,
    updateIntervalHours: process.env.SA7_UPDATE_INTERVAL_HOURS || DEFAULT_INTERVAL_HOURS,
    updateOnStart: process.env.SA7_UPDATE_ON_START !== 'false',
    onUpdated: () => {
      try {
        providers.reloadProviders();
      } catch (error) {
        console.error(`[sa7] provider reload failed: ${error.message}`);
      }
    },
    logger: console,
  });
  updater.start();
} else {
  console.warn('[sa7] provider updates disabled because the bundled directory is read-only');
}

require('./server').start({ updater });
