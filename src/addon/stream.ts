import { Request, Response } from 'express';
import { parseContentId } from '../core/contentId.js';
import { decodeUserConfig, toFilterConfig } from './userConfig.js';
import { GatewayStreamCache } from '../core/cache.js';
import { WorkerClient } from '../core/workerClient.js';
import { mergeAndFilterStreams, FleetStreamsInput } from './merge.js';
import { StremioStream } from './filters.js';
import { logger } from '../core/logger.js';

export interface StreamHandlerContext {
  cache: GatewayStreamCache<{ streams: StremioStream[] }>;
  workers: Record<'sa7' | 'nuvio' | 'vega', WorkerClient>;
  addonVersion: string;
  policyVersion: string;
  maxStreams: number;
  globalDeadlineMs: number;
  workerTimeoutMs: number;
}

// Beamup's Cloudflare zone enforces a 4h Browser Cache TTL and raises any
// lower origin max-age. `private` is preserved for browsers, while
// Cloudflare-CDN-Cache-Control keeps edge caching at the intended TTL.
function setStreamCacheHeaders(res: Response, maxAge: number): void {
  res.setHeader('Cache-Control', `private, max-age=${maxAge}`);
  res.setHeader('Cloudflare-CDN-Cache-Control', `public, max-age=${maxAge}`);
}

export async function handleStreamRoute(
  req: Request,
  res: Response,
  ctx: StreamHandlerContext,
): Promise<void> {
  const rawType = req.params.type;
  const rawId = req.params.id;
  const requestId = (req.headers['x-request-id'] as string) || `req-${Date.now()}`;

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
    setStreamCacheHeaders(res, 180);
    res.setHeader('X-Cache', 'bypass');
    res.status(200).end();
    return;
  }

  const rawConfig = req.params.config || '';
  const userConfig = decodeUserConfig(rawConfig);
  const filterConfig = toFilterConfig(userConfig);

  const cacheKey = `${rawConfig}:${rawType}:${rawId}:${ctx.policyVersion}:${ctx.addonVersion}`;

  try {
    const { value, isPartial, hit } = await ctx.cache.coalesce(cacheKey, async () => {
      const selectedFleets = userConfig.backends.filter((b) => ctx.workers[b]);
      const workerTimeoutMs = Math.min(ctx.workerTimeoutMs, ctx.globalDeadlineMs);
      const fleetPromises = selectedFleets.map(async (fleetName) => {
        const worker = ctx.workers[fleetName];
        const resStream = await worker.fetchStream(rawType, rawId, rawConfig, workerTimeoutMs, requestId);
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

    const maxAge = isPartial ? 30 : 180;
    setStreamCacheHeaders(res, maxAge);
    res.setHeader('X-Cache', hit ? 'hit' : 'miss');

    res.status(200).json(value);
  } catch (err) {
    logger.error('stream_handler_failed', err, { requestId, type: rawType, id: rawId });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ streams: [] });
  }
}
