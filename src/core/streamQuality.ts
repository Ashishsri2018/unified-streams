/**
 * Stream Quality, Resolution, Container Format, and Size Utilities.
 * Unified canonical implementations used across Gateway and Scraper Fleets.
 */

export interface StreamQualityInput {
  quality?: string;
  name?: string;
  title?: string;
  description?: string;
  url?: string;
  externalUrl?: string;
  size?: number | string;
  behaviorHints?: {
    bingeGroup?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const RESOLUTION_RULES: ReadonlyArray<{ readonly regex: RegExp; readonly height: number }> = [
  { regex: /(?<![\p{L}\p{N}])(?:4320p?|8k)(?![\p{L}\p{N}])/iu, height: 4320 },
  { regex: /(?<![\p{L}\p{N}])(?:2160p?|4k|uhd)(?![\p{L}\p{N}])/iu, height: 2160 },
  { regex: /(?<![\p{L}\p{N}])(?:1440p?|2k|qhd)(?![\p{L}\p{N}])/iu, height: 1440 },
  { regex: /(?<![\p{L}\p{N}])(?:1080p?|fhd)(?![\p{L}\p{N}])/iu, height: 1080 },
  { regex: /(?<![\p{L}\p{N}])(?:720p?|hd)(?![\p{L}\p{N}])/iu, height: 720 },
  { regex: /(?<![\p{L}\p{N}])(?:576p?)(?![\p{L}\p{N}])/iu, height: 576 },
  { regex: /(?<![\p{L}\p{N}])(?:480p?|sd)(?![\p{L}\p{N}])/iu, height: 480 },
  { regex: /(?<![\p{L}\p{N}])(?:360p?)(?![\p{L}\p{N}])/iu, height: 360 },
  { regex: /(?<![\p{L}\p{N}])(?:240p?)(?![\p{L}\p{N}])/iu, height: 240 },
];

function extractTextCorpus(input: unknown): string {
  if (typeof input === 'string') return input;
  if (!input || typeof input !== 'object') return '';

  const s = input as StreamQualityInput;
  const parts: string[] = [];
  if (typeof s.quality === 'string') parts.push(s.quality);
  if (typeof s.name === 'string') parts.push(s.name);
  if (typeof s.title === 'string') parts.push(s.title);
  if (typeof s.description === 'string') parts.push(s.description);
  if (typeof s.behaviorHints?.bingeGroup === 'string') parts.push(s.behaviorHints.bingeGroup);
  if (typeof s.url === 'string') parts.push(s.url);
  if (typeof s.externalUrl === 'string') parts.push(s.externalUrl);
  return parts.join(' ');
}

export function inferResolution(input: unknown): number | null {
  const corpus = extractTextCorpus(input);
  if (!corpus) return null;

  for (const rule of RESOLUTION_RULES) {
    if (rule.regex.test(corpus)) {
      return rule.height;
    }
  }
  return null;
}

/** Convenience helper returning 0 if resolution cannot be determined (for sorting). */
export function inferQuality(input: unknown): number {
  return inferResolution(input) ?? 0;
}

const CAM_PATTERN = /(\bcam\b|hdcam|\bcamrip\b|\bts\b|telesync)/i;

/** Returns sort rank 0 (highest) to 5 (cam/telesync). */
export function inferQualityRank(input: unknown): number {
  const corpus = extractTextCorpus(input);
  if (CAM_PATTERN.test(corpus)) return 5;

  const res = inferResolution(input);
  if (res === null) return 4;
  if (res >= 2160) return 0;
  if (res >= 1080) return 1;
  if (res >= 720) return 2;
  return 3;
}

const DIRECT_CONTAINER_REGEX = /\.(?:mp4|mkv|m4v|webm|avi|mov|flv)(?:$|[?#])/i;
const PLAYLIST_CONTAINER_REGEX = /\.(?:m3u8|mpd)(?:$|[?#])/i;

/** Returns sort rank: 0 = mp4/mkv/etc., 1 = other direct, 2 = m3u8/mpd, 3 = unknown/none */
export function getContainerRank(url: string | undefined): number {
  if (!url || typeof url !== 'string') return 3;
  if (DIRECT_CONTAINER_REGEX.test(url)) return 0;
  if (PLAYLIST_CONTAINER_REGEX.test(url)) return 2;
  return 1;
}

const SIZE_MULTIPLIERS: Record<string, number> = {
  tb: 1024 ** 4, tib: 1024 ** 4,
  gb: 1024 ** 3, gib: 1024 ** 3,
  mb: 1024 ** 2, mib: 1024 ** 2,
  kb: 1024, kib: 1024,
  b: 1,
};

const SIZE_TOKEN_REGEX = /(\d+(?:[.,]\d+)?)\s*(tib|gib|mib|kib|tb|gb|mb|kb|b)\b(?![a-z0-9]|\s*\/\s*s)/gi;

export function parseSizeBytes(text: string): number | null {
  if (!text || typeof text !== 'string') return null;

  let best = 0;
  let matched = false;
  for (const match of text.matchAll(SIZE_TOKEN_REGEX)) {
    const rawNum = match[1]?.replace(',', '.');
    const val = Number.parseFloat(rawNum || '');
    const unit = match[2]?.toLowerCase() || '';
    if (Number.isFinite(val) && val > 0 && SIZE_MULTIPLIERS[unit]) {
      const bytes = val * SIZE_MULTIPLIERS[unit];
      if (bytes > best) best = bytes;
      matched = true;
    }
  }
  return matched ? Math.round(best) : null;
}

export function inferSizeBytes(input: unknown): number | null {
  if (!input || typeof input !== 'object') return null;

  const s = input as StreamQualityInput;
  if (typeof s.size === 'number' && Number.isFinite(s.size) && s.size > 0) {
    return Math.round(s.size);
  }
  if (typeof s.size === 'string') {
    const parsed = parseSizeBytes(s.size);
    if (parsed !== null) return parsed;
  }

  const text = `${s.title || ''} ${s.description || ''}`.trim();
  return parseSizeBytes(text);
}

/** Convenience helper returning 0 if size cannot be determined (for sorting). */
export function inferFileSizeBytes(input: unknown): number {
  return inferSizeBytes(input) ?? 0;
}
