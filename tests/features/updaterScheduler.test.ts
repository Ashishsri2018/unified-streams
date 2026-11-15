import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../../src/core/updater/fetchers.js', () => ({
  fetchGitHubHead: vi.fn(),
  fetchCodebergHead: vi.fn(),
}));

vi.mock('../../src/core/updater/sa7.js', () => ({
  updateSa7Providers: vi.fn(),
}));

import { UpdaterScheduler } from '../../src/core/updater/scheduler.js';
import { fetchGitHubHead, fetchCodebergHead } from '../../src/core/updater/fetchers.js';
import { updateSa7Providers } from '../../src/core/updater/sa7.js';
import { WorkerClient } from '../../src/core/workerClient.js';

describe('updater scheduler fleet updates', () => {
  const tmpDir = path.join(process.cwd(), '.data-test-updater-scheduler');
  const sha = 'c'.repeat(40);

  function makeWorkers(reloadResult: boolean, health = vi.fn().mockResolvedValue({ ok: true })) {
    const reload = vi.fn().mockResolvedValue(reloadResult);
    const worker = {
      fleet: 'sa7',
      reload,
      getHealth: health,
    } as unknown as WorkerClient;
    return {
      workers: { sa7: worker, nuvio: worker, vega: worker },
      reload,
      health,
    };
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('installs SA7 providers before reloading and records the SHA only on success', async () => {
    vi.mocked(fetchGitHubHead).mockResolvedValue({ sha });
    vi.mocked(updateSa7Providers).mockResolvedValue({
      changed: true,
      sha,
      providerCount: 2,
      root: path.join(tmpDir, 'sa7', 'cb-providers'),
    });

    const { workers, reload } = makeWorkers(true);
    const scheduler = new UpdaterScheduler(workers, {
      dataDir: tmpDir,
      minHours: 20,
      maxHours: 24,
      updateOnStart: false,
    });

    expect(await scheduler.checkFleet('sa7')).toBe(true);
    expect(updateSa7Providers).toHaveBeenCalledWith({
      dataDir: tmpDir,
      sha,
      githubToken: undefined,
    });
    expect(reload).toHaveBeenCalledTimes(1);

    const installOrder = vi.mocked(updateSa7Providers).mock.invocationCallOrder[0];
    const reloadOrder = reload.mock.invocationCallOrder[0];
    expect(installOrder).toBeLessThan(reloadOrder);

    const status = scheduler.getStatus('sa7');
    expect(status.sha).toBe(sha);
    expect(status.fetchedAt).not.toBeNull();
    expect(status.lastError).toBeNull();

    vi.mocked(updateSa7Providers).mockClear();
    reload.mockClear();

    expect(await scheduler.checkFleet('sa7')).toBe(true);
    expect(updateSa7Providers).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    scheduler.stop();
  });

  it('does not advance the SHA when the worker reload fails', async () => {
    vi.mocked(fetchGitHubHead).mockResolvedValue({ sha });
    vi.mocked(updateSa7Providers).mockResolvedValue({
      changed: true,
      sha,
      providerCount: 2,
      root: path.join(tmpDir, 'sa7', 'cb-providers'),
    });

    const { workers } = makeWorkers(false);
    const scheduler = new UpdaterScheduler(workers, {
      dataDir: tmpDir,
      minHours: 20,
      maxHours: 24,
      updateOnStart: false,
    });

    expect(await scheduler.checkFleet('sa7')).toBe(false);

    const status = scheduler.getStatus('sa7');
    expect(status.sha).toBeNull();
    expect(status.fetchedAt).toBeNull();
    expect(status.lastError).toContain('reload failed');

    scheduler.stop();
  });

  it('waits for a ready worker before running the initial update', async () => {
    vi.useFakeTimers();
    vi.mocked(fetchGitHubHead).mockResolvedValue({ sha });
    vi.mocked(fetchCodebergHead).mockResolvedValue({ sha });
    vi.mocked(updateSa7Providers).mockResolvedValue({
      changed: true,
      sha,
      providerCount: 2,
      root: path.join(tmpDir, 'sa7', 'cb-providers'),
    });

    let ready = false;
    const health = vi.fn(async () => (ready ? { ok: true } : { error: 'not ready' }));
    const { workers } = makeWorkers(true, health);
    const scheduler = new UpdaterScheduler(workers, {
      dataDir: tmpDir,
      minHours: 20,
      maxHours: 24,
      updateOnStart: true,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchGitHubHead).not.toHaveBeenCalled();

    ready = true;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(updateSa7Providers).toHaveBeenCalledWith({
      dataDir: tmpDir,
      sha,
      githubToken: undefined,
    });

    scheduler.stop();
  });
});
