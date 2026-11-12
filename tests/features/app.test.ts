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
    getHealth: vi.fn().mockResolvedValue({ fleet: 'sa7', ok: true, status: 'ok' }),
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
    mockWorker.fetchStream = vi.fn();

    const resHead = await request(app).head('/stream/movie/tt0111161.json');
    expect(resHead.status).toBe(200);
    expect(resHead.text).toBeFalsy();
    expect(resHead.headers['x-cache']).toBe('bypass');
    expect(mockWorker.fetchStream).not.toHaveBeenCalled();
  });

  it('GET /configure returns HTML with security headers', async () => {
    const res = await request(app).get('/configure');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.text).toContain('Unified Streams');
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
