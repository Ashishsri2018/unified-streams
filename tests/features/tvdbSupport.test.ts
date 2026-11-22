import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createGatewayApp } from '../../src/addon/app.js';
import type { StreamHandlerContext } from '../../src/addon/stream.js';
import { GatewayStreamCache } from '../../src/core/cache.js';
import { MetadataResolver } from '../../src/core/metadata.js';
import type { WorkerClient } from '../../src/core/workerClient.js';

const tvmazeShow = {
  name: 'Avatar: Seven Havens',
  premiered: '2027-01-01',
  externals: { imdb: 'tt35854736' },
};

const tmdbMovie = {
  title: 'WWE SummerSlam 2026 Night 2',
  release_date: '2026-08-02',
  imdb_id: 'tt36999001',
};

function workerMock() {
  return {
    fetchStream: vi.fn().mockResolvedValue({
      streams: [{ title: 'Test', url: 'https://test/1.mp4' }],
      outcome: 'ok',
    }),
  };
}

function appWith(
  fetchStream: ReturnType<typeof vi.fn>,
  options?: { tmdbApiKey?: string },
): ReturnType<typeof createGatewayApp> {
  const worker = { fetchStream } as unknown as WorkerClient;
  const ctx: StreamHandlerContext = {
    cache: new GatewayStreamCache(),
    workers: { sa7: worker, nuvio: worker, vega: worker },
    addonVersion: '1.0.0',
    policyVersion: '1.0.0',
    maxStreams: 100,
    globalDeadlineMs: 13000,
    workerTimeoutMs: 12000,
    metadataResolver: new MetadataResolver(
      'https://cinemeta.test',
      options?.tmdbApiKey,
      undefined,
      {
        tvmazeUrl: 'https://tvmaze.test',
        tmdbUrl: 'https://tmdb.test/3',
        metadataBudgetMs: 2000,
      },
    ),
  };
  return createGatewayApp(ctx, Date.now());
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TVDB ID support', () => {
  it('resolves a TVDB series through TVMaze and forwards the IMDb suffix', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('tvmaze.test/lookup/shows?thetvdb=460458')) {
        return Promise.resolve({ ok: true, json: async () => tvmazeShow });
      }
      throw new Error(`unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const fetchStream = workerMock().fetchStream;
    const app = appWith(fetchStream);

    const res = await request(app).get('/stream/series/tvdb:460458:1:2.json');
    expect(res.status).toBe(200);
    expect(res.body.streams.length).toBeGreaterThan(0);
    expect(fetchStream.mock.calls[0]?.[1]).toBe('tt35854736:1:2');
  });

  it('resolves a TVDB movie through TMDB find and forwards the IMDb id', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('tvmaze.test')) {
        return Promise.resolve({ ok: false, status: 404, json: async () => null });
      }
      if (url.includes('tmdb.test/3/find/357063')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ movie_results: [{ id: 1234 }], tv_results: [] }),
        });
      }
      if (url.includes('tmdb.test/3/movie/1234')) {
        return Promise.resolve({ ok: true, json: async () => tmdbMovie });
      }
      throw new Error(`unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const fetchStream = workerMock().fetchStream;
    const app = appWith(fetchStream, { tmdbApiKey: 'key' });

    const res = await request(app).get('/stream/movie/tvdb:357063.json');
    expect(res.status).toBe(200);
    expect(fetchStream.mock.calls[0]?.[1]).toBe('tt36999001');
  });

  it('falls back to TMDB find when TVMaze has no IMDb mapping', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('tvmaze.test')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ name: 'Some Show', externals: {} }),
        });
      }
      if (url.includes('tmdb.test/3/find/777')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ movie_results: [], tv_results: [{ id: 555 }] }),
        });
      }
      if (url.includes('tmdb.test/3/tv/555')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ name: 'Some Show', first_air_date: '2020-01-01', imdb_id: 'tt5555555' }),
        });
      }
      throw new Error(`unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const fetchStream = workerMock().fetchStream;
    const app = appWith(fetchStream, { tmdbApiKey: 'key' });

    const res = await request(app).get('/stream/series/tvdb:777:1:1.json');
    expect(res.status).toBe(200);
    expect(fetchStream.mock.calls[0]?.[1]).toBe('tt5555555:1:1');
  });

  it('returns empty streams without fan-out when TVDB cannot be resolved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => null }),
    );

    const fetchStream = workerMock().fetchStream;
    const app = appWith(fetchStream);

    const res = await request(app).get('/stream/series/tvdb:999:1:1.json');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ streams: [] });
    expect(fetchStream).not.toHaveBeenCalled();
  });

  it('still resolves TVDB series through TVMaze without a TMDB key', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('tvmaze.test')) {
        return Promise.resolve({ ok: true, json: async () => tvmazeShow });
      }
      throw new Error(`unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const fetchStream = workerMock().fetchStream;
    const app = appWith(fetchStream);

    const res = await request(app).get('/stream/series/tvdb:460458:2:3.json');
    expect(res.status).toBe(200);
    expect(fetchStream.mock.calls[0]?.[1]).toBe('tt35854736:2:3');
  });
});
