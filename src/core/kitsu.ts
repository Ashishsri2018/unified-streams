import { DEFAULT_KITSU_URL, RESOLVE_MIN_MS } from './env.js';

export interface KitsuMapping {
  malId?: number;
}

export interface KitsuAnime {
  title: string;
  year?: number;
  subtype?: string;
}

export type KitsuLookup =
  | { status: 'ok'; mapping: KitsuMapping }
  | { status: 'not_found' }
  | { status: 'unavailable' };

const MAX_RESPONSE_BYTES = 1024 * 1024;

function parseYear(raw: string): number | undefined {
  const match = /(?<!\d)((?:18|19|20)\d{2})(?!\d)/.exec(raw);
  if (!match) return undefined;
  const year = parseInt(match[1], 10);
  return year >= 1800 && year <= 2200 ? year : undefined;
}

function positiveInt(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw > 0) return raw;
  if (typeof raw === 'string' && /^\d{1,10}$/.test(raw)) {
    const num = parseInt(raw, 10);
    if (Number.isSafeInteger(num) && num > 0) return num;
  }
  return undefined;
}

export class KitsuClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(baseUrl = DEFAULT_KITSU_URL, timeoutMs = 2000) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = Math.max(RESOLVE_MIN_MS, timeoutMs);
  }

  private async fetchJson(
    path: string,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<{ status: number; ok: boolean; json?: Record<string, unknown> }> {
    const budgetMs = Math.max(RESOLVE_MIN_MS, timeoutMs ?? this.timeoutMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budgetMs);
    const onAbort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        signal: controller.signal,
        headers: { accept: 'application/vnd.api+json' },
      });
      if (!res.ok) return { status: res.status, ok: false };

      const contentLength = Number(res.headers?.get?.('content-length') ?? '0');
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        return { status: res.status, ok: false };
      }
      const raw = typeof res.text === 'function'
        ? await res.text()
        : JSON.stringify(await res.json());
      if (raw.length > MAX_RESPONSE_BYTES) return { status: res.status, ok: false };
      return { status: res.status, ok: true, json: JSON.parse(raw) as Record<string, unknown> };
    } catch {
      return { status: 0, ok: false };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  async lookup(
    kitsuNumericId: number,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<KitsuLookup> {
    const result = await this.fetchJson(
      `/anime/${kitsuNumericId}/mappings`,
      signal,
      timeoutMs,
    );
    if (result.status === 404) return { status: 'not_found' };
    if (!result.ok || !result.json) return { status: 'unavailable' };

    const data = Array.isArray(result.json.data) ? result.json.data : [];
    for (const entry of data) {
      if (!entry || typeof entry !== 'object') continue;
      const attributes = (entry as { attributes?: Record<string, unknown> }).attributes;
      if (!attributes) continue;
      const site = typeof attributes.externalSite === 'string' ? attributes.externalSite : '';
      if (site !== 'myanimelist/anime') continue;
      const malId = positiveInt(attributes.externalId);
      if (malId) return { status: 'ok', mapping: { malId } };
    }
    return { status: 'not_found' };
  }

  async getAnime(
    kitsuNumericId: number,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<KitsuAnime | null> {
    const result = await this.fetchJson(`/anime/${kitsuNumericId}`, signal, timeoutMs);
    if (!result.ok || !result.json) return null;

    const data = result.json.data as { attributes?: Record<string, unknown> } | undefined;
    const attributes = data?.attributes;
    if (!attributes) return null;

    const title =
      typeof attributes.canonicalTitle === 'string' && attributes.canonicalTitle.trim()
        ? attributes.canonicalTitle.trim()
        : undefined;
    if (!title) return null;

    const startDate = typeof attributes.startDate === 'string' ? attributes.startDate : '';
    return {
      title,
      year: startDate ? parseYear(startDate) : undefined,
      subtype: typeof attributes.subtype === 'string' ? attributes.subtype.toLowerCase() : undefined,
    };
  }
}
