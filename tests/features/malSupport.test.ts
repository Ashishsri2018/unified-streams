import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createGatewayApp } from '../../src/addon/app.js';
import type { StreamHandlerContext } from '../../src/addon/stream.js';
import { AnimeApiClient } from '../../src/core/animeapi.js';
import { GatewayStreamCache } from '../../src/core/cache.js';
import { deriveMalResolveBudgetMs, type AppEnv } from '../../src/core/env.js';
import { MetadataResolver } from '../../src/core/metadata.js';
import type { WorkerClient } from '../../src/core/workerClient.js';

const budget = (backend: number, global: number): number =>
  deriveMalResolveBudgetMs({ BACKEND_TIMEOUT_MS: backend, GLOBAL_DEADLINE_MS: global } as AppEnv);

const mappingResponse = {
  title: 'Cowboy Bebop',
  imdb: 'tt0213338',
  themoviedb: 30991,
  themoviedb_type: 'tv',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('MAL ID support', () => {
  it('derives the resolution budget from the global/backend gap', () => {
    expect(budget(12000, 13000)).toBe(1000);
    expect(budget(27000, 29000)).toBe(2000);
    expect(budget(12000, 12100)).toBe(500);
  });

  it('parses and validates animeapi mappings', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => mappingResponse });
    vi.stubGlobal('fetch', fetchMock);

    const mapping = await new AnimeApiClient('https://animeapi.test/').getMapping(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://animeapi.test/myanimelist/1');
    expect(mapping).toEqual({
      title: 'Cowboy Bebop',
      imdbId: 'tt0213338',
      tmdbId: 30991,
      tmdbType: 'tv',
    });
  });

  it('rejects malformed animeapi mappings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ imdb: 'bad', themoviedb: -1 }) }),
    );
    expect(await new AnimeApiClient('https://animeapi.test').getMapping(2)).toBeNull();
  });

  it('resolves MAL via animeapi without extra upstream calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => mappingResponse });
    vi.stubGlobal('fetch', fetchMock);

    const resolver = new MetadataResolver('https://cinemeta.test', undefined, undefined, {
      animeApiUrl: 'https://animeapi.test',
      malResolveBudgetMs: 2000,
    });
    const meta = await resolver.resolveMal('series', 1);

    expect(meta?.title).toBe('Cowboy Bebop');
    expect(meta?.imdbId).toBe('tt0213338');
    expect(meta?.tmdbId).toBe(30991);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to Jikan title and TMDB search when animeapi has no mapping', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('animeapi.test')) return Promise.resolve({ ok: false, json: async () => ({}) });
      if (url.includes('jikan.test')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { title: 'NARUTO', title_english: 'Naruto', type: 'tv', year: 2002 } }),
        });
      }
      if (url.includes('/search/tv')) return Promise.resolve({ ok: true, json: async () => ({ results: [{ id: 1234 }] }) });
      if (url.includes('/tv/1234')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ name: 'Naruto', first_air_date: '2002-10-03', imdb_id: 'tt0409591' }),
        });
      }
      throw new Error(`unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const resolver = new MetadataResolver('https://cinemeta.test', 'tmdb-key', 'https://jikan.test', {
      animeApiUrl: 'https://animeapi.test',
      tmdbUrl: 'https://tmdb.test/3',
      malResolveBudgetMs: 2000,
    });
    const meta = await resolver.resolveMal('series', 20);

    expect(meta?.title).toBe('Naruto');
    expect(meta?.year).toBe(2002);
    expect(meta?.tmdbId).toBe(1234);
    expect(meta?.imdbId).toBe('tt0409591');
  });

  it('returns null when the resolution budget expires', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            if (init?.signal?.aborted) {
              reject(new Error('aborted'));
              return;
            }
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          }),
      ),
    );

    const resolver = new MetadataResolver('https://cinemeta.test', undefined, undefined, {
      animeApiUrl: 'https://animeapi.test',
      malResolveBudgetMs: 300,
    });
    expect(await resolver.resolveMal('series', 99)).toBeNull();
  });

  it('forwards a canonical ID with preserved suffixes to workers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => mappingResponse });
    vi.stubGlobal('fetch', fetchMock);

    const fetchStream = vi.fn().mockResolvedValue({
      streams: [{ title: 'Cowboy Bebop', url: 'https://test/1.mp4' }],
      outcome: 'ok',
    });
    const worker = { fetchStream } as unknown as WorkerClient;
    const ctx: StreamHandlerContext = {
      cache: new GatewayStreamCache(),
      workers: { sa7: worker, nuvio: worker, vega: worker },
      addonVersion: '1.0.0',
      policyVersion: '1.0.0',
      maxStreams: 100,
      globalDeadlineMs: 13000,
      workerTimeoutMs: 12000,
      metadataResolver: new MetadataResolver('https://cinemeta.test', undefined, undefined, {
        animeApiUrl: 'https://animeapi.test',
        malResolveBudgetMs: 2000,
      }),
    };
    const app = createGatewayApp(ctx, Date.now());

    const series = await request(app).get('/stream/series/mal:1:2:5.json');
    expect(series.status).toBe(200);
    expect(series.body.streams.length).toBeGreaterThan(0);
    expect(fetchStream.mock.calls[0]?.[1]).toBe('tt0213338:2:5');

    fetchStream.mockClear();
    const movie = await request(app).get('/stream/movie/mal:1.json');
    expect(movie.status).toBe(200);
    expect(fetchStream.mock.calls[0]?.[1]).toBe('tt0213338');
  });

  it('does not fan out when MAL resolution produces no canonical ID', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

    const fetchStream = vi.fn();
    const worker = { fetchStream } as unknown as WorkerClient;
    const ctx: StreamHandlerContext = {
      cache: new GatewayStreamCache(),
      workers: { sa7: worker, nuvio: worker, vega: worker },
      addonVersion: '1.0.0',
      policyVersion: '1.0.0',
      maxStreams: 100,
      globalDeadlineMs: 13000,
      workerTimeoutMs: 12000,
      metadataResolver: new MetadataResolver('https://cinemeta.test', undefined, undefined, {
        animeApiUrl: 'https://animeapi.test',
        malResolveBudgetMs: 2000,
      }),
    };
    const app = createGatewayApp(ctx, Date.now());

    const res = await request(app).get('/stream/series/mal:999:1.json');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ streams: [] });
    expect(fetchStream).not.toHaveBeenCalled();
  });
});
