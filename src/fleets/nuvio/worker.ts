import http from 'node:http';
import { StreamPipeline } from './nuvio/pipeline.js';
import { SnapshotManager } from './nuvio/snapshot.js';
import { CinemetaClient } from './cinemeta/client.js';
import { CodebergClient } from './source/codeberg.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { parseStreamId } from './addon/parseId.js';
import { StremioStream } from './types.js';

const host = '127.0.0.1';
const port = Number(process.env.PORT || 7002);
const startedAt = Date.now();

const config = loadConfig(process.env);
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

function sendJson(res: http.ServerResponse, status: number, body: unknown, requestId?: string) {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  };
  if (requestId) headers['x-request-id'] = requestId;
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

async function handleStream(req: http.IncomingMessage, res: http.ServerResponse, pathname: string, requestId?: string) {
  const match = /^\/internal\/stream\/(movie|series)\/([^/]+)\.json$/.exec(pathname);
  if (!match) return sendJson(res, 404, { streams: [] }, requestId);

  if (req.method === 'HEAD') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-cache': 'bypass' });
    return res.end();
  }

  const type = match[1];
  const id = decodeURIComponent(match[2]);
  const streamRequest = parseStreamId(type, id);
  if (!streamRequest) {
    return sendJson(res, 200, { streams: [] }, requestId);
  }

  const controller = new AbortController();
  try {
    const rawStreams = await pipeline.handle(streamRequest, controller.signal);
    const streams = Array.isArray(rawStreams) ? (rawStreams as StremioStream[]) : [];
    sendJson(res, 200, { streams }, requestId);
  } catch {
    sendJson(res, 200, { streams: [] }, requestId);
  }
}

function handleHealth(req: http.IncomingMessage, res: http.ServerResponse, requestId?: string) {
  if (req.method === 'HEAD') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end();
  }

  const snapshot = snapshots.getSnapshot();
  const providerStats = pipeline.getProviderStats();
  const scraperIds = snapshot ? snapshot.scrapers.map((s) => s.entry.id) : [];
  const allIds = Array.from(new Set([...scraperIds, ...Object.keys(providerStats)])).sort();

  const stats = allIds.map((id) => {
    const stat = providerStats[id];
    return {
      id,
      state: 'closed' as const,
      calls: stat?.calls ?? 0,
      ok: stat?.ok ?? 0,
      empty: stat?.empty ?? 0,
      errors: stat?.errors ?? 0,
      timeouts: stat?.timeouts ?? 0,
      skipped: stat?.skipped ?? 0,
      successRate: stat?.successRate ?? null,
      avgMs: stat?.p50Ms ?? null,
      lastError: stat?.lastError ?? null,
      lastSuccessAt: null,
    };
  });

  const payload = {
    fleet: 'nuvio',
    ok: true,
    status: 'ok',
    startedAt: new Date(startedAt).toISOString(),
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    snapshot: {
      sha: snapshot?.sha || config.pinnedSha || 'bundled',
      fetchedAt: snapshot ? new Date(snapshot.fetchedAt).toISOString() : new Date(startedAt).toISOString(),
      ageMs: snapshot ? Date.now() - snapshot.fetchedAt : Date.now() - startedAt,
      refreshing: false,
      lastError: null,
    },
    providers: {
      total: allIds.length || 30,
      circuits: { open: 0, halfOpen: 0 },
      stats,
    },
    metrics: { requests: 0, successes: 0, empties: 0, timeouts: 0, errors: 0, skipped: 0, successRate: 0, failureRate: 0 },
  };

  sendJson(res, 200, payload, requestId);
}

void snapshots.ensure();

const server = http.createServer((req, res) => {
  const requestId = (req.headers['x-request-id'] as string) || '';
  const parsedUrl = new URL(req.url || '/', `http://${host}:${port}`);
  const pathname = parsedUrl.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { allow: 'GET, HEAD, POST, OPTIONS', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' });
    return res.end();
  }

  if (pathname === '/internal/health') return handleHealth(req, res, requestId);
  if (pathname.startsWith('/internal/stream/')) return handleStream(req, res, pathname, requestId);
  if (pathname === '/internal/reload' && req.method === 'POST') {
    void snapshots.refresh(true);
    return sendJson(res, 200, { ok: true, reloadedAt: new Date().toISOString() }, requestId);
  }

  sendJson(res, 404, { error: 'Not Found' }, requestId);
});

server.listen(port, host, () => {
  console.log(`[nuvio-worker] listening on http://${host}:${port}`);
});

export { server };
