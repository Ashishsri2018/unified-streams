import { describe, it, expect } from 'vitest';
import { ProviderPolicy } from '../../src/core/policy.js';
import { CircuitBreaker, clampTimeout } from '../../src/core/concurrency.js';
import { deriveFleetEnv, loadAppEnv } from '../../src/core/env.js';

describe('provider policy and concurrency', () => {
  it('enforces allow and deny modes in provider policy', () => {
    const policy = new ProviderPolicy({
      sa7: { mode: 'allow', ids: ['vidrock', 'desiflix'] },
      nuvio: { mode: 'deny', ids: ['bad_provider'] },
      vega: { mode: 'deny', ids: ['torrentio'] },
    });

    // SA7 (allow mode)
    expect(policy.isProviderEnabled('sa7', 'vidrock')).toBe(true);
    expect(policy.isProviderEnabled('sa7', 'unknown')).toBe(false);

    // Nuvio (deny mode)
    expect(policy.isProviderEnabled('nuvio', 'bad_provider')).toBe(false);
    expect(policy.isProviderEnabled('nuvio', 'good_provider')).toBe(true);

    // Default disabled scrapers are always disabled
    expect(policy.isProviderEnabled('vega', 'torrentio')).toBe(false);
    expect(policy.isProviderEnabled('vega', 'youtube')).toBe(false);
  });

  it('circuit breaker transitions between closed, open, and half-open', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 100 });
    expect(breaker.getState()).toBe('closed');
    expect(breaker.canExecute()).toBe(true);

    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('closed');

    breaker.recordFailure(); // 3rd failure opens circuit
    expect(breaker.getState()).toBe('open');
    expect(breaker.canExecute()).toBe(false);

    // empty outcome resets failures per spec
    breaker.recordEmpty();
    expect(breaker.getState()).toBe('closed');
  });

  it('clamps timeouts safely against remaining global deadline', () => {
    const res1 = clampTimeout(5000, 10000, 200);
    expect(res1.effectiveTimeoutMs).toBe(4800);
    expect(res1.shouldSkip).toBe(false);

    const res2 = clampTimeout(250, 10000, 200);
    expect(res2.shouldSkip).toBe(true);
  });

  it('derives vega env with febboxCookie from FEBBOX_UI_COOKIE', () => {
    const appEnv = loadAppEnv({
      FEBBOX_UI_COOKIE: 'ui=test_jwt_cookie_token_123',
    });
    const vegaEnv = deriveFleetEnv(appEnv, 'vega', 7003);
    expect(vegaEnv.PROVIDER_SETTINGS_JSON).toBeDefined();
    const parsed = JSON.parse(vegaEnv.PROVIDER_SETTINGS_JSON);
    expect(parsed.kv).toBeDefined();
    expect(parsed.kv.febboxCookie).toBe('ui=test_jwt_cookie_token_123');

    // Also handles token without leading ui=
    const appEnv2 = loadAppEnv({
      FEBBOX_UI_COOKIE: 'raw_jwt_cookie_token_456',
    });
    const vegaEnv2 = deriveFleetEnv(appEnv2, 'vega', 7003);
    const parsed2 = JSON.parse(vegaEnv2.PROVIDER_SETTINGS_JSON);
    expect(parsed2.kv.febboxCookie).toBe('ui=raw_jwt_cookie_token_456');
  });

  it('derives nuvio env with cinemaTvToken from GRAMCINEMA_TOKEN', () => {
    const appEnv = loadAppEnv({
      GRAMCINEMA_TOKEN: 'gc_session=test_jwt_session_789',
    });
    const nuvioEnv = deriveFleetEnv(appEnv, 'nuvio', 7002);
    expect(nuvioEnv.SCRAPER_SETTINGS_JSON).toBeDefined();
    const parsed = JSON.parse(nuvioEnv.SCRAPER_SETTINGS_JSON);
    expect(parsed.fjoral).toBeDefined();
    expect(parsed.fjoral.cinemaTvToken).toBe('test_jwt_session_789');

    // Also handles Bearer prefix
    const appEnv2 = loadAppEnv({
      GRAMCINEMA_TOKEN: 'Bearer test_jwt_session_bearer',
    });
    const nuvioEnv2 = deriveFleetEnv(appEnv2, 'nuvio', 7002);
    const parsed2 = JSON.parse(nuvioEnv2.SCRAPER_SETTINGS_JSON);
    expect(parsed2.fjoral.cinemaTvToken).toBe('test_jwt_session_bearer');
  });

  it('parses and forwards SEARCH_CONCURRENCY and SCRAPER_CONCURRENCY with default 30', () => {
    // Default values
    const defaultAppEnv = loadAppEnv({});
    expect(defaultAppEnv.SEARCH_CONCURRENCY).toBe(30);
    expect(defaultAppEnv.SCRAPER_CONCURRENCY).toBe(30);

    const vegaDefaultEnv = deriveFleetEnv(defaultAppEnv, 'vega', 7003);
    expect(vegaDefaultEnv.SEARCH_CONCURRENCY).toBe('30');

    const nuvioDefaultEnv = deriveFleetEnv(defaultAppEnv, 'nuvio', 7002);
    expect(nuvioDefaultEnv.SCRAPER_CONCURRENCY).toBe('30');

    // Custom values
    const customAppEnv = loadAppEnv({
      SEARCH_CONCURRENCY: '25',
      SCRAPER_CONCURRENCY: '15',
    });
    expect(customAppEnv.SEARCH_CONCURRENCY).toBe(25);
    expect(customAppEnv.SCRAPER_CONCURRENCY).toBe(15);

    const vegaCustomEnv = deriveFleetEnv(customAppEnv, 'vega', 7003);
    expect(vegaCustomEnv.SEARCH_CONCURRENCY).toBe('25');

    const nuvioCustomEnv = deriveFleetEnv(customAppEnv, 'nuvio', 7002);
    expect(nuvioCustomEnv.SCRAPER_CONCURRENCY).toBe('15');
  });

  it('keeps worker deadlines below the gateway backend timeout', () => {
    const env = loadAppEnv({ BACKEND_TIMEOUT_MS: '10000', GLOBAL_DEADLINE_MS: '12000' });

    const sa7Env = deriveFleetEnv(env, 'sa7', 7001);
    expect(Number(sa7Env.ADDON_DEADLINE_MS)).toBe(9000);
    expect(sa7Env.MAX_PER_PROVIDER_STREAMS).toBe(String(env.MAX_STREAMS_PER_PROVIDER));
    expect(sa7Env.BREAKER_FAILURE_THRESHOLD).toBe(String(env.CIRCUIT_FAILURE_THRESHOLD));

    const vegaEnv = deriveFleetEnv(env, 'vega', 7003);
    expect(Number(vegaEnv.GLOBAL_DEADLINE_MS)).toBe(9000);
    expect(Number(vegaEnv.SEARCH_TIMEOUT_MS)).toBeLessThanOrEqual(9000);
    expect(Number(vegaEnv.SETTLE_MS)).toBe(0);
    expect(Number(vegaEnv.EMPTY_FENCE_MS)).toBe(0);

    const nuvioEnv = deriveFleetEnv(env, 'nuvio', 7002);
    expect(Number(nuvioEnv.GLOBAL_DEADLINE_MS)).toBe(9000);
    expect(Number(nuvioEnv.SCRAPER_TIMEOUT_MS)).toBe(9000);

    const tightEnv = deriveFleetEnv(loadAppEnv({ BACKEND_TIMEOUT_MS: '3000' }), 'vega', 7003);
    expect(Number(tightEnv.GLOBAL_DEADLINE_MS)).toBe(2000);
    expect(Number(tightEnv.SETTLE_MS)).toBe(0);

    const defaultEnv = loadAppEnv();
    const defaultVega = deriveFleetEnv(defaultEnv, 'vega', 7003);
    expect(Number(defaultEnv.BACKEND_TIMEOUT_MS)).toBe(13000);
    expect(Number(defaultEnv.GLOBAL_DEADLINE_MS)).toBe(14000);
    expect(Number(defaultVega.GLOBAL_DEADLINE_MS)).toBe(12000);
  });
});
