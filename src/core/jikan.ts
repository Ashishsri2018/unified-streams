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
  private queue: Array<() => Promise<void>> = [];
  private lastRequestTimes: number[] = [];
  private isProcessing = false;

  constructor(baseUrl = 'https://api.jikan.moe/v4', maxRps = 3) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.maxRps = maxRps;
  }

  private async waitForSlot(): Promise<void> {
    const minIntervalMs = Math.ceil(1000 / this.maxRps);
    const now = Date.now();
    const last = this.lastRequestTimes[this.lastRequestTimes.length - 1] || 0;
    const elapsed = now - last;

    if (elapsed < minIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, minIntervalMs - elapsed));
    }

    this.lastRequestTimes.push(Date.now());
    if (this.lastRequestTimes.length > 60) {
      this.lastRequestTimes.shift();
    }
  }

  async getAnime(malNumericId: number, timeoutMs = 8000): Promise<JikanAnimeData | null> {
    await this.waitForSlot();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
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
    }
  }
}
