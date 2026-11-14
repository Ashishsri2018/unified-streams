const config = require('./config');
const { getRegistry, providersFor } = require('./providers');
const { tmdbIdOf } = require('./content-id');
const cinemeta = require('./cinemeta');
const { isWebPage, isExternalUrl, qualityRank, toStremioStream } = require('./format');
const {
  normalizeSubtitles,
  streamPassesFilters,
  subtitleMatchesConfig,
} = require('./filters');
const { createBreaker } = require('./lib/breaker');
const { createStreamCache } = require('./lib/stream-cache');
const { TimeoutError, withTimeout } = require('./lib/timeout');
const {
  sa7NetworkStorage,
  createTracker,
  classifyEmptyResult,
} = require('./lib/tracker');

const BLOCKER_URL_PATTERN = /\/slowdown\b/i;

function streamKey(type, contentId, season, episode) {
  return `${type}:${contentId}:${season ?? ''}:${episode ?? ''}`;
}

function validStream(stream) {
  if (!stream) return false;
  const targetUrl = stream.url || stream.externalUrl;
  if (typeof targetUrl === 'string' && targetUrl.length > 0) {
    if (BLOCKER_URL_PATTERN.test(targetUrl)) return false;
    return true;
  }
  return typeof stream.infoHash === 'string' && stream.infoHash.length > 0;
}

function normalizeStreamKey(stream) {
  if (!stream) return '';
  const targetUrl = stream.url || stream.externalUrl;
  if (typeof targetUrl === 'string' && targetUrl.length > 0) {
    try {
      const parsed = new URL(targetUrl);
      const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
      return `${parsed.protocol}//${parsed.host.toLowerCase()}${pathname}${parsed.search}`;
    } catch {
      return targetUrl.replace(/#.*$/, '').replace(/\/+$/, '');
    }
  }
  if (typeof stream.infoHash === 'string' && stream.infoHash.length > 0) {
    return `torrent:${stream.infoHash.toLowerCase()}:${stream.fileIdx || 0}`;
  }
  return '';
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function dedupe(results) {
  const seen = new Set();
  const deduped = [];

  for (const list of results) {
    for (const item of list) {
      const key = normalizeStreamKey(item.stream);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }
  }

  return deduped;
}

function createCollector({
  providersFor: providersForFn = providersFor,
  getProviders = getRegistry,
  resolveTmdbId = cinemeta.resolveTmdbId,
  getMetadataCacheStats = cinemeta.cacheStats,
  breaker = createBreaker({
    threshold: config.breakerFailureThreshold,
    cooldownMs: config.breakerCooldownMs,
  }),
  cache = createStreamCache({
    ttlMs: config.streamCacheTtlMs,
    partialTtlMs: config.streamPartialCacheTtlMs,
    maxEntries: config.streamCacheMaxEntries,
  }),
  providerTimeoutMs = config.providerTimeoutMs,
  deadlineMs = config.deadlineMs,
  minProviderTimeoutMs = 1000,
  maxPerProviderStreams = config.maxPerProviderStreams,
  maxTotalStreams = config.maxTotalStreams,
  now = Date.now,
  logger = console,
} = {}) {
  const counters = {
    requests: 0,
    emptyResults: 0,
    deadlineHits: 0,
    providerFailures: 0,
  };

  async function runProviders(contentId, type, season, episode) {
    const deadline = now() + deadlineMs;
    const mediaType = type === 'series' ? 'tv' : 'movie';
    const tmdbId = tmdbIdOf(contentId) ?? (await resolveTmdbId(contentId, type));
    if (!tmdbId) {
      logger.warn(`[streams] no TMDB id resolved for ${contentId}`);
      return [];
    }

    const timeoutMs = Math.max(
      minProviderTimeoutMs,
      Math.min(providerTimeoutMs, deadline - now())
    );
    const providers = providersForFn(mediaType);
    let partial = false;
    const results = await mapWithConcurrency(
      providers,
      config.providerConcurrency,
      async (provider) => {
        if (!breaker.attempt(provider.id)) return [];

        const started = now();
        const tracker = createTracker();
        try {
          const streams = await sa7NetworkStorage.run(tracker, () =>
            withTimeout(
              Promise.resolve().then(() =>
                provider.getStreams(String(tmdbId), mediaType, season, episode)
              ),
              timeoutMs,
              provider.id
            )
          );
          const list = (Array.isArray(streams) ? streams : [])
            .filter(validStream)
            .slice(0, maxPerProviderStreams)
            .map((stream) => ({ stream, provider }));
          const latencyMs = now() - started;
          if (list.length > 0) {
            breaker.record(provider.id, 'ok', {
              latencyMs,
            });
            logger.log(`[streams] ${provider.id} -> ${list.length} (${latencyMs}ms)`);
          } else {
            const classified = classifyEmptyResult(tracker, latencyMs, timeoutMs);
            if (classified.outcome === 'empty') {
              breaker.record(provider.id, 'empty', {
                latencyMs,
              });
            } else {
              counters.providerFailures += 1;
              breaker.record(provider.id, classified.outcome, {
                latencyMs,
                error: new Error(classified.lastError || 'provider failed'),
              });
              logger.warn(`[streams] ${provider.id} failed (${classified.outcome}): ${classified.lastError}`);
            }
          }
          return list;
        } catch (err) {
          const deadlineExpired = now() >= deadline;
          const outcome =
            err instanceof TimeoutError && deadlineExpired
              ? 'skipped'
              : err instanceof TimeoutError
                ? 'timeout'
                : 'error';
          if (outcome !== 'skipped') counters.providerFailures += 1;
          breaker.record(provider.id, outcome, {
            latencyMs: now() - started,
            error: err,
          });
          if (outcome === 'skipped') {
            partial = true;
            logger.warn(`[streams] ${provider.id} skipped at the global deadline`);
          } else if (outcome === 'timeout') {
            partial = true;
            logger.warn(`[streams] ${provider.id} timed out after ${timeoutMs}ms`);
          } else {
            logger.warn(`[streams] ${provider.id} failed: ${err.message}`);
          }
          return [];
        }
      },
    );

    const deadlineHit = now() >= deadline;
    if (deadlineHit) counters.deadlineHits += 1;
    return { value: dedupe(results), partial: partial || deadlineHit };
  }

  async function collectStreams(contentId, type, season, episode, userConfig = null) {
    counters.requests += 1;
    const key = streamKey(type, contentId, season, episode);
    const raw = await cache.getOrLoad(key, () =>
      runProviders(contentId, type, season, episode)
    );

    const filtered = raw
      .map((item) => ({ ...item, rank: qualityRank(item.stream) }))
      .filter((item) => streamPassesFilters(item.stream, userConfig));

    filtered.sort((a, b) => {
      const aIsExt = isExternalUrl(a.stream.url || a.stream.externalUrl, a.stream) ? 1 : 0;
      const bIsExt = isExternalUrl(b.stream.url || b.stream.externalUrl, b.stream) ? 1 : 0;
      if (aIsExt !== bIsExt) return aIsExt - bIsExt;

      const byQuality = a.rank - b.rank;
      if (byQuality !== 0) return byQuality;
      const byHealth = breaker.score(b.provider.id) - breaker.score(a.provider.id);
      if (byHealth !== 0) return byHealth;
      return a.provider.order - b.provider.order;
    });

    const streams = filtered
      .map((item) => toStremioStream(item.stream, item.provider))
      .filter(Boolean)
      .slice(0, maxTotalStreams);
    if (streams.length === 0) counters.emptyResults += 1;
    return streams;
  }

  async function collectSubtitles(contentId, type, season, episode, userConfig = null) {
    counters.requests += 1;
    const key = streamKey(type, contentId, season, episode);
    const raw = await cache.getOrLoad(key, () =>
      runProviders(contentId, type, season, episode)
    );

    const seen = new Set();
    const subtitles = [];
    for (const item of raw) {
      for (const track of normalizeSubtitles(item.stream.subtitles)) {
        if (seen.has(track.url)) continue;
        if (!subtitleMatchesConfig(track, userConfig)) continue;
        seen.add(track.url);
        subtitles.push(track);
      }
    }
    return subtitles;
  }

  function getRuntimeStats() {
    const registry = getProviders();
    const seen = new Map(breaker.snapshot().map((entry) => [entry.id, entry]));
    const providers = registry.map((provider) => {
      const entry = seen.get(provider.id);
      if (entry) return { name: provider.name, ...entry };
      return {
        id: provider.id,
        name: provider.name,
        state: 'closed',
        calls: 0,
        ok: 0,
        empty: 0,
        errors: 0,
        timeouts: 0,
        skipped: 0,
        consecutiveFailures: 0,
        lastMs: null,
        avgMs: null,
        maxMs: 0,
        score: 0.5,
        lastError: null,
        lastSuccessAt: null,
        openedAt: null,
      };
    });

    const streamCache = cache.stats();
    return {
      circuits: breaker.summary(registry.map((provider) => provider.id)),
      providers,
      streamCache,
      metadataCache:
        typeof getMetadataCacheStats === 'function' ? getMetadataCacheStats() : null,
      metrics: {
        requests: counters.requests,
        cacheHits: streamCache.hits,
        cacheMisses: streamCache.misses,
        emptyResults: counters.emptyResults,
        deadlineHits: counters.deadlineHits,
        settleHits: 0,
        providerFailures: counters.providerFailures,
      },
    };
  }

  return { collectStreams, collectSubtitles, getRuntimeStats };
}

const defaultCollector = createCollector();

module.exports = {
  createCollector,
  collectStreams: defaultCollector.collectStreams,
  collectSubtitles: defaultCollector.collectSubtitles,
  getRuntimeStats: defaultCollector.getRuntimeStats,
  normalizeStreamKey,
  dedupe,
};
