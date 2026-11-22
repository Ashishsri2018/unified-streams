import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createGatewayApp } from '../../src/addon/app.js';
import type { StreamHandlerContext } from '../../src/addon/stream.js';
import { AnimeApiClient } from '../../src/core/animeapi.js';
import { GatewayStreamCache } from '../../src/core/cache.js';
import {
  deriveMalResolveBudgetMs,
  deriveMetadataResolveBudgetMs,
  type AppEnv,
} from '../../src/core/env.js';
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

  it('derives the general metadata budget from the same request headroom', () => {
    const metadataBudget = (backend: number, global: number): number =>
      deriveMetadataResolveBudgetMs({ BACKEND_TIMEOUT_MS: backend, GLOBAL_DEADLINE_MS: global } as AppEnv);
    expect(metadataBudget(12000, 13000)).toBe(1000);
    expect(metadataBudget(27000, 29000)).toBe(2000);
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

  it('fills a missing TMDB id from an AnimeAPI IMDb mapping', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('animeapi.test/myanimelist/5')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ title: 'Cowboy Bebop', imdb: 'tt0213338' }),
        });
      }
      if (url.includes('tmdb.test/3/find/tt0213338')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ movie_results: [], tv_results: [{ id: 30991 }] }),
        });
      }
      if (url.includes('tmdb.test/3/tv/30991')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            name: 'Cowboy Bebop',
            first_air_date: '1998-04-03',
            external_ids: { imdb_id: 'tt0213338' },
          }),
        });
      }
      throw new Error(`unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const resolver = new MetadataResolver('https://cinemeta.test', 'tmdb-key', undefined, {
      animeApiUrl: 'https://animeapi.test',
      tmdbUrl: 'https://tmdb.test/3',
      malResolveBudgetMs: 2000,
    });
    const meta = await resolver.resolveMal('series', 5);

    expect(meta?.imdbId).toBe('tt0213338');
    expect(meta?.tmdbId).toBe(30991);
    expect(meta?.year).toBe(1998);
  });

  it('fills a missing IMDb id from an AnimeAPI TMDB mapping', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('animeapi.test/myanimelist/6')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            title: 'Cowboy Bebop',
            themoviedb: 30991,
            themoviedb_type: 'tv',
          }),
        });
      }
      if (url.includes('tmdb.test/3/tv/30991')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            name: 'Cowboy Bebop',
            first_air_date: '1998-04-03',
            external_ids: { imdb_id: 'tt0213338' },
          }),
        });
      }
      throw new Error(`unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const resolver = new MetadataResolver('https://cinemeta.test', 'tmdb-key', undefined, {
      animeApiUrl: 'https://animeapi.test',
      tmdbUrl: 'https://tmdb.test/3',
      malResolveBudgetMs: 2000,
    });
    const meta = await resolver.resolveMal('series', 6);

    expect(meta?.imdbId).toBe('tt0213338');
    expect(meta?.tmdbId).toBe(30991);
    expect(meta?.year).toBe(1998);
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

  it('uses the AnimeAPI TMDB type instead of the requested type for lookups', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('animeapi.test')) {
        return Promise.resolve({ ok: true, json: async () => ({ themoviedb: 777, themoviedb_type: 'tv' }) });
      }
      if (url.includes('/tv/777')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ name: 'Anime', first_air_date: '2020-01-01' }),
        });
      }
      throw new Error(`unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const resolver = new MetadataResolver('https://cinemeta.test', 'tmdb-key', undefined, {
      animeApiUrl: 'https://animeapi.test',
      tmdbUrl: 'https://tmdb.test/3',
      malResolveBudgetMs: 2000,
    });
    const meta = await resolver.resolveMal('movie', 7);

    expect(meta?.tmdbId).toBe(777);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/tv/777'))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/movie/777'))).toBe(false);
  });

  it('lets the Jikan/TMDB fallback complete within the Beamup budget', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('animeapi.test')) {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
      }
      if (url.includes('jikan.test')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { title: 'Naruto', type: 'tv', year: 2002 } }),
        });
      }
      if (url.includes('/search/tv')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ results: [{ id: 1234, name: 'Naruto', first_air_date: '2002-10-03' }] }),
        });
      }
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
      malResolveBudgetMs: 1000,
    });
    const meta = await resolver.resolveMal('series', 9);

    expect(meta?.tmdbId).toBe(1234);
    expect(meta?.imdbId).toBe('tt0409591');
  });

  it('does not negatively cache a budget expiry', async () => {
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(new Error('aborted'));
            return;
          }
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const resolver = new MetadataResolver('https://cinemeta.test', undefined, undefined, {
      animeApiUrl: 'https://animeapi.test',
      malResolveBudgetMs: 300,
    });
    await resolver.resolveMal('series', 42);
    const firstAttempts = fetchMock.mock.calls.length;
    await resolver.resolveMal('series', 42);

    expect(firstAttempts).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(firstAttempts);
  });

  it('ranks TMDB search results by title and year', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('animeapi.test')) return Promise.resolve({ ok: false, json: async () => ({}) });
      if (url.includes('jikan.test')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { title: 'Naruto', type: 'tv', year: 2002 } }),
        });
      }
      if (url.includes('/search/tv')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            results: [
              { id: 1, name: 'Naruto Shippuuden', first_air_date: '2007-01-01' },
              { id: 2, name: 'Naruto', first_air_date: '2002-10-03' },
            ],
          }),
        });
      }
      if (url.includes('/tv/2')) {
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
    const meta = await resolver.resolveMal('series', 11);

    expect(meta?.tmdbId).toBe(2);
  });

  it('ignores oversized AnimeAPI responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => 'x'.repeat(1024 * 1024 + 1),
      }),
    );
    expect(await new AnimeApiClient('https://animeapi.test').getMapping(3)).toBeNull();
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
