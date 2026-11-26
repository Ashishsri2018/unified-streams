import { describe, it, expect, vi } from 'vitest';
import { createNetworkTracker } from '../../src/core/networkClassifier.js';
import {
  createProviderFetch,
  guardProviderResponse,
  MAX_PROVIDER_RESPONSE_BYTES,
  scraperNetworkStorage,
} from '../../src/fleets/nuvio/nuvio/loader.js';
import { gramCinemaLazyFetch } from '../../src/fleets/nuvio/nuvio/gramCinemaLazy.js';

function makeResponse(
  url: string,
  headers: Record<string, string>,
  body: BodyInit = '<html>ok</html>',
): Response {
  const response = new Response(body, { status: 200, headers });
  Object.defineProperty(response, 'url', { value: url, configurable: true });
  return response;
}

describe('Nuvio provider response guard', () => {
  it('blocks oversized responses before a provider can read them', () => {
    const url = 'https://hubcloud.mov/drive/t3dl.php?id=h1atrhmmprbntnt';
    const response = makeResponse(url, {
      'content-type': 'text/html; charset=UTF-8',
      'content-length': '2427569820',
    });

    expect(() => guardProviderResponse(response, url)).toThrow(/blocked oversized response/);
  });

  it('blocks binary content types', () => {
    const url = 'https://hubcloud.mov/drive/t3dl.php?id=h1atrhmmprbntnt';
    const response = makeResponse(url, { 'content-type': 'application/octet-stream' });

    expect(() => guardProviderResponse(response, url)).toThrow(/blocked binary response/);
  });

  it('blocks media files by final redirect path', () => {
    const url = 'https://hubcloud.mov/drive/t3dl.php?id=h1atrhmmprbntnt';
    const finalUrl =
      'https://t3oc.example.r2.cloudflarestorage.com/Steps.2026.1080p.WEB-DL.mkv?sig=1';
    const response = makeResponse(finalUrl, { 'content-type': 'text/plain; charset=UTF-8' });

    expect(() => guardProviderResponse(response, url)).toThrow(/blocked media\/archive response/);
  });

  it('allows normal HTML pages and preserves the response URL', async () => {
    const url = 'https://new15.hdhub4u.cl/steps-2026-webrip-hindi-full-movie/';
    const response = makeResponse(url, {
      'content-type': 'text/html; charset=utf-8',
      'content-length': '2400',
    });
    const guarded = guardProviderResponse(response, url);

    expect(guarded.url).toBe(url);
    expect(await guarded.text()).toBe('<html>ok</html>');
  });

  it('enforces the cap on chunked bodies with no declared length', async () => {
    const url = 'https://example.com/page';
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(5));
        controller.enqueue(new Uint8Array(5));
        controller.close();
      },
    });
    const response = makeResponse(url, { 'content-type': 'text/plain' }, body);
    const onOverflow = vi.fn();

    const guarded = guardProviderResponse(response, url, { maxBytes: 8, onOverflow });

    await expect(guarded.text()).rejects.toThrow(/blocked oversized response/);
    expect(onOverflow).toHaveBeenCalledTimes(1);
  });

  it('enforces the cap when a declared length under-reports the body', async () => {
    const url = 'https://example.com/page';
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(5));
        controller.enqueue(new Uint8Array(5));
        controller.close();
      },
    });
    const response = makeResponse(
      url,
      { 'content-type': 'text/plain', 'content-length': '1' },
      body,
    );

    const guarded = guardProviderResponse(response, url, { maxBytes: 8 });
    await expect(guarded.text()).rejects.toThrow(/blocked oversized response/);
  });

  it('passes normal HTML through and records a successful network attempt', async () => {
    const tracker = createNetworkTracker();
    const url = 'https://new15.hdhub4u.cl/steps-2026-webrip-hindi-full-movie/';
    const fakeFetch = (async () =>
      makeResponse(url, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': '18',
      })) as unknown as typeof fetch;

    await scraperNetworkStorage.run({ tracker }, async () => {
      const providerFetch = createProviderFetch(5000, fakeFetch);
      const response = await providerFetch(url);
      expect(await response.text()).toBe('<html>ok</html>');
    });

    expect(tracker.attempts).toHaveLength(1);
    expect(tracker.attempts[0]).toMatchObject({ url, ok: true, status: 200 });
  });

  it('records a blocked provider fetch as a failed network attempt', async () => {
    const tracker = createNetworkTracker();
    const url = 'https://hubcloud.mov/drive/t3dl.php?id=h1atrhmmprbntnt';
    const fakeFetch = (async () =>
      makeResponse(url, {
        'content-type': 'text/html',
        'content-length': '2427569820',
      })) as unknown as typeof fetch;

    await scraperNetworkStorage.run({ tracker }, async () => {
      const providerFetch = createProviderFetch(5000, fakeFetch);
      await expect(providerFetch(url)).rejects.toThrow(/blocked oversized response/);
    });

    expect(tracker.attempts).toHaveLength(1);
    expect(tracker.attempts[0]).toMatchObject({
      url,
      ok: false,
      error: expect.stringMatching(/blocked oversized response/),
    });
  });

  it('uses a 16 MiB safety ceiling', () => {
    expect(MAX_PROVIDER_RESPONSE_BYTES).toBe(16 * 1024 * 1024);
  });

  it('intercepts GramCinema genLink calls with a synthetic URL', async () => {
    const fileId = 'AgADrwsAAsZloEc';
    const fakeFetch = vi.fn();
    const providerFetch = createProviderFetch(
      5000,
      fakeFetch as unknown as typeof fetch,
      gramCinemaLazyFetch,
    );

    const response = await providerFetch(
      `https://tga-hd.api.hashhackers.com/genLink?type=mix_media&id=${fileId}`,
    );

    expect(await response.json()).toEqual({
      success: true,
      url: `https://cdn1.apranet.eu.org/dl/${fileId}/lazy.mkv`,
    });
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it('leaves non-GramCinema requests to the network', async () => {
    const fakeFetch = vi.fn(async () => new Response('ok'));
    const providerFetch = createProviderFetch(
      5000,
      fakeFetch as unknown as typeof fetch,
      gramCinemaLazyFetch,
    );

    const response = await providerFetch('https://example.test/genLink?type=mix_media&id=abc');

    expect(await response.text()).toBe('ok');
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });
});
