import {
  INTERNAL_HEADERS,
  InternalStreamResponse,
  ForwardedMetadata,
  ProviderCatalogResponse,
  ProviderSelectionResponse,
} from './contract.js';
import { WORKER_DEADLINE_MARGIN_MS } from './env.js';
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

  private buildHeaders(
    requestId?: string,
    deadlineMs?: number,
    metadata?: ForwardedMetadata,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'accept': 'application/json',
    };
    if (requestId) headers[INTERNAL_HEADERS.REQUEST_ID] = requestId;
    if (this.internalToken) headers[INTERNAL_HEADERS.INTERNAL_TOKEN] = this.internalToken;
    if (deadlineMs) headers[INTERNAL_HEADERS.DEADLINE_MS] = String(deadlineMs);
    if (metadata?.title) headers[INTERNAL_HEADERS.META_TITLE] = encodeURIComponent(metadata.title);
    if (metadata?.year != null) {
      const yearNum = typeof metadata.year === 'number' ? metadata.year : parseInt(String(metadata.year), 10);
      if (Number.isInteger(yearNum) && yearNum >= 1800 && yearNum <= 2200) {
        headers[INTERNAL_HEADERS.META_YEAR] = String(yearNum);
      }
    }
    if (metadata?.tmdbId && Number.isSafeInteger(metadata.tmdbId) && metadata.tmdbId > 0) {
      headers[INTERNAL_HEADERS.META_TMDB_ID] = String(metadata.tmdbId);
    }
    if (metadata?.imdbId && /^tt\d+$/.test(metadata.imdbId)) {
      headers[INTERNAL_HEADERS.META_IMDB_ID] = metadata.imdbId;
    }
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
    metadata?: ForwardedMetadata,
    signal?: AbortSignal,
  ): Promise<InternalStreamResponse> {
    const startTime = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const combinedSignal = signal
      ? AbortSignal.any([controller.signal, signal])
      : controller.signal;

    const url = `${this.baseUrl}/internal/stream/${type}/${encodeURIComponent(id)}.json?config=${encodeURIComponent(encodedConfig)}`;

    try {
      const res = await fetch(url, {
        signal: combinedSignal,
        headers: this.buildHeaders(requestId, timeoutMs, metadata),
      });

      const durationMs = Date.now() - startTime;
      if (!res.ok) {
        return { streams: [], outcome: 'error', fleet: this.fleet, durationMs };
      }

      const body = (await res.json()) as { streams?: StremioStream[]; partial?: boolean };
      const responseMs = Date.now() - startTime;
      const streams = Array.isArray(body?.streams) ? body.streams : [];
      // Workers stop one second before the gateway timeout. A response that
      // arrives at the derived deadline is deadline-truncated, so cache it with
      // the partial TTL even though the worker returned HTTP 200.
      const deadlineProximityMs = Math.max(0, timeoutMs - WORKER_DEADLINE_MARGIN_MS);
      const partial =
        body?.partial === true || (streams.length > 0 && responseMs >= deadlineProximityMs);
      return {
        streams,
        outcome: streams.length > 0 ? (partial ? 'timeout' : 'ok') : 'empty',
        fleet: this.fleet,
        durationMs: responseMs,
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

  async getProviders(timeoutMs = 5000): Promise<ProviderCatalogResponse | { error: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/internal/providers`, {
        signal: controller.signal,
        headers: this.buildHeaders(),
      });
      if (!res.ok) {
        return { error: `Provider catalog failed with status ${res.status}` };
      }
      return (await res.json()) as ProviderCatalogResponse;
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    } finally {
      clearTimeout(timer);
    }
  }

  async setProviderSelection(
    overrides: Record<string, boolean>,
    version: number,
    timeoutMs = 10000,
  ): Promise<ProviderSelectionResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/internal/providers/selection`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          ...this.buildHeaders(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ overrides, version }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<ProviderSelectionResponse>;
      if (!res.ok) {
        return {
          ok: false,
          version,
          error: typeof body.error === 'string' ? body.error : `Selection failed with status ${res.status}`,
        };
      }
      return {
        ok: body.ok !== false,
        version: typeof body.version === 'number' ? body.version : version,
        ...(body.applied ? { applied: body.applied } : {}),
        ...(body.errors ? { errors: body.errors } : {}),
        ...(body.error ? { error: body.error } : {}),
      };
    } catch (err) {
      return { ok: false, version, error: err instanceof Error ? err.message : String(err) };
    } finally {
      clearTimeout(timer);
    }
  }

  async reload(timeoutMs = 60000): Promise<boolean> {
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
