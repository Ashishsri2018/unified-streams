import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createGatewayApp } from '../../src/addon/app.js';
import { GatewayStreamCache } from '../../src/core/cache.js';
import type { StreamHandlerContext } from '../../src/addon/stream.js';
import type { WorkerClient } from '../../src/core/workerClient.js';
import type { RemoteSettingsClient } from '../../src/core/remoteSettings.js';
import {
  createProviderOverridesStore,
  type ProviderOverridesStore,
} from '../../src/core/providerOverrides.js';
import {
  isProviderEnabledWithOverrides,
  isProviderLocked,
} from '../../src/core/policy.js';

const HARD = ['torrentio'];

function catalog(fleet: 'sa7' | 'nuvio' | 'vega', version: number) {
  return {
    fleet,
    version,
    providers: [
      {
        id: 'alpha',
        name: 'Alpha',
        types: ['movie', 'tv'],
        enabled: true,
        loaded: true,
        locked: false,
        missing: false,
        lastError: null,
      },
      ...(fleet === 'sa7'
        ? [
            {
              id: 'torrentio',
              name: 'Torrentio',
              types: ['movie'],
              enabled: false,
              loaded: false,
              locked: true,
              missing: false,
              lastError: null,
            },
          ]
        : []),
    ],
  };
}

function makeWorker(fleet: 'sa7' | 'nuvio' | 'vega') {
  let version = 0;
  return {
    getProviders: vi.fn(async () => catalog(fleet, version)),
    setProviderSelection: vi.fn(async (overrides: Record<string, boolean>, next: number) => {
      version = next;
      return { ok: true, version: next, applied: Object.keys(overrides) };
    }),
  };
}

describe('provider overrides and policy', () => {
  it('applies hard-disable, runtime override, then baseline precedence', () => {
    const selection = { enabled: [], disabled: ['blocked'] };
    expect(isProviderEnabledWithOverrides('open', selection, {}, HARD)).toBe(true);
    expect(isProviderEnabledWithOverrides('blocked', selection, { blocked: true }, HARD)).toBe(true);
    expect(isProviderEnabledWithOverrides('open', selection, { open: false }, HARD)).toBe(false);
    expect(isProviderEnabledWithOverrides('torrentio', selection, { torrentio: true }, HARD)).toBe(false);
    expect(isProviderEnabledWithOverrides('open', selection, { open: false, blocked: true }, HARD)).toBe(false);
    expect(isProviderEnabledWithOverrides('open', selection, { '*': false }, HARD)).toBe(false);
    expect(isProviderEnabledWithOverrides('blocked', selection, { '*': true }, HARD)).toBe(true);
    expect(isProviderEnabledWithOverrides('open', selection, { '*': false, open: true }, HARD)).toBe(true);
    expect(isProviderLocked('TORRENTIO', HARD)).toBe(true);
    expect(isProviderLocked('open', HARD)).toBe(false);
  });

  it('persists overrides atomically and increments the version', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overrides-'));
    try {
      const store = createProviderOverridesStore({ dataDir: dir });
      store.load();
      expect(store.getVersion()).toBe(0);

      store.setOverride('sa7', 'alpha', false);
      store.setOverride('sa7', 'beta', true);
      expect(store.getVersion()).toBe(2);
      expect(store.getFleet('sa7')).toEqual({ alpha: false, beta: true });

      const reloaded = createProviderOverridesStore({ dataDir: dir });
      reloaded.load();
      expect(reloaded.getVersion()).toBe(2);
      expect(reloaded.getFleet('sa7')).toEqual({ alpha: false, beta: true });

      reloaded.setOverride('sa7', 'alpha', null);
      expect(reloaded.getFleet('sa7')).toEqual({ beta: true });
      expect(reloaded.getVersion()).toBe(3);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('provider admin gateway', () => {
  let dir: string;
  let store: ProviderOverridesStore;
  let workers: Record<'sa7' | 'nuvio' | 'vega', ReturnType<typeof makeWorker>>;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-'));
    store = createProviderOverridesStore({ dataDir: dir });
    store.load();
    workers = {
      sa7: makeWorker('sa7'),
      nuvio: makeWorker('nuvio'),
      vega: makeWorker('vega'),
    };
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function makeApp(adminToken?: string, remoteSettings?: RemoteSettingsClient) {
    const ctx: StreamHandlerContext = {
      cache: new GatewayStreamCache(),
      workers: workers as unknown as Record<'sa7' | 'nuvio' | 'vega', WorkerClient>,
      addonVersion: '1.0.0',
      policyVersion: String(store.getVersion()),
      getPolicyVersion: () => String(store.getVersion()),
      maxStreams: 1000,
      globalDeadlineMs: 12000,
      workerTimeoutMs: 10000,
      ...(adminToken ? { adminToken, overridesStore: store } : {}),
      ...(remoteSettings ? { remoteSettings } : {}),
      adminSettings: {
        instanceProfile: 'generic',
        backendTimeoutMs: 12000,
        globalDeadlineMs: 13000,
        searchTimeoutMs: 10000,
        scraperConcurrency: 30,
        sa7Concurrency: 30,
        circuitFailureThreshold: 3,
        circuitCooldownMs: 300000,
      },
    };
    return createGatewayApp(ctx, Date.now());
  }

  it('returns 404 for /admin when ADMIN_TOKEN is absent', async () => {
    const app = makeApp();
    expect((await request(app).get('/admin')).status).toBe(404);
    expect((await request(app).post('/admin/api/providers/toggle')).status).toBe(404);
  });

  it('requires login and sets an HttpOnly session cookie', async () => {
    const app = makeApp('secret-token');
    const page = await request(app).get('/admin');
    expect(page.status).toBe(401);
    expect(page.text).toContain('Admin token');

    const denied = await request(app).post('/admin/login').type('form').send({ token: 'wrong' });
    expect(denied.status).toBe(401);

    const accepted = await request(app).post('/admin/login').type('form').send({ token: 'secret-token' });
    expect(accepted.status).toBe(303);
    const cookie = accepted.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('us_admin=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).not.toContain('secret-token');

    const authed = await request(app).get('/admin').set('Cookie', cookie);
    expect(authed.status).toBe(200);
    expect(authed.text).toContain('Provider admin');
    expect(authed.text).toContain('Process memory');
  });

  it('saves current overrides to Cloudflare when configured', async () => {
    const save = vi.fn().mockResolvedValue({ version: 12, updatedAt: '2026-11-24T00:00:00.000Z' });
    const remote = {
      isConfigured: () => true,
      save,
    } as unknown as RemoteSettingsClient;
    const app = makeApp('secret-token', remote);
    const login = await request(app).post('/admin/login').type('form').send({ token: 'secret-token' });
    const cookie = login.headers['set-cookie']?.[0] ?? '';

    const res = await request(app)
      .post('/admin/api/providers/save')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      remoteVersion: 12,
      remoteUpdatedAt: '2026-11-24T00:00:00.000Z',
    });
    expect(save).toHaveBeenCalledWith(store.get());

    const unconfigured = makeApp('secret-token');
    const login2 = await request(unconfigured).post('/admin/login').type('form').send({ token: 'secret-token' });
    const cookie2 = login2.headers['set-cookie']?.[0] ?? '';
    const rejected = await request(unconfigured)
      .post('/admin/api/providers/save')
      .set('Cookie', cookie2);
    expect(rejected.status).toBe(503);
  });

  it('toggles a provider, persists it, and rejects locked providers', async () => {
    const app = makeApp('secret-token');
    const login = await request(app).post('/admin/login').type('form').send({ token: 'secret-token' });
    const cookie = login.headers['set-cookie']?.[0] ?? '';
    workers.sa7.setProviderSelection.mockClear();

    const locked = await request(app)
      .post('/admin/api/providers/toggle')
      .set('Cookie', cookie)
      .send({ fleet: 'sa7', id: 'torrentio', enabled: true });
    expect(locked.status).toBe(409);
    expect(workers.sa7.setProviderSelection).not.toHaveBeenCalled();

    const unknown = await request(app)
      .post('/admin/api/providers/toggle')
      .set('Cookie', cookie)
      .send({ fleet: 'sa7', id: 'ghost', enabled: true });
    expect(unknown.status).toBe(404);

    const res = await request(app)
      .post('/admin/api/providers/toggle')
      .set('Cookie', cookie)
      .send({ fleet: 'sa7', id: 'alpha', enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(workers.sa7.setProviderSelection).toHaveBeenCalledWith({ alpha: false }, 1);
    expect(store.getFleet('sa7')).toEqual({ alpha: false });

    const persisted = JSON.parse(fs.readFileSync(path.join(dir, 'provider-overrides.json'), 'utf8'));
    expect(persisted.version).toBe(1);
    expect(persisted.fleets.sa7).toEqual({ alpha: false });

    const reset = await request(app)
      .post('/admin/api/providers/toggle')
      .set('Cookie', cookie)
      .send({ fleet: 'sa7', id: 'alpha', enabled: null });
    expect(reset.status).toBe(200);
    expect(store.getFleet('sa7')).toEqual({});
    expect(store.getVersion()).toBe(2);
  });

  it('rejects cross-origin toggles', async () => {
    const app = makeApp('secret-token');
    const login = await request(app).post('/admin/login').type('form').send({ token: 'secret-token' });
    const cookie = login.headers['set-cookie']?.[0] ?? '';
    const res = await request(app)
      .post('/admin/api/providers/toggle')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example')
      .send({ fleet: 'sa7', id: 'alpha', enabled: false });
    expect(res.status).toBe(403);
  });
});
