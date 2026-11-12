import { Request, Response } from 'express';
import {
  GatewayHealth,
  HealthStatus,
  WorkerHealth,
  AggregateProvidersReport,
  AggregateProviderMetric,
  ComponentHealthInfo,
} from '../core/telemetry.js';
import { StreamHandlerContext } from './stream.js';
import { logger } from '../core/logger.js';

export function aggregateFleetProviders(
  fleets: Record<string, WorkerHealth | { error: string }>,
  startedAt: number,
): {
  providers: AggregateProvidersReport;
  components: ComponentHealthInfo[];
} {
  const components: ComponentHealthInfo[] = [];
  const stats: AggregateProviderMetric[] = [];
  let totalProviders = 0;
  let open = 0;
  let halfOpen = 0;

  for (const [name, fleetHealth] of Object.entries(fleets)) {
    const isError = 'error' in fleetHealth;
    const ok = !isError && Boolean(fleetHealth.ok);
    const uptimeSec = !isError && typeof fleetHealth.uptimeSec === 'number'
      ? fleetHealth.uptimeSec
      : Math.floor((Date.now() - startedAt) / 1000);

    components.push({
      name,
      displayName: name.toUpperCase(),
      ok,
      latencyMs: null,
      health: fleetHealth,
      process: {
        running: ok,
        uptimeSec,
        restarts: 0,
      },
      error: isError ? fleetHealth.error : undefined,
    });

    if (!isError && fleetHealth.providers) {
      totalProviders += fleetHealth.providers.total || 0;
      open += fleetHealth.providers.circuits?.open || 0;
      halfOpen += fleetHealth.providers.circuits?.halfOpen || 0;

      if (Array.isArray(fleetHealth.providers.stats)) {
        for (const stat of fleetHealth.providers.stats) {
          stats.push({
            component: name,
            id: stat.id,
            state: stat.state || 'closed',
            calls: stat.calls ?? 0,
            ok: stat.ok ?? 0,
            empty: stat.empty ?? 0,
            errors: stat.errors ?? 0,
            timeouts: stat.timeouts ?? 0,
            skipped: stat.skipped ?? 0,
            successRate: stat.successRate ?? null,
            avgMs: stat.avgMs ?? null,
            lastError: stat.lastError ?? null,
          });
        }
      }
    }
  }

  stats.sort((a, b) => {
    const comp = a.component.localeCompare(b.component);
    return comp !== 0 ? comp : a.id.localeCompare(b.id);
  });

  return {
    providers: {
      total: totalProviders,
      circuits: { open, halfOpen },
      stats,
    },
    components,
  };
}

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
  const { providers, components } = aggregateFleetProviders(fleets, startedAt);

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
    providers,
    components,
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
