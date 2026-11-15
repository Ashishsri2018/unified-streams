import { CacheStats } from './cache.js';

export type HealthStatus = 'ok' | 'degraded' | 'error';
export type CircuitState = 'closed' | 'open' | 'half-open';

export interface ProviderMetrics {
  id: string;
  state: CircuitState;
  calls: number;
  ok: number;
  responded?: number;
  empty: number;
  errors: number;
  timeouts: number;
  skipped: number;
  successRate: number | null;
  avgMs: number | null;
  lastMs: number | null;
  maxMs?: number | null;
  lastError: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures?: number;
}

export interface WorkerSnapshot {
  sha: string | null;
  fetchedAt: string | null;
  ageMs: number | null;
  refreshing: boolean;
  lastError: string | null;
}

export interface WorkerHealth {
  fleet: 'sa7' | 'nuvio' | 'vega';
  ok: boolean;
  status: HealthStatus;
  startedAt: string;
  uptimeSec: number;
  snapshot: WorkerSnapshot;
  providers: {
    total: number;
    circuits: { open: number; halfOpen: number };
    stats: ProviderMetrics[];
  };
  metrics: {
    requests: number;
    cacheHits: number;
    cacheMisses: number;
    emptyResults: number;
    deadlineHits: number;
    settleHits: number;
    providerFailures: number;
  };
}

export interface ComponentHealthInfo {
  name: string;
  displayName: string;
  ok: boolean;
  status?: 'ok' | 'degraded' | 'error';
  latencyMs: number | null;
  health: unknown;
  process: {
    running: boolean;
    uptimeSec: number;
    restarts?: number;
  };
  updater?: WorkerSnapshot;
  error?: string;
}

export interface AggregateProviderMetric {
  component: string;
  id: string;
  state: CircuitState | string;
  calls: number;
  ok: number;
  empty: number;
  errors: number;
  timeouts: number;
  skipped: number;
  successRate: number | null;
  avgMs: number | null;
  lastError: string | null;
}

export interface AggregateProvidersReport {
  total: number;
  circuits: {
    open: number;
    halfOpen: number;
  };
  stats: AggregateProviderMetric[];
}

export interface GatewayHealth {
  ok: boolean;
  status: HealthStatus;
  addon: string;
  version: string;
  commit: string;
  startedAt: string;
  uptimeSec: number;
  checkedAt: string;
  cache: {
    stream: CacheStats;
    metadata: {
      hits: number;
      misses: number;
      size: number;
      maxEntries: number;
    };
  };
  fleets: Record<string, WorkerHealth | { error: string }>;
  providers?: AggregateProvidersReport;
  components?: ComponentHealthInfo[];
  updater: Record<string, WorkerSnapshot>;
  sink: {
    queueDepth: number;
    dropped: number;
    batchesSent: number;
    batchesFailed: number;
  };
  metrics: {
    requests: number;
    cacheHits: number;
    cacheMisses: number;
    emptyResults: number;
    deadlineHits: number;
  };
}

export function computeRates(ok: number, empty: number, errors: number, timeouts: number): { successRate: number; failureRate: number } {
  const effectiveAttempts = ok + empty + errors + timeouts;
  if (effectiveAttempts === 0) {
    return { successRate: 0, failureRate: 0 };
  }
  const successes = ok + empty; // Note: empty counts towards non-failure
  const failures = errors + timeouts;
  return {
    successRate: Math.round((successes / effectiveAttempts) * 100) / 100,
    failureRate: Math.round((failures / effectiveAttempts) * 100) / 100,
  };
}
