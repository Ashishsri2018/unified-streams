import { describe, it, expect } from 'vitest';
import { ProviderPolicy } from '../../src/core/policy.js';
import { CircuitBreaker, clampTimeout } from '../../src/core/concurrency.js';

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
});
