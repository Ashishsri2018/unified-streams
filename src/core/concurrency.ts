import { CircuitState } from './telemetry.js';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private nextProbeAt = 0;
  private readonly threshold: number;
  private readonly cooldownMs: number;

  constructor(options?: Partial<CircuitBreakerOptions>) {
    this.threshold = options?.failureThreshold ?? 3;
    this.cooldownMs = options?.cooldownMs ?? 300000;
  }

  getState(): CircuitState {
    if (this.state === 'open' && Date.now() >= this.nextProbeAt) {
      this.state = 'half-open';
    }
    return this.state;
  }

  canExecute(): boolean {
    const current = this.getState();
    return current === 'closed' || current === 'half-open';
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = 'closed';
  }

  recordEmpty(): void {
    // Empty resets streak per spec
    this.consecutiveFailures = 0;
    this.state = 'closed';
  }

  recordFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.threshold) {
      this.state = 'open';
      this.nextProbeAt = Date.now() + this.cooldownMs;
    }
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  reset(): void {
    this.consecutiveFailures = 0;
    this.state = 'closed';
    this.nextProbeAt = 0;
  }
}

/**
 * Calculates remaining timeout budget with a safety margin to prevent global deadline race conditions.
 */
export function clampTimeout(
  remainingDeadlineMs: number,
  configuredTimeoutMs: number,
  safetyMarginMs = 200,
): { effectiveTimeoutMs: number; shouldSkip: boolean } {
  const safeBudget = remainingDeadlineMs - safetyMarginMs;
  if (safeBudget <= 100) {
    return { effectiveTimeoutMs: 0, shouldSkip: true };
  }
  return {
    effectiveTimeoutMs: Math.min(configuredTimeoutMs, safeBudget),
    shouldSkip: false,
  };
}
