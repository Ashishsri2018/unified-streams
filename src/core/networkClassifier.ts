export interface NetworkAttempt {
  url: string;
  status?: number;
  ok: boolean;
  isTimeout: boolean;
  error?: string;
  durationMs: number;
}

export interface NetworkTracker {
  attempts: NetworkAttempt[];
  record(attempt: NetworkAttempt): void;
}

export function createNetworkTracker(): NetworkTracker {
  const attempts: NetworkAttempt[] = [];
  return {
    attempts,
    record(attempt: NetworkAttempt): void {
      attempts.push(attempt);
    },
  };
}

export interface ClassifiedOutcome {
  outcome: 'empty' | 'error' | 'timeout';
  lastError: string | null;
}

function isSuccessfulAttempt(attempt: NetworkAttempt): boolean {
  return attempt.ok && attempt.status !== undefined && attempt.status >= 200 && attempt.status < 400;
}

function attemptErrorMessage(attempt: NetworkAttempt): string {
  if (attempt.error && attempt.error.trim().length > 0) return attempt.error;
  if (attempt.status !== undefined && attempt.status >= 400) return `HTTP ${attempt.status}`;
  return 'network request failed';
}

export function classifyEmptyResult(
  tracker: NetworkTracker | undefined,
  latencyMs: number,
  timeoutBudgetMs: number,
): ClassifiedOutcome {
  const attempts = tracker?.attempts ?? [];
  const successful = attempts.filter(isSuccessfulAttempt);
  const failed = attempts.filter((a) => !isSuccessfulAttempt(a));
  const isBudgetExceeded = timeoutBudgetMs > 0 && latencyMs >= Math.max(1, timeoutBudgetMs - 250);

  // If every attempted request failed (DNS, connection error, HTTP 4xx/5xx, timeout)
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

  // If execution took longer than timeout budget (with small jitter tolerance), classify as timeout
  if (isBudgetExceeded) {
    return { outcome: 'timeout', lastError: 'provider execution timeout' };
  }

  // If no network attempts were recorded (e.g. scraper skipped locally or returned immediately)
  if (attempts.length === 0) {
    return { outcome: 'empty', lastError: null };
  }

  // Case 2: Multi-step pipeline where downstream request failed (e.g. search succeeded, but stream request failed)
  if (failed.length > 0) {
    const lastAttempt = attempts[attempts.length - 1];
    if (!isSuccessfulAttempt(lastAttempt)) {
      return {
        outcome: lastAttempt.isTimeout ? 'timeout' : 'error',
        lastError: attemptErrorMessage(lastAttempt),
      };
    }
  }

  // Case 3: All requests succeeded (HTTP 200 OK), but no streams matched the media query (clean catalog miss)
  return { outcome: 'empty', lastError: null };
}
