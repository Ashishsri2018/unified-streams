import { Request, Response } from 'express';
import {
  GatewayHealth,
  HealthStatus,
  WorkerHealth,
  AggregateProvidersReport,
  AggregateProviderMetric,
  ComponentHealthInfo,
  WorkerSnapshot,
} from '../core/telemetry.js';
import { StreamHandlerContext } from './stream.js';
import { logger } from '../core/logger.js';

export function aggregateFleetProviders(
  fleets: Record<string, WorkerHealth | { error: string }>,
  startedAt: number,
  latencies?: Record<string, number>,
  updater?: Record<string, WorkerSnapshot>,
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
    const workerOk = !isError && Boolean(fleetHealth.ok);
    const uptimeSec = !isError && typeof fleetHealth.uptimeSec === 'number'
      ? fleetHealth.uptimeSec
      : Math.floor((Date.now() - startedAt) / 1000);

    const providerTotal = !isError && fleetHealth.providers ? (fleetHealth.providers.total || 0) : 0;
    const snapshotError = !isError && fleetHealth.snapshot ? fleetHealth.snapshot.lastError : null;
    const fleetUpdater = updater ? updater[name] : undefined;
    const updaterError = fleetUpdater?.lastError || null;
    const circuitsOpen = !isError && fleetHealth.providers?.circuits ? fleetHealth.providers.circuits.open : 0;

    let status: 'ok' | 'degraded' | 'error';
    let errorMessage: string | undefined;

    if (isError || !workerOk || providerTotal === 0) {
      status = 'error';
      errorMessage = isError
        ? fleetHealth.error
        : providerTotal === 0
          ? 'No providers available'
          : 'Worker reported error';
    } else if (updaterError || snapshotError || fleetHealth.status === 'degraded' || (circuitsOpen > 0 && circuitsOpen >= providerTotal)) {
      status = 'degraded';
      errorMessage = updaterError
        ? `Updater: ${updaterError}`
        : snapshotError
          ? `Snapshot: ${snapshotError}`
          : fleetHealth.status === 'degraded'
            ? 'Fleet degraded'
            : 'All provider circuits open';
    } else {
      status = 'ok';
    }

    components.push({
      name,
      displayName: name.toUpperCase(),
      ok: status === 'ok' || status === 'degraded',
      status,
      latencyMs: latencies ? (latencies[name] ?? null) : null,
      health: fleetHealth,
      process: {
        running: !isError && workerOk,
        uptimeSec,
        restarts: 0,
      },
      updater: fleetUpdater,
      error: errorMessage,
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
    const start = Date.now();
    const res = await worker.getHealth(2000);
    const latencyMs = Date.now() - start;
    return [fleet, res, latencyMs] as const;
  });

  const fleetEntries = await Promise.all(fleetHealthPromises);
  const fleets: Record<string, WorkerHealth | { error: string }> = {};
  const latencies: Record<string, number> = {};
  for (const [fleet, res, latencyMs] of fleetEntries) {
    fleets[fleet] = res;
    latencies[fleet] = latencyMs;
  }

  const updater = ctx.scheduler
    ? {
        sa7: ctx.scheduler.getStatus('sa7'),
        nuvio: ctx.scheduler.getStatus('nuvio'),
        vega: ctx.scheduler.getStatus('vega'),
      }
    : {};

  const { providers, components } = aggregateFleetProviders(fleets, startedAt, latencies, updater);

  const isDegraded = components.some((c) => c.status !== 'ok');
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
    providers,
    components,
    updater: ctx.scheduler
      ? {
          sa7: ctx.scheduler.getStatus('sa7'),
          nuvio: ctx.scheduler.getStatus('nuvio'),
          vega: ctx.scheduler.getStatus('vega'),
        }
      : {},
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
