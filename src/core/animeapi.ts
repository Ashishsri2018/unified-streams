import { IMDB_ID_PATTERN } from './contentId.js';

export interface AnimeApiMapping {
  title?: string;
  imdbId?: string;
  tmdbId?: number;
  tmdbType?: 'movie' | 'tv';
}

export class AnimeApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(baseUrl = 'https://animeapi.my.id', timeoutMs = 2000) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = Math.max(250, timeoutMs);
  }

  async getMapping(malNumericId: number, signal?: AbortSignal): Promise<AnimeApiMapping | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const res = await fetch(`${this.baseUrl}/myanimelist/${malNumericId}`, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (!res.ok) return null;

      const json = (await res.json()) as Record<string, unknown>;
      const title = typeof json.title === 'string' && json.title.trim() ? json.title.trim() : undefined;
      const imdbId =
        typeof json.imdb === 'string' && IMDB_ID_PATTERN.test(json.imdb) ? json.imdb : undefined;
      const tmdbId =
        typeof json.themoviedb === 'number' && Number.isSafeInteger(json.themoviedb) && json.themoviedb > 0
          ? json.themoviedb
          : undefined;
      const tmdbType = json.themoviedb_type === 'movie' || json.themoviedb_type === 'tv' ? json.themoviedb_type : undefined;

      if (!imdbId && !tmdbId && !title) return null;
      return { title, imdbId, tmdbId, tmdbType };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}
