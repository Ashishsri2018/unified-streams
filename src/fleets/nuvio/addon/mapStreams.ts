import type { NuvioRawStream, StremioStream, StremioSubtitle } from "../types.js";
import { isBlockerUrl, isArchiveUrl, isExternalUrl } from "./urlClassifier.js";
import {
  inferQuality,
  inferFileSizeBytes,
  getContainerRank as formatRank,
} from "../../../core/streamQuality.js";
import {
  sanitizeProxyHeaders as filterHeaders,
  isPlaceholderHost,
  parseHttpUrl,
} from "../../../core/streamHeaders.js";
import { normalizeSubtitlesTrackList } from "../../../core/subtitles.js";

export { inferQuality, inferFileSizeBytes };

export const MAX_STREAMS = 1000;
const DEFAULT_PER_PROVIDER_LIMIT = 100;

export interface MapScraperOptions {
  scraperId: string;
  scraperName: string;
  proxyEnabled: boolean;
  perProviderLimit?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSubtitles(
  raw: unknown,
  scraperId: string,
  streamIndex: number,
): StremioSubtitle[] {
  return normalizeSubtitlesTrackList(raw, `${scraperId}-${streamIndex}`) as StremioSubtitle[];
}

function buildTitle(rawTitle: string, quality: string): string | undefined {
  if (!rawTitle) return quality || undefined;
  if (!quality) return rawTitle;
  const token = quality.split("\u2022")[0]?.trim() ?? "";
  if (token && rawTitle.toLowerCase().includes(token.toLowerCase())) return rawTitle;
  return `${rawTitle} \u2022 ${quality}`;
}

export function normalizeStreamKey(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const origin = parsed.origin.toLowerCase();
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    return `${origin}${pathname}${parsed.search}`;
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

export function mapScraperStreams(
  rawStreams: unknown[],
  options: MapScraperOptions,
): StremioStream[] {
  const mapped: StremioStream[] = [];
  const seenUrls = new Set<string>();
  const scraperName = options.scraperName.trim() || options.scraperId;
  const limit = Math.max(
    0,
    Math.floor(options.perProviderLimit ?? DEFAULT_PER_PROVIDER_LIMIT),
  );

  rawStreams.forEach((raw, streamIndex) => {
    if (!isRecord(raw)) return;
    const stream = raw as NuvioRawStream;

    const rawUrl = trimString(stream.url) || trimString(stream.externalUrl);
    if (!rawUrl) return;
    const parsed = parseHttpUrl(rawUrl);
    if (!parsed || isPlaceholderHost(parsed.hostname)) return;
    if (isBlockerUrl(rawUrl)) return;

    const streamKey = normalizeStreamKey(rawUrl);
    if (seenUrls.has(streamKey)) return;
    seenUrls.add(streamKey);

    const quality = trimString(stream.quality);
    const title = buildTitle(trimString(stream.title) || trimString(stream.name), quality);
    const subtitles = normalizeSubtitles(stream.subtitles, options.scraperId, streamIndex);
    const requestHeaders = filterHeaders(stream.headers);

    const isArchive = isArchiveUrl(rawUrl);
    const isExternal = isExternalUrl(rawUrl, stream);

    let streamName = scraperName;
    if (isArchive && !streamName.startsWith("🔲")) {
      streamName = `🔲 ${streamName}`;
    }

    let streamTitle = title;
    if (isExternal) {
      const fallback = isArchive ? "Archive" : "External Link";
      if (!streamTitle) {
        streamTitle = `🖥️ ${fallback}`;
      } else if (!streamTitle.startsWith("🖥️")) {
        streamTitle = `🖥️ ${streamTitle}`;
      }
    }

    const behaviorHints: NonNullable<StremioStream["behaviorHints"]> = {
      bingeGroup: `${options.scraperId}-${quality || "auto"}`,
    };
    if (!isExternal && options.proxyEnabled && Object.keys(requestHeaders).length > 0) {
      behaviorHints.proxyHeaders = { request: requestHeaders };
    }

    mapped.push({
      name: streamName,
      ...(streamTitle ? { title: streamTitle } : {}),
      ...(isExternal ? { externalUrl: rawUrl } : { url: rawUrl }),
      behaviorHints,
      ...(!isExternal && subtitles.length > 0 ? { subtitles } : {}),
    });
  });

  return sortStreams(mapped).slice(0, limit);
}

export function sortStreams(streams: StremioStream[]): StremioStream[] {
  if (!Array.isArray(streams)) return [];
  const seen = new Set<string>();
  const unique: Array<{ stream: StremioStream; index: number }> = [];

  streams.forEach((stream, index) => {
    if (!stream) return;
    const targetUrl = stream.url || stream.externalUrl;
    if (typeof targetUrl !== "string" || !targetUrl) return;
    const streamKey = normalizeStreamKey(targetUrl);
    if (seen.has(streamKey)) return;
    seen.add(streamKey);
    unique.push({ stream, index });
  });

  unique.sort((a, b) => {
    const aIsExt = a.stream.externalUrl ? 1 : 0;
    const bIsExt = b.stream.externalUrl ? 1 : 0;
    if (aIsExt !== bIsExt) return aIsExt - bIsExt;

    const qualityDiff = inferQuality(b.stream) - inferQuality(a.stream);
    if (qualityDiff !== 0) return qualityDiff;
    const formatDiff = formatRank(a.stream.url) - formatRank(b.stream.url);
    if (formatDiff !== 0) return formatDiff;
    return a.index - b.index;
  });

  return unique.map((entry) => entry.stream);
}
