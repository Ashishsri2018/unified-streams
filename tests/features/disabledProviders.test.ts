import { describe, it, expect } from 'vitest';
import { deriveFleetEnv, loadAppEnv } from '../../src/core/env.js';
import {
  isProviderEnabledByPolicy,
  parseProviderPolicyPayload,
} from '../../src/core/providerPolicy.js';

function policyFrom(env: Record<string, string>) {
  const raw = env.PROVIDER_POLICY_JSON;
  expect(raw).toBeDefined();
  return parseProviderPolicyPayload(raw);
}

describe('provider policy derivation', () => {
  it('emits only the consolidated policy payload', () => {
    const appEnv = loadAppEnv({});
    for (const fleet of ['sa7', 'nuvio', 'vega'] as const) {
      const env = deriveFleetEnv(appEnv, fleet, 7000);
      expect(env.PROVIDER_POLICY_JSON).toBeDefined();
      expect(env.SA7_ENABLED_PROVIDERS).toBeUndefined();
      expect(env.SA7_DISABLED_PROVIDERS).toBeUndefined();
      expect(env.ENABLED_PROVIDERS).toBeUndefined();
      expect(env.DISABLED_PROVIDERS).toBeUndefined();
      expect(env.ENABLED_SCRAPERS).toBeUndefined();
      expect(env.DISABLED_SCRAPERS).toBeUndefined();
      expect(env.RUNTIME_OVERRIDES_JSON).toBeUndefined();
      expect(env.HARD_DISABLED_PROVIDERS).toBeUndefined();
      expect(env.SELECTION_VERSION).toBeUndefined();
    }
  });

  it('allocates exactly one copy per duplicate group on Railway', () => {
    const appEnv = loadAppEnv({ INSTANCE_PROFILE: 'railway' });
    const sa7 = policyFrom(deriveFleetEnv(appEnv, 'sa7', 7001));
    const nuvio = policyFrom(deriveFleetEnv(appEnv, 'nuvio', 7002));
    const vega = policyFrom(deriveFleetEnv(appEnv, 'vega', 7003));

    // Nuvio is first in duplicatePriority, so it keeps every nuvio copy.
    expect(nuvio.disabled).not.toContain('hexion');
    expect(nuvio.disabled).not.toContain('zyrvael');
    expect(nuvio.disabled).not.toContain('pynvix');

    // Vega keeps only groups where no earlier fleet has a copy (animesalt)
    // and loses every nuvio-primary copy.
    expect(vega.disabled).toEqual(
      expect.arrayContaining([
        '4khdhub',
        'anikoto',
        'castle',
        'hdhub4u',
        'kissKh',
        'multi',
        'movieBox',
        'movieBoxWeb',
        'animeworld',
        'showbox',
      ]),
    );
    expect(vega.disabled).not.toContain('animesalt');

    // SA7 keeps no primary copy at all.
    expect(sa7.disabled).toEqual(
      expect.arrayContaining([
        '4khdhub',
        'animesalt',
        'anizone',
        'castle',
        'hdhub4u',
        'multimovies',
        'netmirror',
        'moviebox',
        'animeworld',
      ]),
    );
    expect(sa7.disabled).not.toContain('anikoto');
    expect(sa7.disabled).not.toContain('kisskh');
    expect(sa7.disabled).not.toContain('showbox');
  });

  it('keeps every non-primary copy on Beamup', () => {
    const appEnv = loadAppEnv({ INSTANCE_PROFILE: 'beamup' });
    const sa7 = policyFrom(deriveFleetEnv(appEnv, 'sa7', 7001));
    const nuvio = policyFrom(deriveFleetEnv(appEnv, 'nuvio', 7002));
    const vega = policyFrom(deriveFleetEnv(appEnv, 'vega', 7003));

    // Nuvio is primary everywhere it appears, so Beamup denies its copies.
    expect(nuvio.disabled).toEqual(
      expect.arrayContaining([
        'hexion',
        'zyrvael',
        'lenyr',
        'karnis',
        'qyrvaen',
        'fyron',
        'fastrion',
        'soryn',
        'mavonyx',
        'pynvix',
        'gravix',
      ]),
    );
    // Vega primaries are denied on Beamup; non-primary vega copies stay.
    expect(vega.disabled).toContain('animesalt');
    expect(vega.disabled).not.toContain('showbox');
    expect(vega.disabled).not.toContain('4khdhub');
    expect(vega.disabled).not.toContain('movieBox');
    expect(vega.disabled).not.toContain('animeworld');
    // SA7 never holds a primary copy, so duplicate allocation denies nothing.
    expect(sa7.disabled).not.toContain('4khdhub');
    expect(sa7.disabled).not.toContain('animesalt');
    expect(sa7.disabled).not.toContain('moviebox');
  });

  it('applies profile deny lists without duplicates', () => {
    const appEnv = loadAppEnv({ INSTANCE_PROFILE: 'railway' });
    const nuvio = policyFrom(deriveFleetEnv(appEnv, 'nuvio', 7002));
    expect(nuvio.disabled).toEqual(
      expect.arrayContaining(['kethrax', 'lyrin', 'novus', 'vyranel', 'zevran']),
    );
    expect(nuvio.disabled).not.toContain('sylphera');

    const beamupEnv = loadAppEnv({ INSTANCE_PROFILE: 'beamup' });
    const sa7 = policyFrom(deriveFleetEnv(beamupEnv, 'sa7', 7001));
    expect(sa7.disabled).toEqual(
      expect.arrayContaining([
        'anizen',
        'dahmermovies',
        'desiflix',
        'einthusan',
        'movix-vf',
        'playimdb',
        'redflix',
        'topcartoons',
      ]),
    );
    expect(sa7.disabled).not.toContain('moviesdrive');
  });

  it('falls back to the default profile for generic and unknown names', () => {
    const generic = loadAppEnv({ INSTANCE_PROFILE: 'generic' });
    const unknown = loadAppEnv({ INSTANCE_PROFILE: 'not-a-profile' });
    const railway = loadAppEnv({ INSTANCE_PROFILE: 'railway' });

    const genericPolicy = policyFrom(deriveFleetEnv(generic, 'nuvio', 7002));
    const unknownPolicy = policyFrom(deriveFleetEnv(unknown, 'nuvio', 7002));
    const railwayPolicy = policyFrom(deriveFleetEnv(railway, 'nuvio', 7002));

    expect(genericPolicy.disabled.sort()).toEqual(railwayPolicy.disabled.sort());
    expect(unknownPolicy.disabled.sort()).toEqual(railwayPolicy.disabled.sort());
  });

  it('carries runtime overrides but locked providers still win', () => {
    const appEnv = loadAppEnv({ INSTANCE_PROFILE: 'railway' });
    const env = deriveFleetEnv(appEnv, 'vega', 7003, { torrentio: true, animeworld: true }, 7);
    const policy = policyFrom(env);

    expect(policy.version).toBe(7);
    expect(policy.overrides).toMatchObject({ torrentio: true, animeworld: true });
    expect(policy.locked).toContain('torrentio');
    expect(policy.locked).toContain('mxplayer');
    expect(isProviderEnabledByPolicy('torrentio', policy)).toBe(false);
    expect(isProviderEnabledByPolicy('animeworld', policy)).toBe(true);
    // A locked provider stays disabled even with a wildcard override.
    const wildcard = parseProviderPolicyPayload(
      JSON.stringify({ ...policy, overrides: { '*': true } }),
    );
    expect(isProviderEnabledByPolicy('mxplayer', wildcard)).toBe(false);
  });

  it('applies the Beamup runtime settings while keeping policy deny-based', () => {
    const appEnv = loadAppEnv({ INSTANCE_PROFILE: 'beamup' });
    expect(Number(appEnv.BACKEND_TIMEOUT_MS)).toBe(12000);
    expect(Number(appEnv.GLOBAL_DEADLINE_MS)).toBe(13000);
    expect(Number(appEnv.SEARCH_CONCURRENCY)).toBe(40);
    expect(Number(appEnv.SCRAPER_CONCURRENCY)).toBe(40);
    expect(Number(appEnv.SA7_CONCURRENCY)).toBe(40);

    const sa7Env = deriveFleetEnv(appEnv, 'sa7', 7001);
    const nuvioEnv = deriveFleetEnv(appEnv, 'nuvio', 7002);
    const vegaEnv = deriveFleetEnv(appEnv, 'vega', 7003);
    expect(Number(sa7Env.PROVIDER_CONCURRENCY)).toBe(40);
    expect(nuvioEnv.SCRAPER_CONCURRENCY).toBe('40');
    expect(vegaEnv.SEARCH_CONCURRENCY).toBe('40');
  });

  it('applies the Railway profile timeouts', () => {
    const appEnv = loadAppEnv({ INSTANCE_PROFILE: 'railway' });
    expect(Number(appEnv.BACKEND_TIMEOUT_MS)).toBe(34000);
    expect(Number(appEnv.GLOBAL_DEADLINE_MS)).toBe(38000);
    expect(Number(appEnv.SEARCH_CONCURRENCY)).toBe(40);
    expect(Number(appEnv.SEARCH_TIMEOUT_MS)).toBe(20000);
  });
});
