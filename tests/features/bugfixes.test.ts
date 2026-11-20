import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { IMDB_ID_PATTERN, parseContentId } from '../../src/core/contentId.js';
import { parseStreamId } from '../../src/fleets/vega/addon/parseId.js';
import { Semaphore as VegaSemaphore } from '../../src/fleets/vega/util/concurrency.js';
import { Semaphore as NuvioSemaphore } from '../../src/fleets/nuvio/util/concurrency.js';
import { GatewayStreamCache } from '../../src/core/cache.js';
import { createGatewayApp } from '../../src/addon/app.js';
import type { StreamHandlerContext } from '../../src/addon/stream.js';
import type { WorkerClient } from '../../src/core/workerClient.js';
import { MetadataResolver } from '../../src/core/metadata.js';
import { logger } from '../../src/core/logger.js';

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

describe('review fixes', () => {
  const tmpDir = path.join(process.cwd(), '.data-test-review-fixes');
  const sha = 'a'.repeat(40);

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('accepts 11-12 digit IMDb IDs consistently across gateway and Vega', () => {
    const longId = 'tt12345678901';
    expect(IMDB_ID_PATTERN.test(longId)).toBe(true);
    expect(parseContentId('movie', longId)?.cleanId).toBe(longId);
    expect(parseStreamId('movie', longId)?.imdbId).toBe(longId);
    expect(IMDB_ID_PATTERN.test('tt123')).toBe(false);
  });

  it('never exceeds the semaphore limit in either fleet copy', async () => {
    for (const Semaphore of [VegaSemaphore, NuvioSemaphore]) {
      const semaphore = new Semaphore(2);
      let active = 0;
      let peak = 0;
      await Promise.all(
        Array.from({ length: 10 }, () =>
          semaphore.run(async () => {
            active += 1;
            peak = Math.max(peak, active);
            await new Promise((resolve) => setTimeout(resolve, 2));
            active -= 1;
          }),
        ),
      );
      expect(peak).toBe(2);
    }
  });

  it('returns 503 from GET and HEAD /health when every fleet is unreachable', async () => {
    const downWorker = {
      getHealth: vi.fn().mockResolvedValue({ error: 'ECONNREFUSED' }),
    } as unknown as WorkerClient;
    const ctx: StreamHandlerContext = {
      cache: new GatewayStreamCache(),
      workers: { sa7: downWorker, nuvio: downWorker, vega: downWorker },
      addonVersion: '1.0.0',
      policyVersion: '1.0.0',
      maxStreams: 1000,
      globalDeadlineMs: 12000,
      workerTimeoutMs: 10000,
    };
    const app = createGatewayApp(ctx, Date.now());

    const get = await request(app).get('/health');
    expect(get.status).toBe(503);
    expect(get.body.status).toBe('error');
    expect(get.body.ok).toBe(false);

    const head = await request(app).head('/health');
    expect(head.status).toBe(503);
  });

  it('uses the configured TMDB base URL and sanitizes TMDB years', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        title: 'Example',
        release_date: '2020-05-01',
        imdb_id: 'tt1234567',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const resolver = new MetadataResolver(
      'https://cinemeta.example',
      'key',
      undefined,
      { tmdbUrl: 'https://tmdb.local/3' },
    );
    const meta = await resolver.resolveTmdb('movie', 123);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('https://tmdb.local/3/movie/123');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('append_to_response=external_ids');
    expect(meta?.year).toBe(2020);
    expect(meta?.imdbId).toBe('tt1234567');
  });

  it('resolves IMDb ids for TMDB series via external_ids', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'Game of Thrones',
        first_air_date: '2011-04-17',
        external_ids: { imdb_id: 'tt0944947' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const resolver = new MetadataResolver(
      'https://cinemeta.example',
      'key',
      undefined,
      { tmdbUrl: 'https://tmdb.local/3' },
    );
    const meta = await resolver.resolveTmdb('series', 1399);

    expect(fetchMock.mock.calls[0]?.[0]).toContain('https://tmdb.local/3/tv/1399');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('append_to_response=external_ids');
    expect(meta?.title).toBe('Game of Thrones');
    expect(meta?.year).toBe(2011);
    expect(meta?.imdbId).toBe('tt0944947');
  });

  it('stops the 5-minute retry loop after three failures', async () => {
    vi.useFakeTimers();
    const downWorker = {
      getHealth: vi.fn().mockResolvedValue({ error: 'worker down' }),
      reload: vi.fn().mockResolvedValue(false),
    } as unknown as WorkerClient;
    const workers = { sa7: downWorker, nuvio: downWorker, vega: downWorker };
    const infoSpy = vi.spyOn(logger, 'info');
    const warnSpy = vi.spyOn(logger, 'warn');

    const scheduler = new UpdaterScheduler(workers, {
      dataDir: tmpDir,
      minHours: 20,
      maxHours: 24,
      updateOnStart: true,
    });
    scheduler.start();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await vi.advanceTimersByTimeAsync(31_000 + 5 * 60 * 1000);
    }

    const sa7Retries = infoSpy.mock.calls.filter(
      ([event, meta]) => event === 'updater.retry' && (meta as { fleet?: string })?.fleet === 'sa7',
    );
    const sa7Exhausted = warnSpy.mock.calls.filter(
      ([event, meta]) => event === 'updater.retry.exhausted' && (meta as { fleet?: string })?.fleet === 'sa7',
    );
    expect(sa7Retries).toHaveLength(3);
    expect(sa7Exhausted).toHaveLength(1);
    scheduler.stop();
  });

  it('only enforces strict snapshot SHA verification for SA7', async () => {
    vi.mocked(fetchGitHubHead).mockResolvedValue({ sha });
    vi.mocked(fetchCodebergHead).mockResolvedValue({ sha });
    vi.mocked(updateSa7Providers).mockResolvedValue({
      changed: true,
      sha,
      providerCount: 2,
      root: path.join(tmpDir, 'sa7', 'cb-providers'),
    });
    const worker = {
      getHealth: vi.fn().mockResolvedValue({ ok: true, snapshot: { sha: 'different' } }),
      reload: vi.fn().mockResolvedValue(true),
    } as unknown as WorkerClient;
    const scheduler = new UpdaterScheduler(
      { sa7: worker, nuvio: worker, vega: worker },
      { dataDir: tmpDir, minHours: 20, maxHours: 24, updateOnStart: false },
    );

    expect(await scheduler.checkFleet('nuvio')).toBe(true);
    expect(await scheduler.checkFleet('sa7')).toBe(false);
    expect(scheduler.getStatus('sa7').sha).toBeNull();
    scheduler.stop();
  });
});
