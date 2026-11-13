/**
 * Gateway response cache with LRU eviction, request coalescing (singleflight),
 * and separate complete (180s) vs partial (30s) TTLs. Never caches empty streams.
 */

export interface CacheOptions {
  fullTtlMs: number;
  partialTtlMs: number;
  maxEntries: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  coalesced: number;
  sets: number;
  evictions: number;
  expired: number;
  partialSets: number;
  emptySkips: number;
  size: number;
  maxEntries: number;
  fullTtlMs: number;
  partialTtlMs: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  isPartial: boolean;
}

export class GatewayStreamCache<T extends { streams: unknown[] }> {
  private map = new Map<string, CacheEntry<T>>();
  private inFlight = new Map<string, Promise<{ value: T; isPartial: boolean }>>();
  private stats: CacheStats;
  private readonly fullTtlMs: number;
  private readonly partialTtlMs: number;
  private readonly maxEntries: number;

  constructor(options?: Partial<CacheOptions>) {
    this.fullTtlMs = options?.fullTtlMs ?? 180000;
    this.partialTtlMs = options?.partialTtlMs ?? 30000;
    this.maxEntries = options?.maxEntries ?? 5000;

    this.stats = {
      hits: 0,
      misses: 0,
      coalesced: 0,
      sets: 0,
      evictions: 0,
      expired: 0,
      partialSets: 0,
      emptySkips: 0,
      size: 0,
      maxEntries: this.maxEntries,
      fullTtlMs: this.fullTtlMs,
      partialTtlMs: this.partialTtlMs,
    };
  }

  get(key: string): { hit: true; value: T; isPartial: boolean } | { hit: false } {
    const entry = this.map.get(key);
    if (!entry) {
      this.stats.misses++;
      return { hit: false };
    }

    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      this.stats.expired++;
      this.stats.misses++;
      this.stats.size = this.map.size;
      return { hit: false };
    }

    // Refresh LRU order
    this.map.delete(key);
    this.map.set(key, entry);
    this.stats.hits++;
    return { hit: true, value: entry.value, isPartial: entry.isPartial };
  }

  set(key: string, value: T, isPartial: boolean): boolean {
    // Rule: Never cache empty stream results!
    if (!value || !Array.isArray(value.streams) || value.streams.length === 0) {
      this.stats.emptySkips++;
      return false;
    }

    const ttl = isPartial ? this.partialTtlMs : this.fullTtlMs;
    const expiresAt = Date.now() + ttl;

    // Evict oldest if full
    if (this.map.size >= this.maxEntries && !this.map.has(key)) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
        this.stats.evictions++;
      }
    }

    this.map.set(key, { value, expiresAt, isPartial });
    this.stats.sets++;
    if (isPartial) this.stats.partialSets++;
    this.stats.size = this.map.size;
    return true;
  }

  async coalesce(key: string, fn: () => Promise<{ value: T; isPartial: boolean }>): Promise<{ value: T; isPartial: boolean; hit: boolean }> {
    const cached = this.get(key);
    if (cached.hit) {
      return { value: cached.value, isPartial: cached.isPartial, hit: true };
    }

    const running = this.inFlight.get(key);
    if (running) {
      this.stats.coalesced++;
      const res = await running;
      return { value: res.value, isPartial: res.isPartial, hit: true };
    }

    const promise = (async () => {
      try {
        const result = await fn();
        this.set(key, result.value, result.isPartial);
        return result;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    const result = await promise;
    return { value: result.value, isPartial: result.isPartial, hit: false };
  }

  getStats(): CacheStats {
    return { ...this.stats, size: this.map.size };
  }

  clear(): void {
    this.map.clear();
    this.inFlight.clear();
    this.stats.size = 0;
  }
}
