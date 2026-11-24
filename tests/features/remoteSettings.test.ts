import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteSettingsClient } from '../../src/core/remoteSettings.js';
import { emptyProviderOverrides, parseProviderOverrides } from '../../src/core/providerOverrides.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Cloudflare remote settings', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads saved overrides with bearer auth', async () => {
    const settings = emptyProviderOverrides();
    settings.version = 4;
    settings.fleets.sa7.alpha = false;
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ settings, version: 9 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new RemoteSettingsClient({
      endpoint: 'https://ingest.example.com/',
      token: 'secret',
    });
    await expect(client.load()).resolves.toEqual(settings);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ingest.example.com/v1/settings',
      expect.objectContaining({
        method: 'GET',
        headers: { authorization: 'Bearer secret' },
      }),
    );
  });

  it('returns null when no remote settings have been saved', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ settings: null })));
    const client = new RemoteSettingsClient({ endpoint: 'https://ingest.example.com' });
    await expect(client.load()).resolves.toBeNull();
  });

  it('saves the current overrides as JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ ok: true, version: 3, updatedAt: '2026-11-24T00:00:00.000Z' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const settings = emptyProviderOverrides();
    settings.version = 2;
    settings.fleets.vega.alpha = true;

    const client = new RemoteSettingsClient({
      endpoint: 'https://ingest.example.com',
      token: 'secret',
    });
    await expect(client.save(settings)).resolves.toEqual({
      version: 3,
      updatedAt: '2026-11-24T00:00:00.000Z',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ingest.example.com/v1/settings',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ settings }),
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer secret',
        },
      }),
    );
  });

  it('rejects unconfigured clients and failed responses', async () => {
    const unconfigured = new RemoteSettingsClient({});
    expect(unconfigured.isConfigured()).toBe(false);
    await expect(unconfigured.load()).rejects.toThrow('not configured');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, 502)));
    const client = new RemoteSettingsClient({ endpoint: 'https://ingest.example.com' });
    await expect(client.load()).rejects.toThrow('HTTP 502');
  });

  it('validates the provider overrides payload', () => {
    expect(() => parseProviderOverrides({ version: 1, fleets: { sa7: { alpha: 'yes' } } })).toThrow();
    expect(
      parseProviderOverrides({
        version: 2,
        updatedAt: '2026-11-24T00:00:00.000Z',
        fleets: { sa7: { Alpha: false } },
      }),
    ).toMatchObject({ version: 2, fleets: { sa7: { alpha: false } } });
  });
});
