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

export const INTERNAL_HEADERS = {
  REQUEST_ID: 'x-request-id',
  INTERNAL_TOKEN: 'x-internal-token',
  DEADLINE_MS: 'x-deadline-ms',
} as const;
