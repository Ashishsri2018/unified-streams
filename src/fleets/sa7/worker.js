'use strict';

require('./lib/cheerio-hook');

const fs = require('node:fs');
const http = require('node:http');
const config = require('./config');
const {
  getRegistry,
  reloadProviders,
  getCatalog,
  applyRuntimeSelection,
} = require('./providers');
const { collectStreams, getRuntimeStats } = require('./streams');
const { parseContentId, toContentId } = require('./content-id');
const cinemeta = require('./cinemeta');
const { buildStatus } = require('./telemetry');

function createSa7Handlers(fleetEnv = process.env) {
  config.apply(fleetEnv);

  const port = Number(fleetEnv.PORT || 7001);
  const startedAt = Date.now();

  try {
    getRegistry();
  } catch (err) {
    console.warn(`[providers] initial load failed: ${err.message}`);
  }

  function readSnapshotInfo() {
    const fallback = {
      sha: fleetEnv.SA7_SNAPSHOT_SHA || 'bundled',
      fetchedAt: new Date(startedAt).toISOString(),
      ageMs: Date.now() - startedAt,
    };
    const file = config.snapshotFile;
    if (!file) return fallback;

    try {
      const sha = fs.readFileSync(file, 'utf8').trim();
      const fetchedAt = fs.statSync(file).mtimeMs;
      if (!sha) return fallback;
      return {
        sha,
        fetchedAt: new Date(fetchedAt).toISOString(),
        ageMs: Math.max(0, Date.now() - fetchedAt),
      };
    } catch {
      return fallback;
    }
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
    const total = getRegistry().length;
    const status = total > 0 ? 'ok' : 'error';
    const payload = buildStatus({
      addon: 'sa7',
      startedAt: new Date(startedAt).toISOString(),
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      status,
      ok: total > 0,
      snapshot: {
        ...readSnapshotInfo(),
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

    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(requestId ? { 'x-request-id': requestId } : {}),
    });
    res.end(JSON.stringify(payload));
  }

  async function handleStream(req, res, urlPath, requestId) {
    const match = /^\/internal\/stream\/(movie|series)\/([^/]+)\.json$/.exec(urlPath);
    if (!match) {
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(JSON.stringify({ streams: [] }));
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
    const parsed = parseContentId(rawId, type);
    const contentId = parsed ? toContentId(parsed) : rawId;
    const season = parsed && parsed.season != null ? parsed.season : undefined;
    const episode = parsed && parsed.episode != null ? parsed.episode : undefined;

    const metaTmdb = Number(req.headers['x-meta-tmdb-id']);
    if (Number.isSafeInteger(metaTmdb) && metaTmdb > 0 && typeof contentId === 'string' && contentId.startsWith('tt')) {
      cinemeta.prime(contentId, type, metaTmdb);
    }

    const controller = new AbortController();
    const abortOnClose = () => {
      if (!res.writableEnded) controller.abort(new Error('client disconnected'));
    };
    res.on('close', abortOnClose);

    let streams = [];
    let partial = false;
    try {
      const result = await collectStreams(
        contentId,
        type,
        season,
        episode,
        null,
        controller.signal,
      );
      if (result && Array.isArray(result.streams)) {
        streams = result.streams;
        partial = result.partial === true;
      }
    } catch {
      streams = [];
    } finally {
      res.off('close', abortOnClose);
    }
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(requestId ? { 'x-request-id': requestId } : {}),
    });
    res.end(JSON.stringify({ streams, partial }));
  }

  function handleReload(req, res, requestId) {
    try {
      reloadProviders();
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        ...(requestId ? { 'x-request-id': requestId } : {}),
      });
      res.end(JSON.stringify({ ok: true, reloadedAt: new Date().toISOString() }));
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  }

  function handleProviders(req, res, requestId) {
    try {
      const payload = getCatalog();
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        ...(requestId ? { 'x-request-id': requestId } : {}),
      });
      res.end(JSON.stringify(payload));
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  }

  function handleSelectProviders(req, res, requestId, body) {
    const overrides =
      body && typeof body === 'object' && body.overrides && typeof body.overrides === 'object'
        ? body.overrides
        : {};
    const version =
      body && typeof body === 'object' && typeof body.version === 'number'
        ? body.version
        : Number(config.selectionVersion || 0);
    try {
      const catalog = applyRuntimeSelection(overrides, version);
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        ...(requestId ? { 'x-request-id': requestId } : {}),
      });
      res.end(
        JSON.stringify({
          ok: true,
          version: catalog.version,
          applied: catalog.providers.filter((provider) => provider.enabled).map((provider) => provider.id),
        }),
      );
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, version, error: err.message }));
    }
  }

  return {
    port,
    internalToken: fleetEnv.INTERNAL_TOKEN || '',
    handlers: {
      health: handleHealth,
      stream: handleStream,
      reload: handleReload,
      providers: handleProviders,
      selectProviders: handleSelectProviders,
    },
  };
}

async function readJsonBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

module.exports = { createSa7Handlers };

if (require.main === module) {
  const host = '127.0.0.1';
  const instance = createSa7Handlers();
  const server = http.createServer(async (req, res) => {
    const requestId = req.headers['x-request-id'] || '';
    if (instance.internalToken && req.headers['x-internal-token'] !== instance.internalToken) {
      res.writeHead(401, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }
    const pathname = new URL(req.url, `http://${host}:${instance.port}`).pathname;
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        allow: 'GET, HEAD, POST, OPTIONS',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
      });
      return res.end();
    }
    if (pathname === '/internal/health') return instance.handlers.health(req, res, requestId);
    if (pathname.startsWith('/internal/stream/')) return instance.handlers.stream(req, res, pathname, requestId);
    if (pathname === '/internal/providers' && req.method === 'GET') {
      return instance.handlers.providers(req, res, requestId);
    }
    if (pathname === '/internal/providers/selection' && req.method === 'POST') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        res.writeHead(413, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(JSON.stringify({ error: error.message }));
      }
      return instance.handlers.selectProviders(req, res, requestId, body);
    }
    if (pathname === '/internal/reload' && req.method === 'POST') return instance.handlers.reload(req, res, requestId);
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });
  server.listen(instance.port, host, () => {
    console.log(`[sa7-worker] listening on http://${host}:${instance.port}`);
  });
}
