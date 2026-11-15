import fs from 'node:fs';
import path from 'node:path';
import { WorkerSnapshot } from '../telemetry.js';

export interface UpdaterState {
  sha: string | null;
  fetchedAt: number | null;
  lastCheck: number | null;
  lastSuccess: number | null;
  nextRun: number | null;
  lastError: string | null;
}

export class UpdaterStateStore {
  private readonly filePath: string;
  private state: UpdaterState;

  constructor(dataDir: string, fleet: string) {
    this.filePath = path.join(dataDir, `${fleet}-updater-state.json`);
    this.state = this.load();
  }

  private load(): UpdaterState {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(raw) as UpdaterState;
      } catch {
        // Fall back to default
      }
    }
    return {
      sha: null,
      fetchedAt: null,
      lastCheck: null,
      lastSuccess: null,
      nextRun: null,
      lastError: null,
    };
  }

  get(): UpdaterState {
    return { ...this.state };
  }

  update(patch: Partial<UpdaterState>): void {
    this.state = { ...this.state, ...patch };
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch {
      // Ignore write failures in read-only setups
    }
  }

  toSnapshot(refreshing = false): WorkerSnapshot {
    const fetchedAtStr = this.state.fetchedAt ? new Date(this.state.fetchedAt).toISOString() : null;
    const ageMs = this.state.fetchedAt ? Math.max(0, Date.now() - this.state.fetchedAt) : null;

    return {
      sha: this.state.sha,
      fetchedAt: fetchedAtStr,
      ageMs,
      refreshing,
      lastError: this.state.lastError,
    };
  }
}
