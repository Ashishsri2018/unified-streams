import { IMDB_ID_PATTERN } from './contentId.js';
import { DEFAULT_TVMAZE_URL, RESOLVE_MIN_MS } from './env.js';

export interface TvmazeShow {
  title: string;
  year?: number;
  imdbId?: string;
}

export type TvmazeLookup =
  | { status: 'ok'; show: TvmazeShow }
  | { status: 'not_found' }
  | { status: 'unavailable' };

const MAX_RESPONSE_BYTES = 1024 * 1024;

function parseYear(raw: unknown): number | undefined {
  if (typeof raw !== 'string') return undefined;
  const match = /(?<!\d)((?:18|19|20)\d{2})(?!\d)/.exec(raw);
  if (!match) return undefined;
  const year = parseInt(match[1], 10);
  return year >= 1800 && year <= 2200 ? year : undefined;
}

export class TvmazeClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(baseUrl = DEFAULT_TVMAZE_URL, timeoutMs = 2000) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = Math.max(RESOLVE_MIN_MS, timeoutMs);
  }

  async lookupByTvdb(
    tvdbNumericId: number,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<TvmazeLookup> {
    const budgetMs = Math.max(RESOLVE_MIN_MS, timeoutMs ?? this.timeoutMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budgetMs);
    const onAbort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const res = await fetch(
        `${this.baseUrl}/lookup/shows?thetvdb=${tvdbNumericId}`,
        {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        },
      );
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

      const json = JSON.parse(raw) as {
        name?: unknown;
        premiered?: unknown;
        externals?: { imdb?: unknown };
      } | null;
      if (!json || typeof json !== 'object') return { status: 'not_found' };

      const title =
        typeof json.name === 'string' && json.name.trim() ? json.name.trim() : undefined;
      const imdbId =
        typeof json.externals?.imdb === 'string' && IMDB_ID_PATTERN.test(json.externals.imdb)
          ? json.externals.imdb
          : undefined;
      if (!title && !imdbId) return { status: 'not_found' };

      return {
        status: 'ok',
        show: {
          title: title ?? '',
          year: parseYear(json.premiered),
          imdbId,
        },
      };
    } catch {
      return { status: 'unavailable' };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}
