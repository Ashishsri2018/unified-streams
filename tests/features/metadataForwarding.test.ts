import { afterEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createGatewayApp } from '../../src/addon/app.js';
import type { StreamHandlerContext } from '../../src/addon/stream.js';
import { GatewayStreamCache } from '../../src/core/cache.js';
import { WorkerClient } from '../../src/core/workerClient.js';
import { INTERNAL_HEADERS } from '../../src/core/contract.js';
import { MetadataResolver, parseCanonicalYear } from '../../src/core/metadata.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Metadata Forwarding between Gateway and Loopback Workers', () => {
  it('attaches metadata headers in WorkerClient.fetchStream', async () => {
    let capturedHeaders: Headers | undefined;

    const mockFetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ streams: [] }),
      });
    });

    vi.stubGlobal('fetch', mockFetch);

    const client = new WorkerClient({
      fleet: 'nuvio',
      baseUrl: 'http://127.0.0.1:7002',
      internalToken: 'secret',
    });

    await client.fetchStream(
      'movie',
      'tt1375666',
      '',
      5000,
      'req-test',
      {
        title: 'Inception',
        year: 2010,
        tmdbId: 27205,
        imdbId: 'tt1375666',
      },
    );

    expect(capturedHeaders).toBeDefined();
    expect(capturedHeaders?.get(INTERNAL_HEADERS.REQUEST_ID)).toBe('req-test');
    expect(capturedHeaders?.get(INTERNAL_HEADERS.META_TITLE)).toBe(encodeURIComponent('Inception'));
    expect(capturedHeaders?.get(INTERNAL_HEADERS.META_YEAR)).toBe('2010');
    expect(capturedHeaders?.get(INTERNAL_HEADERS.META_TMDB_ID)).toBe('27205');
    expect(capturedHeaders?.get(INTERNAL_HEADERS.META_IMDB_ID)).toBe('tt1375666');

    vi.unstubAllGlobals();
  });

  it('sanitizes string year containing non-ASCII en-dash (e.g. 2019–) to valid ASCII year', async () => {
    let capturedHeaders: Headers | undefined;

    const mockFetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ streams: [] }),
      });
    });

    vi.stubGlobal('fetch', mockFetch);

    const client = new WorkerClient({
      fleet: 'nuvio',
      baseUrl: 'http://127.0.0.1:7002',
    });

    await client.fetchStream(
      'series',
      'tt9561862:1:1',
      '',
      5000,
      'req-test-dash',
      {
        title: 'Love, Death & Robots',
        year: '2019–' as unknown as number,
        tmdbId: 86831,
        imdbId: 'tt9561862',
      },
    );

    expect(capturedHeaders?.get(INTERNAL_HEADERS.META_YEAR)).toBe('2019');
    expect(capturedHeaders?.get(INTERNAL_HEADERS.META_TMDB_ID)).toBe('86831');
    expect(capturedHeaders?.get(INTERNAL_HEADERS.META_TITLE)).toBe(encodeURIComponent('Love, Death & Robots'));

    vi.unstubAllGlobals();
  });

  it('correctly parses various year formats with parseCanonicalYear', () => {
    expect(parseCanonicalYear(2019)).toBe(2019);
    expect(parseCanonicalYear('2019–')).toBe(2019);
    expect(parseCanonicalYear('2008–2013')).toBe(2008);
    expect(parseCanonicalYear('2019-2022')).toBe(2019);
    expect(parseCanonicalYear('invalid')).toBeUndefined();
    expect(parseCanonicalYear(null)).toBeUndefined();
    expect(parseCanonicalYear(undefined)).toBeUndefined();
  });

  it('forwards resolved IMDb metadata for TMDB series stream requests', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/tv/1399')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            name: 'Game of Thrones',
            first_air_date: '2011-04-17',
            external_ids: { imdb_id: 'tt0944947' },
          }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        json: async () => ({}),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const fetchStream = vi.fn().mockResolvedValue({ streams: [], outcome: 'ok' });
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
        'tmdb-key',
        undefined,
        { tmdbUrl: 'https://tmdb.test/3' },
      ),
    };
    const app = createGatewayApp(ctx, Date.now());

    const res = await request(app).get('/stream/series/tmdb:1399:1:1.json');

    expect(res.status).toBe(200);
    expect(fetchStream).toHaveBeenCalled();
    const call = fetchStream.mock.calls[0];
    expect(call?.[0]).toBe('series');
    expect(call?.[1]).toBe('tmdb:1399:1:1');
    expect(call?.[5]).toMatchObject({
      title: 'Game of Thrones',
      year: 2011,
      tmdbId: 1399,
      imdbId: 'tt0944947',
    });
  });
});
