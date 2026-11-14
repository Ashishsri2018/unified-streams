import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createGatewayApp } from '../../src/addon/app.js';
import { GatewayStreamCache } from '../../src/core/cache.js';
import { WorkerClient } from '../../src/core/workerClient.js';
import { StreamHandlerContext } from '../../src/addon/stream.js';
import { encodeUserConfig } from '../../src/addon/userConfig.js';

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

    const csp = res.headers['content-security-policy'];
    const nonce = /script-src 'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(csp).not.toContain("default-src 'self' 'unsafe-inline'");
    expect(res.text).toContain(`<script nonce="${nonce}">`);
  });

  it('GET /:config/configure prefills the saved configuration', async () => {
    const encoded = encodeUserConfig({ maxRes: 720, backends: ['vega'] });
    const res = await request(app).get(`/${encoded}/configure`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('const PREFILL_CONFIG = ');
    expect(res.text).toContain('"maxRes":720');
    expect(res.text).toContain('"backends":["vega"]');
    expect(res.text).toContain('Stream filters');
    expect(res.text).toContain('Provider fleets');
    expect(res.text).toContain('passed through unchanged');
    expect(res.text).not.toContain('name="subMode"');
  });

  it('GET /stream applies resolution and size filters from the encoded config', async () => {
    const inlineSubtitles = [
      { id: 'en', url: 'https://sub.test/en.vtt', lang: 'en' },
      { id: 'hi', url: 'https://sub.test/hi.vtt', lang: 'hi' },
    ];
    const workers = {
      sa7: {
        ...mockWorker,
        fetchStream: vi.fn().mockResolvedValue({
          streams: [
            {
              title: 'SA7 1080p',
              quality: '1080p',
              url: 'https://cdn.test/sa7-1080.mp4',
            },
            {
              title: 'SA7 720p',
              quality: '720p',
              url: 'https://cdn.test/sa7-720.mp4',
              size: 1024 * 1024 * 1024,
              subtitles: inlineSubtitles,
            },
          ],
          outcome: 'ok',
        }),
      },
      nuvio: {
        ...mockWorker,
        fetchStream: vi.fn().mockResolvedValue({
          streams: [
            {
              title: 'Nuvio 480p 3 GB',
              quality: '480p',
              url: 'https://cdn.test/nuvio-480.mp4',
              size: 3 * 1024 * 1024 * 1024,
            },
          ],
          outcome: 'ok',
        }),
      },
      vega: {
        ...mockWorker,
        fetchStream: vi.fn().mockResolvedValue({
          streams: [
            {
              title: 'Vega unknown resolution',
              url: 'https://cdn.test/vega-unknown.mp4',
              size: 1024 * 1024 * 1024,
            },
          ],
          outcome: 'ok',
        }),
      },
    } as unknown as StreamHandlerContext['workers'];

    const filteredApp = createGatewayApp(
      { ...ctx, cache: new GatewayStreamCache(), workers },
      Date.now(),
    );
    const encoded = encodeUserConfig({
      maxRes: 720,
      includeUnknownRes: false,
      maxSizeGB: 2,
      includeUnknownSize: false,
      subtitleMode: 'none',
      subtitleLangs: ['en'],
      backends: ['sa7', 'nuvio', 'vega'],
    });

    const res = await request(filteredApp).get(`/${encoded}/stream/movie/tt0111161.json`);
    expect(res.status).toBe(200);
    expect(res.body.streams).toHaveLength(1);
    expect(res.body.streams[0].title).toBe('SA7 720p');
    expect(res.body.streams[0].url).toBe('https://cdn.test/sa7-720.mp4');
    expect(res.body.streams[0].subtitles).toEqual(inlineSubtitles);
  });

  it('GET /stream only fans out to fleets selected in the config', async () => {
    const workers = {
      sa7: { ...mockWorker, fetchStream: vi.fn().mockResolvedValue({ streams: [], outcome: 'empty' }) },
      nuvio: { ...mockWorker, fetchStream: vi.fn().mockResolvedValue({ streams: [], outcome: 'empty' }) },
      vega: {
        ...mockWorker,
        fetchStream: vi.fn().mockResolvedValue({
          streams: [{ title: 'Vega only', quality: '1080p', url: 'https://cdn.test/vega.mp4' }],
          outcome: 'ok',
        }),
      },
    } as unknown as StreamHandlerContext['workers'];

    const fleetApp = createGatewayApp(
      { ...ctx, cache: new GatewayStreamCache(), workers },
      Date.now(),
    );
    const encoded = encodeUserConfig({ backends: ['vega'] });

    const res = await request(fleetApp).get(`/${encoded}/stream/movie/tt0111161.json`);
    expect(res.status).toBe(200);
    expect(res.body.streams).toHaveLength(1);
    expect(res.body.streams[0].title).toBe('Vega only');
    expect(workers.sa7.fetchStream).not.toHaveBeenCalled();
    expect(workers.nuvio.fetchStream).not.toHaveBeenCalled();
    expect(workers.vega.fetchStream).toHaveBeenCalledTimes(1);
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

    const csp = resGet.headers['content-security-policy'];
    const nonce = /script-src 'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(csp).not.toContain("default-src 'self' 'unsafe-inline'");
    expect(resGet.text).toContain(`<script nonce="${nonce}">`);
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
