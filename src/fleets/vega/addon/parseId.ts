import type { StreamRequest } from "../types.js";
import { parseContentId } from "../../../core/contentId.js";

const MAX_SEASON = 1000;
const MAX_EPISODE = 10000;

export function parseStreamId(type: string, rawId: string): StreamRequest | null {
  if (type !== "movie" && type !== "series") return null;

  const id = rawId.endsWith(".json") ? rawId.slice(0, -".json".length) : rawId;
  const parsed = parseContentId(type, id);
  if (!parsed) return null;

  if (type === "series" && parsed.season === undefined) return null;
  if (parsed.season !== undefined && (parsed.season < 0 || parsed.season > MAX_SEASON)) {
    return null;
  }
  if (parsed.episode !== undefined && (parsed.episode < 1 || parsed.episode > MAX_EPISODE)) {
    return null;
  }

  if (parsed.family === "tmdb") {
    const tmdbId = Number(parsed.cleanId.slice("tmdb:".length));
    if (!Number.isSafeInteger(tmdbId) || tmdbId < 1) return null;
    return {
      type,
      tmdbId,
      ...(parsed.season !== undefined ? { season: parsed.season } : {}),
      ...(parsed.episode !== undefined ? { episode: parsed.episode } : {}),
    };
  }

  if (parsed.family === "tt") {
    return {
      type,
      imdbId: parsed.cleanId,
      ...(parsed.season !== undefined ? { season: parsed.season } : {}),
      ...(parsed.episode !== undefined ? { episode: parsed.episode } : {}),
    };
  }

  return null;
}

export function contentIdOf(request: StreamRequest): string {
  return "imdbId" in request ? request.imdbId : `tmdb:${request.tmdbId}`;
}

export function requestLogFields(request: StreamRequest): {
  contentId: string;
  imdbId: string | null;
} {
  return "imdbId" in request
    ? { contentId: request.imdbId, imdbId: request.imdbId }
    : { contentId: `tmdb:${request.tmdbId}`, imdbId: null };
}
