import { describe, it, expect } from 'vitest';
import { installFailureSummary } from '../../src/fleets/vega/providers/updater.js';
import type { UpstreamProviderEntry } from '../../src/fleets/vega/types.js';

function entry(value: string, disabled = false): UpstreamProviderEntry {
  return { display_name: value, value, version: '1', disabled };
}

describe('vega install failure summary', () => {
  it('ignores policy-disabled providers that are intentionally not loaded', () => {
    const entries = [entry('a'), entry('b'), entry('off'), entry('off2')];

    expect(
      installFailureSummary(entries, { enabled: [], disabled: ['off', 'off2'] }, 2),
    ).toBeNull();
  });

  it('reports only enabled providers that failed to install', () => {
    const entries = [entry('a'), entry('b'), entry('off')];

    expect(
      installFailureSummary(entries, { enabled: [], disabled: ['off'] }, 1),
    ).toBe('1/2 provider(s) failed to install');
  });
});
