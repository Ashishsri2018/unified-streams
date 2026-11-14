import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { ProviderTelemetry } from '../../src/core/providerTelemetry.js';

const require = createRequire(import.meta.url);
const { createBreaker } = require('../../src/fleets/sa7/lib/breaker.js');

describe('ProviderTelemetry canonical semantics', () => {
  it('counts empty results as successful and never trips the breaker', () => {
    const telemetry = new ProviderTelemetry({ failureThreshold: 3 });
    expect(telemetry.attempt('p')).toBe(true);
    telemetry.record('p', 'empty');

    const [entry] = telemetry.snapshot();
    expect(entry).toMatchObject({
      id: 'p',
      state: 'closed',
      calls: 1,
      ok: 1,
      responded: 0,
      empty: 1,
      errors: 0,
      timeouts: 0,
      skipped: 0,
      successRate: 1,
      lastError: null,
    });
  });

  it('opens only after consecutive genuine failures and skips while open', () => {
    let now = 0;
    const telemetry = new ProviderTelemetry({
      failureThreshold: 3,
      cooldownMs: 1000,
      now: () => now,
    });

    for (let i = 0; i < 3; i += 1) {
      expect(telemetry.attempt('p')).toBe(true);
      telemetry.record('p', 'error', { error: new Error(`boom-${i}`) });
    }

    let [entry] = telemetry.snapshot();
    expect(entry).toMatchObject({
      state: 'open',
      calls: 3,
      ok: 0,
      errors: 3,
      consecutiveFailures: 3,
      lastError: 'boom-2',
    });

    expect(telemetry.attempt('p')).toBe(false);
    [entry] = telemetry.snapshot();
    expect(entry).toMatchObject({ state: 'open', calls: 3, skipped: 1 });

    now = 1000;
    expect(telemetry.attempt('p')).toBe(true);
    telemetry.record('p', 'ok');
    [entry] = telemetry.snapshot();
    expect(entry).toMatchObject({
      state: 'closed',
      calls: 4,
      ok: 1,
      errors: 3,
      consecutiveFailures: 0,
      lastError: null,
    });
  });

  it('clears the last error after an empty recovery', () => {
    const telemetry = new ProviderTelemetry();
    telemetry.attempt('p');
    telemetry.record('p', 'timeout', { error: new Error('timeout') });
    expect(telemetry.snapshot()[0]?.lastError).toBe('timeout');

    telemetry.attempt('p');
    telemetry.record('p', 'empty');
    expect(telemetry.snapshot()[0]?.lastError).toBeNull();
  });

  it('records skipped work without inflating calls', () => {
    const telemetry = new ProviderTelemetry();
    telemetry.record('p', 'skipped');
    expect(telemetry.snapshot()[0]).toMatchObject({
      calls: 0,
      skipped: 1,
      ok: 0,
    });
  });

  it('stays in parity with the SA7 breaker', () => {
    let now = 0;
    const plan = [
      'attempt-ok',
      'attempt-empty',
      'attempt-error',
      'attempt-error',
      'attempt-error',
      'attempt-open',
      'cooldown',
      'attempt-ok',
      'attempt-timeout',
    ] as const;

    const shared = new ProviderTelemetry({
      failureThreshold: 3,
      cooldownMs: 500,
      now: () => now,
    });
    const sa7 = createBreaker({
      threshold: 3,
      cooldownMs: 500,
      now: () => now,
    });

    for (const step of plan) {
      if (step === 'cooldown') {
        now += 500;
        continue;
      }
      if (step === 'attempt-open') {
        expect(shared.attempt('p')).toBe(false);
        expect(sa7.attempt('p')).toBe(false);
        continue;
      }
      expect(shared.attempt('p')).toBe(true);
      expect(sa7.attempt('p')).toBe(true);
      const outcome = step === 'attempt-ok'
        ? 'ok'
        : step === 'attempt-empty'
          ? 'empty'
          : step === 'attempt-timeout'
            ? 'timeout'
            : 'error';
      shared.record('p', outcome, { latencyMs: 10, error: new Error(outcome) });
      sa7.record('p', outcome, { latencyMs: 10, error: new Error(outcome) });
      now += 10;
    }

    const sharedEntry = shared.snapshot()[0];
    const sa7Entry = sa7.snapshot()[0];
    expect(sharedEntry).toBeDefined();
    expect(sa7Entry).toBeDefined();

    for (const key of [
      'state',
      'calls',
      'ok',
      'responded',
      'empty',
      'errors',
      'timeouts',
      'skipped',
      'consecutiveFailures',
      'avgMs',
    ] as const) {
      expect(sharedEntry?.[key]).toBe(sa7Entry?.[key]);
    }
  });
});
