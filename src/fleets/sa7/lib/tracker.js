const { AsyncLocalStorage } = require('node:async_hooks');

const sa7NetworkStorage = new AsyncLocalStorage();

function createTracker() {
  return {
    attempts: [],
  };
}

function initNetworkHooks() {
  if (!globalThis.__sa7NetworkHooked) {
    globalThis.__sa7NetworkHooked = true;

    // Hook globalThis.fetch
    if (typeof globalThis.fetch === 'function') {
      const origFetch = globalThis.fetch;
      globalThis.fetch = async function (input, init) {
        const tracker = sa7NetworkStorage.getStore();
        if (!tracker) return origFetch.call(this, input, init);
        const startedAt = Date.now();
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input && input.url
                ? input.url
                : '';
        try {
          const res = await origFetch.call(this, input, init);
          tracker.attempts.push({
            url,
            status: res.status,
            ok: res.ok,
            isTimeout: false,
            durationMs: Date.now() - startedAt,
          });
          return res;
        } catch (err) {
          const isTimeout =
            err instanceof Error &&
            (err.name === 'TimeoutError' ||
              err.name === 'AbortError' ||
              err.message.toLowerCase().includes('abort') ||
              err.message.toLowerCase().includes('timeout'));
          tracker.attempts.push({
            url,
            ok: false,
            isTimeout,
            error: err instanceof Error ? err.message : String(err),
            durationMs: Date.now() - startedAt,
          });
          throw err;
        }
      };
    }

    // Hook axios interceptors if axios is available
    try {
      const axios = require('axios');
      if (axios && axios.interceptors) {
        axios.interceptors.request.use((reqConfig) => {
          reqConfig.__sa7StartedAt = Date.now();
          return reqConfig;
        });
        axios.interceptors.response.use(
          (response) => {
            const tracker = sa7NetworkStorage.getStore();
            if (tracker) {
              const url = response.config ? response.config.url || '' : '';
              tracker.attempts.push({
                url,
                status: response.status,
                ok: response.status >= 200 && response.status < 400,
                isTimeout: false,
                durationMs: Date.now() - (response.config.__sa7StartedAt || Date.now()),
              });
            }
            return response;
          },
          (err) => {
            const tracker = sa7NetworkStorage.getStore();
            if (tracker) {
              const status = err.response ? err.response.status : undefined;
              const isTimeout =
                err.code === 'ECONNABORTED' ||
                err.code === 'ETIMEDOUT' ||
                (err.message && err.message.toLowerCase().includes('timeout'));
              tracker.attempts.push({
                url: (err.config && err.config.url) || '',
                status,
                ok: false,
                isTimeout,
                error: err.message || String(err),
                durationMs: Date.now() - ((err.config && err.config.__sa7StartedAt) || Date.now()),
              });
            }
            return Promise.reject(err);
          }
        );
      }
    } catch {
      // axios not required at startup; will be captured if required later
    }
  }
}

initNetworkHooks();

function isSuccessfulAttempt(attempt) {
  return attempt.ok && attempt.status !== undefined && attempt.status >= 200 && attempt.status < 400;
}

function attemptErrorMessage(attempt) {
  if (attempt.error && String(attempt.error).trim().length > 0) return String(attempt.error);
  if (attempt.status !== undefined && attempt.status >= 400) return `HTTP ${attempt.status}`;
  return 'network request failed';
}

function classifyEmptyResult(tracker, latencyMs, timeoutBudgetMs) {
  const attempts = tracker && Array.isArray(tracker.attempts) ? tracker.attempts : [];
  const successful = attempts.filter(isSuccessfulAttempt);
  const failed = attempts.filter((a) => !isSuccessfulAttempt(a));
  const isBudgetExceeded = timeoutBudgetMs > 0 && latencyMs >= Math.max(1, timeoutBudgetMs - 250);

  if (successful.length === 0 && failed.length > 0) {
    const timeoutAttempt = failed.find((a) => a.isTimeout);
    if (timeoutAttempt) {
      return {
        outcome: 'timeout',
        lastError: attemptErrorMessage(timeoutAttempt),
      };
    }
    const firstFail = failed[0];
    return {
      outcome: isBudgetExceeded ? 'timeout' : 'error',
      lastError: isBudgetExceeded ? 'provider execution timeout' : attemptErrorMessage(firstFail),
    };
  }

  if (isBudgetExceeded) {
    return { outcome: 'timeout', lastError: 'provider execution timeout' };
  }

  if (attempts.length === 0) {
    return { outcome: 'empty', lastError: null };
  }

  if (failed.length > 0) {
    const lastAttempt = attempts[attempts.length - 1];
    if (!isSuccessfulAttempt(lastAttempt)) {
      return {
        outcome: lastAttempt.isTimeout ? 'timeout' : 'error',
        lastError: attemptErrorMessage(lastAttempt),
      };
    }
  }

  return { outcome: 'empty', lastError: null };
}

module.exports = {
  sa7NetworkStorage,
  createTracker,
  classifyEmptyResult,
};
