import { Request, Response } from 'express';
import { GatewayHealth, HealthStatus } from '../core/telemetry.js';
import { StreamHandlerContext } from './stream.js';
import { logger } from '../core/logger.js';

export async function buildHealthReport(ctx: StreamHandlerContext, startedAt: number): Promise<GatewayHealth> {
  const fleetHealthPromises = (['sa7', 'nuvio', 'vega'] as const).map(async (fleet) => {
    const worker = ctx.workers[fleet];
    const res = await worker.getHealth(2000);
    return [fleet, res] as const;
  });

  const fleetEntries = await Promise.all(fleetHealthPromises);
  const fleets = Object.fromEntries(fleetEntries);

  const isDegraded = Object.values(fleets).some((f) => 'error' in f || !f.ok);
  const status: HealthStatus = isDegraded ? 'degraded' : 'ok';

  const cacheStats = ctx.cache.getStats();
  const queueMetrics = logger.getQueueMetrics();

  return {
    ok: !isDegraded,
    status,
    addon: 'Unified Streams',
    version: ctx.addonVersion,
    commit: process.env.GIT_COMMIT || 'development',
    startedAt: new Date(startedAt).toISOString(),
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    checkedAt: new Date().toISOString(),
    cache: {
      stream: cacheStats,
      metadata: { hits: 0, misses: 0, size: 0, maxEntries: 5000 },
    },
    fleets,
    updater: {},
    sink: {
      queueDepth: logger.getQueueDepth(),
      dropped: queueMetrics.dropped,
      batchesSent: queueMetrics.batchesSent,
      batchesFailed: queueMetrics.batchesFailed,
    },
    metrics: {
      requests: cacheStats.hits + cacheStats.misses,
      cacheHits: cacheStats.hits,
      cacheMisses: cacheStats.misses,
      emptyResults: cacheStats.emptySkips,
      deadlineHits: 0,
    },
  };
}

export async function handleHealth(
  req: Request,
  res: Response,
  ctx: StreamHandlerContext,
  startedAt: number,
): Promise<void> {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }

  const report = await buildHealthReport(ctx, startedAt);
  const httpStatus = report.status === 'error' ? 503 : 200;
  res.status(httpStatus).json(report);
}

export async function handleStats(
  req: Request,
  res: Response,
  ctx: StreamHandlerContext,
  startedAt: number,
): Promise<void> {
  // Stats returns the same canonical telemetry as health
  await handleHealth(req, res, ctx, startedAt);
}
