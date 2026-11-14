import { promises as fs } from 'node:fs';
import path from 'node:path';

const UPSTREAM_REPO = 'SA7ANI/cb-providers';
const PROVIDER_PATH = /^providers\/[A-Za-z0-9._-]+\.js$/;
const MAX_MANIFEST_CHARS = 2_000_000;
const MAX_PROVIDER_CHARS = 5_000_000;
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_TIMEOUT_MS = 15_000;

interface FetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<FetchResponse>;

export interface Sa7UpdateOptions {
  dataDir: string;
  sha: string;
  githubToken?: string;
  fetchImpl?: FetchLike;
  concurrency?: number;
  timeoutMs?: number;
}

export interface Sa7UpdateResult {
  changed: boolean;
  sha: string;
  providerCount: number;
  root: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeProviderPath(raw: string): string {
  const normalized = path.posix.normalize(raw);
  if (!PROVIDER_PATH.test(normalized) || normalized.includes('..')) {
    throw new Error(`Unsafe provider filename in manifest: ${raw}`);
  }
  return normalized;
}

function collectProviderFiles(manifest: unknown): string[] {
  if (!isRecord(manifest)) throw new Error('manifest.json must contain an object');

  const filenames = new Set<string>();
  for (const list of [manifest.providers, manifest.scrapers]) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!isRecord(entry) || typeof entry.filename !== 'string') continue;
      const filename = entry.filename.trim();
      if (filename) filenames.add(safeProviderPath(filename));
    }
  }

  if (filenames.size === 0) throw new Error('manifest.json has no provider filenames');
  return Array.from(filenames).sort();
}

async function fetchText(
  fetchImpl: FetchLike,
  url: string,
  options: { token?: string; timeoutMs: number; maxChars: number },
): Promise<string> {
  const headers: Record<string, string> = {
    'accept': 'application/json,text/plain,*/*',
    'user-agent': 'unified-streams-updater',
  };
  if (options.token) headers['authorization'] = `Bearer ${options.token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const res = await fetchImpl(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const text = await res.text();
    if (text.length > options.maxChars) {
      throw new Error(`Response from ${url} exceeds ${options.maxChars} characters`);
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

async function readCurrentProviderCount(root: string, sha: string): Promise<number | null> {
  try {
    const [commit, manifestText] = await Promise.all([
      fs.readFile(path.join(root, 'UPSTREAM_COMMIT'), 'utf-8'),
      fs.readFile(path.join(root, 'manifest.json'), 'utf-8'),
    ]);
    if (commit.trim() !== sha) return null;

    const filenames = collectProviderFiles(JSON.parse(manifestText));
    await Promise.all(filenames.map((filename) => fs.access(path.join(root, filename))));
    return filenames.length;
  } catch {
    return null;
  }
}

async function copyIfExists(source: string, destination: string): Promise<void> {
  try {
    const data = await fs.readFile(source);
    await fs.writeFile(destination, data);
  } catch {
    // Optional file.
  }
}

export async function updateSa7Providers(options: Sa7UpdateOptions): Promise<Sa7UpdateResult> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{6,79}$/.test(options.sha)) {
    throw new Error(`Invalid SA7 upstream SHA: ${options.sha}`);
  }

  const fetchImpl: FetchLike = options.fetchImpl ?? fetch;
  const token = options.githubToken;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const fleetDir = path.join(options.dataDir, 'sa7');
  const root = path.join(fleetDir, 'cb-providers');

  const currentCount = await readCurrentProviderCount(root, options.sha);
  if (currentCount !== null) {
    return { changed: false, sha: options.sha, providerCount: currentCount, root };
  }

  const staging = path.join(fleetDir, `.cb-providers.tmp-${process.pid}-${Date.now()}`);
  const backup = path.join(fleetDir, `.cb-providers.old-${process.pid}-${Date.now()}`);
  const baseUrl = `https://raw.githubusercontent.com/${UPSTREAM_REPO}/${options.sha}`;

  await fs.mkdir(path.join(staging, 'providers'), { recursive: true });

  try {
    const manifestText = await fetchText(fetchImpl, `${baseUrl}/manifest.json`, {
      token,
      timeoutMs,
      maxChars: MAX_MANIFEST_CHARS,
    });
    const manifest = JSON.parse(manifestText) as unknown;
    const filenames = collectProviderFiles(manifest);

    const downloads = await mapLimit(filenames, concurrency, async (filename) => {
      const text = await fetchText(fetchImpl, `${baseUrl}/${filename}`, {
        token,
        timeoutMs,
        maxChars: MAX_PROVIDER_CHARS,
      });
      return { filename, text };
    });

    await fs.writeFile(path.join(staging, 'manifest.json'), manifestText, 'utf-8');
    await fs.writeFile(path.join(staging, 'UPSTREAM_COMMIT'), `${options.sha}\n`, 'utf-8');
    await copyIfExists(path.join(root, 'LICENSE'), path.join(staging, 'LICENSE'));

    for (const download of downloads) {
      await fs.writeFile(path.join(staging, download.filename), download.text, 'utf-8');
    }

    let movedOld = false;
    try {
      try {
        await fs.rename(root, backup);
        movedOld = true;
      } catch {
        // No previous install.
      }
      await fs.rename(staging, root);
    } catch (error) {
      if (movedOld) {
        try {
          await fs.rename(backup, root);
        } catch {
          // Keep the original error.
        }
      }
      throw error;
    } finally {
      await fs.rm(backup, { recursive: true, force: true }).catch(() => undefined);
    }

    return {
      changed: true,
      sha: options.sha,
      providerCount: filenames.length,
      root,
    };
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}
