import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkerClient } from '../../src/core/workerClient.js';
import http from 'node:http';

describe('worker client and internal worker contract', () => {
  let server: http.Server;
  let serverPort: number;
  let streamBody: Record<string, unknown>;
  let streamDelayMs: number;

  beforeEach(async () => {
    streamBody = { streams: [{ title: 'Stream 1', url: 'https://test/1.mp4' }] };
    streamDelayMs = 0;
    server = http.createServer((req, res) => {
      const parsed = new URL(req.url || '/', `http://127.0.0.1`);
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { allow: 'GET, HEAD, POST, OPTIONS' });
        return res.end();
      }

      if (parsed.pathname === '/internal/health') {
        if (req.method === 'HEAD') {
          res.writeHead(200, { 'content-type': 'application/json' });
          return res.end();
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ fleet: 'sa7', ok: true, status: 'ok' }));
      }

      if (parsed.pathname.startsWith('/internal/stream/')) {
        if (req.method === 'HEAD') {
          res.writeHead(200, { 'content-type': 'application/json', 'x-cache': 'bypass' });
          return res.end();
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        setTimeout(() => res.end(JSON.stringify(streamBody)), streamDelayMs);
        return;
      }

      if (parsed.pathname === '/internal/reload' && req.method === 'POST') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, reloadedAt: new Date().toISOString() }));
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('fetches health, stream, and reload correctly through WorkerClient', async () => {
    const client = new WorkerClient({
      fleet: 'sa7',
      baseUrl: `http://127.0.0.1:${serverPort}`,
    });

    const health = await client.getHealth();
    expect(health).toHaveProperty('ok', true);

    const stream = await client.fetchStream('movie', 'tt0111161', '', 5000, 'req-123');
    expect(stream.outcome).toBe('ok');
    expect(stream.streams).toHaveLength(1);
    expect(stream.streams[0].title).toBe('Stream 1');

    const reloaded = await client.reload();
    expect(reloaded).toBe(true);
  });

  it('treats responses near the worker deadline as partial', async () => {
    streamDelayMs = 400;
    const client = new WorkerClient({
      fleet: 'sa7',
      baseUrl: `http://127.0.0.1:${serverPort}`,
    });

    const nearDeadline = await client.fetchStream('movie', 'tt0111161', '', 1300);
    expect(nearDeadline.streams).toHaveLength(1);
    expect(nearDeadline.outcome).toBe('timeout');

    const relaxed = await client.fetchStream('movie', 'tt0111161', '', 5000);
    expect(relaxed.streams).toHaveLength(1);
    expect(relaxed.outcome).toBe('ok');
  });

  it('honors an explicit partial flag from the worker', async () => {
    streamBody = {
      streams: [{ title: 'Stream 1', url: 'https://test/1.mp4' }],
      partial: true,
    };
    const client = new WorkerClient({
      fleet: 'sa7',
      baseUrl: `http://127.0.0.1:${serverPort}`,
    });

    const result = await client.fetchStream('movie', 'tt0111161', '', 5000);
    expect(result.outcome).toBe('timeout');
  });
});
