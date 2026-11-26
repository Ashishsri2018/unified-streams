import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createGatewayApp } from '../../src/addon/app.js';
import { GatewayStreamCache } from '../../src/core/cache.js';
import type { StreamHandlerContext } from '../../src/addon/stream.js';
import type { WorkerClient } from '../../src/core/workerClient.js';
import { createProviderOverridesStore } from '../../src/core/providerOverrides.js';
import {
  createManifestProxyStore,
  type ManifestProxyStore,
} from '../../src/core/manifestProxyConfig.js';
import {
  rewriteManifest,
  rewriteManifestStreamUrl,
  signManifestProxyToken,
  verifyManifestProxyToken,
  type ManifestProxyRuntime,
} from '../../src/addon/manifestProxy.js';
import { mergeAndFilterStreams } from '../../src/addon/merge.js';
import type { StremioStream } from '../../src/addon/filters.js';

const SECRET = 'test-secret-value';
const TTL = 6 * 60 * 60 * 1000;
const BASE = 'https://gateway.example';

function tempStore(): { dir: string; store: ManifestProxyStore; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-proxy-test-'));
  const store = createManifestProxyStore({ dataDir: dir });
  store.load();
  return { dir, store, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function runtime(store: ManifestProxyStore, overrides: Partial<ManifestProxyRuntime> = {}): ManifestProxyRuntime {
  return {
    secret: SECRET,
    ttlMs: TTL,
    store,
    lookupHost: async () => ['93.184.216.34'],
    ...overrides,
  };
}

const FILTERS = {
  minRes: null,
  maxRes: null,
  includeUnknownRes: true,
  maxSizeGB: null,
  includeUnknownSize: true,
  subtitleMode: 'all' as const,
  subtitleLangs: [],
  includeUnknownSubtitleLang: true,
};

function makeApp(
  store: ManifestProxyStore,
  proxyRuntime: ManifestProxyRuntime,
  adminToken?: string,
  remote?: { isConfigured: () => boolean; save: ReturnType<typeof vi.fn> },
) {
  const overridesStore = createProviderOverridesStore({ dataDir: path.dirname(store.getFilePath()) });
  overridesStore.load();
  const ctx: StreamHandlerContext = {
    cache: new GatewayStreamCache(),
    workers: {} as Record<'sa7' | 'nuvio' | 'vega', WorkerClient>,
    addonVersion: '1.0.0',
    policyVersion: '0',
    maxStreams: 1000,
    globalDeadlineMs: 12000,
    workerTimeoutMs: 10000,
    publicBaseUrl: BASE,
    manifestProxy: proxyRuntime,
    ...(adminToken ? { adminToken, overridesStore } : {}),
    ...(remote ? { remoteSettings: remote as never } : {}),
  };
  return createGatewayApp(ctx, Date.now());
}

async function login(app: ReturnType<typeof makeApp>): Promise<string> {
  const response = await request(app).post('/admin/login').type('form').send({ token: 'admin' });
  return response.headers['set-cookie']?.[0] ?? '';
}

describe('manifest proxy tokens and rewrite', () => {
  it('signs and verifies tokens, rejecting tampering and expiry', () => {
    const now = 1_700_000_000_000;
    const token = signManifestProxyToken('https://moon.goldenkite.top/a.m3u8', SECRET, TTL, now);
    expect(verifyManifestProxyToken(token, SECRET, now + 1000)).toEqual({
      url: 'https://moon.goldenkite.top/a.m3u8',
      exp: now + TTL,
    });
    expect(verifyManifestProxyToken(token, SECRET, now + TTL + 1)).toBeNull();
    expect(verifyManifestProxyToken(`${token}x`, SECRET, now)).toBeNull();
    expect(verifyManifestProxyToken(token, 'wrong-secret', now)).toBeNull();
    expect(verifyManifestProxyToken('not-a-token', SECRET, now)).toBeNull();
    expect(verifyManifestProxyToken('', SECRET, now)).toBeNull();

    const [body, signature] = token.split('.');
    const tampered = `${body.slice(0, -2)}aa.${signature}`;
    expect(verifyManifestProxyToken(tampered, SECRET, now)).toBeNull();
  });

  it('rewrites master and media playlists, keeping segments direct', () => {
    const source = [
      '#EXTM3U',
      '# master comment',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",URI="audio/index.m3u8"',
      '#EXT-X-STREAM-INF:BANDWIDTH=1000',
      'video/index.m3u8',
      '#EXT-X-MAP:URI="init/init.mp4"',
      '#EXT-X-KEY:METHOD=AES-128,URI="keys/key.bin"',
      '#EXTINF:6.0,',
      'segments/1.ts',
      '#EXT-X-ENDLIST',
      '',
    ].join('\r\n');

    const output = rewriteManifest(
      source,
      'https://moon.goldenkite.top/master.m3u8',
      BASE,
      SECRET,
      TTL,
      1_700_000_000_000,
    );
    const lines = output.split('\n');
    expect(lines[0]).toBe('#EXTM3U');
    expect(lines[1]).toBe('# master comment');
    expect(lines[2]).toContain('URI="https://gateway.example/proxy/manifest?t=');
    expect(lines[4]).toMatch(/^https:\/\/gateway\.example\/proxy\/manifest\?t=/);
    expect(lines[5]).toBe('#EXT-X-MAP:URI="https://moon.goldenkite.top/init/init.mp4"');
    expect(lines[6]).toBe('#EXT-X-KEY:METHOD=AES-128,URI="https://moon.goldenkite.top/keys/key.bin"');
    expect(lines[8]).toBe('https://moon.goldenkite.top/segments/1.ts');
    expect(output).not.toContain('\r');

    const childToken = new URL(lines[4]).searchParams.get('t') ?? '';
    expect(verifyManifestProxyToken(childToken, SECRET, 1_700_000_000_000)?.url).toBe(
      'https://moon.goldenkite.top/video/index.m3u8',
    );
  });

  it('proxies an extensionless child URI after EXT-X-STREAM-INF', () => {
    const output = rewriteManifest(
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nchild\n',
      'https://moon.goldenkite.top/master.m3u8',
      BASE,
      SECRET,
      TTL,
    );
    expect(output).toContain('https://gateway.example/proxy/manifest?t=');
  });

  it('rewrites I-frame and rendition playlist URIs but leaves parts direct', () => {
    const output = rewriteManifest(
      [
        '#EXTM3U',
        '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=1,URI="iframe.m3u8"',
        '#EXT-X-RENDITION-REPORT:URI="rendition.m3u8"',
        '#EXT-X-PART:URI="part.mp4"',
        '',
      ].join('\n'),
      'https://moon.goldenkite.top/master.m3u8',
      BASE,
      SECRET,
      TTL,
    );
    const lines = output.split('\n');
    expect(lines[1]).toContain('URI="https://gateway.example/proxy/manifest?t=');
    expect(lines[2]).toContain('URI="https://gateway.example/proxy/manifest?t=');
    expect(lines[3]).toBe(
      '#EXT-X-PART:URI="https://moon.goldenkite.top/part.mp4"',
    );
  });

  it('rewrites only matching stream URLs after merge and preserves hints', () => {
    const { store, cleanup } = tempStore();
    try {
      const matching: StremioStream = {
        name: 'Vidy',
        title: 'Vidy 1080p',
        url: 'https://moon.goldenkite.top/master.m3u8?token=abc',
        behaviorHints: {
          proxyHeaders: { request: { Referer: 'https://www.vidy.st/' } },
          notWebReady: true,
        },
      };
      const other: StremioStream = {
        name: 'Other',
        url: 'https://example.com/video.mp4',
      };
      const external: StremioStream = {
        name: 'External',
        externalUrl: 'https://moon.goldenkite.top/page',
      };
      const merged = mergeAndFilterStreams(
        [{ fleet: 'nuvio', streams: [matching, other, external] }],
        FILTERS,
        100,
        { baseUrl: BASE, secret: SECRET, ttlMs: TTL, store },
      );
      const byName = Object.fromEntries(merged.map((stream) => [stream.name, stream]));
      expect(byName.Vidy.url).toMatch(/^https:\/\/gateway\.example\/proxy\/manifest\?t=/);
      expect(byName.Vidy.behaviorHints).toMatchObject({
        proxyHeaders: { request: { Referer: 'https://www.vidy.st/' } },
        notWebReady: true,
      });
      expect(byName.Other.url).toBe('https://example.com/video.mp4');
      expect(byName.External.externalUrl).toBe('https://moon.goldenkite.top/page');

      const direct = rewriteManifestStreamUrl(matching, {
        baseUrl: BASE,
        secret: SECRET,
        ttlMs: TTL,
        store,
      });
      expect(direct.url).not.toBe(matching.url);
      expect(rewriteManifestStreamUrl(other, {
        baseUrl: BASE,
        secret: SECRET,
        ttlMs: TTL,
        store,
      })).toBe(other);
    } finally {
      cleanup();
    }
  });
});

describe('manifest proxy route', () => {
  it('serves a rewritten playlist with no-store and CORS headers', async () => {
    const { store, cleanup } = tempStore();
    try {
      const fetchImpl = vi.fn(async () =>
        new Response(
          '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"\n#EXTINF:6,\nseg.ts\n',
          { status: 200, headers: { 'content-type': 'application/vnd.apple.mpegurl' } },
        ),
      );
      const app = makeApp(store, runtime(store, { fetchImpl: fetchImpl as unknown as typeof fetch }));
      const token = signManifestProxyToken('https://moon.goldenkite.top/master.m3u8', SECRET, TTL);
      const response = await request(app).get(`/proxy/manifest?t=${encodeURIComponent(token)}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/vnd.apple.mpegurl');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.text).toContain('URI="https://gateway.example/proxy/manifest?t=');
      expect(response.text).toContain('https://moon.goldenkite.top/seg.ts');
      expect(fetchImpl).toHaveBeenCalledWith(
        'https://moon.goldenkite.top/master.m3u8',
        expect.objectContaining({
          headers: expect.objectContaining({ Referer: 'https://www.vidy.st/' }),
          redirect: 'manual',
        }),
      );
    } finally {
      cleanup();
    }
  });

  it('returns HEAD status without a body', async () => {
    const { store, cleanup } = tempStore();
    try {
      const fetchImpl = vi.fn(async () =>
        new Response('#EXTM3U\n', {
          status: 200,
          headers: { 'content-type': 'application/x-mpegURL' },
        }),
      );
      const app = makeApp(store, runtime(store, { fetchImpl: fetchImpl as unknown as typeof fetch }));
      const token = signManifestProxyToken('https://moon.goldenkite.top/master.m3u8', SECRET, TTL);
      const response = await request(app).head(`/proxy/manifest?t=${encodeURIComponent(token)}`);
      expect(response.status).toBe(200);
      expect(response.text).toBeFalsy();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });

  it('rejects missing, invalid, expired, and disallowed tokens', async () => {
    const { store, cleanup } = tempStore();
    try {
      const app = makeApp(store, runtime(store, { fetchImpl: vi.fn() as unknown as typeof fetch }));
      expect((await request(app).get('/proxy/manifest')).status).toBe(400);
      expect((await request(app).get('/proxy/manifest?t=garbage')).status).toBe(403);

      const expired = signManifestProxyToken(
        'https://moon.goldenkite.top/master.m3u8',
        SECRET,
        TTL,
        Date.now() - TTL - 1000,
      );
      expect((await request(app).get(`/proxy/manifest?t=${encodeURIComponent(expired)}`)).status).toBe(403);

      const disallowed = signManifestProxyToken('https://evil.example/master.m3u8', SECRET, TTL);
      expect((await request(app).get(`/proxy/manifest?t=${encodeURIComponent(disallowed)}`)).status).toBe(403);
    } finally {
      cleanup();
    }
  });

  it('rejects disabled entries immediately', async () => {
    const { store, cleanup } = tempStore();
    try {
      const token = signManifestProxyToken('https://moon.goldenkite.top/master.m3u8', SECRET, TTL);
      store.toggle('vidy-moon', false);
      const app = makeApp(store, runtime(store, { fetchImpl: vi.fn() as unknown as typeof fetch }));
      expect((await request(app).get(`/proxy/manifest?t=${encodeURIComponent(token)}`)).status).toBe(403);
    } finally {
      cleanup();
    }
  });

  it('maps upstream failures, non-HLS bodies, and timeouts to gateway errors', async () => {
    const { store, cleanup } = tempStore();
    try {
      const token = signManifestProxyToken('https://moon.goldenkite.top/master.m3u8', SECRET, TTL);
      const path = `/proxy/manifest?t=${encodeURIComponent(token)}`;

      const upstream = makeApp(
        store,
        runtime(store, {
          fetchImpl: (async () => new Response('no', { status: 500 })) as typeof fetch,
        }),
      );
      expect((await request(upstream).get(path)).status).toBe(502);

      const nonHls = makeApp(
        store,
        runtime(store, {
          fetchImpl: (async () =>
            new Response('<html>no</html>', {
              status: 200,
              headers: { 'content-type': 'text/html' },
            })) as typeof fetch,
        }),
      );
      expect((await request(nonHls).get(path)).status).toBe(502);

      const timeout = makeApp(
        store,
        runtime(store, {
          timeoutMs: 10,
          fetchImpl: ((_url: string, init?: RequestInit) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            })) as unknown as typeof fetch,
        }),
      );
      expect((await request(timeout).get(path)).status).toBe(504);
    } finally {
      cleanup();
    }
  });

  it('rejects manifests above the body cap', async () => {
    const { store, cleanup } = tempStore();
    try {
      const body = `#EXTM3U\n${'x'.repeat(2 * 1024 * 1024)}`;
      const app = makeApp(
        store,
        runtime(store, {
          fetchImpl: (async () =>
            new Response(body, {
              status: 200,
              headers: { 'content-type': 'application/vnd.apple.mpegurl' },
            })) as typeof fetch,
        }),
      );
      const token = signManifestProxyToken('https://moon.goldenkite.top/master.m3u8', SECRET, TTL);
      const response = await request(app).get(`/proxy/manifest?t=${encodeURIComponent(token)}`);
      expect(response.status).toBe(502);
    } finally {
      cleanup();
    }
  });

  it('handles OPTIONS and rejects non-read methods', async () => {
    const { store, cleanup } = tempStore();
    try {
      const app = makeApp(store, runtime(store, { fetchImpl: vi.fn() as unknown as typeof fetch }));
      const options = await request(app).options('/proxy/manifest');
      expect(options.status).toBe(204);
      expect(options.headers.allow).toBe('GET, HEAD, OPTIONS');

      const post = await request(app).post('/proxy/manifest').send({ t: 'x' });
      expect(post.status).toBe(405);
    } finally {
      cleanup();
    }
  });

  it('rejects hosts that resolve to private addresses', async () => {
    const { store, cleanup } = tempStore();
    try {
      const fetchImpl = vi.fn();
      const app = makeApp(
        store,
        runtime(store, {
          lookupHost: async () => ['127.0.0.1'],
          fetchImpl: fetchImpl as unknown as typeof fetch,
        }),
      );
      const token = signManifestProxyToken('https://moon.goldenkite.top/master.m3u8', SECRET, TTL);
      const response = await request(app).get(`/proxy/manifest?t=${encodeURIComponent(token)}`);
      expect(response.status).toBe(502);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('follows allowlisted redirects and rejects off-list ones', async () => {
    const { store, cleanup } = tempStore();
    try {
      const token = signManifestProxyToken('https://moon.goldenkite.top/master.m3u8', SECRET, TTL);
      const path = `/proxy/manifest?t=${encodeURIComponent(token)}`;

      const allowedFetch = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(null, {
            status: 302,
            headers: { location: 'https://moon.goldenkite.top/final.m3u8' },
          }),
        )
        .mockResolvedValueOnce(
          new Response('#EXTM3U\n#EXTINF:6,\nseg.ts\n', {
            status: 200,
            headers: { 'content-type': 'application/vnd.apple.mpegurl' },
          }),
        );
      const allowed = makeApp(store, runtime(store, { fetchImpl: allowedFetch as unknown as typeof fetch }));
      const ok = await request(allowed).get(path);
      expect(ok.status).toBe(200);
      expect(allowedFetch).toHaveBeenCalledTimes(2);

      const offListFetch = vi.fn(async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://evil.example/final.m3u8' },
        }),
      );
      const offList = makeApp(store, runtime(store, { fetchImpl: offListFetch as unknown as typeof fetch }));
      expect((await request(offList).get(path)).status).toBe(502);
    } finally {
      cleanup();
    }
  });
});

describe('manifest proxy admin endpoints', () => {
  it('adds, toggles, removes, and backs up entries', async () => {
    const { dir, store, cleanup } = tempStore();
    try {
      const save = vi.fn().mockResolvedValue({ version: 3 });
      const remote = { isConfigured: () => true, save };
      const app = makeApp(store, runtime(store, { fetchImpl: vi.fn() as unknown as typeof fetch }), 'admin', remote);
      const cookie = await login(app);
      expect(cookie).toContain('us_admin=');

      const list = await request(app).get('/admin/api/manifest-proxy').set('Cookie', cookie);
      expect(list.status).toBe(200);
      expect(list.body.version).toBe(0);
      expect(list.body.entries.map((entry: { id: string }) => entry.id)).toContain('vidy-moon');

      const added = await request(app)
        .post('/admin/api/manifest-proxy/add')
        .set('Cookie', cookie)
        .send({ match: 'https://cdn.example.com/', headers: { Referer: 'https://example.com/' } });
      expect(added.status).toBe(200);
      expect(added.body.version).toBe(1);
      const addedId = added.body.entry.id;

      const toggled = await request(app)
        .post('/admin/api/manifest-proxy/toggle')
        .set('Cookie', cookie)
        .send({ id: addedId, enabled: false });
      expect(toggled.status).toBe(200);
      expect(toggled.body.entries.find((entry: { id: string }) => entry.id === addedId).enabled).toBe(false);

      const removed = await request(app)
        .post('/admin/api/manifest-proxy/remove')
        .set('Cookie', cookie)
        .send({ id: addedId });
      expect(removed.status).toBe(200);
      expect(removed.body.entries.some((entry: { id: string }) => entry.id === addedId)).toBe(false);

      const invalid = await request(app)
        .post('/admin/api/manifest-proxy/add')
        .set('Cookie', cookie)
        .send({ match: 'http://insecure.example/' });
      expect(invalid.status).toBe(400);

      const saved = await request(app).post('/admin/api/providers/save').set('Cookie', cookie);
      expect(saved.status).toBe(200);
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 0,
          fleets: { sa7: {}, nuvio: {}, vega: {} },
          manifestProxy: expect.objectContaining({ version: 3 }),
        }),
      );

      const persisted = JSON.parse(fs.readFileSync(path.join(dir, 'manifest-proxy.json'), 'utf8'));
      expect(persisted.version).toBe(3);
    } finally {
      cleanup();
    }
  });
});
