const { createLru } = require('./lru');

function createStreamCache({
  ttlMs = 180000,
  partialTtlMs = 30000,
  maxEntries = 500,
  now = Date.now,
} = {}) {
  const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? Math.floor(ttlMs) : 0;
  const partialTtl =
    Number.isFinite(partialTtlMs) && partialTtlMs > 0
      ? Math.floor(partialTtlMs)
      : 0;
  const lru = createLru({ maxEntries, now });
  const enabled = ttl > 0 && lru.stats().maxEntries > 0;
  const inFlight = new Map();
  let coalesced = 0;
  let sets = 0;

  async function getOrLoadResult(key, loader, signal) {
    if (enabled) {
      const hit = lru.get(key);
      if (hit !== undefined) return hit;
    }

    let entry = inFlight.get(key);
    if (entry) {
      coalesced += 1;
    } else {
      const controller = new AbortController();
      const created = { controller, waiters: 0, promise: null };
      created.promise = Promise.resolve()
        .then(() => loader(controller.signal))
        .then((result) => {
          const value = Array.isArray(result) ? result : result?.value;
          const partial = !Array.isArray(result) && result?.partial === true;
          const valueEntry = { value, partial };
          if (enabled && Array.isArray(value) && value.length > 0) {
            const entryTtl = partial ? Math.min(ttl, partialTtl) : ttl;
            if (entryTtl > 0) {
              lru.set(key, valueEntry, now() + entryTtl);
              sets += 1;
            }
          }
          return valueEntry;
        })
        .finally(() => {
          if (inFlight.get(key) === created) inFlight.delete(key);
        });
      inFlight.set(key, created);
      entry = created;
    }

    entry.waiters += 1;
    try {
      if (!signal) return await entry.promise;
      if (signal.aborted) throw signal.reason || new Error('request aborted');
      return await new Promise((resolve, reject) => {
        const onAbort = () => reject(signal.reason || new Error('request aborted'));
        signal.addEventListener('abort', onAbort, { once: true });
        entry.promise.then(
          (value) => {
            signal.removeEventListener('abort', onAbort);
            resolve(value);
          },
          (error) => {
            signal.removeEventListener('abort', onAbort);
            reject(error);
          }
        );
      });
    } finally {
      entry.waiters -= 1;
      if (entry.waiters <= 0) {
        if (inFlight.get(key) === entry) inFlight.delete(key);
        entry.controller.abort(new Error('all callers aborted'));
      }
    }
  }

  async function getOrLoad(key, loader) {
    const result = await getOrLoadResult(key, loader);
    return result.value;
  }

  function stats() {
    const current = lru.stats();
    return {
      enabled,
      hits: current.hits,
      misses: current.misses,
      coalesced,
      sets,
      evictions: current.evictions,
      expired: current.expired,
      size: current.size,
      maxEntries: current.maxEntries,
      ttlMs: ttl,
      partialTtlMs: partialTtl,
    };
  }

  return { getOrLoad, getOrLoadResult, size: () => lru.size(), stats };
}

module.exports = { createStreamCache };
