import { describe, expect, it, vi } from 'vitest';
import {
  createProviderContext,
  installGlobalFetch,
  vegaNetworkStorage,
} from '../../src/fleets/vega/providers/sdk/context.js';
import { createNetworkTracker } from '../../src/core/networkClassifier.js';
import type {
  CookieJarApi,
  HttpTransportApi,
  LoggerLike,
} from '../../src/fleets/vega/types.js';

function transportWithCookies(setCookies: string[]): HttpTransportApi {
  return {
    request: vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      url: 'https://example.com/page',
      headers: { 'content-type': 'text/html', 'set-cookie': setCookies.join(', ') },
      setCookies,
      body: Buffer.from('<html></html>'),
    }),
  } as unknown as HttpTransportApi;
}

const cookieJar = {} as CookieJarApi;
const logger = {} as LoggerLike;

describe('Vega SDK set-cookie normalization', () => {
  it('exposes set-cookie as an array through axios so .map() works', async () => {
    const context = createProviderContext({
      transport: transportWithCookies(['a=1; Path=/', 'b=2; Path=/']),
      kvStore: {} as never,
      cookieJar,
      logger,
    });

    const response = await context.axios.get('https://example.com/page');
    const setCookie = response.headers['set-cookie'];

    expect(Array.isArray(setCookie)).toBe(true);
    expect(setCookie).toEqual(['a=1; Path=/', 'b=2; Path=/']);
  });

  it('exposes individual cookies through the fetch shim getSetCookie()', async () => {
    const originalFetch = globalThis.fetch;
    try {
      installGlobalFetch({
        transport: transportWithCookies(['a=1; Path=/', 'b=2; Path=/']),
        cookieJar,
        logger,
        getActiveUrls: () => null,
      });

      const response = await vegaNetworkStorage.run(
        createNetworkTracker(),
        async () => (await fetch('https://example.com/page')) as Response,
      );
      expect(response.headers.getSetCookie()).toEqual([
        'a=1; Path=/',
        'b=2; Path=/',
      ]);
      expect(response.headers.get('set-cookie')).toBe('a=1; Path=/, b=2; Path=/');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
