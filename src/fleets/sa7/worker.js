'use strict';

const http = require('node:http');
const path = require('node:path');
const { getRegistry, reloadProviders } = require('./providers');
const { collectStreams, getRuntimeStats } = require('./streams');
const { parseContentId, toContentId } = require('./content-id');
const { buildStatus } = require('./telemetry');

const host = '127.0.0.1';
const port = Number(process.env.PORT || 7001);
const startedAt = Date.now();

function sendJson(res, status, body, requestId) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  };
  if (requestId) headers['x-request-id'] = requestId;
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function handleHealth(req, res, requestId) {
  if (req.method === 'HEAD') {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    return res.end();
  }

  const runtime = getRuntimeStats();
  const payload = buildStatus({
    addon: 'sa7',
    startedAt: new Date(startedAt).toISOString(),
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    status: 'ok',
    snapshot: {
      sha: process.env.SA7_SNAPSHOT_SHA || 'bundled',
      fetchedAt: new Date(startedAt).toISOString(),
      ageMs: Date.now() - startedAt,
      refreshing: false,
      lastError: null,
    },
    providers: {
      total: getRegistry().length,
      circuits: runtime.circuits || { open: 0, halfOpen: 0 },
      stats: runtime.providers || [],
    },
    cache: {
      stream: { enabled: false, hits: 0, misses: 0, size: 0, maxEntries: 0, ttlMs: 0, partialTtlMs: 0 },
      metadata: runtime.metadataCache || null,
    },
    metrics: runtime.metrics || {},
  });

  sendJson(res, 200, payload, requestId);
}

async function handleStream(req, res, urlPath, query, requestId) {
  // /internal/stream/:type/:id.json
  const match = /^\/internal\/stream\/(movie|series)\/([^/]+)\.json$/.exec(urlPath);
  if (!match) {
    return sendJson(res, 404, { streams: [] }, requestId);
  }

  if (req.method === 'HEAD') {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-cache': 'bypass',
    });
    return res.end();
  }

  const type = match[1];
  const rawId = decodeURIComponent(match[2]);
  const parsed = parseContentId(rawId);
  const contentId = parsed ? toContentId(parsed) : rawId;
  const season = parsed && parsed.season != null ? parsed.season : undefined;
  const episode = parsed && parsed.episode != null ? parsed.episode : undefined;

  try {
    const rawStreams = await collectStreams(
      contentId,
      type,
      season,
      episode,
      query.get('config') || '',
    );

    const streams = Array.isArray(rawStreams) ? rawStreams : [];
    sendJson(res, 200, { streams }, requestId);
  } catch (err) {
    sendJson(res, 200, { streams: [] }, requestId);
  }
}

function handleReload(req, res, requestId) {
  try {
    reloadProviders();
    sendJson(res, 200, { ok: true, reloadedAt: new Date().toISOString() }, requestId);
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message }, requestId);
  }
}

const server = http.createServer((req, res) => {
  const requestId = req.headers['x-request-id'] || '';
  const parsedUrl = new URL(req.url, `http://${host}:${port}`);
  const pathname = parsedUrl.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      allow: 'GET, HEAD, POST, OPTIONS',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
    });
    return res.end();
  }

  if (pathname === '/internal/health') {
    return handleHealth(req, res, requestId);
  }

  if (pathname.startsWith('/internal/stream/')) {
    return handleStream(req, res, pathname, parsedUrl.searchParams, requestId);
  }

  if (pathname === '/internal/reload' && req.method === 'POST') {
    return handleReload(req, res, requestId);
  }

  sendJson(res, 404, { error: 'Not Found' }, requestId);
});

server.listen(port, host, () => {
  console.log(`[sa7-worker] listening on http://${host}:${port}`);
});

module.exports = { server };
