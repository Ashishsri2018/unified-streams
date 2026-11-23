const { AsyncLocalStorage } = require('node:async_hooks');

const sa7NetworkStorage = new AsyncLocalStorage();

// Scrapers only parse text payloads (HTML/JSON). A provider can be tricked into
// following a download redirect to a multi-gigabyte media file (for example
// HDHub4u's hubcloud `t3dl.php` links); buffering that with `.text()` aborts the
// whole worker. Refuse obviously non-text or oversized responses before the
// provider reads the body.
const MAX_SAFE_RESPONSE_BYTES = 16 * 1024 * 1024;
const BINARY_MEDIA_CONTENT_TYPE =
  /^(?:video|audio|image|font)\/|(?:octet-stream|zip|rar|7z|gzip|x-tar|pdf)/i;
const TEXTUAL_CONTENT_TYPE =
  /^(?:text\/|application\/(?:json|xml|javascript|ecmascript|x-www-form-urlencoded|ld\+json|rss\+xml|atom\+xml|xhtml\+xml|graphql))/i;
const ARCHIVE_OR_MEDIA_PATH =
  /\.(?:mkv|mp4|m4v|avi|mov|webm|flv|wmv|mpe?g|m2ts|zip|rar|7z|tar|gz|tgz|bz2|xz|zst|iso|mp3|aac|flac|wav|m4a|opus)$/i;

function createTracker(signal) {
  return {
    attempts: [],
    signal,
  };
}

function safeUrlHost(rawUrl) {
  try {
    return new URL(rawUrl).host;
  } catch {
    return 'unknown';
  }
}

function safeUrlPath(rawUrl) {
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return '';
  }
}

function isBinaryContentType(contentType) {
  const normalized = String(contentType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!normalized || TEXTUAL_CONTENT_TYPE.test(normalized)) return false;
  return BINARY_MEDIA_CONTENT_TYPE.test(normalized);
}

function assertSafeSa7Response(url, response) {
  const contentType = response.headers.get('content-type') || '';
  const rawLength = response.headers.get('content-length');
  const contentLength = rawLength == null || rawLength === '' ? NaN : Number(rawLength);
  const host = safeUrlHost(url || response.url || '');

  if (Number.isFinite(contentLength) && contentLength > MAX_SAFE_RESPONSE_BYTES) {
    throw new Error(
      `blocked oversized response (${contentLength} bytes, ${contentType || 'unknown type'}) from ${host}`
    );
  }
  if (isBinaryContentType(contentType)) {
    throw new Error(`blocked binary response (${contentType}) from ${host}`);
  }
  const path = safeUrlPath(response.url || url || '');
  if (ARCHIVE_OR_MEDIA_PATH.test(path)) {
    throw new Error(`blocked media/archive response from ${host}`);
  }
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
        const signals = [];
        if (init && init.signal) signals.push(init.signal);
        if (tracker.signal) signals.push(tracker.signal);
        const mergedInit =
          signals.length === 0
            ? init
            : { ...(init || {}), signal: signals.length === 1 ? signals[0] : AbortSignal.any(signals) };
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
          const res = await origFetch.call(this, input, mergedInit);
          try {
            assertSafeSa7Response(url, res);
          } catch (guardError) {
            // Drain nothing; release the socket before surfacing the guard error.
            void res.body?.cancel().catch(() => {});
            throw guardError;
          }
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
          const currentMax = Number(reqConfig.maxContentLength);
          reqConfig.maxContentLength =
            Number.isFinite(currentMax) && currentMax > 0
              ? Math.min(currentMax, MAX_SAFE_RESPONSE_BYTES)
              : MAX_SAFE_RESPONSE_BYTES;
          const tracker = sa7NetworkStorage.getStore();
          if (tracker && tracker.signal && !reqConfig.signal) {
            reqConfig.signal = tracker.signal;
          }
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
  assertSafeSa7Response,
  MAX_SAFE_RESPONSE_BYTES,
};
