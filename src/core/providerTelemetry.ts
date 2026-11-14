export type ProviderOutcomeKind = 'ok' | 'empty' | 'timeout' | 'error' | 'skipped';
export type ProviderTelemetryState = 'closed' | 'open' | 'half-open';

export interface ProviderTelemetryOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  breaker?: boolean;
  now?: () => number;
}

export interface ProviderTelemetryEntry {
  id: string;
  state: ProviderTelemetryState;
  calls: number;
  ok: number;
  responded: number;
  empty: number;
  errors: number;
  timeouts: number;
  skipped: number;
  consecutiveFailures: number;
  lastMs: number | null;
  avgMs: number | null;
  maxMs: number;
  successRate: number | null;
  lastError: string | null;
  lastSuccessAt: string | null;
  openedAt: string | null;
}

export interface ProviderTelemetrySummary {
  total: number;
  closed: number;
  open: number;
  halfOpen: number;
}

interface TelemetryState {
  id: string;
  state: ProviderTelemetryState;
  openedAt: number | null;
  consecutiveFailures: number;
  probeInFlight: boolean;
  calls: number;
  ok: number;
  responded: number;
  empty: number;
  errors: number;
  timeouts: number;
  skipped: number;
  totalLatencyMs: number;
  maxMs: number;
  lastMs: number | null;
  lastError: string | null;
  lastSuccessAt: number | null;
}

const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

function clampInt(value: number | undefined, fallback: number, min: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.floor(value));
}

function errorMessage(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 300);
}

function clampLatency(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

export class ProviderTelemetry {
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly breakerEnabled: boolean;
  private readonly now: () => number;
  private readonly providers = new Map<string, TelemetryState>();

  constructor(options: ProviderTelemetryOptions = {}) {
    this.failureThreshold = clampInt(
      options.failureThreshold,
      DEFAULT_FAILURE_THRESHOLD,
      1,
    );
    this.cooldownMs = clampInt(options.cooldownMs, DEFAULT_COOLDOWN_MS, 0);
    this.breakerEnabled = options.breaker !== false;
    this.now = options.now ?? Date.now;
  }

  attempt(id: string): boolean {
    const state = this.stateFor(id);
    const time = this.now();

    if (!this.breakerEnabled) {
      state.calls += 1;
      return true;
    }

    if (state.state === 'open') {
      if (time - (state.openedAt ?? time) >= this.cooldownMs) {
        state.state = 'half-open';
        state.probeInFlight = true;
        state.calls += 1;
        return true;
      }
      state.skipped += 1;
      return false;
    }

    if (state.state === 'half-open') {
      if (state.probeInFlight) {
        state.skipped += 1;
        return false;
      }
      state.probeInFlight = true;
      state.calls += 1;
      return true;
    }

    state.calls += 1;
    return true;
  }

  record(
    id: string,
    outcome: ProviderOutcomeKind,
    details: { latencyMs?: number; error?: unknown } = {},
  ): void {
    const state = this.stateFor(id);
    const time = this.now();

    if (outcome === 'skipped') {
      state.skipped += 1;
      state.calls = Math.max(0, state.calls - 1);
      state.probeInFlight = false;
      return;
    }

    const latency = clampLatency(details.latencyMs);
    state.lastMs = latency;
    state.totalLatencyMs += latency;
    if (latency > state.maxMs) state.maxMs = latency;

    if (outcome === 'ok' || outcome === 'empty') {
      state.ok += 1;
      if (outcome === 'ok') {
        state.responded += 1;
        state.lastSuccessAt = time;
      } else {
        state.empty += 1;
      }
      state.lastError = null;
      this.close(state);
      return;
    }

    if (outcome === 'timeout') state.timeouts += 1;
    else state.errors += 1;

    state.consecutiveFailures += 1;
    state.lastError = errorMessage(details.error);
    state.probeInFlight = false;

    if (
      state.state === 'half-open' ||
      state.consecutiveFailures >= this.failureThreshold
    ) {
      this.open(state, time);
    }
  }

  getState(id: string): ProviderTelemetryState {
    const state = this.providers.get(id);
    return state ? this.effectiveState(state, this.now()) : 'closed';
  }

  isAvailable(id: string): boolean {
    return this.getState(id) !== 'open';
  }

  snapshot(): ProviderTelemetryEntry[] {
    const time = this.now();
    return [...this.providers.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((state) => this.entry(state, time));
  }

  summary(ids?: Iterable<string>): ProviderTelemetrySummary {
    const time = this.now();
    const list = ids ? [...ids] : [...this.providers.keys()];
    const summary: ProviderTelemetrySummary = {
      total: list.length,
      closed: 0,
      open: 0,
      halfOpen: 0,
    };
    for (const id of list) {
      const state = this.providers.get(id);
      const current = state ? this.effectiveState(state, time) : 'closed';
      if (current === 'open') summary.open += 1;
      else if (current === 'half-open') summary.halfOpen += 1;
      else summary.closed += 1;
    }
    return summary;
  }

  reset(): void {
    this.providers.clear();
  }

  private stateFor(id: string): TelemetryState {
    let state = this.providers.get(id);
    if (!state) {
      state = {
        id,
        state: 'closed',
        openedAt: null,
        consecutiveFailures: 0,
        probeInFlight: false,
        calls: 0,
        ok: 0,
        responded: 0,
        empty: 0,
        errors: 0,
        timeouts: 0,
        skipped: 0,
        totalLatencyMs: 0,
        maxMs: 0,
        lastMs: null,
        lastError: null,
        lastSuccessAt: null,
      };
      this.providers.set(id, state);
    }
    return state;
  }

  private effectiveState(
    state: TelemetryState,
    time: number,
  ): ProviderTelemetryState {
    if (
      state.state === 'open' &&
      state.openedAt !== null &&
      time - state.openedAt >= this.cooldownMs
    ) {
      return 'half-open';
    }
    return state.state;
  }

  private close(state: TelemetryState): void {
    state.state = 'closed';
    state.openedAt = null;
    state.consecutiveFailures = 0;
    state.probeInFlight = false;
  }

  private open(state: TelemetryState, time: number): void {
    state.state = 'open';
    state.openedAt = time;
    state.probeInFlight = false;
  }

  private entry(state: TelemetryState, time: number): ProviderTelemetryEntry {
    const calls = state.calls;
    return {
      id: state.id,
      state: this.effectiveState(state, time),
      calls,
      ok: state.ok,
      responded: state.responded,
      empty: state.empty,
      errors: state.errors,
      timeouts: state.timeouts,
      skipped: state.skipped,
      consecutiveFailures: state.consecutiveFailures,
      lastMs: state.lastMs,
      avgMs: calls > 0 ? Math.round(state.totalLatencyMs / calls) : null,
      maxMs: state.maxMs,
      successRate: calls > 0 ? Math.round((state.ok / calls) * 1000) / 1000 : null,
      lastError: state.lastError,
      lastSuccessAt:
        state.lastSuccessAt === null
          ? null
          : new Date(state.lastSuccessAt).toISOString(),
      openedAt:
        state.openedAt === null ? null : new Date(state.openedAt).toISOString(),
    };
  }
}
