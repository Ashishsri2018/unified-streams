'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_SOURCE_REPO = 'SA7ANI/cb-providers';
const DEFAULT_SOURCE_BRANCH = 'main';
const DEFAULT_INTERVAL_HOURS = 20;
const MIN_INTERVAL_HOURS = 20;
const MAX_INTERVAL_HOURS = 24;
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;
const FETCH_ATTEMPTS = 2;
const FETCH_RETRY_DELAY_MS = 200;
const DOWNLOAD_CONCURRENCY = 4;
const MIN_PROVIDER_COUNT = 10;

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function encodePath(value) {
  return value
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryable(error) {
  if (error && typeof error.status === 'number') {
    return error.status >= 500 || error.status === 429;
  }
  return true;
}

async function fetchBuffer(
  fetchImpl,
  url,
  { timeoutMs = FETCH_TIMEOUT_MS, attempts = FETCH_ATTEMPTS, headers = {} } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error('request timed out'));
    }, timeoutMs);
    timer.unref?.();
    try {
      const response = await fetchImpl(url, {
        headers,
        redirect: 'follow',
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} for ${url}`);
        error.status = response.status;
        throw error;
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < attempts && isRetryable(error)) {
        await sleep(FETCH_RETRY_DELAY_MS * attempt);
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('fetch failed');
}

async function resolveHead({ fetchImpl, repo, branch, timeoutMs } = {}) {
  if (!fetchImpl) throw new Error('resolveHead requires fetchImpl');
  const url = `https://api.github.com/repos/${encodePath(repo || DEFAULT_SOURCE_REPO)}/commits/${encodeURIComponent(branch || DEFAULT_SOURCE_BRANCH)}`;
  const body = await fetchBuffer(
    fetchImpl,
    url,
    {
      timeoutMs,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'sa7-provider-updater',
      },
    },
  );
  let parsed;
  try {
    parsed = JSON.parse(body.toString('utf8'));
  } catch {
    throw new Error('GitHub API returned invalid JSON');
  }
  if (!parsed || typeof parsed.sha !== 'string' || parsed.sha.length === 0) {
    throw new Error('GitHub API response is missing a commit sha');
  }
  return parsed.sha;
}

async function fetchRaw({ fetchImpl, repo, sha, filePath, timeoutMs, attempts } = {}) {
  if (!fetchImpl) throw new Error('fetchRaw requires fetchImpl');
  const url = `https://raw.githubusercontent.com/${encodePath(repo || DEFAULT_SOURCE_REPO)}/${encodeURIComponent(sha)}/${encodePath(filePath)}`;
  return fetchBuffer(fetchImpl, url, { timeoutMs, attempts });
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(limit, items.length); i += 1) {
    workers.push(run());
  }
  await Promise.all(workers);
  return results;
}

async function downloadSnapshot({ fetchImpl, repo, sha, timeoutMs, attempts } = {}) {
  const manifestBytes = await fetchRaw({
    fetchImpl,
    repo,
    sha,
    filePath: 'manifest.json',
    timeoutMs,
    attempts,
  });
  if (manifestBytes.length < 1 || manifestBytes.length > MAX_MANIFEST_BYTES) {
    throw new Error(`manifest.json has invalid size (${manifestBytes.length} bytes)`);
  }
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch {
    throw new Error('manifest.json is not valid JSON');
  }
  const providers = Array.isArray(manifest.providers) ? manifest.providers : [];
  if (providers.length < MIN_PROVIDER_COUNT) {
    throw new Error(`manifest has too few providers (${providers.length})`);
  }

  const filenames = new Set();
  for (const entry of providers) {
    if (entry && typeof entry.filename === 'string' && entry.filename.length > 0) {
      filenames.add(entry.filename);
    }
  }
  if (filenames.size === 0) {
    throw new Error('manifest has no provider files');
  }

  const files = new Map();
  files.set('manifest.json', manifestBytes);

  const results = await mapLimit(
    Array.from(filenames),
    DOWNLOAD_CONCURRENCY,
    async (filename) => {
      const buffer = await fetchRaw({ fetchImpl, repo, sha, filePath: filename, timeoutMs, attempts });
      if (buffer.length < 1 || buffer.length > MAX_FILE_BYTES) {
        throw new Error(`${filename} has invalid size (${buffer.length} bytes)`);
      }
      return { filename, buffer };
    },
  );
  for (const result of results) {
    files.set(result.filename, result.buffer);
  }

  try {
    const license = await fetchRaw({ fetchImpl, repo, sha, filePath: 'LICENSE', timeoutMs, attempts });
    if (license.length > 0 && license.length <= MAX_FILE_BYTES) {
      files.set('LICENSE', license);
    }
  } catch {
    // LICENSE is optional.
  }

  return { manifestBytes, files, providerCount: providers.length };
}

async function persistSnapshot({ rootDir, sha, snapshot }) {
  const parent = path.dirname(rootDir);
  await fs.promises.mkdir(parent, { recursive: true });
  const tmpRoot = path.join(parent, `${path.basename(rootDir)}.new-${process.pid}-${Date.now()}`);
  const backupRoot = path.join(parent, `${path.basename(rootDir)}.old-${process.pid}-${Date.now()}`);
  await fs.promises.rm(tmpRoot, { recursive: true, force: true });
  await fs.promises.mkdir(tmpRoot, { recursive: true });

  try {
    for (const [relative, buffer] of snapshot.files) {
      const destination = path.join(tmpRoot, relative);
      await fs.promises.mkdir(path.dirname(destination), { recursive: true });
      await fs.promises.writeFile(destination, buffer);
    }
    await fs.promises.writeFile(path.join(tmpRoot, 'UPSTREAM_COMMIT'), `${sha}\n`);

    let hadOld = false;
    try {
      await fs.promises.rename(rootDir, backupRoot);
      hadOld = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    try {
      await fs.promises.rename(tmpRoot, rootDir);
    } catch (error) {
      if (hadOld) {
        await fs.promises.rename(backupRoot, rootDir).catch(() => undefined);
      }
      throw error;
    }
    if (hadOld) {
      await fs.promises.rm(backupRoot, { recursive: true, force: true });
    }
  } catch (error) {
    await fs.promises.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

function readState(statePath) {
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.sha !== 'string' || typeof parsed.fetchedAt !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeState(statePath, state) {
  const parent = path.dirname(statePath);
  fs.mkdirSync(parent, { recursive: true });
  const tmp = `${statePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmp, statePath);
}

function ensureNodeModulesLink({ dataDir, modulesDir } = {}) {
  if (!dataDir || !modulesDir) {
    throw new Error('ensureNodeModulesLink requires dataDir and modulesDir');
  }
  if (!fs.existsSync(modulesDir)) return false;
  const linkPath = path.join(dataDir, 'node_modules');
  let existing = null;
  try {
    existing = fs.lstatSync(linkPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (existing) {
    if (existing.isSymbolicLink()) {
      if (fs.readlinkSync(linkPath) === modulesDir) return true;
      fs.unlinkSync(linkPath);
    } else if (existing.isDirectory()) {
      return true;
    } else {
      fs.unlinkSync(linkPath);
    }
  }
  fs.mkdirSync(dataDir, { recursive: true });
  fs.symlinkSync(modulesDir, linkPath, 'dir');
  return true;
}

function seedFromBundle({ bundledDir, rootDir, statePath }) {
  if (fs.existsSync(path.join(rootDir, 'manifest.json'))) {
    return false;
  }
  if (!fs.existsSync(path.join(bundledDir, 'manifest.json'))) {
    throw new Error(`bundled providers missing at ${bundledDir}`);
  }
  fs.mkdirSync(path.dirname(rootDir), { recursive: true });
  fs.rmSync(rootDir, { recursive: true, force: true });
  fs.cpSync(bundledDir, rootDir, { recursive: true });

  let sha = 'bundled';
  try {
    const commit = fs.readFileSync(path.join(bundledDir, 'UPSTREAM_COMMIT'), 'utf8').trim();
    if (commit) sha = commit;
  } catch {
    // Keep the fallback marker.
  }
  writeState(statePath, { sha, fetchedAt: Date.now(), source: 'bundled' });
  return true;
}

function computeNextDelayMs({
  minHours = MIN_INTERVAL_HOURS,
  maxHours = MAX_INTERVAL_HOURS,
  random = Math.random,
} = {}) {
  const low = Math.min(minHours, maxHours);
  const high = Math.max(minHours, maxHours);
  const hours = low + random() * Math.max(0, high - low);
  const jitter = Math.floor(random() * 120_000);
  return Math.round(hours * 3_600_000) + jitter;
}

function clampIntervalHours(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_INTERVAL_HOURS;
  return Math.min(MAX_INTERVAL_HOURS, Math.max(MIN_INTERVAL_HOURS, parsed));
}

function createUpdater(options = {}) {
  const bundledDir = options.bundledDir;
  const rootDir = options.rootDir;
  const statePath = options.statePath;
  if (!bundledDir || !rootDir || !statePath) {
    throw new Error('createUpdater requires bundledDir, rootDir and statePath');
  }

  const sourceRepo = options.sourceRepo || DEFAULT_SOURCE_REPO;
  const sourceBranch = options.sourceBranch || DEFAULT_SOURCE_BRANCH;
  const updateIntervalHours = clampIntervalHours(options.updateIntervalHours);
  const updateOnStart = options.updateOnStart !== false;
  const fetchImpl =
    options.fetchImpl ||
    (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
  const timeoutMs = options.timeoutMs;
  const fetchAttempts = options.fetchAttempts;
  const logger = options.logger || console;
  const onUpdated = typeof options.onUpdated === 'function' ? options.onUpdated : null;
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const random = typeof options.random === 'function' ? options.random : Math.random;

  let timer = null;
  let stopped = true;
  let updating = false;
  let lastCheck = null;
  let nextCheck = null;
  let lastError = null;

  function isFresh(state) {
    return now() - state.fetchedAt < updateIntervalHours * 3_600_000;
  }

  function schedule(delayMs) {
    if (stopped) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const delay =
      typeof delayMs === 'number'
        ? Math.max(0, delayMs)
        : computeNextDelayMs({
            minHours: updateIntervalHours,
            maxHours: Math.min(MAX_INTERVAL_HOURS, updateIntervalHours + 4),
            random,
          });
    nextCheck = now() + delay;
    timer = setTimeout(() => {
      timer = null;
      void check('schedule');
    }, delay);
    timer.unref?.();
  }

  function snapshot() {
    const state = readState(statePath);
    const fetchedAt =
      state && typeof state.fetchedAt === 'number' ? state.fetchedAt : null;
    return {
      sha: state && typeof state.sha === 'string' ? state.sha : null,
      fetchedAt,
      ageMs: fetchedAt === null ? null : Math.max(0, now() - fetchedAt),
      refreshing: updating,
      lastError,
    };
  }

  async function check(reason = 'manual') {
    if (updating) return;
    updating = true;
    lastCheck = now();
    nextCheck = null;
    try {
      const state = readState(statePath);
      const head = await resolveHead({
        fetchImpl,
        repo: sourceRepo,
        branch: sourceBranch,
        timeoutMs,
      });

      if (state && state.sha === head) {
        lastError = null;
        if (isFresh(state)) {
          schedule();
          return;
        }
        writeState(statePath, { ...state, fetchedAt: now() });
        schedule();
        return;
      }

      const snapshot = await downloadSnapshot({
        fetchImpl,
        repo: sourceRepo,
        sha: head,
        timeoutMs,
        attempts: fetchAttempts,
      });
      await persistSnapshot({ rootDir, sha: head, snapshot });
      const newState = {
        sha: head,
        fetchedAt: now(),
        source: 'network',
        providerCount: snapshot.providerCount,
      };
      writeState(statePath, newState);
      lastError = null;
      logger.log?.(`[sa7-updater] activated ${head} (${snapshot.providerCount} providers)`);
      if (onUpdated) onUpdated({ ...newState, reason });
      schedule();
    } catch (error) {
      lastError = errorMessage(error);
      logger.warn?.(`[sa7-updater] update failed (${reason}): ${lastError}`);
      schedule(
        computeNextDelayMs({ minHours: 1, maxHours: 2, random }),
      );
    } finally {
      updating = false;
    }
  }

  return {
    start() {
      stopped = false;
      if (updateOnStart) {
        schedule(0);
      } else {
        schedule();
      }
    },
    stop() {
      stopped = true;
      nextCheck = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    check,
    getState() {
      return readState(statePath);
    },
    getSnapshot() {
      return snapshot();
    },
    getHealth() {
      const state = readState(statePath);
      const current = snapshot();
      const status = lastError ? (state ? 'degraded' : 'error') : state ? 'ok' : 'degraded';
      return {
        status,
        activeSha: current.sha,
        providerCount:
          state && Number.isFinite(state.providerCount) ? state.providerCount : null,
        lastCheck: lastCheck === null ? null : new Date(lastCheck).toISOString(),
        lastSuccess:
          state && typeof state.fetchedAt === 'number'
            ? new Date(state.fetchedAt).toISOString()
            : null,
        nextCheck: nextCheck === null ? null : new Date(nextCheck).toISOString(),
        pending: [],
        lastError,
      };
    },
    get intervalHours() {
      return updateIntervalHours;
    },
  };
}

module.exports = {
  DEFAULT_SOURCE_REPO,
  DEFAULT_SOURCE_BRANCH,
  DEFAULT_INTERVAL_HOURS,
  MIN_INTERVAL_HOURS,
  MAX_INTERVAL_HOURS,
  resolveHead,
  fetchRaw,
  downloadSnapshot,
  persistSnapshot,
  readState,
  writeState,
  seedFromBundle,
  ensureNodeModulesLink,
  computeNextDelayMs,
  createUpdater,
};
