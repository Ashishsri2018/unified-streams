import { StremioStream, StreamFilterConfig, filterStream, inferResolution } from './filters.js';
import { isBlockerUrl, isArchiveUrl, isExternalUrl, canonicalizeStreamKey } from './classifier.js';
import { getContainerRank } from '../core/streamQuality.js';

export interface FleetStreamsInput {
  fleet: string;
  streams: StremioStream[];
}

// When the same stream is returned by more than one fleet, keep the copy from
// the highest-priority fleet. Vega is primary, then Nuvio, then SA7.
const FLEET_PRIORITY: Record<string, number> = { vega: 0, nuvio: 1, sa7: 2 };

function fleetPriority(fleet: string): number {
  return FLEET_PRIORITY[fleet] ?? 3;
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
  const isExternal = Boolean(stream.externalUrl || (primaryUrl && isExternalUrl(primaryUrl)));

  let name = stream.name;
  if (isArchive) {
    if (!name || !name.startsWith('🔲')) {
      name = name ? `🔲 ${name}` : '🔲 Archive';
    }
  }

  let title = stream.title;
  if (isExternal) {
    if (!title || !title.startsWith('🖥️')) {
      const fallback = isArchive ? 'Archive' : 'External Link';
      title = title ? `🖥️ ${title}` : `🖥️ ${fallback}`;
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

export function mergeAndFilterStreams(
  fleetInputs: FleetStreamsInput[],
  filterConfig: StreamFilterConfig,
  maxStreams = 1000,
): StremioStream[] {
  const normalizedList: Array<{ stream: StremioStream; fleet: string }> = [];

  for (const input of fleetInputs) {
    for (const rawStream of input.streams) {
      const normalized = normalizeStreamItem(rawStream, input.fleet);
      if (normalized) {
        normalizedList.push({ stream: normalized, fleet: input.fleet });
      }
    }
  }

  // Sort: direct before external, then by resolution descending, then container,
  // then fleet priority so duplicate URLs resolve to Vega before Nuvio/SA7.
  normalizedList.sort((a, b) => {
    const aExt = a.stream.externalUrl ? 1 : 0;
    const bExt = b.stream.externalUrl ? 1 : 0;
    if (aExt !== bExt) return aExt - bExt;

    const aRes = inferResolution(a.stream) || 0;
    const bRes = inferResolution(b.stream) || 0;
    if (aRes !== bRes) return bRes - aRes;

    const aRank = getContainerRank(a.stream.url || a.stream.externalUrl);
    const bRank = getContainerRank(b.stream.url || b.stream.externalUrl);
    if (aRank !== bRank) return aRank - bRank;

    return fleetPriority(a.fleet) - fleetPriority(b.fleet);
  });

  // Deduplicate and apply filters
  const seenKeys = new Set<string>();
  const finalStreams: StremioStream[] = [];

  for (const { stream } of normalizedList) {
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
