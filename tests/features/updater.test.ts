import { describe, it, expect, vi, afterEach } from 'vitest';
import { UpdaterScheduler } from '../../src/core/updater/scheduler.js';
import { WorkerClient } from '../../src/core/workerClient.js';
import fs from 'node:fs';
import path from 'node:path';

describe('in-process updater scheduler', () => {
  const tmpDir = path.join(process.cwd(), '.data-test-updater');

  const mockWorker = {
    fleet: 'sa7' as const,
    baseUrl: 'http://127.0.0.1:7001',
    reload: vi.fn().mockResolvedValue(true),
  } as unknown as WorkerClient;

  const mockWorkers = {
    sa7: mockWorker,
    nuvio: mockWorker,
    vega: mockWorker,
  };

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('calculates jittered intervals between min and max bounds', () => {
    const scheduler = new UpdaterScheduler(mockWorkers, {
      dataDir: tmpDir,
      minHours: 20,
      maxHours: 24,
      updateOnStart: false,
    });

    scheduler.start();
    const status = scheduler.getStatus('sa7');
    expect(status).toHaveProperty('refreshing', false);

    scheduler.stop();
  });
});
