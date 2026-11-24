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

let coreChanges = null;
try {
  coreChanges = require(path.resolve(process.cwd(), 'dist/core/providerChanges.js'));
} catch {
  coreChanges = null;
}

function computeProviderChanges(baseline, current) {
  if (coreChanges && typeof coreChanges.computeProviderChanges === 'function') {
    return coreChanges.computeProviderChanges(baseline, current);
  }
  const changes = {};
  if (!Array.isArray(baseline) || baseline.length === 0) return changes;
  const previous = new Map();
  for (const entry of baseline) {
    const id = String((entry && entry.id) || '').trim().toLowerCase();
    if (!id) continue;
    previous.set(id, String((entry && entry.version) || '').trim());
  }
  for (const entry of current) {
    const id = String((entry && entry.id) || '').trim().toLowerCase();
    if (!id) continue;
    const version = String((entry && entry.version) || '').trim();
    if (!previous.has(id)) {
      changes[id] = { isNew: true, updated: false, previousVersion: null };
      continue;
    }
    const previousVersion = previous.get(id);
    if (previousVersion !== version) {
      changes[id] = { isNew: false, updated: true, previousVersion };
    }
  }
  return changes;
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
let baselineVersions = null;
let providerChanges = {};
const loadErrors = new Map();

// Torrent providers stay vendored so the daily sync keeps them updated, but
// they are never loaded or queried. The vendored manifest has no source-type field.
const DISABLED_PROVIDER_IDS = new Set(['torrentio']);

function normalizeOverrideMap(input) {
  const result = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== 'boolean') continue;
    const id = String(key).trim().toLowerCase();
    if (id) result[id] = value;
  }
  return result;
}

function hardDisabledSet() {
  const set = new Set(DISABLED_PROVIDER_IDS);
  for (const id of config.hardDisabledProviders || []) {
    set.add(String(id).trim().toLowerCase());
  }
  return set;
}

function baselineSelection() {
  return {
    enabled: config.enabledProviders || [],
    disabled: [...DISABLED_PROVIDER_IDS, ...(config.disabledProviders || [])],
  };
}

function overrideFor(id) {
  const overrides = config.runtimeOverrides || {};
  const key = String(id).trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
  for (const [rawId, value] of Object.entries(overrides)) {
    if (String(rawId).trim().toLowerCase() === key) return value;
  }
  if (Object.prototype.hasOwnProperty.call(overrides, '*')) return overrides['*'];
  return undefined;
}

function effectiveEnabled(id) {
  const key = String(id).trim().toLowerCase();
  if (hardDisabledSet().has(key)) return false;
  const override = overrideFor(id);
  if (override !== undefined) return override;
  return isProviderEnabled(id, baselineSelection());
}

function manifestEntries() {
  const manifest = JSON.parse(fs.readFileSync(config.providerManifest, 'utf8'));
  return Array.isArray(manifest.providers) ? manifest.providers : [];
}

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
  const providers = manifestEntries();
  const selection = baselineSelection();
  const manifestIds = providers
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

  const versions = providers
    .map((provider) => ({
      id: provider && typeof provider.id === 'string' ? provider.id : '',
      version: provider && provider.version ? String(provider.version) : '',
    }))
    .filter((provider) => provider.id);
  if (!baselineVersions || baselineVersions.length === 0) {
    baselineVersions = versions;
    providerChanges = {};
  } else {
    providerChanges = computeProviderChanges(baselineVersions, versions);
  }

  const entries = providers.filter((p) => {
    if (p.enabled === false) return false;
    return effectiveEnabled(p.id);
  });

  const next = [];
  loadErrors.clear();
  for (const entry of entries) {
    try {
      const provider = loadProvider(entry);
      provider.order = next.length;
      next.push(provider);
    } catch (err) {
      loadErrors.set(String(entry.id).toLowerCase(), err.message);
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

function getCatalog() {
  const loaded = new Set(getRegistry().map((provider) => String(provider.id).toLowerCase()));
  const hard = hardDisabledSet();
  const providers = manifestEntries().map((entry) => {
    const id = typeof entry.id === 'string' ? entry.id : '';
    const key = id.toLowerCase();
    const available = entry.enabled !== false;
    const change = providerChanges[key];
    return {
      id,
      name: entry.name || id,
      types: Array.isArray(entry.supportedTypes) ? entry.supportedTypes : ['movie', 'tv'],
      enabled: available && effectiveEnabled(id),
      loaded: loaded.has(key),
      locked: hard.has(key),
      missing: false,
      lastError: loadErrors.get(key) || null,
      version: entry.version ? String(entry.version) : '',
      isNew: Boolean(change && change.isNew),
      updated: Boolean(change && change.updated),
      previousVersion: change && change.previousVersion != null ? change.previousVersion : null,
    };
  });
  return {
    fleet: 'sa7',
    version: Number(config.selectionVersion || 0),
    providers,
  };
}

function applyRuntimeSelection(overrides, version) {
  config.runtimeOverrides = normalizeOverrideMap(overrides);
  if (typeof version === 'number' && Number.isFinite(version)) {
    config.selectionVersion = version;
  }
  clearProviderModuleCache(config.providerDir);
  registry = buildRegistry();
  return getCatalog();
}

module.exports = {
  DISABLED_PROVIDER_IDS,
  getRegistry,
  providersFor,
  reloadProviders,
  getCatalog,
  applyRuntimeSelection,
};
