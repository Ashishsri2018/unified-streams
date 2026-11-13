import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createGatewayApp } from '../../src/addon/app.js';
import { GatewayStreamCache } from '../../src/core/cache.js';
import { WorkerClient } from '../../src/core/workerClient.js';
import { StreamHandlerContext } from '../../src/addon/stream.js';

describe('gateway HTTP endpoints and contract', () => {
  const mockWorker = {
    fleet: 'sa7' as const,
    baseUrl: 'http://127.0.0.1:7001',
    getHealth: vi.fn().mockResolvedValue({
      fleet: 'sa7',
      ok: true,
      status: 'ok',
      providers: {
        total: 10,
        circuits: { open: 0, halfOpen: 0 },
        stats: [
          {
            id: 'test-prov',
            state: 'closed',
            calls: 5,
            ok: 4,
            empty: 1,
            errors: 0,
            timeouts: 0,
            skipped: 0,
            successRate: 1,
            avgMs: 120,
            lastError: null,
          },
        ],
      },
    }),
    fetchStream: vi.fn().mockResolvedValue({ streams: [{ title: 'Direct', url: 'https://test/1.mp4' }], outcome: 'ok' }),
    reload: vi.fn().mockResolvedValue(true),
  } as unknown as WorkerClient;

  const mockWorkers = {
    sa7: mockWorker,
    nuvio: mockWorker,
    vega: mockWorker,
  };

  const ctx: StreamHandlerContext = {
    cache: new GatewayStreamCache(),
    workers: mockWorkers,
    addonVersion: '1.0.0',
    policyVersion: '1.0.0',
    maxStreams: 1000,
    globalDeadlineMs: 12000,
    workerTimeoutMs: 10000,
  };

  const app = createGatewayApp(ctx, Date.now());

  it('GET and HEAD / return correct status and body', async () => {
    const resGet = await request(app).get('/');
    expect(resGet.status).toBe(200);
    expect(resGet.body).toHaveProperty('ok', true);
    expect(resGet.headers['cache-control']).toBe('no-store');

    const resHead = await request(app).head('/');
    expect(resHead.status).toBe(200);
    expect(resHead.text).toBeFalsy();
    expect(resHead.headers['cache-control']).toBe('no-store');
  });

  it('GET and HEAD /manifest.json adhere to Stremio protocol', async () => {
    const resGet = await request(app).get('/manifest.json');
    expect(resGet.status).toBe(200);
    expect(resGet.body.id).toBe('org.unifiedstreams.addon');
    expect(resGet.body.resources).toEqual(['stream']);
    expect(resGet.headers['cache-control']).toBe('public, max-age=300');
    expect(resGet.headers['access-control-allow-origin']).toBe('*');

    const resHead = await request(app).head('/manifest.json');
    expect(resHead.status).toBe(200);
    expect(resHead.text).toBeFalsy();
  });

  it('HEAD /stream/... returns 200 with no body and does not fan out to workers', async () => {
    const fetchMock = mockWorker.fetchStream as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();

    const resHead = await request(app).head('/stream/movie/tt0111161.json');
    expect(resHead.status).toBe(200);
    expect(resHead.text).toBeFalsy();
    expect(resHead.headers['x-cache']).toBe('bypass');
    expect(resHead.headers['cache-control']).toBe('no-store');
    expect(resHead.headers['cloudflare-cdn-cache-control']).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockClear();
  });

  it('GET /stream disables Cloudflare and browser caching', async () => {
    const res = await request(app).get('/stream/movie/tt0111161.json');
    expect(res.status).toBe(200);
    expect(res.body.streams.length).toBeGreaterThan(0);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['cloudflare-cdn-cache-control']).toBeUndefined();
  });

  it('GET /stream merges results when a worker times out', async () => {
    const okWorker = {
      ...mockWorker,
      fetchStream: vi.fn().mockResolvedValue({
        streams: [{ title: 'Direct', url: 'https://test/partial.mp4' }],
        outcome: 'ok',
      }),
    };
    const timedOutWorker = {
      ...mockWorker,
      fetchStream: vi.fn().mockResolvedValue({ streams: [], outcome: 'timeout' }),
    };
    const partialApp = createGatewayApp(
      {
        ...ctx,
        cache: new GatewayStreamCache(),
        workers: {
          sa7: okWorker,
          nuvio: timedOutWorker,
          vega: timedOutWorker,
        } as unknown as StreamHandlerContext['workers'],
      },
      Date.now(),
    );

    const res = await request(partialApp).get('/stream/movie/tt0111161.json');
    expect(res.status).toBe(200);
    expect(res.body.streams.length).toBeGreaterThan(0);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['cloudflare-cdn-cache-control']).toBeUndefined();
  });

  it('GET /configure returns HTML with security headers', async () => {
    const res = await request(app).get('/configure');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.text).toContain('Unified Streams');
  });

  it('GET and HEAD /status render rich status page with table and security headers', async () => {
    const resGet = await request(app).get('/status');
    expect(resGet.status).toBe(200);
    expect(resGet.headers['content-type']).toContain('text/html');
    expect(resGet.headers['x-frame-options']).toBe('DENY');
    expect(resGet.text).toContain('Unified Streams status');
    expect(resGet.text).toContain('provider-rows');
    expect(resGet.text).toContain('provider-search');
    expect(resGet.text).toContain('Fleets');
    expect(resGet.text).toContain('Providers');

    const resHead = await request(app).head('/status');
    expect(resHead.status).toBe(200);
    expect(resHead.text).toBeFalsy();
  });

  it('GET /health aggregates providers and components across all fleets', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.providers.total).toBe(30);
    expect(Array.isArray(res.body.providers.stats)).toBe(true);
    expect(res.body.providers.stats.length).toBe(3);
    expect(res.body.providers.stats[0]).toHaveProperty('component');
    expect(res.body.providers.stats[0]).toHaveProperty('id', 'test-prov');
    expect(Array.isArray(res.body.components)).toBe(true);
    expect(res.body.components.length).toBe(3);
  });

  it('OPTIONS returns 204 with allow headers', async () => {
    const res = await request(app).options('/manifest.json');
    expect(res.status).toBe(204);
    expect(res.headers['allow']).toBe('GET, HEAD, OPTIONS');
  });

  it('/subtitles returns 404 for all methods', async () => {
    const resGet = await request(app).get('/subtitles/movie/tt0111161.json');
    expect(resGet.status).toBe(404);

    const resHead = await request(app).head('/subtitles');
    expect(resHead.status).toBe(404);
  });

  it('POST on public routes returns 405 Method Not Allowed', async () => {
    const res = await request(app).post('/manifest.json');
    expect(res.status).toBe(405);
    expect(res.headers['allow']).toBe('GET, HEAD, OPTIONS');
  });
});
