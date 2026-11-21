import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createGatewayApp } from '../../src/addon/app.js';
import type { StreamHandlerContext } from '../../src/addon/stream.js';
import { GatewayStreamCache } from '../../src/core/cache.js';
import { MetadataResolver } from '../../src/core/metadata.js';
import type { WorkerClient } from '../../src/core/workerClient.js';

const kitsuMapping = {
  data: [
    { attributes: { externalSite: 'anilist/anime', externalId: '154587' } },
    { attributes: { externalSite: 'myanimelist/anime', externalId: '52991' } },
  ],
};

const malMapping = {
  title: 'Frieren: Beyond Journey’s End',
  imdb: 'tt22248376',
  themoviedb: 209867,
  themoviedb_type: 'tv',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Kitsu ID support', () => {
  it('resolves Kitsu to MAL and then to a canonical IMDb ID', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('kitsu.test/anime/46474/mappings')) {
        return Promise.resolve({ ok: true, json: async () => kitsuMapping });
      }
      if (url.includes('animeapi.test/myanimelist/52991')) {
        return Promise.resolve({ ok: true, json: async () => malMapping });
      }
      throw new Error(`unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const resolver = new MetadataResolver('https://cinemeta.test', undefined, undefined, {
      animeApiUrl: 'https://animeapi.test',
      kitsuUrl: 'https://kitsu.test',
      malResolveBudgetMs: 2000,
    });
    const meta = await resolver.resolveKitsu('series', 46474);

    expect(meta?.title).toBe(malMapping.title);
    expect(meta?.imdbId).toBe('tt22248376');
    expect(meta?.tmdbId).toBe(209867);
  });

  it('forwards a canonical ID with preserved suffixes for Kitsu episode requests', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('kitsu.test/anime/46474/mappings')) {
        return Promise.resolve({ ok: true, json: async () => kitsuMapping });
      }
      if (url.includes('animeapi.test/myanimelist/52991')) {
        return Promise.resolve({ ok: true, json: async () => malMapping });
      }
      throw new Error(`unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const fetchStream = vi.fn().mockResolvedValue({
      streams: [{ title: 'Frieren', url: 'https://test/1.mp4' }],
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
        kitsuUrl: 'https://kitsu.test',
        malResolveBudgetMs: 2000,
      }),
    };
    const app = createGatewayApp(ctx, Date.now());

    const series = await request(app).get('/stream/series/kitsu:46474:1:2.json');
    expect(series.status).toBe(200);
    expect(series.body.streams.length).toBeGreaterThan(0);
    expect(fetchStream.mock.calls[0]?.[1]).toBe('tt22248376:1:2');

    fetchStream.mockClear();
    const movie = await request(app).get('/stream/movie/kitsu:46474.json');
    expect(movie.status).toBe(200);
    expect(fetchStream.mock.calls[0]?.[1]).toBe('tt22248376');
  });

  it('falls back to Kitsu title and TMDB search when no MAL mapping exists', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('kitsu.test/anime/999/mappings')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: [{ attributes: { externalSite: 'anilist/anime', externalId: '1' } }] }),
        });
      }
      if (url.includes('kitsu.test/anime/999')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: { attributes: { canonicalTitle: 'Frieren', startDate: '2023-09-29', subtype: 'TV' } },
          }),
        });
      }
      if (url.includes('/search/tv')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ results: [{ id: 209867, name: 'Frieren', first_air_date: '2023-09-29' }] }),
        });
      }
      if (url.includes('/tv/209867')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ name: 'Frieren', first_air_date: '2023-09-29', imdb_id: 'tt22248376' }),
        });
      }
      throw new Error(`unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const resolver = new MetadataResolver('https://cinemeta.test', 'tmdb-key', undefined, {
      animeApiUrl: 'https://animeapi.test',
      kitsuUrl: 'https://kitsu.test',
      tmdbUrl: 'https://tmdb.test/3',
      malResolveBudgetMs: 2000,
    });
    const meta = await resolver.resolveKitsu('series', 999);

    expect(meta?.title).toBe('Frieren');
    expect(meta?.year).toBe(2023);
    expect(meta?.imdbId).toBe('tt22248376');
    expect(meta?.tmdbId).toBe(209867);
  });

  it('does not fan out when Kitsu resolution produces no canonical ID', async () => {
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
        kitsuUrl: 'https://kitsu.test',
        malResolveBudgetMs: 2000,
      }),
    };
    const app = createGatewayApp(ctx, Date.now());

    const res = await request(app).get('/stream/series/kitsu:999:1.json');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ streams: [] });
    expect(fetchStream).not.toHaveBeenCalled();
  });
});
