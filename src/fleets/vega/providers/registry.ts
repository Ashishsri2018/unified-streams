import {
  computeProviderChanges,
  type ProviderChangeMap,
  type ProviderVersion,
} from "../../../core/providerChanges.js";
import type {
  LoggerLike,
  ProviderBundle,
  ProviderContextLike,
  ProviderRegistryApi,
  ProviderSnapshot,
  SnapshotLease,
  UpstreamProviderEntry,
} from "../types.js";
import { unloadProviderModules } from "./loader.js";

interface SnapshotMeta {
  refs: number;
  retired: boolean;
  purged: boolean;
  graceTimer?: NodeJS.Timeout;
}

const DEFAULT_GRACE_PERIOD_MS = 10 * 60 * 1000;

export class ProviderRegistry implements ProviderRegistryApi {
  readonly context: ProviderContextLike;
  private readonly logger: LoggerLike;
  private readonly gracePeriodMs: number;
  private readonly tracked = new Map<ProviderSnapshot, SnapshotMeta>();
  private readonly listeners = new Set<(snapshot: ProviderSnapshot) => void>();
  private active: ProviderSnapshot | null = null;
  private previous: ProviderSnapshot | null = null;
  private disposed = false;
  private baselineVersions: ProviderVersion[] | null = null;
  private providerChanges: ProviderChangeMap = {};

  constructor(options: {
    context: ProviderContextLike;
    logger: LoggerLike;
    gracePeriodMs?: number;
  }) {
    this.context = options.context;
    this.logger = options.logger;
    this.gracePeriodMs = options.gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS;
  }

  getActiveSnapshot(): ProviderSnapshot | null {
    return this.active;
  }

  listProviders(): ProviderBundle[] {
    return this.active ? Array.from(this.active.bundles.values()) : [];
  }

  acquire(): SnapshotLease {
    const snapshot = this.active;
    if (!snapshot) {
      return { snapshot: null, release: () => undefined };
    }

    const meta = this.ensureMeta(snapshot);
    meta.refs += 1;
    let released = false;

    return {
      snapshot,
      release: () => {
        if (released) return;
        released = true;
        const current = this.tracked.get(snapshot);
        if (!current) return;
        current.refs = Math.max(0, current.refs - 1);
        if (current.retired && current.refs === 0) {
          this.purgeSnapshot(snapshot);
        }
      },
    };
  }

  onActivate(listener: (snapshot: ProviderSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  activate(snapshot: ProviderSnapshot): void {
    if (this.disposed) {
      this.logger.warn("provider_registry_disposed");
      return;
    }

    if (this.active === snapshot) {
      this.ensureMeta(snapshot);
      this.emit(snapshot);
      return;
    }

    const oldActive = this.active;
    const oldPrevious = this.previous;

    this.updateProviderChanges(snapshot.entries ?? []);
    snapshot.changes = this.providerChanges;

    this.active = snapshot;
    this.previous = oldActive;
    const meta = this.ensureMeta(snapshot);
    meta.retired = false;
    if (meta.graceTimer) {
      clearTimeout(meta.graceTimer);
      meta.graceTimer = undefined;
    }

    if (oldActive) this.retire(oldActive);
    if (oldPrevious && oldPrevious !== oldActive && oldPrevious !== snapshot) {
      this.retire(oldPrevious);
    }

    this.logger.info("provider_registry_activated", {
      sha: snapshot.sha,
      providerCount: snapshot.bundles.size,
    });
    this.emit(snapshot);
  }

  previousSnapshot(): ProviderSnapshot | null {
    return this.previous;
  }

  private updateProviderChanges(entries: UpstreamProviderEntry[]): void {
    const versions = entries.map((entry) => ({
      id: entry.value,
      version: entry.version,
    }));
    if (!this.baselineVersions || this.baselineVersions.length === 0) {
      this.baselineVersions = versions;
      this.providerChanges = {};
      return;
    }
    this.providerChanges = computeProviderChanges(this.baselineVersions, versions);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();

    const snapshots = Array.from(this.tracked.keys());
    this.active = null;
    this.previous = null;
    for (const snapshot of snapshots) {
      this.purgeSnapshot(snapshot);
    }
    this.tracked.clear();
    this.logger.debug("provider_registry_disposed");
  }

  private ensureMeta(snapshot: ProviderSnapshot): SnapshotMeta {
    let meta = this.tracked.get(snapshot);
    if (!meta) {
      meta = { refs: 0, retired: false, purged: false };
      this.tracked.set(snapshot, meta);
    }
    return meta;
  }

  private retire(snapshot: ProviderSnapshot): void {
    const meta = this.ensureMeta(snapshot);
    meta.retired = true;
    if (meta.purged) return;

    if (meta.refs === 0) {
      this.purgeSnapshot(snapshot);
      return;
    }
    if (meta.graceTimer) return;

    meta.graceTimer = setTimeout(() => {
      const current = this.tracked.get(snapshot);
      if (!current || current.purged) return;
      current.graceTimer = undefined;
      this.purgeSnapshot(snapshot);
    }, this.gracePeriodMs);
    meta.graceTimer.unref?.();
  }

  private purgeSnapshot(snapshot: ProviderSnapshot): void {
    const meta = this.tracked.get(snapshot);
    if (!meta || meta.purged) return;
    meta.purged = true;
    if (meta.graceTimer) {
      clearTimeout(meta.graceTimer);
      meta.graceTimer = undefined;
    }
    const rootStillReferenced =
      this.active?.rootDir === snapshot.rootDir ||
      this.previous?.rootDir === snapshot.rootDir ||
      [...this.tracked.entries()].some(
        ([other, otherMeta]) =>
          other !== snapshot &&
          !otherMeta.purged &&
          other.rootDir === snapshot.rootDir,
      );
    this.tracked.delete(snapshot);
    if (rootStillReferenced) return;
    try {
      unloadProviderModules(snapshot.rootDir);
    } catch (error) {
      this.logger.warn("provider_registry_unload_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private emit(snapshot: ProviderSnapshot): void {
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        this.logger.error("provider_registry_listener_failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
