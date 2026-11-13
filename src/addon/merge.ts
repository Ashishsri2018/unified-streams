import { StremioStream, StreamFilterConfig, filterStream, inferResolution } from './filters.js';
import { isBlockerUrl, isArchiveUrl, isExternalUrl, canonicalizeStreamKey } from './classifier.js';

export interface FleetStreamsInput {
  fleet: string;
  streams: StremioStream[];
}

function normalizeStreamItem(stream: StremioStream, fleet: string): StremioStream | null {
  const primaryUrl = stream.url || stream.externalUrl;
  if (!primaryUrl && !stream.infoHash) return null;

  if (primaryUrl && isBlockerUrl(primaryUrl)) {
    return null; // Drop known blocker links
  }

  // Prefix bingeGroup
  const prevGroup = stream.behaviorHints?.bingeGroup;
  const bingeGroup = prevGroup ? `${fleet}:${prevGroup}` : `${fleet}:auto`;
  const behaviorHints = {
    ...stream.behaviorHints,
    bingeGroup,
  };

  const isArchive = Boolean(primaryUrl && isArchiveUrl(primaryUrl));
  const isExternal = Boolean(!isArchive && primaryUrl && isExternalUrl(primaryUrl));

  let name = stream.name;
  if (isArchive) {
    if (!name || !name.startsWith('🔲')) {
      name = name ? `🔲 ${name}` : '🔲 Archive';
    }
  }

  let title = stream.title;
  if (isExternal) {
    if (!title || !title.startsWith('🖥️')) {
      title = title ? `🖥️ ${title}` : '🖥️ External Link';
    }
    const restHints = { ...behaviorHints };
    delete restHints.proxyHeaders;
    return {
      name,
      title,
      description: stream.description,
      externalUrl: primaryUrl,
      behaviorHints: restHints,
    };
  }

  if (title && title.startsWith('🖥️ ')) {
    title = title.slice(3).trim();
  }

  const cleanStream: StremioStream = {
    ...stream,
    name,
    title,
    url: primaryUrl,
    behaviorHints,
  };
  delete cleanStream.externalUrl;
  return cleanStream;
}

function getStreamDedupeKey(stream: StremioStream): string {
  const url = stream.url || stream.externalUrl;
  if (url) return canonicalizeStreamKey(url);
  if (stream.infoHash) {
    return `infohash:${stream.infoHash.toLowerCase()}:${stream.fileIdx ?? 0}`;
  }
  return '';
}

function getContainerRank(url: string | undefined): number {
  if (!url) return 3;
  const lower = url.toLowerCase();
  if (/\.(mp4|mkv)($|\?)/.test(lower)) return 0;
  if (/\.(webm|mov|m4v)($|\?)/.test(lower)) return 1;
  if (/\.(m3u8|mpd)($|\?)/.test(lower)) return 2;
  return 3;
}

export function mergeAndFilterStreams(
  fleetInputs: FleetStreamsInput[],
  filterConfig: StreamFilterConfig,
  maxStreams = 1000,
): StremioStream[] {
  const normalizedList: StremioStream[] = [];

  for (const input of fleetInputs) {
    for (const rawStream of input.streams) {
      const normalized = normalizeStreamItem(rawStream, input.fleet);
      if (normalized) {
        normalizedList.push(normalized);
      }
    }
  }

  // Sort: direct before external, then by resolution descending, then container
  normalizedList.sort((a, b) => {
    const aExt = a.externalUrl ? 1 : 0;
    const bExt = b.externalUrl ? 1 : 0;
    if (aExt !== bExt) return aExt - bExt;

    const aRes = inferResolution(a) || 0;
    const bRes = inferResolution(b) || 0;
    if (aRes !== bRes) return bRes - aRes;

    const aRank = getContainerRank(a.url || a.externalUrl);
    const bRank = getContainerRank(b.url || b.externalUrl);
    return aRank - bRank;
  });

  // Deduplicate and apply filters
  const seenKeys = new Set<string>();
  const finalStreams: StremioStream[] = [];

  for (const stream of normalizedList) {
    const key = getStreamDedupeKey(stream);
    if (key && seenKeys.has(key)) continue;
    if (key) seenKeys.add(key);

    const filtered = filterStream(stream, filterConfig);
    if (filtered) {
      finalStreams.push(filtered);
      if (finalStreams.length >= maxStreams) break;
    }
  }

  return finalStreams;
}
