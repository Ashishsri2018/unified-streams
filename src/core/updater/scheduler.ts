import { UpdaterStateStore } from './state.js';
import { fetchGitHubHead, fetchCodebergHead } from './fetchers.js';
import { updateSa7Providers } from './sa7.js';
import { WorkerClient } from '../workerClient.js';
import { WorkerSnapshot } from '../telemetry.js';
import { logger } from '../logger.js';

const RETRY_DELAY_MS = 5 * 60 * 1000;
const MAX_RETRIES = 3;
const WORKER_READY_TIMEOUT_MS = 30_000;
const WORKER_READY_POLL_MS = 1_000;

type Fleet = 'sa7' | 'nuvio' | 'vega';
type CheckOutcome = 'ok' | 'failed' | 'skipped';

export interface SchedulerOptions {
  dataDir: string;
  minHours: number;
  maxHours: number;
  githubToken?: string;
  updateOnStart: boolean;
}

export class UpdaterScheduler {
  private readonly options: SchedulerOptions;
  private readonly workers: Record<'sa7' | 'nuvio' | 'vega', WorkerClient>;
  private readonly stateStores: Record<'sa7' | 'nuvio' | 'vega', UpdaterStateStore>;
  private readonly timers = new Map<Fleet, NodeJS.Timeout>();
  private readonly refreshing = new Set<Fleet>();
  private readonly retryCounts = new Map<Fleet, number>();

  constructor(
    workers: Record<'sa7' | 'nuvio' | 'vega', WorkerClient>,
    options: SchedulerOptions,
  ) {
    this.workers = workers;
    this.options = options;
    this.stateStores = {
      sa7: new UpdaterStateStore(options.dataDir, 'sa7'),
      nuvio: new UpdaterStateStore(options.dataDir, 'nuvio'),
      vega: new UpdaterStateStore(options.dataDir, 'vega'),
    };
  }

  private calculateJitterMs(): number {
    const minMs = this.options.minHours * 3600 * 1000;
    const maxMs = this.options.maxHours * 3600 * 1000;
    return Math.floor(minMs + Math.random() * Math.max(0, maxMs - minMs));
  }

  start(): void {
    const fleets: Array<'sa7' | 'nuvio' | 'vega'> = ['sa7', 'nuvio', 'vega'];
    for (const fleet of fleets) {
      if (this.options.updateOnStart) {
        this.setTimer(fleet, 0, true);
      } else {
        this.scheduleNext(fleet);
      }
    }
  }

  private setTimer(
    fleet: 'sa7' | 'nuvio' | 'vega',
    delayMs: number,
    waitForReady: boolean,
  ): void {
    const existing = this.timers.get(fleet);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.timers.delete(fleet);
      void this.runScheduledCheck(fleet, waitForReady);
    }, delayMs);

    if (timer.unref) timer.unref();
    this.timers.set(fleet, timer);
  }

  private async runScheduledCheck(
    fleet: Fleet,
    waitForReady: boolean,
  ): Promise<void> {
    if (waitForReady && !(await this.waitForWorker(fleet))) {
      this.stateStores[fleet].update({
        lastCheck: Date.now(),
        lastError: 'Worker was not ready for the initial update',
      });
      logger.warn('updater.failed', { fleet, error: 'worker_not_ready' });
      this.recordFailure(fleet);
      return;
    }

    const outcome = await this.runCheck(fleet);
    if (outcome === 'skipped') return;
    if (outcome === 'ok') {
      this.scheduleNext(fleet);
      return;
    }
    this.recordFailure(fleet);
  }

  private recordFailure(fleet: Fleet): void {
    const attempts = (this.retryCounts.get(fleet) ?? 0) + 1;
    if (attempts > MAX_RETRIES) {
      logger.warn('updater.retry.exhausted', { fleet, attempts: attempts - 1 });
      this.scheduleNext(fleet);
      return;
    }
    this.retryCounts.set(fleet, attempts);
    logger.info('updater.retry', {
      fleet,
      attempt: attempts,
      maxAttempts: MAX_RETRIES,
    });
    this.scheduleRetry(fleet);
  }

  private async waitForWorker(fleet: 'sa7' | 'nuvio' | 'vega'): Promise<boolean> {
    const deadline = Date.now() + WORKER_READY_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const health = await this.workers[fleet].getHealth(2000);
      if (!('error' in health) && health.ok) return true;
      await new Promise((resolve) => setTimeout(resolve, WORKER_READY_POLL_MS));
    }

    return false;
  }

  private scheduleNext(fleet: Fleet): void {
    this.retryCounts.delete(fleet);
    const delayMs = this.calculateJitterMs();
    this.stateStores[fleet].update({ nextRun: Date.now() + delayMs });
    this.setTimer(fleet, delayMs, false);
  }

  private scheduleRetry(fleet: 'sa7' | 'nuvio' | 'vega'): void {
    this.stateStores[fleet].update({ nextRun: Date.now() + RETRY_DELAY_MS });
    this.setTimer(fleet, RETRY_DELAY_MS, false);
  }

  async checkFleet(fleet: Fleet): Promise<boolean> {
    const outcome = await this.runCheck(fleet);
    return outcome === 'ok';
  }

  private async runCheck(fleet: Fleet): Promise<CheckOutcome> {
    if (this.refreshing.has(fleet)) return 'skipped';
    this.refreshing.add(fleet);

    logger.info('updater.started', { fleet });
    try {
      let remoteHead: { sha: string } | null = null;
      if (fleet === 'sa7') {
        remoteHead = await fetchGitHubHead('SA7ANI/cb-providers', 'main', this.options.githubToken);
      } else if (fleet === 'nuvio') {
        remoteHead = await fetchCodebergHead('eclipsia/nuvio-plugin', 'main');
      } else {
        remoteHead = await fetchGitHubHead('Zenda-Cross/vega-providers', 'main', this.options.githubToken);
      }

      const current = this.stateStores[fleet].get();
      if (!remoteHead) {
        this.stateStores[fleet].update({ lastCheck: Date.now(), lastError: 'Remote head fetch failed' });
        logger.warn('updater.failed', { fleet, error: 'Remote head fetch failed' });
        return 'failed';
      }

      if (current.sha && current.sha === remoteHead.sha) {
        this.stateStores[fleet].update({ lastCheck: Date.now(), lastError: null });
        logger.info('updater.head.resolved', { fleet, sha: remoteHead.sha, status: 'unchanged' });
        return 'ok';
      }

      await this.installUpdate(fleet, remoteHead.sha);

      this.stateStores[fleet].update({
        sha: remoteHead.sha,
        fetchedAt: Date.now(),
        lastCheck: Date.now(),
        lastSuccess: Date.now(),
        lastError: null,
      });

      logger.info('updater.installed', { fleet, sha: remoteHead.sha });
      return 'ok';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.stateStores[fleet].update({ lastCheck: Date.now(), lastError: msg });
      logger.error('updater.failed', err, { fleet });
      return 'failed';
    } finally {
      this.refreshing.delete(fleet);
    }
  }

  private async installUpdate(
    fleet: 'sa7' | 'nuvio' | 'vega',
    sha: string,
  ): Promise<void> {
    if (fleet === 'sa7') {
      const result = await updateSa7Providers({
        dataDir: this.options.dataDir,
        sha,
        githubToken: this.options.githubToken,
      });
      logger.info('updater.download.completed', {
        fleet,
        sha,
        changed: result.changed,
        providers: result.providerCount,
      });
    }

    const reloaded = await this.workers[fleet].reload();
    if (!reloaded) {
      throw new Error(`${fleet} worker reload failed`);
    }

    const health = await this.workers[fleet].getHealth(2000);
    if ('error' in health) {
      throw new Error(`${fleet} worker health check failed: ${health.error}`);
    }
    if (!health.ok) {
      throw new Error(`${fleet} worker reported unhealthy after reload`);
    }
    if (health.snapshot?.lastError) {
      throw new Error(`${fleet} worker reported snapshot error: ${health.snapshot.lastError}`);
    }
    if (health.snapshot?.sha && health.snapshot.sha !== sha) {
      throw new Error(
        `${fleet} worker still reports snapshot ${health.snapshot.sha}, expected ${sha}`,
      );
    }

    logger.info('updater.reload.completed', { fleet, sha });
  }

  getStatus(fleet: 'sa7' | 'nuvio' | 'vega'): WorkerSnapshot {
    return this.stateStores[fleet].toSnapshot(this.refreshing.has(fleet));
  }

  stop(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
