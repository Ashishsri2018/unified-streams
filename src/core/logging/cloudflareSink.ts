import { LogEvent } from './events.js';
import { LogSink } from './sink.js';
import { redactObject } from '../redact.js';

export interface CloudflareSinkOptions {
  endpoint: string;
  token?: string;
  timeoutMs?: number;
}

export class CloudflareSink implements LogSink {
  readonly name = 'cloudflare';
  private readonly endpoint: string;
  private readonly token?: string;
  private readonly timeoutMs: number;
  private circuitOpenUntil = 0;
  private consecutiveFailures = 0;

  constructor(options: CloudflareSinkOptions) {
    this.endpoint = options.endpoint.replace(/\/+$/, '');
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  async write(event: LogEvent): Promise<void> {
    await this.writeBatch([event]);
  }

  async writeBatch(events: LogEvent[]): Promise<void> {
    if (Date.now() < this.circuitOpenUntil) {
      return; // Circuit open, skip to protect application
    }

    const payload = events.map((e) => redactObject(e));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
      };
      if (this.token) {
        headers['authorization'] = `Bearer ${this.token}`;
      }

      const res = await fetch(`${this.endpoint}/v1/logs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ events: payload }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Cloudflare ingest HTTP ${res.status}`);
      }

      this.consecutiveFailures = 0;
    } catch {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= 3) {
        // Open circuit for 2 minutes
        this.circuitOpenUntil = Date.now() + 120000;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }
}
