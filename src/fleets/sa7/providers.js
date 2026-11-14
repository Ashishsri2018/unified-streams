const fs = require('fs');
const path = require('path');
const Module = require('module');
const config = require('./config');

if (!Module._cheerioHooked) {
  Module._cheerioHooked = true;
  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === 'cheerio-without-node-native') {
      return origResolve.call(this, 'cheerio', parent, isMain, options);
    }
    return origResolve.call(this, request, parent, isMain, options);
  };
}

let registry = null;

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
  const disabled = new Set([
    ...DISABLED_PROVIDER_IDS,
    ...(config.disabledProviders || []),
  ]);
  const entries = (manifest.providers || []).filter(
    (p) => p.enabled !== false && !disabled.has(p.id.toLowerCase())
  );

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

  const disabledList = [...disabled].join(', ') || 'none';
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
