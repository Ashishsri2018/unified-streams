import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { createInternalServer, sendJson, type FleetInstance } from '../../src/core/internalServer.js';

describe('shared internal fleet server', () => {
  let server: http.Server | null = null;
  const calls: string[] = [];

  function makeInstance(internalToken: string): FleetInstance {
    return {
      port: 7009,
      internalToken,
      handlers: {
        health: (_req, res, requestId) => {
          calls.push(`health:${requestId}`);
          sendJson(res, 200, { fleet: 'test', ok: true });
        },
        stream: (_req, res, pathname, requestId) => {
          calls.push(`stream:${pathname}:${requestId}`);
          sendJson(res, 200, { streams: [] });
        },
        reload: (_req, res, _requestId) => {
          calls.push('reload');
          sendJson(res, 200, { ok: true });
        },
      },
    };
  }

  async function start(internalToken: string): Promise<number> {
    server = createInternalServer('127.0.0.1', makeInstance(internalToken));
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (typeof address !== 'object' || !address) throw new Error('no address');
    return address.port;
  }

  afterEach(async () => {
    calls.length = 0;
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
  });

  it('rejects unauthenticated requests', async () => {
    const port = await start('secret');
    const res = await fetch(`http://127.0.0.1:${port}/internal/health`);
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it('routes health, stream and reload with request ids', async () => {
    const port = await start('');
    const headers = { 'x-request-id': 'req-1' };

    const health = await fetch(`http://127.0.0.1:${port}/internal/health`, { headers });
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ fleet: 'test', ok: true });

    const stream = await fetch(
      `http://127.0.0.1:${port}/internal/stream/movie/tt123.json`,
      { headers },
    );
    expect(stream.status).toBe(200);
    expect(await stream.json()).toEqual({ streams: [] });

    const reload = await fetch(`http://127.0.0.1:${port}/internal/reload`, {
      method: 'POST',
      headers,
    });
    expect(reload.status).toBe(200);
    expect(await reload.json()).toEqual({ ok: true });
    expect(calls).toEqual([
      'health:req-1',
      'stream:/internal/stream/movie/tt123.json:req-1',
      'reload',
    ]);
  });

  it('handles HEAD without invoking handlers and OPTIONS/404 directly', async () => {
    const port = await start('');

    const head = await fetch(`http://127.0.0.1:${port}/internal/stream/movie/tt1.json`, {
      method: 'HEAD',
    });
    expect(head.status).toBe(200);
    expect(calls).toEqual([]);

    const options = await fetch(`http://127.0.0.1:${port}/internal/health`, {
      method: 'OPTIONS',
    });
    expect(options.status).toBe(204);

    const missing = await fetch(`http://127.0.0.1:${port}/nope`);
    expect(missing.status).toBe(404);
    expect(calls).toEqual([]);
  });
});
