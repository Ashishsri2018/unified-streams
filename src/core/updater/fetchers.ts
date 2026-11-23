import { logger } from '../logger.js';

export interface RemoteHead {
  sha: string;
  etag?: string;
}

interface CodebergBranchResponse {
  name?: string;
  commit?: {
    id?: string;
  };
  sha?: string;
}

interface CodebergCommitItem {
  sha?: string;
}

const HEAD_MAX_ATTEMPTS = 3;
const HEAD_RETRY_DELAYS_MS = [250, 750];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

function isRetriableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

interface HeadFetchMeta {
  repo: string;
  endpoint: string;
}

interface HeadFetchOptions {
  failureLevel?: 'warn' | 'debug';
}

async function fetchHeadWithRetry(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  meta: HeadFetchMeta,
  options: HeadFetchOptions = {},
): Promise<Response | null> {
  const failureLevel = options.failureLevel ?? 'warn';
  let lastStatus: number | undefined;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= HEAD_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      if (res.ok) {
        if (attempt > 1) {
          logger.info('updater.head.resolved', { ...meta, status: res.status, attempt });
        }
        return res;
      }

      lastStatus = res.status;
      lastError = undefined;
      const retryMeta = {
        ...meta,
        status: res.status,
        attempt,
        maxAttempts: HEAD_MAX_ATTEMPTS,
        rateLimitRemaining: res.headers.get('x-ratelimit-remaining') || undefined,
      };

      if (!isRetriableStatus(res.status)) {
        if (failureLevel === 'debug') logger.debug('updater.head.failed', retryMeta);
        else logger.warn('updater.head.failed', retryMeta);
        return null;
      }
      if (attempt >= HEAD_MAX_ATTEMPTS) break;
      logger.warn('updater.head.retry', retryMeta);
    } catch (err) {
      lastStatus = undefined;
      lastError = errorMessage(err);
      if (attempt >= HEAD_MAX_ATTEMPTS) break;
      logger.warn('updater.head.retry', {
        ...meta,
        attempt,
        maxAttempts: HEAD_MAX_ATTEMPTS,
        error: lastError,
      });
    } finally {
      clearTimeout(timer);
    }

    const delay = HEAD_RETRY_DELAYS_MS[Math.min(attempt - 1, HEAD_RETRY_DELAYS_MS.length - 1)];
    await sleep(delay);
  }

  const failureMeta = {
    ...meta,
    status: lastStatus,
    error: lastError,
    attempts: HEAD_MAX_ATTEMPTS,
  };
  if (failureLevel === 'debug') logger.debug('updater.head.failed', failureMeta);
  else logger.warn('updater.head.failed', failureMeta);
  return null;
}

export async function fetchGitHubHead(
  repo: string,
  branch = 'main',
  token?: string,
  timeoutMs = 10000,
): Promise<RemoteHead | null> {
  const url = `https://api.github.com/repos/${repo}/commits/${branch}`;
  const headers: Record<string, string> = {
    'accept': 'application/vnd.github.v3+json',
    'user-agent': 'unified-streams-updater',
  };
  if (token) headers['authorization'] = `Bearer ${token}`;

  const res = await fetchHeadWithRetry(url, headers, timeoutMs, {
    repo,
    endpoint: 'github.commits',
  });
  if (!res) return null;

  try {
    const json = (await res.json()) as { sha?: string };
    if (!json?.sha) {
      logger.warn('updater.head.failed', {
        repo,
        endpoint: 'github.commits',
        status: res.status,
        error: 'missing sha in response',
      });
      return null;
    }
    return {
      sha: json.sha,
      etag: res.headers.get('etag') || undefined,
    };
  } catch (err) {
    logger.warn('updater.head.failed', {
      repo,
      endpoint: 'github.commits',
      status: res.status,
      error: errorMessage(err),
    });
    return null;
  }
}

export async function fetchCodebergHead(
  repo: string,
  branch = 'main',
  timeoutMs = 10000,
): Promise<RemoteHead | null> {
  const branchUrl = `https://codeberg.org/api/v1/repos/${repo}/branches/${encodeURIComponent(branch)}`;
  const headers: Record<string, string> = {
    'accept': 'application/json',
    'user-agent': 'unified-streams-updater',
  };

  const branchRes = await fetchHeadWithRetry(
    branchUrl,
    headers,
    timeoutMs,
    { repo, endpoint: 'codeberg.branch' },
    { failureLevel: 'debug' },
  );
  if (branchRes?.ok) {
    try {
      const json = (await branchRes.json()) as CodebergBranchResponse;
      const sha = json.commit?.id || json.sha;
      if (sha) {
        return {
          sha,
          etag: branchRes.headers.get('etag') || undefined,
        };
      }
    } catch (err) {
      logger.debug('updater.head.failed', {
        repo,
        endpoint: 'codeberg.branch',
        status: branchRes.status,
        error: errorMessage(err),
      });
    }
  }

  // Fallback: query commits with sha=branch
  const commitsUrl = `https://codeberg.org/api/v1/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&limit=1`;
  const commitsRes = await fetchHeadWithRetry(commitsUrl, headers, timeoutMs, {
    repo,
    endpoint: 'codeberg.commits',
  });
  if (!commitsRes?.ok) return null;

  try {
    const commitsJson = (await commitsRes.json()) as CodebergCommitItem[];
    if (Array.isArray(commitsJson) && commitsJson.length > 0 && commitsJson[0]?.sha) {
      return {
        sha: commitsJson[0].sha,
        etag: commitsRes.headers.get('etag') || undefined,
      };
    }
    logger.warn('updater.head.failed', {
      repo,
      endpoint: 'codeberg.commits',
      status: commitsRes.status,
      error: 'missing sha in response',
    });
    return null;
  } catch (err) {
    logger.warn('updater.head.failed', {
      repo,
      endpoint: 'codeberg.commits',
      status: commitsRes.status,
      error: errorMessage(err),
    });
    return null;
  }
}
