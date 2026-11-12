import { UpdaterStateStore } from './state.js';
import { fetchGitHubHead, fetchCodebergHead } from './fetchers.js';
import { WorkerClient } from '../workerClient.js';
import { WorkerSnapshot } from '../telemetry.js';
import { logger } from '../logger.js';

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
  private timers: NodeJS.Timeout[] = [];
  private refreshing = new Set<string>();

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
        void this.checkFleet(fleet);
      }
      this.scheduleNext(fleet);
    }
  }

  private scheduleNext(fleet: 'sa7' | 'nuvio' | 'vega'): void {
    const delayMs = this.calculateJitterMs();
    this.stateStores[fleet].update({ nextRun: Date.now() + delayMs });

    const timer = setTimeout(() => {
      void this.checkFleet(fleet).then(() => this.scheduleNext(fleet));
    }, delayMs);

    if (timer.unref) timer.unref();
    this.timers.push(timer);
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

      // SHA changed -> update state and reload worker
      this.stateStores[fleet].update({
        sha: remoteHead.sha,
        fetchedAt: Date.now(),
        lastCheck: Date.now(),
        lastSuccess: Date.now(),
        lastError: null,
      });

      await this.workers[fleet].reload();
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

  getStatus(fleet: 'sa7' | 'nuvio' | 'vega'): WorkerSnapshot {
    return this.stateStores[fleet].toSnapshot(this.refreshing.has(fleet));
  }

  stop(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}
