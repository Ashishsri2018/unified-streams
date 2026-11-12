import { filterSubtitleTracks, SubtitleTrack } from './subtitles.js';

export interface StremioStream {
  url?: string;
  externalUrl?: string;
  infoHash?: string;
  fileIdx?: number;
  name?: string;
  title?: string;
  description?: string;
  behaviorHints?: {
    bingeGroup?: string;
    proxyHeaders?: Record<string, string>;
    notWebReady?: boolean;
    [key: string]: unknown;
  };
  subtitles?: SubtitleTrack[];
  size?: number;
  quality?: string;
  [key: string]: unknown;
}

export interface StreamFilterConfig {
  minRes: number | null;
  maxRes: number | null;
  includeUnknownRes: boolean;
  maxSizeGB: number | null;
  includeUnknownSize: boolean;
  subtitleMode: 'all' | 'none' | 'languages';
  subtitleLangs: string[];
  includeUnknownSubtitleLang: boolean;
}

const RESOLUTION_MAP: Array<{ regex: RegExp; height: number }> = [
  { regex: /\b(4320p|8k)\b/i, height: 4320 },
  { regex: /\b(2160p|4k|uhd)\b/i, height: 2160 },
  { regex: /\b(1440p|2k|qhd)\b/i, height: 1440 },
  { regex: /\b(1080p|fhd)\b/i, height: 1080 },
  { regex: /\b(720p|hd)\b/i, height: 720 },
  { regex: /\b(576p)\b/i, height: 576 },
  { regex: /\b(480p|sd)\b/i, height: 480 },
  { regex: /\b(360p)\b/i, height: 360 },
  { regex: /\b(240p)\b/i, height: 240 },
];

export function inferResolution(stream: StremioStream): number | null {
  const text = `${stream.quality || ''} ${stream.name || ''} ${stream.title || ''} ${stream.description || ''} ${stream.behaviorHints?.bingeGroup || ''} ${stream.url || ''}`;
  for (const item of RESOLUTION_MAP) {
    if (item.regex.test(text)) {
      return item.height;
    }
  }
  return null;
}

const SIZE_REGEX = /(\d+(?:\.\d+)?)\s*(tb|gb|mb|kb|b)\b/i;

export function inferSizeBytes(stream: StremioStream): number | null {
  if (typeof stream.size === 'number' && stream.size > 0) {
    return stream.size;
  }
  const text = `${stream.title || ''} ${stream.description || ''}`;
  const match = text.match(SIZE_REGEX);
  if (!match) return null;

  const val = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 'tb': return val * 1024 * 1024 * 1024 * 1024;
    case 'gb': return val * 1024 * 1024 * 1024;
    case 'mb': return val * 1024 * 1024;
    case 'kb': return val * 1024;
    default: return val;
  }
}

export function filterStream(stream: StremioStream, config: StreamFilterConfig): StremioStream | null {
  // 1. Resolution Filter
  const hasResFilter = config.minRes !== null || config.maxRes !== null;
  if (hasResFilter) {
    const res = inferResolution(stream);
    if (res === null) {
      if (!config.includeUnknownRes) return null;
    } else {
      if (config.minRes !== null && res < config.minRes) return null;
      if (config.maxRes !== null && res > config.maxRes) return null;
    }
  }

  // 2. File Size Filter
  if (config.maxSizeGB !== null) {
    const sizeBytes = inferSizeBytes(stream);
    if (sizeBytes === null) {
      if (!config.includeUnknownSize) return null;
    } else {
      const maxBytes = config.maxSizeGB * 1024 * 1024 * 1024;
      if (sizeBytes > maxBytes) return null;
    }
  }

  // 3. Subtitle Filter
  const filteredSubtitles = filterSubtitleTracks(
    stream.subtitles,
    config.subtitleMode,
    config.subtitleLangs,
    config.includeUnknownSubtitleLang,
  );

  return {
    ...stream,
    subtitles: filteredSubtitles,
  };
}
