import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createGatewayApp } from '../../src/addon/app.js';
import { GatewayStreamCache } from '../../src/core/cache.js';
import type { StreamHandlerContext } from '../../src/addon/stream.js';
import type { WorkerClient } from '../../src/core/workerClient.js';
import type { StremioStream } from '../../src/addon/filters.js';
import {
  GRAMCINEMA_REFRESH_TOKEN_TTL_MS,
  extractGramCinemaFileId,
  rewriteGramCinemaStreamUrl,
  signGramCinemaRefreshToken,
  verifyGramCinemaRefreshToken,
  type GramCinemaRefreshRuntime,
} from '../../src/addon/gramCinemaRefresh.js';
import { normalizeGramCinemaToken, resolveGramCinemaToken } from '../../src/core/env.js';

const SECRET = 'test-secret-value';
const BASE = 'https://gateway.example';
const FILE_ID = 'AgADLCAAAsoOoVM';
const CDN_URL =
  `https://cdn3.apranet.eu.org/dl/${FILE_ID}/BAACAgQAAyEFAATk/304489588/VisionQuest_2026_S01E02_720p.mkv?t=1795666252&s=abc`;
const FRESH_URL =
  `https://cdn4.apranet.eu.org/dl/${FILE_ID}/BAACAgQAAyEFAATk/304489588/VisionQuest_2026_S01E02_720p.mkv?t=1795669999&s=def`;

function runtime(overrides: Partial<GramCinemaRefreshRuntime> = {}): GramCinemaRefreshRuntime {
  return {
    token: 'gc-token',
    secret: SECRET,
    cache: new Map(),
    ...overrides,
  };
}

function makeApp(refresh: GramCinemaRefreshRuntime, streamUrl = CDN_URL) {
  const worker = {
    fetchStream: vi.fn().mockResolvedValue({
      streams: [{ name: 'Fjoral.', title: 'GramCinema • 1080P', url: streamUrl }],
      outcome: 'ok',
    }),
    getHealth: vi.fn(),
    reload: vi.fn(),
  } as unknown as WorkerClient;
  const ctx: StreamHandlerContext = {
    cache: new GatewayStreamCache(),
    workers: { sa7: worker, nuvio: worker, vega: worker },
    addonVersion: '1.0.0',
    policyVersion: '0',
    maxStreams: 1000,
    globalDeadlineMs: 12000,
    workerTimeoutMs: 10000,
    publicBaseUrl: BASE,
    gramCinemaRefresh: refresh,
  };
  return createGatewayApp(ctx, Date.now());
}

describe('GramCinema refresh tokens and URLs', () => {
  it('signs and verifies tokens, rejecting tampering and expiry', () => {
    const now = 1_700_000_000_000;
    const token = signGramCinemaRefreshToken(FILE_ID, SECRET, 60_000, now);
    expect(verifyGramCinemaRefreshToken(token, SECRET, now)).toEqual({
      fileId: FILE_ID,
      exp: now + 60_000,
    });
    expect(verifyGramCinemaRefreshToken(token, SECRET, now + 60_001)).toBeNull();
    expect(verifyGramCinemaRefreshToken(token, 'wrong-secret', now)).toBeNull();
    expect(verifyGramCinemaRefreshToken('not-a-token', SECRET, now)).toBeNull();
    expect(verifyGramCinemaRefreshToken('', SECRET, now)).toBeNull();

    const [body, signature] = token.split('.');
    const tampered = `${body.slice(0, -2)}aa.${signature}`;
    expect(verifyGramCinemaRefreshToken(tampered, SECRET, now)).toBeNull();
  });

  it('extracts only Telegram file ids from apranet CDN links', () => {
    expect(extractGramCinemaFileId(CDN_URL)).toBe(FILE_ID);
    expect(extractGramCinemaFileId(`http://cdn3.apranet.eu.org/dl/${FILE_ID}/x.mkv`)).toBeNull();
    expect(extractGramCinemaFileId(`https://cdn3.apranet.eu.org.evil.test/dl/${FILE_ID}/x.mkv`)).toBeNull();
    expect(extractGramCinemaFileId(`https://cdn3.apranet.eu.org/not-dl/${FILE_ID}/x.mkv`)).toBeNull();
    expect(extractGramCinemaFileId('https://cdn3.apranet.eu.org/dl/../x.mkv')).toBeNull();
    expect(extractGramCinemaFileId('')).toBeNull();
  });

  it('rewrites matching streams and leaves other URLs alone', () => {
    const stream: StremioStream = {
      name: 'Fjoral.',
      title: 'GramCinema • 1080P',
      url: CDN_URL,
      behaviorHints: { proxyHeaders: { request: { Referer: 'https://bollywood.eu.org/' } } },
    };
    const rewritten = rewriteGramCinemaStreamUrl(stream, {
      baseUrl: BASE,
      secret: SECRET,
      now: 1_700_000_000_000,
    });
    expect(rewritten.url).toMatch(
      new RegExp(`^https://gateway\\.example/proxy/gramcinema/${FILE_ID}\\.mkv\\?t=`),
    );
    const token = new URL(rewritten.url ?? '').searchParams.get('t') ?? '';
    expect(verifyGramCinemaRefreshToken(token, SECRET, 1_700_000_000_000)?.fileId).toBe(FILE_ID);
    expect(rewritten.behaviorHints).toEqual(stream.behaviorHints);
    expect(rewritten.name).toBe('Fjoral.');

    const other: StremioStream = { url: 'https://example.test/movie.mkv' };
    expect(rewriteGramCinemaStreamUrl(other, { baseUrl: BASE, secret: SECRET })).toBe(other);
    const external: StremioStream = { externalUrl: CDN_URL };
    expect(rewriteGramCinemaStreamUrl(external, { baseUrl: BASE, secret: SECRET })).toBe(external);
  });

  it('normalizes tokens from env and provider settings', () => {
    expect(normalizeGramCinemaToken('gc_session=abc')).toBe('abc');
    expect(normalizeGramCinemaToken('Bearer abc')).toBe('abc');
    expect(normalizeGramCinemaToken('  bearer   abc  ')).toBe('abc');
    expect(
      resolveGramCinemaToken({ GRAMCINEMA_TOKEN: 'gc_session=direct' }),
    ).toBe('direct');
    expect(
      resolveGramCinemaToken({
        SCRAPER_SETTINGS_JSON: JSON.stringify({ fjoral: { cinemaTvToken: 'gc_session=scraper' } }),
      }),
    ).toBe('scraper');
    expect(
      resolveGramCinemaToken({
        PROVIDER_SETTINGS_JSON: JSON.stringify({
          nuvio: { fjoral: { cinemaTvToken: 'Bearer provider' } },
        }),
      }),
    ).toBe('provider');
    expect(
      resolveGramCinemaToken({
        GRAMCINEMA_TOKEN: 'direct',
        SCRAPER_SETTINGS_JSON: JSON.stringify({ fjoral: { cinemaTvToken: 'scraper' } }),
      }),
    ).toBe('direct');
  });
});

describe('GramCinema refresh route', () => {
  it('rewrites stream responses to proxy URLs without calling genLink', async () => {
    const fetchImpl = vi.fn();
    const app = makeApp(runtime({ fetchImpl: fetchImpl as unknown as typeof fetch }));
    const response = await request(app).get('/stream/movie/tt0111161.json');

    expect(response.status).toBe(200);
    expect(response.body.streams).toHaveLength(1);
    const proxyUrl: string = response.body.streams[0].url;
    expect(proxyUrl).toMatch(
      new RegExp(`^https://gateway\\.example/proxy/gramcinema/${FILE_ID}\\.mkv\\?t=`),
    );
    const token = new URL(proxyUrl).searchParams.get('t') ?? '';
    expect(verifyGramCinemaRefreshToken(token, SECRET)?.fileId).toBe(FILE_ID);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('redirects to a freshly generated link and caches it per file', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, url: FRESH_URL }),
    });
    const app = makeApp(runtime({ fetchImpl: fetchImpl as unknown as typeof fetch }));
    const token = signGramCinemaRefreshToken(FILE_ID, SECRET, GRAMCINEMA_REFRESH_TOKEN_TTL_MS);

    const first = await request(app).get(`/proxy/gramcinema/${FILE_ID}.mkv?t=${encodeURIComponent(token)}`);
    expect(first.status).toBe(302);
    expect(first.headers.location).toBe(FRESH_URL);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.headers['access-control-allow-origin']).toBe('*');

    const second = await request(app).get(`/proxy/gramcinema/${FILE_ID}.mkv?t=${encodeURIComponent(token)}`);
    expect(second.status).toBe(302);
    expect(second.headers.location).toBe(FRESH_URL);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toContain(`/genLink?type=mix_media&id=${FILE_ID}`);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: 'Bearer gc-token' }),
    });
  });

  it('answers HEAD with a redirect and no body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, url: FRESH_URL }),
    });
    const app = makeApp(runtime({ fetchImpl: fetchImpl as unknown as typeof fetch }));
    const token = signGramCinemaRefreshToken(FILE_ID, SECRET, GRAMCINEMA_REFRESH_TOKEN_TTL_MS);

    const response = await request(app).head(`/proxy/gramcinema/${FILE_ID}.mkv?t=${encodeURIComponent(token)}`);
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(FRESH_URL);
    expect(response.text).toBeFalsy();
  });

  it('rejects missing, invalid, and expired tokens', async () => {
    const app = makeApp(runtime());

    const missing = await request(app).get('/proxy/gramcinema');
    expect(missing.status).toBe(400);

    const invalid = await request(app).get('/proxy/gramcinema?t=bad');
    expect(invalid.status).toBe(403);

    const expired = signGramCinemaRefreshToken(FILE_ID, SECRET, 60_000, 1_700_000_000_000);
    const response = await request(app).get(
      `/proxy/gramcinema/${FILE_ID}.mkv?t=${encodeURIComponent(expired)}`,
    );
    expect(response.status).toBe(403);
  });

  it('returns 502 for upstream failures and unsafe URLs', async () => {
    const failing = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    const app = makeApp(runtime({ fetchImpl: failing as unknown as typeof fetch }));
    const token = signGramCinemaRefreshToken(FILE_ID, SECRET, GRAMCINEMA_REFRESH_TOKEN_TTL_MS);

    const upstream = await request(app).get(`/proxy/gramcinema/${FILE_ID}.mkv?t=${encodeURIComponent(token)}`);
    expect(upstream.status).toBe(502);

    const unsafeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, url: 'https://evil.test/file.mkv' }),
    });
    const unsafeApp = makeApp(runtime({ fetchImpl: unsafeFetch as unknown as typeof fetch }));
    const unsafe = await request(unsafeApp).get(
      `/proxy/gramcinema/${FILE_ID}.mkv?t=${encodeURIComponent(token)}`,
    );
    expect(unsafe.status).toBe(502);
  });
});
