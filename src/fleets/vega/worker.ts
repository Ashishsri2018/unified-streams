import http from 'node:http';
import { createRuntime } from './runtime.js';
import { CinemetaClient } from './cinemeta/client.js';
import { TmdbClient } from './tmdb/client.js';
import { StreamPipeline } from './pipeline/streamHandler.js';
import { nativeFetch } from './util/nativeFetch.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { parseStreamId } from './addon/parseId.js';
import { StremioStream } from './types.js';

const host = '127.0.0.1';
const port = Number(process.env.PORT || 7003);
const startedAt = Date.now();

const config = loadConfig(process.env);
config.port = port;
config.streamCacheTtlMs = 0;
config.streamPartialCacheTtlMs = 0;

const logger = createLogger(config.logLevel);

let pipeline: StreamPipeline | null = null;
let runtime: Awaited<ReturnType<typeof createRuntime>> | null = null;

async function initVega() {
  runtime = await createRuntime(config, logger);
  await runtime.stateStore.load();
  await runtime.updater.preloadFromDisk();
  const cinemeta = new CinemetaClient({ baseUrl: config.cinemetaUrl, logger, fetchImpl: nativeFetch, timeoutMs: config.httpTimeoutMs });
  const tmdb = config.tmdbApiKey ? new TmdbClient({ apiKey: config.tmdbApiKey, baseUrl: config.tmdbUrl, logger, fetchImpl: nativeFetch, timeoutMs: config.httpTimeoutMs }) : null;
  pipeline = new StreamPipeline({ config, logger, registry: runtime.registry, cinemeta, tmdb });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown, requestId?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
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
  if (!streamRequest || !pipeline) {
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

  const snapshotState = runtime?.stateStore?.get();
  const registryProviders = runtime?.registry?.listProviders() || [];
  const activeSha = snapshotState?.activeSha || 'bundled';
  const lastSuccessStr = snapshotState?.lastSuccess || new Date(startedAt).toISOString();
  const lastSuccessMs = new Date(lastSuccessStr).getTime() || startedAt;

  const pipelineMetrics = pipeline?.getMetrics();
  const reportedStats = new Map(
    (pipelineMetrics?.providerStats || []).map((s) => [s.id, s]),
  );

  const disabled = new Set((config.disabledProviders || []).map((p) => p.toLowerCase()));
  const activeProviders = registryProviders.filter(
    (b) => !disabled.has(b.entry.value.toLowerCase()),
  );

  const stats = activeProviders.map((b) => {
    const id = b.entry.value;
    const stat = reportedStats.get(id);
    return {
      id,
      state: (stat?.state || 'closed') as 'closed' | 'open' | 'half-open',
      calls: stat?.calls ?? 0,
      ok: stat?.ok ?? 0,
      empty: stat?.empty ?? 0,
      errors: stat?.errors ?? 0,
      timeouts: stat?.timeouts ?? 0,
      skipped: stat?.skipped ?? 0,
      successRate: stat?.successRate ?? null,
      avgMs: stat?.avgMs ?? null,
      lastError: stat?.lastError ?? null,
      lastSuccessAt: null,
    };
  });

  const payload = {
    fleet: 'vega',
    ok: true,
    status: 'ok',
    startedAt: new Date(startedAt).toISOString(),
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    snapshot: {
      sha: activeSha,
      fetchedAt: lastSuccessStr,
      ageMs: Math.max(0, Date.now() - lastSuccessMs),
      refreshing: false,
      lastError: snapshotState?.lastError || null,
    },
    providers: { total: activeProviders.length, circuits: { open: 0, halfOpen: 0 }, stats },
    metrics: {
      requests: pipelineMetrics?.requests ?? 0,
      successes: 0,
      empties: pipelineMetrics?.emptyResults ?? 0,
      timeouts: 0,
      errors: pipelineMetrics?.providerFailures ?? 0,
      skipped: 0,
      successRate: 0,
      failureRate: 0,
    },
  };

  sendJson(res, 200, payload, requestId);
}

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
    void runtime?.updater?.runOnce('manual');
    return sendJson(res, 200, { ok: true, reloadedAt: new Date().toISOString() }, requestId);
  }

  sendJson(res, 404, { error: 'Not Found' }, requestId);
});

void initVega().then(() => {
  server.listen(port, host, () => {
    console.log(`[vega-worker] listening on http://${host}:${port}`);
  });
});

export { server };
