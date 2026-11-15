import { StremioStream } from '../addon/filters.js';
import { WorkerHealth } from './telemetry.js';

export interface InternalStreamResponse {
  streams: StremioStream[];
  outcome?: 'ok' | 'empty' | 'timeout' | 'error' | 'skipped';
  fleet?: string;
  durationMs?: number;
}

export interface InternalReloadResponse {
  ok: boolean;
  message?: string;
  reloadedAt: string;
}

export type InternalHealthResponse = WorkerHealth;

export interface ForwardedMetadata {
  title?: string;
  year?: number;
  tmdbId?: number;
  imdbId?: string;
}

export const INTERNAL_HEADERS = {
  REQUEST_ID: 'x-request-id',
  INTERNAL_TOKEN: 'x-internal-token',
  DEADLINE_MS: 'x-deadline-ms',
  META_TITLE: 'x-meta-title',
  META_YEAR: 'x-meta-year',
  META_TMDB_ID: 'x-meta-tmdb-id',
  META_IMDB_ID: 'x-meta-imdb-id',
} as const;
