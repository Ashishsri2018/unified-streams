import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { updateSa7Providers, FetchLike } from '../../src/core/updater/sa7.js';

describe('SA7 upstream provider updater', () => {
  const tmpDir = path.join(process.cwd(), '.data-test-sa7-updater');
  const sha = 'a'.repeat(40);

  function manifestFor(filenames: string[]): string {
    return JSON.stringify({
      manifestVersion: 1,
      providers: filenames.map((filename) => ({ id: filename, filename })),
    });
  }

  function fetchFrom(files: Record<string, string>): FetchLike {
    return vi.fn(async (url: string) => {
      const match = Object.entries(files).find(([suffix]) => url.endsWith(suffix));
      if (!match) return new Response('not found', { status: 404 });
      return new Response(match[1], { status: 200 });
    }) as unknown as FetchLike;
  }

  afterEach(() => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('downloads manifest and providers into the data directory atomically', async () => {
    const fetchImpl = fetchFrom({
      '/manifest.json': manifestFor(['providers/a.js', 'providers/b.js', 'providers/b.js']),
      '/providers/a.js': 'module.exports = "a";',
      '/providers/b.js': 'module.exports = "b";',
    });

    const result = await updateSa7Providers({
      dataDir: tmpDir,
      sha,
      fetchImpl,
      concurrency: 2,
    });

    expect(result.changed).toBe(true);
    expect(result.providerCount).toBe(2);
    expect(result.root).toBe(path.join(tmpDir, 'sa7', 'cb-providers'));
    expect(fs.readFileSync(path.join(result.root, 'UPSTREAM_COMMIT'), 'utf-8').trim()).toBe(sha);
    expect(fs.readFileSync(path.join(result.root, 'providers', 'a.js'), 'utf-8')).toBe('module.exports = "a";');
    expect(fs.readFileSync(path.join(result.root, 'providers', 'b.js'), 'utf-8')).toBe('module.exports = "b";');
  });

  it('skips network work when the requested SHA is already installed', async () => {
    await updateSa7Providers({
      dataDir: tmpDir,
      sha,
      fetchImpl: fetchFrom({
        '/manifest.json': manifestFor(['providers/a.js']),
        '/providers/a.js': 'module.exports = "a";',
      }),
    });

    const failingFetch = vi.fn(async () => {
      throw new Error('network should not be used');
    }) as unknown as FetchLike;

    const result = await updateSa7Providers({ dataDir: tmpDir, sha, fetchImpl: failingFetch });
    expect(result.changed).toBe(false);
    expect(result.providerCount).toBe(1);
    expect(failingFetch).not.toHaveBeenCalled();
  });

  it('keeps the previous install when an update fails part-way through', async () => {
    const initialFetch = fetchFrom({
      '/manifest.json': manifestFor(['providers/a.js']),
      '/providers/a.js': 'module.exports = "old";',
    });
    const initial = await updateSa7Providers({ dataDir: tmpDir, sha, fetchImpl: initialFetch });

    const nextSha = 'b'.repeat(40);
    await expect(
      updateSa7Providers({
        dataDir: tmpDir,
        sha: nextSha,
        fetchImpl: fetchFrom({
          '/manifest.json': manifestFor(['providers/a.js', 'providers/missing.js']),
          '/providers/a.js': 'module.exports = "new";',
        }),
      }),
    ).rejects.toThrow('HTTP 404');

    expect(fs.readFileSync(path.join(initial.root, 'UPSTREAM_COMMIT'), 'utf-8').trim()).toBe(sha);
    expect(fs.readFileSync(path.join(initial.root, 'providers', 'a.js'), 'utf-8')).toBe('module.exports = "old";');
  });

  it('rejects unsafe provider paths from the upstream manifest', async () => {
    await expect(
      updateSa7Providers({
        dataDir: tmpDir,
        sha,
        fetchImpl: fetchFrom({
          '/manifest.json': manifestFor(['../escape.js']),
        }),
      }),
    ).rejects.toThrow('Unsafe provider filename');
  });
});
