import { describe, it, expect } from 'vitest';
import { GatewayStreamCache } from '../../src/core/cache.js';

describe('gateway stream cache', () => {
  it('does NOT cache empty stream results', () => {
    const cache = new GatewayStreamCache<{ streams: unknown[] }>();
    const res = cache.set('movie:tt0111161', { streams: [] }, false);
    expect(res).toBe(false);

    const lookup = cache.get('movie:tt0111161');
    expect(lookup.hit).toBe(false);

    const stats = cache.getStats();
    expect(stats.emptySkips).toBe(1);
    expect(stats.size).toBe(0);
  });

  it('caches non-empty stream results and tracks hit/miss stats', () => {
    const cache = new GatewayStreamCache<{ streams: unknown[] }>();
    const res = cache.set('movie:tt0111161', { streams: [{ url: 'https://test/1.mp4' }] }, false);
    expect(res).toBe(true);

    const lookup = cache.get('movie:tt0111161');
    expect(lookup.hit).toBe(true);
    if (lookup.hit) {
      expect(lookup.value.streams).toHaveLength(1);
      expect(lookup.isPartial).toBe(false);
    }

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.sets).toBe(1);
    expect(stats.size).toBe(1);
  });

  it('coalesces concurrent requests to the same key', async () => {
    const cache = new GatewayStreamCache<{ streams: unknown[] }>();
    let invocationCount = 0;

    const fetcher = async () => {
      invocationCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { value: { streams: [{ url: 'https://test/coalesced.mp4' }] }, isPartial: false };
    };

    const [res1, res2, res3] = await Promise.all([
      cache.coalesce('key1', fetcher),
      cache.coalesce('key1', fetcher),
      cache.coalesce('key1', fetcher),
    ]);

    expect(invocationCount).toBe(1);
    expect(res1.value.streams).toHaveLength(1);
    expect(res2.value.streams).toHaveLength(1);
    expect(res3.value.streams).toHaveLength(1);

    const stats = cache.getStats();
    expect(stats.coalesced).toBe(2);
  });

  it('preserves the partial flag on fresh and coalesced responses', async () => {
    const cache = new GatewayStreamCache<{ streams: unknown[] }>();
    const fetcher = async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { value: { streams: [{ url: 'https://test/partial.mp4' }] }, isPartial: true };
    };

    const [fresh, coalesced] = await Promise.all([
      cache.coalesce('key2', fetcher),
      cache.coalesce('key2', fetcher),
    ]);

    expect(fresh.isPartial).toBe(true);
    expect(coalesced.isPartial).toBe(true);

    const cached = cache.get('key2');
    expect(cached.hit).toBe(true);
    if (cached.hit) expect(cached.isPartial).toBe(true);
  });
});
