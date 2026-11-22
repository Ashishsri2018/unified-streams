/**
 * Jikan v4 anime metadata client with rate limiting (max 3 req/sec, max 60 req/min).
 */

export interface JikanAnimeData {
  malId: number;
  title: string;
  titleEnglish?: string;
  type: string;
  episodes?: number;
  year?: number;
}

export class JikanClient {
  private readonly baseUrl: string;
  private readonly maxRps: number;
  private readonly maxRpm: number;
  private requestTimes: number[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(baseUrl = 'https://api.jikan.moe/v4', maxRps = 3, maxRpm = 60) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.maxRps = Math.max(1, maxRps);
    this.maxRpm = Math.max(1, maxRpm);
  }

  private async waitForSlot(signal?: AbortSignal): Promise<void> {
    const acquire = this.queue.then(() => this.reserveSlot(signal));
    this.queue = acquire.then(
      () => undefined,
      () => undefined,
    );
    await acquire;
  }

  private async reserveSlot(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw signal.reason ?? new Error('aborted');
    const minIntervalMs = Math.ceil(1000 / this.maxRps);
    let now = Date.now();
    let waitMs = 0;

    const last = this.requestTimes[this.requestTimes.length - 1];
    if (last !== undefined) waitMs = Math.max(waitMs, minIntervalMs - (now - last));

    this.prune(now);
    if (this.requestTimes.length >= this.maxRpm) {
      waitMs = Math.max(waitMs, (this.requestTimes[0] ?? now) + 60_000 - now);
    }
    if (waitMs > 0) {
      await new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          reject(signal.reason ?? new Error('aborted'));
          return;
        }
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, waitMs);
        const onAbort = (): void => {
          clearTimeout(timer);
          reject(signal?.reason ?? new Error('aborted'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
      });
      if (signal?.aborted) throw signal.reason ?? new Error('aborted');
      now = Date.now();
    }

    this.prune(now);
    this.requestTimes.push(now);
  }

  private prune(now: number): void {
    const cutoff = now - 60_000;
    let expired = 0;
    while (expired < this.requestTimes.length && (this.requestTimes[expired] ?? 0) <= cutoff) {
      expired += 1;
    }
    if (expired > 0) this.requestTimes = this.requestTimes.slice(expired);
  }

  async getAnime(malNumericId: number, timeoutMs = 8000, signal?: AbortSignal): Promise<JikanAnimeData | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', onAbort, { once: true });

    try {
      await this.waitForSlot(controller.signal);
      if (controller.signal.aborted) return null;

      const res = await fetch(`${this.baseUrl}/anime/${malNumericId}`, {
        signal: controller.signal,
        headers: { 'accept': 'application/json' },
      });

      if (res.status === 429 || res.status === 404 || !res.ok) {
        return null;
      }

      const json = (await res.json()) as { data?: Record<string, unknown> };
      if (!json?.data) return null;

      const d = json.data;
      return {
        malId: malNumericId,
        title: typeof d.title === 'string' ? d.title : '',
        titleEnglish: typeof d.title_english === 'string' ? d.title_english : undefined,
        type: typeof d.type === 'string' ? d.type.toLowerCase() : 'tv',
        episodes: typeof d.episodes === 'number' ? d.episodes : undefined,
        year: typeof d.year === 'number' ? d.year : undefined,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}
