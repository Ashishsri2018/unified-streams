import { INTERNAL_HEADERS, InternalStreamResponse } from './contract.js';
import { WorkerHealth } from './telemetry.js';
import { StremioStream } from '../addon/filters.js';

export interface WorkerClientOptions {
  fleet: 'sa7' | 'nuvio' | 'vega';
  baseUrl: string;
  internalToken?: string;
}

export class WorkerClient {
  readonly fleet: 'sa7' | 'nuvio' | 'vega';
  readonly baseUrl: string;
  private readonly internalToken: string;

  constructor(options: WorkerClientOptions) {
    this.fleet = options.fleet;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.internalToken = options.internalToken || '';
  }

  private buildHeaders(requestId?: string, deadlineMs?: number): Record<string, string> {
    const headers: Record<string, string> = {
      'accept': 'application/json',
    };
    if (requestId) headers[INTERNAL_HEADERS.REQUEST_ID] = requestId;
    if (this.internalToken) headers[INTERNAL_HEADERS.INTERNAL_TOKEN] = this.internalToken;
    if (deadlineMs) headers[INTERNAL_HEADERS.DEADLINE_MS] = String(deadlineMs);
    return headers;
  }

  async getHealth(timeoutMs = 5000): Promise<WorkerHealth | { error: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/internal/health`, {
        signal: controller.signal,
        headers: this.buildHeaders(),
      });
      if (!res.ok) {
        return { error: `Health check failed with status ${res.status}` };
      }
      return (await res.json()) as WorkerHealth;
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchStream(
    type: 'movie' | 'series',
    id: string,
    encodedConfig: string,
    timeoutMs: number,
    requestId?: string,
  ): Promise<InternalStreamResponse> {
    const startTime = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const url = `${this.baseUrl}/internal/stream/${type}/${encodeURIComponent(id)}.json?config=${encodeURIComponent(encodedConfig)}`;

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: this.buildHeaders(requestId, timeoutMs),
      });

      const durationMs = Date.now() - startTime;
      if (!res.ok) {
        return { streams: [], outcome: 'error', fleet: this.fleet, durationMs };
      }

      const body = (await res.json()) as { streams?: StremioStream[] };
      const streams = Array.isArray(body?.streams) ? body.streams : [];
      return {
        streams,
        outcome: streams.length > 0 ? 'ok' : 'empty',
        fleet: this.fleet,
        durationMs,
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const isTimeout =
        (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) ||
        durationMs >= timeoutMs - 50;

      return {
        streams: [],
        outcome: isTimeout ? 'timeout' : 'error',
        fleet: this.fleet,
        durationMs,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async reload(timeoutMs = 10000): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/internal/reload`, {
        method: 'POST',
        signal: controller.signal,
        headers: this.buildHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
