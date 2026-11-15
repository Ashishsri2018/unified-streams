import { UpdaterStateStore } from './state.js';
import { fetchGitHubHead, fetchCodebergHead } from './fetchers.js';
import { updateSa7Providers } from './sa7.js';
import { WorkerClient } from '../workerClient.js';
import { WorkerSnapshot } from '../telemetry.js';
import { logger } from '../logger.js';

const RETRY_DELAY_MS = 5 * 60 * 1000;
const WORKER_READY_TIMEOUT_MS = 30_000;
const WORKER_READY_POLL_MS = 1_000;

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
  private readonly timers = new Map<'sa7' | 'nuvio' | 'vega', NodeJS.Timeout>();
  private readonly refreshing = new Set<string>();

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
    return Math.floor(minMs + Math.random() * (maxMs - minMs));
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
    fleet: 'sa7' | 'nuvio' | 'vega',
    waitForReady: boolean,
  ): Promise<void> {
    if (waitForReady && !(await this.waitForWorker(fleet))) {
      this.stateStores[fleet].update({
        lastCheck: Date.now(),
        lastError: 'Worker was not ready for the initial update',
      });
      logger.warn('updater.failed', { fleet, error: 'worker_not_ready' });
      this.scheduleRetry(fleet);
      return;
    }

    const ok = await this.checkFleet(fleet);
    if (ok) {
      this.scheduleNext(fleet);
    } else {
      this.scheduleRetry(fleet);
    }
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

  private scheduleNext(fleet: 'sa7' | 'nuvio' | 'vega'): void {
    const delayMs = this.calculateJitterMs();
    this.stateStores[fleet].update({ nextRun: Date.now() + delayMs });
    this.setTimer(fleet, delayMs, false);
  }

  private scheduleRetry(fleet: 'sa7' | 'nuvio' | 'vega'): void {
    this.stateStores[fleet].update({ nextRun: Date.now() + RETRY_DELAY_MS });
    this.setTimer(fleet, RETRY_DELAY_MS, false);
  }

  async checkFleet(fleet: 'sa7' | 'nuvio' | 'vega'): Promise<boolean> {
    if (this.refreshing.has(fleet)) return false;
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
        return false;
      }

      if (current.sha && current.sha === remoteHead.sha) {
        this.stateStores[fleet].update({ lastCheck: Date.now(), lastError: null });
        logger.info('updater.head.resolved', { fleet, sha: remoteHead.sha, status: 'unchanged' });
        return true;
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
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.stateStores[fleet].update({ lastCheck: Date.now(), lastError: msg });
      logger.error('updater.failed', err, { fleet });
      return false;
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
    if (!('error' in health) && health.snapshot?.sha && health.snapshot.sha !== sha) {
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
