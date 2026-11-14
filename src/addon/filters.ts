import { SubtitleTrack } from './subtitles.js';
import { inferResolution, inferSizeBytes } from '../core/streamQuality.js';

export { inferResolution, inferSizeBytes };

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

  // Inline subtitles belong to the stream object and are passed through as-is.
  return stream;
}
