import { describe, expect, it } from 'vitest';
import { reconcileProviderStates } from '../../src/core/providerChanges.js';

describe('provider reconciliation', () => {
  it('reports added, removed, and upstream state changes', () => {
    const result = reconcileProviderStates(
      [
        { id: 'alpha', upstreamEnabled: true },
        { id: 'beta', upstreamEnabled: true },
        { id: 'gone', upstreamEnabled: false },
      ],
      [
        { id: 'ALPHA', upstreamEnabled: true },
        { id: 'beta', upstreamEnabled: false },
        { id: 'gamma', upstreamEnabled: true },
      ],
    );
    expect(result.added).toEqual([{ id: 'gamma', upstreamEnabled: true }]);
    expect(result.removed).toEqual(['gone']);
    expect(result.stateChanged).toEqual([
      { id: 'beta', from: 'enabled', to: 'disabled' },
    ]);
  });

  it('returns no changes without a baseline', () => {
    expect(reconcileProviderStates(null, [{ id: 'alpha', upstreamEnabled: true }])).toEqual({
      added: [],
      removed: [],
      stateChanged: [],
    });
  });
});
