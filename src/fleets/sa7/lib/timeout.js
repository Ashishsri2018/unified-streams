class TimeoutError extends Error {
  constructor(label, ms) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
    this.label = label;
    this.timeoutMs = ms;
    this.code = 'ETIMEDOUT';
  }
}

function withTimeout(promise, ms, label = 'operation', signal) {
  const source = Promise.resolve(promise);
  source.catch(() => {});

  let timer;
  let onAbort;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    if (signal) {
      onAbort = () => reject(signal.reason || new Error(`${label} aborted`));
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
  });

  return Promise.race([source, timeout]).finally(() => {
    clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
  });
}

module.exports = { TimeoutError, withTimeout };
