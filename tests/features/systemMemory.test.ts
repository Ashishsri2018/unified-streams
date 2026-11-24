import { describe, it, expect, vi, beforeEach } from 'vitest';

const { readFileSync, totalmem, freemem } = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  totalmem: vi.fn(),
  freemem: vi.fn(),
}));

vi.mock('node:fs', () => ({ default: { readFileSync } }));
vi.mock('node:os', () => ({ default: { totalmem, freemem } }));

import { readSystemMemory } from '../../src/core/systemMemory.js';

describe('readSystemMemory', () => {
  beforeEach(() => {
    readFileSync.mockReset();
    totalmem.mockReset();
    freemem.mockReset();
  });

  it('reads cgroup v2 usage and limit', () => {
    readFileSync.mockImplementation((filePath: string) => {
      if (filePath.endsWith('memory.current')) return '1234';
      if (filePath.endsWith('memory.max')) return '10000';
      throw new Error('missing');
    });

    expect(readSystemMemory(10_000_000)).toEqual({
      totalBytes: 10000,
      usedBytes: 1234,
      availableBytes: 8766,
      source: 'cgroup-v2',
    });
  });

  it('treats an unlimited cgroup max as unknown total', () => {
    readFileSync.mockImplementation((filePath: string) => {
      if (filePath.endsWith('memory.current')) return '2000';
      if (filePath.endsWith('memory.max')) return 'max';
      throw new Error('missing');
    });

    expect(readSystemMemory(20_000_000)).toEqual({
      totalBytes: null,
      usedBytes: 2000,
      availableBytes: null,
      source: 'cgroup-v2',
    });
  });

  it('falls back to cgroup v1 then os totals', () => {
    readFileSync.mockImplementation((filePath: string) => {
      if (filePath.endsWith('memory.usage_in_bytes')) return '500';
      if (filePath.endsWith('memory.limit_in_bytes')) return '5000';
      throw new Error('missing');
    });

    expect(readSystemMemory(30_000_000)).toEqual({
      totalBytes: 5000,
      usedBytes: 500,
      availableBytes: 4500,
      source: 'cgroup-v1',
    });

    readFileSync.mockImplementation(() => {
      throw new Error('missing');
    });
    totalmem.mockReturnValue(8000);
    freemem.mockReturnValue(3000);

    expect(readSystemMemory(40_000_000)).toEqual({
      totalBytes: 8000,
      usedBytes: 5000,
      availableBytes: 3000,
      source: 'os',
    });
  });
});
