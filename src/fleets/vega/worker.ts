import http from 'node:http';
import { createRuntime } from './runtime.js';
import { CinemetaClient } from './cinemeta/client.js';
import { TmdbClient } from './tmdb/client.js';
import { StreamPipeline } from './pipeline/streamHandler.js';
import { nativeFetch } from './util/nativeFetch.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { applyForwardedImdb, parseStreamId } from './addon/parseId.js';
import { isProviderEnabled } from '../../core/policy.js';
import { sendJson, type FleetInstance } from '../../core/internalServer.js';
import type { StremioStream } from './types.js';

export async function createVegaHandlers(fleetEnv: NodeJS.ProcessEnv): Promise<FleetInstance> {
  const port = Number(fleetEnv.PORT || 7003);
  const startedAt = Date.now();

  const config = loadConfig(fleetEnv);
  config.port = port;
  config.streamCacheTtlMs = 0;
  config.streamPartialCacheTtlMs = 0;

  const logger = createLogger(config.logLevel);

  let cinemeta: CinemetaClient | null = null;
  let pipeline: StreamPipeline | null = null;
  let runtime: Awaited<ReturnType<typeof createRuntime>> | null = null;

  runtime = await createRuntime(config, logger);
  await runtime.stateStore.load();
  await runtime.updater.preloadFromDisk();
  cinemeta = new CinemetaClient({
    baseUrl: config.cinemetaUrl,
    logger,
    fetchImpl: nativeFetch,
    timeoutMs: config.httpTimeoutMs,
  });
  const tmdb = config.tmdbApiKey
    ? new TmdbClient({
        apiKey: config.tmdbApiKey,
        baseUrl: config.tmdbUrl,
        logger,
        fetchImpl: nativeFetch,
        timeoutMs: config.httpTimeoutMs,
      })
    : null;
  pipeline = new StreamPipeline({ config, logger, registry: runtime.registry, cinemeta, tmdb });

  async function handleStream(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string,
    requestId: string,
  ): Promise<unknown> {
    const match = /^\/internal\/stream\/(movie|series)\/([^/]+)\.json$/.exec(pathname);
    if (!match) return sendJson(res, 404, { streams: [] }, requestId);

    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-cache': 'bypass',
      });
      return res.end();
    }

    const type = match[1];
    const id = decodeURIComponent(match[2]);
    let streamRequest = parseStreamId(type, id);
    if (!streamRequest || !pipeline) {
      return sendJson(res, 200, { streams: [] }, requestId);
    }

    const rawTitle = req.headers['x-meta-title'];
    const metaTitle = typeof rawTitle === 'string' && rawTitle ? decodeURIComponent(rawTitle) : undefined;
    const metaYear = req.headers['x-meta-year'] ? Number(req.headers['x-meta-year']) : undefined;
    const metaTmdb = Number(req.headers['x-meta-tmdb-id']);
    const rawImdb = req.headers['x-meta-imdb-id'];
    streamRequest = applyForwardedImdb(
      streamRequest,
      typeof rawImdb === 'string' ? rawImdb : undefined,
    );
    if (cinemeta && metaTitle && 'imdbId' in streamRequest) {
      cinemeta.prime(streamRequest.type, streamRequest.imdbId, {
        id: streamRequest.imdbId,
        type: streamRequest.type,
        name: metaTitle,
        ...(Number.isFinite(metaYear) ? { year: metaYear } : {}),
      });
    }
    if (Number.isSafeInteger(metaTmdb) && metaTmdb > 0) {
      streamRequest = { ...streamRequest, tmdbId: metaTmdb };
    }

    const controller = new AbortController();
    const abortOnClose = (): void => {
      if (!res.writableEnded) controller.abort(new Error('client disconnected'));
    };
    res.on('close', abortOnClose);
    try {
      const rawStreams = await pipeline.handle(streamRequest, controller.signal);
      const streams = Array.isArray(rawStreams) ? (rawStreams as StremioStream[]) : [];
      sendJson(res, 200, { streams }, requestId);
    } catch {
      sendJson(res, 200, { streams: [] }, requestId);
    } finally {
      res.off('close', abortOnClose);
    }
  }

  function handleHealth(req: http.IncomingMessage, res: http.ServerResponse, requestId: string): unknown {
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      return res.end();
    }

    const snapshotState = runtime?.stateStore?.get();
    const registryProviders = runtime?.registry?.listProviders() || [];
    const activeSha = snapshotState?.activeSha || 'bundled';
    const lastSuccessStr = snapshotState?.lastSuccess || new Date(startedAt).toISOString();
    const lastSuccessMs = new Date(lastSuccessStr).getTime() || startedAt;

    const pipelineMetrics = pipeline?.getMetrics();
    const reportedStats = new Map(
      (pipelineMetrics?.providerStats || []).map((s) => [s.id.toLowerCase(), s]),
    );

    const selection = {
      enabled: config.enabledProviders,
      disabled: config.disabledProviders,
    };
    const activeProviders = registryProviders.filter((bundle) =>
      isProviderEnabled(bundle.entry.value, selection),
    );

    const stats = activeProviders.map((bundle) => {
      const id = bundle.entry.value;
      const stat = reportedStats.get(id.toLowerCase());
      return {
        id,
        state: (stat?.state || 'closed') as 'closed' | 'open' | 'half-open',
        calls: stat?.calls ?? 0,
        ok: stat?.ok ?? 0,
        responded: stat?.responded ?? 0,
        empty: stat?.empty ?? 0,
        errors: stat?.errors ?? 0,
        timeouts: stat?.timeouts ?? 0,
        skipped: stat?.skipped ?? 0,
        responseRate: stat?.responseRate ?? null,
        yieldRate: stat?.yieldRate ?? null,
        avgMs: stat?.avgMs ?? null,
        lastError: stat?.lastError ?? null,
        lastSuccessAt: stat?.lastSuccessAt ?? null,
      };
    });

    const circuits = stats.reduce(
      (counts, stat) => {
        if (stat.state === 'open') counts.open += 1;
        else if (stat.state === 'half-open') counts.halfOpen += 1;
        return counts;
      },
      { open: 0, halfOpen: 0 },
    );

    const ok = activeProviders.length > 0;
    const status = snapshotState?.lastError ? 'degraded' : ok ? 'ok' : 'error';

    sendJson(
      res,
      200,
      {
        fleet: 'vega',
        ok,
        status,
        startedAt: new Date(startedAt).toISOString(),
        uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
        snapshot: {
          sha: activeSha,
          fetchedAt: lastSuccessStr,
          ageMs: Math.max(0, Date.now() - lastSuccessMs),
          refreshing: false,
          lastError: snapshotState?.lastError || null,
        },
        providers: { total: activeProviders.length, circuits, stats },
        metrics: {
          requests: pipelineMetrics?.requests ?? 0,
          cacheHits: pipelineMetrics?.cacheHits ?? 0,
          cacheMisses: pipelineMetrics?.cacheMisses ?? 0,
          emptyResults: pipelineMetrics?.emptyResults ?? 0,
          deadlineHits: pipelineMetrics?.deadlineHits ?? 0,
          settleHits: pipelineMetrics?.settleHits ?? 0,
          providerFailures: pipelineMetrics?.providerFailures ?? 0,
        },
      },
      requestId,
    );
  }

  async function handleReload(req: http.IncomingMessage, res: http.ServerResponse, requestId: string): Promise<void> {
    if (!runtime?.updater) {
      return sendJson(res, 503, { ok: false, error: 'updater unavailable' }, requestId);
    }
    try {
      await runtime.updater.runOnce('manual');
    } catch (error) {
      return sendJson(
        res,
        500,
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        requestId,
      );
    }
    return sendJson(res, 200, { ok: true, reloadedAt: new Date().toISOString() }, requestId);
  }

  return {
    port,
    internalToken: fleetEnv.INTERNAL_TOKEN || '',
    handlers: { health: handleHealth, stream: handleStream, reload: handleReload },
    dispose: async () => {
      if (runtime) await runtime.updater.stop();
    },
  };
}
