import { describe, expect, it } from 'vitest';
import { computeProviderChanges } from '../../src/core/providerChanges.js';

describe('provider changes', () => {
  it('does not mark providers when there is no baseline', () => {
    expect(computeProviderChanges(null, [{ id: 'alpha', version: '1.0.0' }])).toEqual({});
    expect(computeProviderChanges([], [{ id: 'alpha', version: '1.0.0' }])).toEqual({});
  });

  it('marks providers absent from the baseline as new', () => {
    expect(
      computeProviderChanges(
        [{ id: 'alpha', version: '1.0.0' }],
        [
          { id: 'alpha', version: '1.0.0' },
          { id: 'beta', version: '2.0.0' },
        ],
      ),
    ).toEqual({
      beta: { isNew: true, updated: false, previousVersion: null },
    });
  });

  it('marks version changes and keeps the baseline version', () => {
    expect(
      computeProviderChanges(
        [
          { id: 'alpha', version: '1.0.0' },
          { id: 'beta', version: '2.0.0' },
        ],
        [
          { id: 'alpha', version: '1.1.0' },
          { id: 'beta', version: '2.0.0' },
        ],
      ),
    ).toEqual({
      alpha: { isNew: false, updated: true, previousVersion: '1.0.0' },
    });
  });

  it('matches provider ids case-insensitively', () => {
    expect(
      computeProviderChanges(
        [{ id: 'Alpha', version: '1.0.0' }],
        [{ id: 'alpha', version: '1.0.1' }],
      ),
    ).toEqual({
      alpha: { isNew: false, updated: true, previousVersion: '1.0.0' },
    });
  });
});
