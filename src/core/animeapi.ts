import { IMDB_ID_PATTERN } from './contentId.js';
import { DEFAULT_ANIMEAPI_URL, RESOLVE_MIN_MS } from './env.js';

export interface AnimeApiMapping {
  title?: string;
  imdbId?: string;
  tmdbId?: number;
  tmdbType?: 'movie' | 'tv';
}

export type AnimeApiLookup =
  | { status: 'ok'; mapping: AnimeApiMapping }
  | { status: 'not_found' }
  | { status: 'unavailable' };

const MAX_RESPONSE_BYTES = 1024 * 1024;

export class AnimeApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(baseUrl = DEFAULT_ANIMEAPI_URL, timeoutMs = 2000) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = Math.max(RESOLVE_MIN_MS, timeoutMs);
  }

  async getMapping(
    malNumericId: number,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<AnimeApiMapping | null> {
    const result = await this.lookup(malNumericId, signal, timeoutMs);
    return result.status === 'ok' ? result.mapping : null;
  }

  async lookup(
    malNumericId: number,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<AnimeApiLookup> {
    const budgetMs = Math.max(RESOLVE_MIN_MS, timeoutMs ?? this.timeoutMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budgetMs);
    const onAbort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const res = await fetch(`${this.baseUrl}/myanimelist/${malNumericId}`, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (res.status === 404) return { status: 'not_found' };
      if (!res.ok) return { status: 'unavailable' };

      const contentLength = Number(res.headers?.get?.('content-length') ?? '0');
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        return { status: 'unavailable' };
      }
      const raw = typeof res.text === 'function'
        ? await res.text()
        : JSON.stringify(await res.json());
      if (raw.length > MAX_RESPONSE_BYTES) return { status: 'unavailable' };
      const json = JSON.parse(raw) as Record<string, unknown>;

      const title = typeof json.title === 'string' && json.title.trim() ? json.title.trim() : undefined;
      const imdbId =
        typeof json.imdb === 'string' && IMDB_ID_PATTERN.test(json.imdb) ? json.imdb : undefined;
      const tmdbId =
        typeof json.themoviedb === 'number' && Number.isSafeInteger(json.themoviedb) && json.themoviedb > 0
          ? json.themoviedb
          : undefined;
      const tmdbType = json.themoviedb_type === 'movie' || json.themoviedb_type === 'tv' ? json.themoviedb_type : undefined;

      if (!imdbId && !tmdbId && !title) return { status: 'not_found' };
      return { status: 'ok', mapping: { title, imdbId, tmdbId, tmdbType } };
    } catch {
      return { status: 'unavailable' };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}
