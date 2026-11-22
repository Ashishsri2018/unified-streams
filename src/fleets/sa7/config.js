const fs = require('fs');
const path = require('path');

const bundledRoot = path.join(__dirname, 'vendor', 'cb-providers');

function resolvePath(candidate, fallback) {
  if (typeof candidate === 'string' && candidate.length > 0 && fs.existsSync(candidate)) {
    return candidate;
  }
  return fallback;
}

function envInt(env, name, fallback, min) {
  const raw = env[name];
  if (raw == null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  const floored = Math.floor(value);
  return floored >= min ? floored : fallback;
}

function envList(env, primary, secondary) {
  return String(env[primary] || env[secondary] || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function createConfig(env = process.env) {
  return {
    host: env.HOST || '0.0.0.0',
    port: Number(env.PORT || 7000),
    addonName: env.ADDON_NAME || 'CB Providers',
    providerManifest: resolvePath(
      env.PROVIDER_MANIFEST,
      path.join(bundledRoot, 'manifest.json'),
    ),
    providerDir: resolvePath(
      env.PROVIDER_DIR,
      path.join(bundledRoot, 'providers'),
    ),
    snapshotFile: env.SA7_SNAPSHOT_FILE || '',
    providerTimeoutMs: Number(env.PROVIDER_TIMEOUT_MS || 20000),
    deadlineMs: Number(env.ADDON_DEADLINE_MS || 25000),
    breakerFailureThreshold: envInt(env, 'BREAKER_FAILURE_THRESHOLD', 3, 1),
    breakerCooldownMs: envInt(env, 'BREAKER_COOLDOWN_MS', 300000, 0),
    streamCacheTtlMs: envInt(env, 'STREAM_CACHE_TTL_MS', 180000, 0),
    streamPartialCacheTtlMs: envInt(env, 'STREAM_PARTIAL_CACHE_TTL_MS', 30000, 0),
    streamCacheMaxEntries: envInt(env, 'STREAM_CACHE_MAX_ENTRIES', 500, 0),
    tmdbCacheMaxEntries: envInt(env, 'TMDB_CACHE_MAX_ENTRIES', 5000, 1),
    maxPerProviderStreams: envInt(env, 'MAX_PER_PROVIDER_STREAMS', 100, 1),
    maxTotalStreams: envInt(env, 'MAX_TOTAL_STREAMS', 1000, 1),
    providerConcurrency: envInt(env, 'PROVIDER_CONCURRENCY', 30, 1),
    enabledProviders: envList(env, 'ENABLED_PROVIDERS', 'SA7_ENABLED_PROVIDERS'),
    disabledProviders: envList(env, 'DISABLED_PROVIDERS', 'SA7_DISABLED_PROVIDERS'),
    cinemetaUrl: (env.CINEMETA_URL || 'https://v3-cinemeta.strem.io').replace(/\/$/, ''),
    tmdbUrl: (env.TMDB_URL || 'https://api.themoviedb.org/3').replace(/\/$/, ''),
    tmdbApiKey: env.TMDB_API_KEY || '',
  };
}

const config = createConfig();

module.exports = config;
module.exports.createConfig = createConfig;
module.exports.apply = function apply(env) {
  const next = createConfig(env);
  for (const key of Object.keys(next)) {
    config[key] = next[key];
  }
  return config;
};
