import { AnimeApiClient } from './animeapi.js';
import { IMDB_ID_PATTERN } from './contentId.js';
import { DEFAULT_ANIMEAPI_URL, RESOLVE_MIN_MS } from './env.js';
import { JikanClient } from './jikan.js';
import { KitsuClient } from './kitsu.js';
import { scoreTitleCandidate } from './titleMatch.js';

export interface CanonicalMetadata {
  title: string;
  year?: number;
  type: 'movie' | 'series';
  imdbId?: string;
  tmdbId?: number;
}

export function parseCanonicalYear(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1800 && raw <= 2200) {
    return raw;
  }
  if (typeof raw === 'string') {
    const match = /(?<!\d)((?:18|19|20)\d{2})(?!\d)/.exec(raw);
    if (match) {
      const y = parseInt(match[1], 10);
      if (Number.isInteger(y) && y >= 1800 && y <= 2200) return y;
    }
  }
  return undefined;
}

interface CacheItem {
  data: CanonicalMetadata | null;
  expiresAt: number;
}

interface AbortContext {
  signal: AbortSignal;
  cleanup(): void;
  aborted(): boolean;
}

interface TmdbCandidate {
  id: number;
  name: string;
  year?: number;
}

export class MetadataResolver {
  private cache = new Map<string, CacheItem>();
  private readonly cinemetaUrl: string;
  private readonly tmdbUrl: string;
  private readonly tmdbApiKey?: string;
  private readonly jikan: JikanClient;
  private readonly animeApi: AnimeApiClient;
  private readonly kitsu: KitsuClient;
  private readonly metadataBudgetMs: number;
  private readonly malResolveBudgetMs: number;
  private readonly posTtlMs = 86400000;
  private readonly notFoundTtlMs = 60000;
  private readonly transientTtlMs = 5000;
  private readonly maxEntries = 5000;
  private hits = 0;
  private misses = 0;
  private readonly resolutionStats = {
    animeApiOk: 0,
    animeApiNotFound: 0,
    animeApiUnavailable: 0,
    jikanOk: 0,
    tmdbSearchOk: 0,
    tmdbDetailSkipped: 0,
    budgetExpired: 0,
  };

  constructor(
    cinemetaUrl = 'https://v3-cinemeta.strem.io',
    tmdbApiKey?: string,
    jikanUrl?: string,
    options?: {
      tmdbUrl?: string;
      jikanMaxRps?: number;
      jikanMaxRpm?: number;
      animeApiUrl?: string;
      kitsuUrl?: string;
      metadataBudgetMs?: number;
      malResolveBudgetMs?: number;
    },
  ) {
    this.cinemetaUrl = cinemetaUrl.replace(/\/+$/, '');
    this.tmdbUrl = (options?.tmdbUrl ?? 'https://api.themoviedb.org/3').replace(/\/+$/, '');
    this.tmdbApiKey = tmdbApiKey;
    this.jikan = new JikanClient(jikanUrl, options?.jikanMaxRps, options?.jikanMaxRpm);
    this.metadataBudgetMs = Math.max(RESOLVE_MIN_MS, options?.metadataBudgetMs ?? 2000);
    this.malResolveBudgetMs = Math.max(RESOLVE_MIN_MS, options?.malResolveBudgetMs ?? 2000);
    this.animeApi = new AnimeApiClient(
      options?.animeApiUrl ?? DEFAULT_ANIMEAPI_URL,
      this.malResolveBudgetMs,
    );
    this.kitsu = new KitsuClient(options?.kitsuUrl, this.malResolveBudgetMs);
  }

  private abortable(timeoutMs: number, external?: AbortSignal): AbortContext {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Math.max(RESOLVE_MIN_MS, timeoutMs),
    );
    const onAbort = () => controller.abort();
    if (external?.aborted) controller.abort();
    else external?.addEventListener('abort', onAbort, { once: true });
    return {
      signal: controller.signal,
      cleanup: () => {
        clearTimeout(timer);
        external?.removeEventListener('abort', onAbort);
      },
      aborted: () => controller.signal.aborted || Boolean(external?.aborted),
    };
  }

  private getCached(key: string): CanonicalMetadata | null | undefined {
    const item = this.cache.get(key);
    if (!item) {
      this.misses++;
      return undefined;
    }
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    return item.data;
  }

  private setCache(key: string, data: CanonicalMetadata | null, ttlMs?: number): void {
    if (this.cache.size >= this.maxEntries) {
      const first = this.cache.keys().next().value;
      if (first) this.cache.delete(first);
    }
    const ttl = ttlMs ?? (data ? this.posTtlMs : this.notFoundTtlMs);
    this.cache.set(key, { data, expiresAt: Date.now() + ttl });
  }

  private cacheError(key: string, ctx: AbortContext, status?: number): void {
    if (ctx.aborted()) {
      this.resolutionStats.budgetExpired += 1;
      return;
    }
    this.setCache(key, null, status === 404 ? this.notFoundTtlMs : this.transientTtlMs);
  }

  async resolveImdb(
    type: 'movie' | 'series',
    imdbId: string,
    signal?: AbortSignal,
  ): Promise<CanonicalMetadata | null> {
    const cacheKey = `imdb:${type}:${imdbId}`;
    const cached = this.getCached(cacheKey);
    if (cached !== undefined) return cached;

    const ctx = this.abortable(this.metadataBudgetMs, signal);
    try {
      const res = await fetch(`${this.cinemetaUrl}/meta/${type}/${imdbId}.json`, {
        signal: ctx.signal,
      });
      if (!res.ok) {
        this.cacheError(cacheKey, ctx, res.status);
        return null;
      }
      const json = (await res.json()) as { meta?: { name?: string; year?: number | string; moviedb_id?: number } };
      if (!json?.meta) {
        this.cacheError(cacheKey, ctx, 404);
        return null;
      }

      const meta: CanonicalMetadata = {
        title: json.meta.name || '',
        year: parseCanonicalYear(json.meta.year),
        type,
        imdbId,
        tmdbId: json.meta.moviedb_id,
      };
      this.setCache(cacheKey, meta);
      return meta;
    } catch {
      this.cacheError(cacheKey, ctx);
      return null;
    } finally {
      ctx.cleanup();
    }
  }

  async resolveTmdb(
    type: 'movie' | 'series',
    tmdbNumericId: number,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<CanonicalMetadata | null> {
    const cacheKey = `tmdb:${type}:${tmdbNumericId}`;
    const cached = this.getCached(cacheKey);
    if (cached !== undefined) return cached;

    if (!this.tmdbApiKey) {
      this.setCache(cacheKey, null, this.notFoundTtlMs);
      return null;
    }

    const ctx = this.abortable(timeoutMs ?? this.metadataBudgetMs, signal);
    try {
      const endpoint = type === 'movie' ? 'movie' : 'tv';
      const url = `${this.tmdbUrl}/${endpoint}/${tmdbNumericId}?api_key=${this.tmdbApiKey}&append_to_response=external_ids`;
      const res = await fetch(url, { signal: ctx.signal });
      if (!res.ok) {
        this.cacheError(cacheKey, ctx, res.status);
        return null;
      }
      const d = (await res.json()) as {
        title?: string;
        name?: string;
        release_date?: string;
        first_air_date?: string;
        imdb_id?: string;
        external_ids?: { imdb_id?: string };
      };
      const dateStr = d.release_date || d.first_air_date || '';
      const rawImdbId =
        typeof d.imdb_id === 'string' ? d.imdb_id : d.external_ids?.imdb_id;
      const meta: CanonicalMetadata = {
        title: d.title || d.name || '',
        year: dateStr ? parseCanonicalYear(dateStr) : undefined,
        type,
        imdbId:
          typeof rawImdbId === 'string' && IMDB_ID_PATTERN.test(rawImdbId)
            ? rawImdbId
            : undefined,
        tmdbId: tmdbNumericId,
      };
      this.setCache(cacheKey, meta);
      return meta;
    } catch {
      this.cacheError(cacheKey, ctx);
      return null;
    } finally {
      ctx.cleanup();
    }
  }

  private async searchTmdbByTitle(
    type: 'movie' | 'series',
    title: string,
    year: number | undefined,
    signal: AbortSignal,
    timeoutMs?: number,
  ): Promise<number | undefined> {
    if (!title || !this.tmdbApiKey) return undefined;

    const ctx = this.abortable(timeoutMs ?? this.metadataBudgetMs, signal);
    try {
      const endpoint = type === 'movie' ? 'movie' : 'tv';
      const params = new URLSearchParams();
      params.set('api_key', this.tmdbApiKey);
      params.set('query', title);
      if (year !== undefined) {
        params.set(type === 'movie' ? 'year' : 'first_air_date_year', String(year));
      }
      const res = await fetch(`${this.tmdbUrl}/search/${endpoint}?${params.toString()}`, {
        signal: ctx.signal,
      });
      if (!res.ok) return undefined;
      const json = (await res.json()) as { results?: Array<Record<string, unknown>> };
      const candidates: TmdbCandidate[] = [];
      for (const raw of Array.isArray(json.results) ? json.results : []) {
        const id = raw?.id;
        if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) continue;
        const name = typeof raw.title === 'string'
          ? raw.title
          : typeof raw.name === 'string'
            ? raw.name
            : '';
        const date = typeof raw.release_date === 'string'
          ? raw.release_date
          : typeof raw.first_air_date === 'string'
            ? raw.first_air_date
            : '';
        candidates.push({ id, name, year: date ? parseCanonicalYear(date) : undefined });
      }
      if (candidates.length === 0) return undefined;
      if (candidates.every((candidate) => !candidate.name)) {
        this.resolutionStats.tmdbSearchOk += 1;
        return candidates[0]!.id;
      }
      const best = candidates
        .map((candidate) => ({
          ...candidate,
          score: scoreTitleCandidate(candidate.name, title, candidate.year, year),
        }))
        .sort((a, b) => b.score - a.score)[0]!;
      if (best.score < 40) return undefined;
      this.resolutionStats.tmdbSearchOk += 1;
      return best.id;
    } catch {
      return undefined;
    } finally {
      ctx.cleanup();
    }
  }

  async resolveMal(
    type: 'movie' | 'series',
    malNumericId: number,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<CanonicalMetadata | null> {
    const cacheKey = `mal:${type}:${malNumericId}`;
    const cached = this.getCached(cacheKey);
    if (cached !== undefined) return cached;

    const budgetMs = Math.max(
      RESOLVE_MIN_MS,
      Math.min(this.malResolveBudgetMs, timeoutMs ?? this.malResolveBudgetMs),
    );
    const deadlineAt = Date.now() + budgetMs;
    const remaining = () =>
      Math.max(RESOLVE_MIN_MS, Math.min(budgetMs, deadlineAt - Date.now()));
    const ctx = this.abortable(budgetMs, signal);

    try {
      const animeApiBudget = Math.max(RESOLVE_MIN_MS, Math.floor(budgetMs * 0.4));
      const lookup = await this.animeApi.lookup(malNumericId, ctx.signal, animeApiBudget);
      if (lookup.status === 'ok') this.resolutionStats.animeApiOk += 1;
      else if (lookup.status === 'not_found') this.resolutionStats.animeApiNotFound += 1;
      else this.resolutionStats.animeApiUnavailable += 1;

      if (lookup.status === 'ok' && (lookup.mapping.imdbId || lookup.mapping.tmdbId)) {
        const mapping = lookup.mapping;
        const lookupType: 'movie' | 'series' =
          mapping.tmdbType === 'movie'
            ? 'movie'
            : mapping.tmdbType === 'tv'
              ? 'series'
              : type;
        const meta: CanonicalMetadata = {
          title: mapping.title ?? '',
          type,
          imdbId: mapping.imdbId,
          tmdbId: mapping.tmdbId,
        };
        if (!meta.title && meta.tmdbId) {
          const detail = await this.resolveTmdb(lookupType, meta.tmdbId, ctx.signal, remaining());
          if (detail) {
            meta.title = detail.title;
            meta.year = detail.year;
            meta.imdbId = detail.imdbId ?? meta.imdbId;
          }
        }
        this.setCache(cacheKey, meta);
        return meta;
      }

      const anime = await this.jikan.getAnime(malNumericId, remaining(), ctx.signal);
      if (!anime) {
        if (!ctx.aborted()) this.setCache(cacheKey, null, this.transientTtlMs);
        return null;
      }
      this.resolutionStats.jikanOk += 1;

      const title = anime.titleEnglish || anime.title;
      const animeType: 'movie' | 'series' =
        anime.type === 'movie' ? 'movie' : anime.type === 'tv' ? 'series' : type;
      let tmdbId = await this.searchTmdbByTitle(animeType, title, anime.year, ctx.signal, remaining());
      let imdbId: string | undefined;
      if (tmdbId) {
        if (remaining() >= 300) {
          const detail = await this.resolveTmdb(animeType, tmdbId, ctx.signal, remaining());
          imdbId = detail?.imdbId;
          tmdbId = detail?.tmdbId ?? tmdbId;
        } else {
          this.resolutionStats.tmdbDetailSkipped += 1;
        }
      }

      const meta: CanonicalMetadata = { title, year: anime.year, type, imdbId, tmdbId };
      this.setCache(cacheKey, meta);
      return meta;
    } catch {
      if (!ctx.aborted()) this.setCache(cacheKey, null, this.transientTtlMs);
      return null;
    } finally {
      ctx.cleanup();
    }
  }

  async resolveKitsu(
    type: 'movie' | 'series',
    kitsuNumericId: number,
    signal?: AbortSignal,
  ): Promise<CanonicalMetadata | null> {
    const cacheKey = `kitsu:${type}:${kitsuNumericId}`;
    const cached = this.getCached(cacheKey);
    if (cached !== undefined) return cached;

    const budgetMs = this.malResolveBudgetMs;
    const deadlineAt = Date.now() + budgetMs;
    const remaining = () =>
      Math.max(RESOLVE_MIN_MS, Math.min(budgetMs, deadlineAt - Date.now()));
    const ctx = this.abortable(budgetMs, signal);

    try {
      const mappingBudget = Math.max(RESOLVE_MIN_MS, Math.floor(budgetMs * 0.35));
      const lookup = await this.kitsu.lookup(kitsuNumericId, ctx.signal, mappingBudget);
      if (lookup.status === 'ok' && lookup.mapping.malId) {
        const mal = await this.resolveMal(type, lookup.mapping.malId, ctx.signal, remaining());
        if (mal) {
          this.setCache(cacheKey, mal);
          return mal;
        }
      }

      const anime = await this.kitsu.getAnime(kitsuNumericId, remaining(), ctx.signal);
      if (!anime) {
        if (!ctx.aborted()) this.setCache(cacheKey, null, this.transientTtlMs);
        return null;
      }

      const animeType: 'movie' | 'series' = anime.subtype === 'movie' ? 'movie' : 'series';
      let tmdbId = await this.searchTmdbByTitle(
        animeType,
        anime.title,
        anime.year,
        ctx.signal,
        remaining(),
      );
      let imdbId: string | undefined;
      if (tmdbId && remaining() >= 300) {
        const detail = await this.resolveTmdb(animeType, tmdbId, ctx.signal, remaining());
        imdbId = detail?.imdbId;
        tmdbId = detail?.tmdbId ?? tmdbId;
      }

      const meta: CanonicalMetadata = { title: anime.title, year: anime.year, type, imdbId, tmdbId };
      this.setCache(cacheKey, meta);
      return meta;
    } catch {
      if (!ctx.aborted()) this.setCache(cacheKey, null, this.transientTtlMs);
      return null;
    } finally {
      ctx.cleanup();
    }
  }

  async resolveContent(
    type: 'movie' | 'series',
    parsed: { family: string; cleanId: string },
    signal?: AbortSignal,
  ): Promise<CanonicalMetadata | null> {
    if (parsed.family === 'tt') {
      return this.resolveImdb(type, parsed.cleanId, signal);
    }
    if (parsed.family === 'tmdb') {
      const id = Number(parsed.cleanId.slice('tmdb:'.length));
      return this.resolveTmdb(type, id, signal);
    }
    if (parsed.family === 'mal') {
      const id = Number(parsed.cleanId.slice('mal:'.length));
      return this.resolveMal(type, id, signal);
    }
    if (parsed.family === 'kitsu') {
      const id = Number(parsed.cleanId.slice('kitsu:'.length));
      return this.resolveKitsu(type, id, signal);
    }
    return null;
  }

  getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      maxEntries: this.maxEntries,
      resolution: { ...this.resolutionStats },
    };
  }
}
