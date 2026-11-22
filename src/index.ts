import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import { createRequire } from 'node:module';
import {
  deriveMalResolveBudgetMs,
  deriveMetadataResolveBudgetMs,
  loadAppEnv,
  deriveFleetEnv,
  type AppEnv,
} from './core/env.js';
import { ensureFleetDirs } from './core/fleetBootstrap.js';
import { GatewayStreamCache } from './core/cache.js';
import { WorkerClient } from './core/workerClient.js';
import { MetadataResolver } from './core/metadata.js';
import { createGatewayApp } from './addon/app.js';
import { UpdaterScheduler } from './core/updater/scheduler.js';
import {
  closeServer,
  createInternalServer,
  listen,
  type FleetInstance,
} from './core/internalServer.js';
import { createVegaHandlers } from './fleets/vega/worker.js';
import { createNuvioHandlers } from './fleets/nuvio/worker.js';
import { configureLoggerFromEnv, logger } from './core/logger.js';
import { installConsoleGuard } from './core/logging/consoleGuard.js';
import { StremioStream } from './addon/filters.js';

type Fleet = 'sa7' | 'nuvio' | 'vega';
const FLEET_PORTS: Record<Fleet, number> = { sa7: 7001, nuvio: 7002, vega: 7003 };
const nodeRequire = createRequire(import.meta.url);

function loadSa7Factory(): (env: NodeJS.ProcessEnv) => FleetInstance {
  const distWorker = path.resolve(process.cwd(), 'dist/fleets/sa7/worker.js');
  const srcWorker = path.resolve(process.cwd(), 'src/fleets/sa7/worker.js');
  const runningFromSource = import.meta.url.endsWith('.ts');
  const modulePath =
    runningFromSource && fs.existsSync(srcWorker)
      ? srcWorker
      : fs.existsSync(distWorker)
        ? distWorker
        : srcWorker;
  const sa7 = nodeRequire(modulePath) as {
    createSa7Handlers: (env: NodeJS.ProcessEnv) => FleetInstance;
  };
  return sa7.createSa7Handlers;
}

async function startFleets(env: AppEnv): Promise<() => Promise<void>> {
  const createSa7 = loadSa7Factory();
  const servers: http.Server[] = [];
  const disposers: Array<() => Promise<void>> = [];

  for (const fleet of Object.keys(FLEET_PORTS) as Fleet[]) {
    const port = FLEET_PORTS[fleet];
    const fleetEnv = deriveFleetEnv(env, fleet, port);
    const instance: FleetInstance =
      fleet === 'sa7'
        ? createSa7(fleetEnv)
        : fleet === 'nuvio'
          ? createNuvioHandlers(fleetEnv)
          : await createVegaHandlers(fleetEnv);
    const server = createInternalServer('127.0.0.1', instance);
    await listen(server, port, '127.0.0.1');
    servers.push(server);
    if (instance.dispose) disposers.push(instance.dispose);
    logger.info('fleet.internal_listening', { fleet, port });
  }

  return async () => {
    for (const dispose of disposers) {
      try {
        await dispose();
      } catch (error) {
        logger.debug('fleet.dispose_failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    await Promise.all(servers.map(closeServer));
  };
}

async function main(): Promise<void> {
  const env = loadAppEnv();
  configureLoggerFromEnv(env);
  const startedAt = Date.now();
  ensureFleetDirs(env);

  const uninstallConsoleGuard = installConsoleGuard({
    onSuppressed: (count) => logger.warn('console.suppressed', { count }),
  });

  logger.info('gateway.starting', {
    port: env.PORT,
    version: env.ADDON_VERSION,
    dataDir: env.DATA_DIR,
    heapLimitMb: Math.round(v8.getHeapStatistics().heap_size_limit / (1024 * 1024)),
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('process.unhandled_rejection', reason);
  });
  process.on('uncaughtException', (error) => {
    logger.error('process.uncaught_exception', {
      error: error instanceof Error ? error.message : String(error),
    });
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

  const stopFleets = await startFleets(env);
  scheduler.start();

  const metadataResolver = new MetadataResolver(env.CINEMETA_URL, env.TMDB_API_KEY, env.JIKAN_URL, {
    tmdbUrl: env.TMDB_URL,
    jikanMaxRps: env.JIKAN_MAX_RPS,
    jikanMaxRpm: env.JIKAN_MAX_RPM,
    animeApiUrl: env.ANIMEAPI_URL,
    kitsuUrl: env.KITSU_URL,
    tvmazeUrl: env.TVMAZE_URL,
    malResolveBudgetMs: deriveMalResolveBudgetMs(env),
    metadataBudgetMs: deriveMetadataResolveBudgetMs(env),
  });

  const ctx = {
    cache,
    workers,
    addonVersion: env.ADDON_VERSION,
    policyVersion: '1.0.0',
    gitCommit: env.GIT_COMMIT,
    publicBaseUrl: env.PUBLIC_BASE_URL,
    hasTmdb: Boolean(env.TMDB_API_KEY),
    maxStreams: env.MAX_STREAMS,
    globalDeadlineMs: env.GLOBAL_DEADLINE_MS,
    workerTimeoutMs: env.BACKEND_TIMEOUT_MS,
    metadataResolver,
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
    await stopFleets();
    uninstallConsoleGuard();
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
