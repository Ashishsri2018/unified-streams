import { describe, it, expect, vi } from 'vitest';
import { WorkerClient } from '../../src/core/workerClient.js';
import { INTERNAL_HEADERS } from '../../src/core/contract.js';

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
});
