import { StremioStream, StreamFilterConfig, filterStream, inferResolution } from './filters.js';
import { isBlockerUrl, isArchiveUrl, isExternalUrl, canonicalizeStreamKey } from './classifier.js';
import { normalizeDrm } from '../core/drm.js';
import { getContainerRank } from '../core/streamQuality.js';

export interface FleetStreamsInput {
  fleet: string;
  streams: StremioStream[];
}

// When the same stream URL is returned by more than one fleet, dedupe keeps the
// first survivor after sorting (best resolution/container first, then fleet
// priority: Nuvio > Vega > SA7).
const FLEET_PRIORITY: Record<string, number> = { nuvio: 0, vega: 1, sa7: 2 };

function fleetPriority(fleet: string): number {
  return FLEET_PRIORITY[fleet] ?? 3;
}

// Vidlink/Haylox MP4s on this host return HTTP 428 for browser-style UAs
// (`Mozilla/5.0 ...`) and 200/206 for non-browser UAs. The provider emits no
// headers, so fill in a non-browser UA at the gateway when none is present.
// Keep this host-scoped: many CDNs require a browser UA.
const UA_SENSITIVE_HOSTS = new Set(['bcdn.hakunaymatata.com']);
const NON_BROWSER_USER_AGENT = 'okhttp/4.12.0';

function hasUserAgentHeader(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((name) => name.toLowerCase() === 'user-agent');
}

function applyUaSensitiveHeaders(
  primaryUrl: string,
  behaviorHints: NonNullable<StremioStream['behaviorHints']>,
): NonNullable<StremioStream['behaviorHints']> {
  let host: string;
  try {
    host = new URL(primaryUrl).hostname.toLowerCase();
  } catch {
    return behaviorHints;
  }
  if (!UA_SENSITIVE_HOSTS.has(host)) return behaviorHints;

  const proxyHeaders = behaviorHints.proxyHeaders;
  const existing = proxyHeaders?.request;
  const request: Record<string, string> =
    existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
  if (hasUserAgentHeader(request)) return behaviorHints;

  return {
    ...behaviorHints,
    proxyHeaders: {
      ...(proxyHeaders ?? {}),
      request: { ...request, 'User-Agent': NON_BROWSER_USER_AGENT },
    },
    notWebReady: true,
  };
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

  // Keep the full DRM object on every stream type; clients decide whether it applies.
  const drm = normalizeDrm(stream.drm);

  let title = stream.title;
  if (isExternal) {
    if (!title || !title.startsWith('🖥️')) {
      const fallback = isArchive ? 'Archive' : 'External Link';
      title = title ? `🖥️ ${title}` : `🖥️ ${fallback}`;
    }
    const restHints = { ...behaviorHints };
    delete restHints.proxyHeaders;
    delete restHints.notWebReady;
    return {
      name,
      title,
      description: stream.description,
      externalUrl: primaryUrl,
      behaviorHints: restHints,
      ...(drm ? { drm } : {}),
    };
  }

  if (title && title.startsWith('🖥️ ')) {
    title = title.slice(3).trim();
  }

  const directHints = primaryUrl ? applyUaSensitiveHeaders(primaryUrl, behaviorHints) : behaviorHints;

  const cleanStream: StremioStream = {
    ...stream,
    name,
    title,
    url: primaryUrl,
    behaviorHints: directHints,
  };
  if (drm) cleanStream.drm = drm;
  else delete cleanStream.drm;
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
  // then fleet priority so duplicate URLs resolve to Nuvio before Vega/SA7.
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

    // If the same URL arrives with and without DRM metadata, keep the DRM-bearing copy.
    const aDrm = a.stream.drm ? 0 : 1;
    const bDrm = b.stream.drm ? 0 : 1;
    if (aDrm !== bDrm) return aDrm - bDrm;

    return fleetPriority(a.fleet) - fleetPriority(b.fleet);
  });

  // Deduplicate and apply filters
  const seenKeys = new Set<string>();
  const finalStreams: StremioStream[] = [];

  for (const { stream } of normalizedList) {
    const key = getStreamDedupeKey(stream);
    if (key && seenKeys.has(key)) continue;

    // Only mark the key as seen once the copy survives filtering. Otherwise a
    // filtered-out higher-ranked duplicate would suppress a valid lower-ranked
    // duplicate of the same URL.
    const filtered = filterStream(stream, filterConfig);
    if (filtered) {
      if (key) seenKeys.add(key);
      finalStreams.push(filtered);
      if (finalStreams.length >= maxStreams) break;
    }
  }

  return finalStreams;
}
