import { LogEvent, LogLevel, ServiceName } from './logging/events.js';
import { LogQueue } from './logging/queue.js';
import { StdoutSink } from './logging/stdoutSink.js';

export interface LoggerOptions {
  service: ServiceName;
  minLevel: LogLevel;
  sampleRate: number;
  slowMs: number;
  queueMax: number;
  batchSize: number;
  flushMs: number;
}

const LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private options: LoggerOptions;
  private queue: LogQueue;

  constructor(options?: Partial<LoggerOptions>) {
    this.options = {
      service: options?.service || 'gateway',
      minLevel: options?.minLevel || 'info',
      sampleRate: options?.sampleRate ?? 1.0,
      slowMs: options?.slowMs ?? 2000,
      queueMax: options?.queueMax ?? 10000,
      batchSize: options?.batchSize ?? 200,
      flushMs: options?.flushMs ?? 5000,
    };

    const stdout = new StdoutSink();
    this.queue = new LogQueue([stdout], {
      maxSize: this.options.queueMax,
      batchSize: this.options.batchSize,
      flushIntervalMs: this.options.flushMs,
    });
  }

  private shouldLog(level: LogLevel, event: LogEvent): boolean {
    if (LEVEL_SEVERITY[level] < LEVEL_SEVERITY[this.options.minLevel]) {
      return false;
    }
    // Never sample errors, warnings, timeouts, or slow requests
    if (level === 'error' || level === 'warn') return true;
    if (event.outcome === 'timeout' || event.outcome === 'error') return true;
    if (event.durationMs !== undefined && event.durationMs >= this.options.slowMs) return true;
    if (event.event.includes('circuit') || event.event.includes('fail')) return true;

    // Apply sample rate to standard info events
    if (this.options.sampleRate < 1.0) {
      return Math.random() < this.options.sampleRate;
    }
    return true;
  }

  log(event: Omit<LogEvent, 'ts' | 'service'> & { service?: ServiceName }): void {
    const fullEvent: LogEvent = {
      ts: new Date().toISOString(),
      service: event.service || this.options.service,
      ...event,
    };

    if (this.shouldLog(fullEvent.level, fullEvent)) {
      this.queue.enqueue(fullEvent);
    }
  }

  debug(event: string, meta?: Record<string, unknown>): void {
    this.log({ level: 'debug', event: event as LogEvent['event'], meta });
  }

  info(event: string, meta?: Record<string, unknown>): void {
    this.log({ level: 'info', event: event as LogEvent['event'], meta });
  }

  warn(event: string, meta?: Record<string, unknown>): void {
    this.log({ level: 'warn', event: event as LogEvent['event'], meta });
  }

  error(event: string, err?: unknown, meta?: Record<string, unknown>): void {
    const errorDetails = err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : err ? { name: 'Error', message: String(err) } : undefined;

    this.log({
      level: 'error',
      event: event as LogEvent['event'],
      error: errorDetails,
      meta,
    });
  }

  getQueueMetrics() {
    return this.queue.getMetrics();
  }

  getQueueDepth(): number {
    return this.queue.getDepth();
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export const logger = new Logger();
