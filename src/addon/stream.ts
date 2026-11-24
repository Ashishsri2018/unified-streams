import { Request, Response } from 'express';
import { canonicalIdSuffix, parseContentId } from '../core/contentId.js';
import { decodeUserConfig, toFilterConfig } from './userConfig.js';
import { GatewayStreamCache } from '../core/cache.js';
import { WorkerClient } from '../core/workerClient.js';
import { mergeAndFilterStreams, FleetStreamsInput } from './merge.js';
import { StremioStream } from './filters.js';
import { logger } from '../core/logger.js';
import type { WorkerSnapshot } from '../core/telemetry.js';
import type { MetadataResolver } from '../core/metadata.js';
import type { ForwardedMetadata } from '../core/contract.js';
import type { ProviderOverridesStore } from '../core/providerOverrides.js';
import type { RemoteSettingsClient } from '../core/remoteSettings.js';

export interface AdminRuntimeSettings {
  instanceProfile: string;
  backendTimeoutMs: number;
  globalDeadlineMs: number;
  searchTimeoutMs: number;
  scraperConcurrency: number;
  sa7Concurrency: number;
  circuitFailureThreshold: number;
  circuitCooldownMs: number;
}

export interface StreamHandlerContext {
  cache: GatewayStreamCache<{ streams: StremioStream[] }>;
  workers: Record<'sa7' | 'nuvio' | 'vega', WorkerClient>;
  addonVersion: string;
  policyVersion: string;
  getPolicyVersion?: () => string;
  gitCommit?: string;
  publicBaseUrl?: string;
  hasTmdb?: boolean;
  maxStreams: number;
  globalDeadlineMs: number;
  workerTimeoutMs: number;
  metadataResolver?: MetadataResolver;
  scheduler?: {
    getStatus(fleet: 'sa7' | 'nuvio' | 'vega'): WorkerSnapshot;
  };
  adminToken?: string;
  overridesStore?: ProviderOverridesStore;
  remoteSettings?: RemoteSettingsClient;
  adminSettings?: AdminRuntimeSettings;
}

function sanitizeRequestId(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  if (/^[A-Za-z0-9._:-]{1,128}$/.test(raw)) return raw;
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Stream responses must not be cached by Cloudflare or browsers. Cloudflare is
// used for log delivery only; caching stays in the gateway.
function setStreamCacheHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
}

export async function handleStreamRoute(
  req: Request,
  res: Response,
  ctx: StreamHandlerContext,
): Promise<void> {
  const rawType = req.params.type;
  const rawId = req.params.id;
  const requestId = sanitizeRequestId(req.headers['x-request-id']);

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Request-Id', requestId);

  // Validate type
  if (rawType !== 'movie' && rawType !== 'series') {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ streams: [] });
    return;
  }

  // Parse content ID
  const parsedId = parseContentId(rawType, rawId);
  if (!parsedId) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ streams: [] });
    return;
  }

  // Handle HEAD requests without provider fan-out
  if (req.method === 'HEAD') {
    setStreamCacheHeaders(res);
    res.setHeader('X-Cache', 'bypass');
    res.status(200).end();
    return;
  }

  const rawConfig = req.params.config || '';
  const userConfig = decodeUserConfig(rawConfig);
  const filterConfig = toFilterConfig(userConfig);

  const requestController = new AbortController();
  const deadlineAt = Date.now() + Math.max(1, ctx.globalDeadlineMs);
  res.on('close', () => {
    if (!res.writableEnded) requestController.abort(new Error('client disconnected'));
  });

  const requiresCanonicalRewrite =
    parsedId.family === 'mal' || parsedId.family === 'kitsu' || parsedId.family === 'tvdb';

  // Resolve canonical metadata once before the cache lookup so equivalent
  // IMDb/TMDB/MAL/Kitsu/TVDB requests share a single cache entry and every
  // worker receives both ids when they are available.
  let forwardedMeta: ForwardedMetadata | undefined;
  let forwardId = rawId;
  if (parsedId.family === 'tmdb') {
    const numericTmdb = Number(parsedId.cleanId.slice('tmdb:'.length));
    if (Number.isSafeInteger(numericTmdb) && numericTmdb > 0) {
      forwardedMeta = { tmdbId: numericTmdb };
    }
  } else if (parsedId.family === 'tt') {
    forwardedMeta = { imdbId: parsedId.cleanId };
  }

  if (ctx.metadataResolver) {
    try {
      const resolved = await ctx.metadataResolver.resolveContent(
        rawType,
        parsedId,
        requestController.signal,
      );
      if (resolved) {
        forwardedMeta = {
          title: resolved.title,
          year: resolved.year,
          tmdbId: resolved.tmdbId ?? forwardedMeta?.tmdbId,
          imdbId: resolved.imdbId ?? forwardedMeta?.imdbId,
        };
        if (requiresCanonicalRewrite) {
          const suffix = canonicalIdSuffix(parsedId);
          if (resolved.imdbId) {
            forwardId = `${resolved.imdbId}${suffix}`;
          } else if (resolved.tmdbId && resolved.tmdbId > 0) {
            forwardId = `tmdb:${resolved.tmdbId}${suffix}`;
          }
        }
      }
    } catch {
      // Proceed with existing metadata on resolver error
    }
  }

  if (requestController.signal.aborted) {
    setStreamCacheHeaders(res);
    res.setHeader('X-Cache', 'bypass');
    res.status(200).json({ streams: [] });
    return;
  }

  if (requiresCanonicalRewrite && forwardId === rawId) {
    setStreamCacheHeaders(res);
    res.setHeader('X-Cache', 'bypass');
    res.status(200).json({ streams: [] });
    return;
  }

  const idSuffix = canonicalIdSuffix(parsedId);
  const canonicalId = forwardedMeta?.imdbId
    ? `${forwardedMeta.imdbId}${idSuffix}`
    : forwardedMeta?.tmdbId && forwardedMeta.tmdbId > 0
      ? `tmdb:${forwardedMeta.tmdbId}${idSuffix}`
      : rawId;
  const policyVersion = ctx.getPolicyVersion?.() ?? ctx.policyVersion;
  const cacheKey = `${rawConfig}:${rawType}:${canonicalId}:${policyVersion}:${ctx.addonVersion}`;

  try {
    const { value, hit } = await ctx.cache.coalesce(cacheKey, async () => {
      const selectedFleets = userConfig.backends.filter((b) => ctx.workers[b]);
      const remainingMs = Math.max(1, deadlineAt - Date.now());
      const workerTimeoutMs = Math.min(ctx.workerTimeoutMs, remainingMs);
      const fleetPromises = selectedFleets.map(async (fleetName) => {
        const worker = ctx.workers[fleetName];
        const resStream = await worker.fetchStream(
          rawType,
          forwardId,
          rawConfig,
          workerTimeoutMs,
          requestId,
          forwardedMeta,
          requestController.signal,
        );
        return { fleet: fleetName, streams: resStream.streams, outcome: resStream.outcome };
      });

      const results = await Promise.all(fleetPromises);
      const isAnyPartial = results.some((r) => r.outcome === 'timeout' || r.outcome === 'error');

      const inputs: FleetStreamsInput[] = results.map((r) => ({ fleet: r.fleet, streams: r.streams }));
      const merged = mergeAndFilterStreams(inputs, filterConfig, ctx.maxStreams);

      return {
        value: { streams: merged },
        isPartial: isAnyPartial && merged.length > 0,
      };
    });

    setStreamCacheHeaders(res);
    res.setHeader('X-Cache', hit ? 'hit' : 'miss');

    res.status(200).json(value);
  } catch (err) {
    logger.error('stream_handler_failed', err, { requestId, type: rawType, id: rawId });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ streams: [] });
  }
}
