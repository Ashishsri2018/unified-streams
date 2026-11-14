import type {
  ProviderStream,
  StremioStream,
  StremioSubtitle,
  SubtitleTrack,
} from "../types.js";
import {
  isBlockerUrl,
  isArchiveUrl,
  isExternalUrl,
  normalizeStreamKey,
} from "./urlClassifier.js";
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

export interface MapStreamsOptions {
  providerValue: string;
  providerName: string;
  includeMagnets: boolean;
  perProviderLimit?: number;
}

const DEFAULT_PER_PROVIDER_LIMIT = 100;

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isMagnet(value: string): boolean {
  return /^magnet:\?/i.test(value);
}

function normalizeSubtitles(
  subtitles: SubtitleTrack[] | undefined,
  providerValue: string,
  streamIndex: number,
): StremioSubtitle[] {
  return normalizeSubtitlesTrackList(subtitles, `${providerValue}-${streamIndex}`) as StremioSubtitle[];
}

function collectTags(stream: ProviderStream): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  const push = (value: unknown): void => {
    const tag = trimString(value);
    if (!tag || seen.has(tag)) return;
    seen.add(tag);
    tags.push(tag);
  };

  if (Array.isArray(stream.tags)) {
    for (const tag of stream.tags) push(tag);
  }
  push(stream.tag);
  return tags;
}

export function mapProviderStreams(
  streams: ProviderStream[],
  options: MapStreamsOptions,
): StremioStream[] {
  const mapped: StremioStream[] = [];
  const seenUrls = new Set<string>();
  const providerName = trimString(options.providerName) || options.providerValue;
  const limit = Math.max(
    0,
    Math.floor(options.perProviderLimit ?? DEFAULT_PER_PROVIDER_LIMIT),
  );

  if (!Array.isArray(streams)) return mapped;

  streams.forEach((stream, streamIndex) => {
    if (!stream || typeof stream !== "object") return;

    const link = trimString(stream.link);
    if (!link) return;

    if (isBlockerUrl(link)) return;

    const type = trimString(stream.type).toLowerCase();
    if (type === "torrent" && !options.includeMagnets) return;

    const magnet = isMagnet(link);
    if (magnet) {
      if (!options.includeMagnets) return;
    } else {
      const url = parseHttpUrl(link);
      if (!url) return;
      if (isPlaceholderHost(url.hostname)) return;
      if (isBlockerUrl(link)) return;
    }

    const key = normalizeStreamKey(link);
    if (!key || seenUrls.has(key)) return;
    seenUrls.add(key);

    const server = trimString(stream.server);
    const quality = trimString(stream.quality);
    const tags = collectTags(stream);
    const titleParts = [server, quality, tags.join(", ")].filter(Boolean);
    const title = titleParts.length > 0 ? titleParts.join(" \u2022 ") : undefined;

    const isArchive = isArchiveUrl(link);
    const isExternal = isExternalUrl(link, {
      server: stream.server,
      tag: stream.tag,
      tags: stream.tags,
      title,
      quality: stream.quality,
    });

    let streamName = providerName;
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

    if (isExternal) {
      mapped.push({
        name: streamName,
        ...(streamTitle ? { title: streamTitle } : {}),
        externalUrl: link,
        behaviorHints: {
          bingeGroup: `${options.providerValue}-${quality || "auto"}`,
        },
      });
    } else {
      const subtitles = normalizeSubtitles(
        stream.subtitles,
        options.providerValue,
        streamIndex,
      );

      const requestHeaders = filterHeaders(stream.headers);
      const behaviorHints: NonNullable<StremioStream["behaviorHints"]> = {
        bingeGroup: `${options.providerValue}-${quality || "auto"}`,
      };
      if (Object.keys(requestHeaders).length > 0) {
        behaviorHints.proxyHeaders = { request: requestHeaders };
      }

      mapped.push({
        name: providerName,
        ...(title ? { title } : {}),
        url: link,
        behaviorHints,
        ...(subtitles.length > 0 ? { subtitles } : {}),
      });
    }
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
    if (isBlockerUrl(targetUrl)) return;
    const key = normalizeStreamKey(targetUrl);
    if (!key || seen.has(key)) return;
    seen.add(key);
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
