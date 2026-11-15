/**
 * Canonical Event Vocabulary and Schema for Unified Streams logging.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type ServiceName = 'gateway' | 'sa7' | 'nuvio' | 'vega';
export type FleetName = 'sa7' | 'nuvio' | 'vega';
export type ProviderOutcome = 'ok' | 'empty' | 'timeout' | 'error' | 'skipped';

export type EventFamily =
  // Request events
  | 'stream.request.started'
  | 'stream.request.completed'
  | 'stream.request.failed'
  | 'stream.request.slow'
  | 'health.request.completed'
  | 'configure.request.completed'
  | 'manifest.request.completed'
  // Backend events
  | 'backend.request.started'
  | 'backend.request.completed'
  | 'backend.request.timeout'
  | 'backend.request.error'
  | 'backend.request.aborted'
  // Provider events
  | 'provider.started'
  | 'provider.completed'
  | 'provider.empty'
  | 'provider.timeout'
  | 'provider.error'
  | 'provider.skipped'
  | 'provider.circuit.open'
  | 'provider.circuit.closed'
  // Metadata events
  | 'metadata.cache.hit'
  | 'metadata.cache.miss'
  | 'metadata.resolve.completed'
  | 'metadata.resolve.failed'
  | 'jikan.rate_limited'
  // Cache events
  | 'cache.hit'
  | 'cache.miss'
  | 'cache.coalesced'
  | 'cache.set'
  | 'cache.expired'
  | 'cache.evicted'
  // Updater events
  | 'updater.started'
  | 'updater.head.resolved'
  | 'updater.download.completed'
  | 'updater.retry'
  | 'updater.failed'
  | 'updater.installed'
  | 'updater.reload.completed'
  | 'updater.scheduled'
  // Log sink events
  | 'log.batch.sent'
  | 'log.batch.failed'
  | 'log.queue.dropped'
  | 'log.sink.disabled';

export interface LogEvent {
  ts: string;
  level: LogLevel;
  service: ServiceName;
  fleet?: FleetName;
  event: EventFamily;
  requestId?: string;
  route?: string;
  type?: 'movie' | 'series';
  contentId?: string;
  provider?: string;
  outcome?: ProviderOutcome;
  durationMs?: number;
  streams?: number;
  meta?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}
