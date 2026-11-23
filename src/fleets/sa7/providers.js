require('./lib/cheerio-hook');

const fs = require('fs');
const path = require('path');
const config = require('./config');

let corePolicy = null;
try {
  corePolicy = require(path.resolve(process.cwd(), 'dist/core/policy.js'));
} catch {
  corePolicy = null;
}

function isProviderEnabled(id, selection) {
  if (corePolicy && typeof corePolicy.isProviderEnabled === 'function') {
    return corePolicy.isProviderEnabled(id, selection);
  }
  const key = String(id).trim().toLowerCase();
  const disabled = new Set((selection.disabled || []).map((value) => String(value).toLowerCase()));
  const enabled = (selection.enabled || []).map((value) => String(value).toLowerCase());
  if (disabled.has('*') || disabled.has(key)) return false;
  return enabled.length === 0 || enabled.includes(key);
}

function findDepartedProviderIds(previousIds, currentIds, selection) {
  if (corePolicy && typeof corePolicy.findDepartedProviderIds === 'function') {
    return corePolicy.findDepartedProviderIds(previousIds, currentIds, selection);
  }
  const current = new Set(
    (currentIds || []).map((id) => String(id).trim().toLowerCase()).filter(Boolean),
  );
  const configured = new Set(
    [...(selection.enabled || []), ...(selection.disabled || [])]
      .map((id) => String(id).trim().toLowerCase())
      .filter((id) => id && id !== '*'),
  );
  const departed = new Set();
  for (const raw of previousIds || []) {
    const id = String(raw).trim().toLowerCase();
    if (id && configured.has(id) && !current.has(id)) departed.add(id);
  }
  return [...departed].sort();
}

let registry = null;
let manifestProviderIds = null;

// Torrent providers stay vendored so the daily sync keeps them updated, but
// they are never loaded or queried. The vendored manifest has no source-type field.
const DISABLED_PROVIDER_IDS = new Set(['torrentio']);

function loadProvider(entry) {
  const file = path.join(config.providerDir, path.basename(entry.filename));
  const mod = require(file);
  const getStreams =
    typeof mod.getStreams === 'function'
      ? mod.getStreams
      : mod.default && typeof mod.default.getStreams === 'function'
        ? mod.default.getStreams
        : null;

  if (!getStreams) throw new Error('missing getStreams export');

  return {
    id: entry.id,
    name: entry.name || entry.id,
    types: Array.isArray(entry.supportedTypes) ? entry.supportedTypes : ['movie', 'tv'],
    getStreams,
    order: 0,
  };
}

function clearProviderModuleCache(dir) {
  const prefix = `${path.resolve(dir)}${path.sep}`;
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(prefix)) {
      delete require.cache[key];
    }
  }
}

function buildRegistry() {
  const manifest = JSON.parse(fs.readFileSync(config.providerManifest, 'utf8'));
  const selection = {
    enabled: config.enabledProviders || [],
    disabled: [...DISABLED_PROVIDER_IDS, ...(config.disabledProviders || [])],
  };
  const manifestIds = (manifest.providers || [])
    .map((provider) => (provider && typeof provider.id === 'string' ? provider.id : ''))
    .filter(Boolean);

  if (manifestProviderIds) {
    const departed = findDepartedProviderIds(manifestProviderIds, manifestIds, selection);
    if (departed.length > 0) {
      console.warn(
        `[providers] configured provider(s) missing from manifest: ${departed.join(', ')}`
      );
    }
  }
  manifestProviderIds = manifestIds;

  const entries = (manifest.providers || []).filter((p) => {
    if (p.enabled === false) return false;
    return isProviderEnabled(p.id, selection);
  });

  const next = [];
  for (const entry of entries) {
    try {
      const provider = loadProvider(entry);
      provider.order = next.length;
      next.push(provider);
    } catch (err) {
      console.warn(`[providers] skipped ${entry.id}: ${err.message}`);
    }
  }

  const disabledList = selection.disabled.join(', ') || 'none';
  console.log(
    `[providers] loaded ${next.length}/${entries.length} (disabled: ${disabledList})`
  );
  return next;
}

function getRegistry() {
  if (!registry) {
    registry = buildRegistry();
  }
  return registry;
}

function reloadProviders() {
  clearProviderModuleCache(config.providerDir);
  registry = buildRegistry();
  return registry;
}

function providersFor(mediaType) {
  const wanted = mediaType === 'tv' ? ['tv', 'anime'] : ['movie'];
  return getRegistry().filter((p) => p.types.some((t) => wanted.includes(t)));
}

module.exports = { DISABLED_PROVIDER_IDS, getRegistry, providersFor, reloadProviders };
