import http from 'node:http';
import { loadAppEnv } from './core/env.js';
import { GatewayStreamCache } from './core/cache.js';
import { WorkerClient } from './core/workerClient.js';
import { createGatewayApp } from './addon/app.js';
import { UpdaterScheduler } from './core/updater/scheduler.js';
import { Supervisor } from './supervisor.js';
import { logger } from './core/logger.js';
import { StremioStream } from './addon/filters.js';

async function main(): Promise<void> {
  const env = loadAppEnv();
  const startedAt = Date.now();

  logger.info('gateway.starting', {
    port: env.PORT,
    version: env.ADDON_VERSION,
    dataDir: env.DATA_DIR,
  });

  const cache = new GatewayStreamCache<{ streams: StremioStream[] }>({
    fullTtlMs: env.CACHE_TTL_MS,
    partialTtlMs: env.CACHE_PARTIAL_TTL_MS,
    maxEntries: 5000,
  });

  const workers = {
    sa7: new WorkerClient({ fleet: 'sa7', baseUrl: env.SA7_INTERNAL_URL, internalToken: env.INTERNAL_TOKEN }),
    nuvio: new WorkerClient({ fleet: 'nuvio', baseUrl: env.NUVIO_INTERNAL_URL, internalToken: env.INTERNAL_TOKEN }),
    vega: new WorkerClient({ fleet: 'vega', baseUrl: env.VEGA_INTERNAL_URL, internalToken: env.INTERNAL_TOKEN }),
  };

  const scheduler = new UpdaterScheduler(workers, {
    dataDir: env.DATA_DIR,
    minHours: env.UPDATE_INTERVAL_MIN_HOURS,
    maxHours: env.UPDATE_INTERVAL_MAX_HOURS,
    githubToken: env.GITHUB_TOKEN,
    updateOnStart: env.UPDATE_ON_START,
  });

  const supervisor = new Supervisor(env);
  supervisor.start();
  scheduler.start();

  const ctx = {
    cache,
    workers,
    addonVersion: env.ADDON_VERSION,
    policyVersion: '1.0.0',
    maxStreams: env.MAX_STREAMS,
    globalDeadlineMs: env.GLOBAL_DEADLINE_MS,
    workerTimeoutMs: env.BACKEND_TIMEOUT_MS,
    scheduler,
  };

  const app = createGatewayApp(ctx, startedAt);
  const server = http.createServer(app);

  server.listen(env.PORT, () => {
    logger.info('gateway.ready', { port: env.PORT, url: `http://localhost:${env.PORT}` });
  });

  const shutdown = async (signal: string) => {
    logger.info('gateway.shutting_down', { signal });
    server.close();
    scheduler.stop();
    await supervisor.stop();
    await logger.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[fatal] Startup failed:', err);
  process.exit(1);
});
