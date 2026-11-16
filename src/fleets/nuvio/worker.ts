import http from 'node:http';
import { StreamPipeline } from './nuvio/pipeline.js';
import { SnapshotManager } from './nuvio/snapshot.js';
import { CinemetaClient } from './cinemeta/client.js';
import { CodebergClient } from './source/codeberg.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { parseStreamId } from './addon/parseId.js';
import { sendJson, type FleetInstance } from '../../core/internalServer.js';
import type { StremioStream } from './types.js';

export function createNuvioHandlers(fleetEnv: NodeJS.ProcessEnv): FleetInstance {
  const port = Number(fleetEnv.PORT || 7002);
  const startedAt = Date.now();

  const config = loadConfig(fleetEnv);
  config.port = port;
  config.streamCacheTtlMs = 0;
  config.streamPartialCacheTtlMs = 0;

  const logger = createLogger(config.logLevel);
  const source = new CodebergClient({
    source: config.source,
    branch: config.branch,
    logger,
    timeoutMs: config.httpTimeoutMs,
  });
  const snapshots = new SnapshotManager(config, logger, source);
  const cinemeta = new CinemetaClient({ config, logger });
  const pipeline = new StreamPipeline({ config, logger, snapshots, cinemeta });

  void snapshots.ensure();

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
    if (!streamRequest) {
      return sendJson(res, 200, { streams: [] }, requestId);
    }

    const metaTmdb = Number(req.headers['x-meta-tmdb-id']);
    if (Number.isSafeInteger(metaTmdb) && metaTmdb > 0 && 'imdbId' in streamRequest) {
      cinemeta.prime(streamRequest.type, streamRequest.imdbId, metaTmdb);
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

    const snapshot = snapshots.getSnapshot();
    const snapshotHealth = snapshots.getHealth();
    const ok = Boolean(snapshot && snapshot.scrapers.length > 0);
    const status = ok ? snapshotHealth.status : 'error';
    const providerStats = pipeline.getProviderStats();
    const scraperIds = snapshot ? snapshot.scrapers.map((s) => s.entry.id) : [];
    const allIds = Array.from(new Set([...scraperIds, ...Object.keys(providerStats)])).sort();

    const stats = allIds.map((id) => {
      const stat = providerStats[id];
      return {
        id,
        state: (stat?.state ?? 'closed') as 'closed' | 'open' | 'half-open',
        calls: stat?.calls ?? 0,
        ok: stat?.ok ?? 0,
        empty: stat?.empty ?? 0,
        errors: stat?.errors ?? 0,
        timeouts: stat?.timeouts ?? 0,
        skipped: stat?.skipped ?? 0,
        successRate: stat?.successRate ?? null,
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

    sendJson(
      res,
      200,
      {
        fleet: 'nuvio',
        ok,
        status,
        startedAt: new Date(startedAt).toISOString(),
        uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
        snapshot: {
          sha: snapshotHealth.sha || config.pinnedSha || 'bundled',
          fetchedAt: snapshotHealth.fetchedAt || new Date(startedAt).toISOString(),
          ageMs: snapshot ? Math.max(0, Date.now() - snapshot.fetchedAt) : Date.now() - startedAt,
          refreshing: snapshotHealth.refreshing,
          lastError: snapshotHealth.lastError,
        },
        providers: { total: allIds.length, circuits, stats },
        metrics: pipeline.getMetrics(),
      },
      requestId,
    );
  }

  async function handleReload(req: http.IncomingMessage, res: http.ServerResponse, requestId: string): Promise<void> {
    let refreshed: Awaited<ReturnType<typeof snapshots.refresh>> = null;
    try {
      refreshed = await snapshots.refresh(true);
    } catch (error) {
      return sendJson(
        res,
        500,
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        requestId,
      );
    }
    if (!refreshed) {
      return sendJson(res, 500, { ok: false, error: 'snapshot refresh failed' }, requestId);
    }
    return sendJson(res, 200, { ok: true, reloadedAt: new Date().toISOString() }, requestId);
  }

  return {
    port,
    internalToken: fleetEnv.INTERNAL_TOKEN || '',
    handlers: { health: handleHealth, stream: handleStream, reload: handleReload },
  };
}
