import { JikanClient } from './jikan.js';

export interface CanonicalMetadata {
  title: string;
  year?: number;
  type: 'movie' | 'series';
  imdbId?: string;
  tmdbId?: number;
}

interface CacheItem {
  data: CanonicalMetadata | null;
  expiresAt: number;
}

export class MetadataResolver {
  private cache = new Map<string, CacheItem>();
  private readonly cinemetaUrl: string;
  private readonly tmdbApiKey?: string;
  private readonly jikan: JikanClient;
  private readonly posTtlMs = 86400000; // 24 hours
  private readonly negTtlMs = 60000;    // 60 seconds
  private readonly maxEntries = 5000;
  private hits = 0;
  private misses = 0;

  constructor(cinemetaUrl = 'https://v3-cinemeta.strem.io', tmdbApiKey?: string, jikanUrl?: string) {
    this.cinemetaUrl = cinemetaUrl.replace(/\/+$/, '');
    this.tmdbApiKey = tmdbApiKey;
    this.jikan = new JikanClient(jikanUrl);
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

  private setCache(key: string, data: CanonicalMetadata | null): void {
    if (this.cache.size >= this.maxEntries) {
      const first = this.cache.keys().next().value;
      if (first) this.cache.delete(first);
    }
    const ttl = data ? this.posTtlMs : this.negTtlMs;
    this.cache.set(key, { data, expiresAt: Date.now() + ttl });
  }

  async resolveImdb(type: 'movie' | 'series', imdbId: string): Promise<CanonicalMetadata | null> {
    const cacheKey = `imdb:${type}:${imdbId}`;
    const cached = this.getCached(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const res = await fetch(`${this.cinemetaUrl}/meta/${type}/${imdbId}.json`);
      if (!res.ok) {
        this.setCache(cacheKey, null);
        return null;
      }
      const json = (await res.json()) as { meta?: { name?: string; year?: number; moviedb_id?: number } };
      if (!json?.meta) {
        this.setCache(cacheKey, null);
        return null;
      }

      const meta: CanonicalMetadata = {
        title: json.meta.name || '',
        year: json.meta.year,
        type,
        imdbId,
        tmdbId: json.meta.moviedb_id,
      };
      this.setCache(cacheKey, meta);
      return meta;
    } catch {
      this.setCache(cacheKey, null);
      return null;
    }
  }

  async resolveTmdb(type: 'movie' | 'series', tmdbNumericId: number): Promise<CanonicalMetadata | null> {
    const cacheKey = `tmdb:${type}:${tmdbNumericId}`;
    const cached = this.getCached(cacheKey);
    if (cached !== undefined) return cached;

    if (!this.tmdbApiKey) {
      this.setCache(cacheKey, null);
      return null;
    }

    try {
      const endpoint = type === 'movie' ? 'movie' : 'tv';
      const url = `https://api.themoviedb.org/3/${endpoint}/${tmdbNumericId}?api_key=${this.tmdbApiKey}&external_source=imdb_id`;
      const res = await fetch(url);
      if (!res.ok) {
        this.setCache(cacheKey, null);
        return null;
      }
      const d = (await res.json()) as { title?: string; name?: string; release_date?: string; first_air_date?: string; imdb_id?: string };
      const title = d.title || d.name || '';
      const dateStr = d.release_date || d.first_air_date || '';
      const year = dateStr ? parseInt(dateStr.slice(0, 4), 10) : undefined;

      const meta: CanonicalMetadata = {
        title,
        year,
        type,
        imdbId: d.imdb_id,
        tmdbId: tmdbNumericId,
      };
      this.setCache(cacheKey, meta);
      return meta;
    } catch {
      this.setCache(cacheKey, null);
      return null;
    }
  }

  async resolveMal(type: 'movie' | 'series', malNumericId: number): Promise<CanonicalMetadata | null> {
    const cacheKey = `mal:${type}:${malNumericId}`;
    const cached = this.getCached(cacheKey);
    if (cached !== undefined) return cached;

    const anime = await this.jikan.getAnime(malNumericId);
    if (!anime) {
      this.setCache(cacheKey, null);
      return null;
    }

    const meta: CanonicalMetadata = {
      title: anime.titleEnglish || anime.title,
      year: anime.year,
      type,
    };
    this.setCache(cacheKey, meta);
    return meta;
  }

  async resolveContent(type: 'movie' | 'series', parsed: { family: string; cleanId: string }): Promise<CanonicalMetadata | null> {
    if (parsed.family === 'tt') {
      return this.resolveImdb(type, parsed.cleanId);
    }
    if (parsed.family === 'tmdb') {
      const id = Number(parsed.cleanId.slice('tmdb:'.length));
      return this.resolveTmdb(type, id);
    }
    if (parsed.family === 'mal') {
      const id = Number(parsed.cleanId.slice('mal:'.length));
      return this.resolveMal(type, id);
    }
    return null;
  }

  getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      maxEntries: this.maxEntries,
    };
  }
}
