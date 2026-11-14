import {
  ProviderTelemetry,
  type ProviderOutcomeKind,
  type ProviderTelemetryEntry,
} from '../../../core/providerTelemetry.js';

export type ProviderError =
  | 'timeout'
  | 'error'
  | 'non_array'
  | 'deadline'
  | 'skipped';

export interface ProviderOutcome {
  id: string;
  ok: boolean;
  streams: number;
  latencyMs: number;
  error?: ProviderError;
  lastError?: string;
}

export interface ProviderStats {
  state: ProviderTelemetryEntry['state'];
  calls: number;
  ok: number;
  responded: number;
  empty: number;
  errors: number;
  timeouts: number;
  skipped: number;
  successRate: number | null;
  avgMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  lastError: string | null;
  lastSuccessAt: string | null;
}

export type ProviderStatsReport = Record<string, ProviderStats>;

const DEFAULT_CAPACITY = 100;

export function percentile(
  samples: readonly number[],
  p: 50 | 95,
): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  return sorted[index] as number;
}

export interface ProviderMetricsOptions {
  failureThreshold?: number;
  cooldownMs?: number;
}

export class ProviderMetrics {
  private readonly capacity: number;
  private readonly telemetry: ProviderTelemetry;
  private readonly latencies = new Map<string, number[]>();

  constructor(capacity = DEFAULT_CAPACITY, options: ProviderMetricsOptions = {}) {
    this.capacity = Math.max(1, capacity);
    this.telemetry = new ProviderTelemetry({
      failureThreshold: options.failureThreshold,
      cooldownMs: options.cooldownMs,
    });
  }

  attempt(id: string): boolean {
    return this.telemetry.attempt(id);
  }

  record(outcome: ProviderOutcome): void {
    const id = outcome.id;
    if (outcome.error === 'deadline' || outcome.error === 'skipped') {
      this.telemetry.record(id, 'skipped');
      return;
    }

    const kind: ProviderOutcomeKind = outcome.ok
      ? outcome.streams > 0
        ? 'ok'
        : 'empty'
      : outcome.error === 'timeout'
        ? 'timeout'
        : 'error';

    const samples = this.latencies.get(id) ?? [];
    samples.push(outcome.latencyMs);
    if (samples.length > this.capacity) samples.shift();
    this.latencies.set(id, samples);

    this.telemetry.record(id, kind, {
      latencyMs: outcome.latencyMs,
      error: outcome.lastError ?? outcome.error,
    });
  }

  report(): ProviderStatsReport {
    const report: ProviderStatsReport = {};
    for (const entry of this.telemetry.snapshot()) {
      if (entry.calls === 0 && entry.skipped === 0) continue;
      const samples = this.latencies.get(entry.id) ?? [];
      report[entry.id] = {
        state: entry.state,
        calls: entry.calls,
        ok: entry.ok,
        responded: entry.responded,
        empty: entry.empty,
        errors: entry.errors,
        timeouts: entry.timeouts,
        skipped: entry.skipped,
        successRate: entry.successRate,
        avgMs: entry.avgMs,
        p50Ms: percentile(samples, 50),
        p95Ms: percentile(samples, 95),
        lastError: entry.lastError,
        lastSuccessAt: entry.lastSuccessAt,
      };
    }
    return report;
  }

  reset(): void {
    this.telemetry.reset();
    this.latencies.clear();
  }
}
