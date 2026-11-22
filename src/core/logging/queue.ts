import { LogEvent } from './events.js';
import { LogSink } from './sink.js';

export interface LogQueueOptions {
  maxSize: number;
  batchSize: number;
  flushIntervalMs: number;
}

export interface LogQueueMetrics {
  enqueued: number;
  dropped: number;
  flushed: number;
  batchesSent: number;
  batchesFailed: number;
}

export class LogQueue {
  private queue: LogEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private isFlushing = false;
  private activeFlush: Promise<void> | null = null;
  private closed = false;
  private readonly options: LogQueueOptions;
  private readonly sinks: LogSink[];
  private readonly metrics: LogQueueMetrics = {
    enqueued: 0,
    dropped: 0,
    flushed: 0,
    batchesSent: 0,
    batchesFailed: 0,
  };

  constructor(sinks: LogSink[], options: LogQueueOptions) {
    this.sinks = sinks;
    this.options = options;
    this.startTimer();
  }

  private startTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      void this.flush();
    }, this.options.flushIntervalMs);
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  enqueue(event: LogEvent): void {
    if (this.closed) {
      this.metrics.dropped++;
      return;
    }
    this.metrics.enqueued++;
    if (this.queue.length >= this.options.maxSize) {
      this.queue.shift(); // Drop oldest
      this.metrics.dropped++;
    }
    this.queue.push(event);

    if (this.queue.length >= this.options.batchSize) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.isFlushing) {
      await this.activeFlush;
      return;
    }
    if (this.queue.length === 0) return;
    this.isFlushing = true;

    const task = (async () => {
      const batch = this.queue.splice(0, this.options.batchSize);
      try {
        for (const sink of this.sinks) {
          if (sink.writeBatch) {
            await sink.writeBatch(batch);
          } else {
            for (const item of batch) {
              await sink.write(item);
            }
          }
        }
        this.metrics.flushed += batch.length;
        this.metrics.batchesSent++;
      } catch {
        this.metrics.batchesFailed++;
      }
    })();
    this.activeFlush = task;

    try {
      await task;
    } finally {
      this.isFlushing = false;
      this.activeFlush = null;
      if (this.queue.length >= this.options.batchSize) {
        void this.flush();
      }
    }
  }

  getMetrics(): Readonly<LogQueueMetrics> {
    return { ...this.metrics };
  }

  getDepth(): number {
    return this.queue.length;
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.activeFlush) {
      await this.activeFlush;
    }
    while (this.queue.length > 0) {
      await this.flush();
    }
    for (const sink of this.sinks) {
      if (sink.close) {
        await sink.close();
      }
    }
  }
}
