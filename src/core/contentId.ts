/**
 * Content ID parser for Stremio stream requests.
 * Supports IMDb (`tt`), TMDB (`tmdb:`), and MyAnimeList (`mal:`).
 */

export type ContentIdFamily = 'tt' | 'tmdb' | 'mal';

export interface ParsedContentId {
  family: ContentIdFamily;
  rawId: string;
  cleanId: string;
  season?: number;
  episode?: number;
  isSeasonPack?: boolean;
}

const FORBIDDEN_CHARS = /[/?#]|\.\./;
const TT_PATTERN = /^tt(\d{7,12})$/;
const TMDB_PATTERN = /^tmdb:(\d{1,10})$/;
const MAL_PATTERN = /^mal:(\d{1,10})$/;

function parseNumericPart(part: string | undefined): number | undefined {
  if (part === undefined) return undefined;
  if (!/^\d{1,4}$/.test(part)) return undefined;
  const num = parseInt(part, 10);
  return num >= 0 && num <= 9999 ? num : undefined;
}

export function parseContentId(
  type: 'movie' | 'series',
  rawIdInput: string,
): ParsedContentId | null {
  if (!rawIdInput || rawIdInput.length > 256) return null;

  let decoded = rawIdInput;
  try {
    decoded = decodeURIComponent(rawIdInput);
  } catch {
    return null;
  }

  if (decoded.length > 256 || FORBIDDEN_CHARS.test(decoded)) {
    return null;
  }

  const parts = decoded.split(':');
  const isMal = parts[0] === 'mal';
  const isTmdb = parts[0] === 'tmdb';

  if (isMal) {
    return parseMalId(type, decoded, parts);
  } else if (isTmdb) {
    return parseTmdbId(type, decoded, parts);
  } else {
    return parseImdbId(type, decoded, parts);
  }
}

function parseMalId(
  type: 'movie' | 'series',
  raw: string,
  parts: string[],
): ParsedContentId | null {
  // MAL format: mal:id, mal:id:ep, or mal:id:season:ep
  if (parts.length < 2 || parts.length > 4) return null;
  const baseId = `mal:${parts[1]}`;
  if (!MAL_PATTERN.test(baseId)) return null;

  if (type === 'movie') {
    if (parts.length > 2) return null; // Movie must not have episode
    return { family: 'mal', rawId: raw, cleanId: baseId };
  }

  // Series
  if (parts.length === 2) {
    // MAL series request without episode is invalid per spec
    return null;
  }

  if (parts.length === 3) {
    // mal:id:episode -> season 1, episode N
    const ep = parseNumericPart(parts[2]);
    if (ep === undefined) return null;
    return { family: 'mal', rawId: raw, cleanId: baseId, season: 1, episode: ep };
  }

  // parts.length === 4: mal:id:season:episode
  const s = parseNumericPart(parts[2]);
  const ep = parseNumericPart(parts[3]);
  if (s === undefined || ep === undefined) return null;
  return { family: 'mal', rawId: raw, cleanId: baseId, season: s, episode: ep };
}

function parseTmdbId(
  type: 'movie' | 'series',
  raw: string,
  parts: string[],
): ParsedContentId | null {
  if (parts.length < 2 || parts.length > 4) return null;
  const baseId = `tmdb:${parts[1]}`;
  if (!TMDB_PATTERN.test(baseId)) return null;

  return parseStandardSuffixes(type, raw, baseId, 'tmdb', parts.slice(2));
}

function parseImdbId(
  type: 'movie' | 'series',
  raw: string,
  parts: string[],
): ParsedContentId | null {
  const baseId = parts[0];
  if (!TT_PATTERN.test(baseId)) return null;

  return parseStandardSuffixes(type, raw, baseId, 'tt', parts.slice(1));
}

function parseStandardSuffixes(
  type: 'movie' | 'series',
  raw: string,
  cleanId: string,
  family: 'tt' | 'tmdb',
  suffixes: string[],
): ParsedContentId | null {
  if (type === 'movie') {
    if (suffixes.length > 0) return null; // No season/episode allowed for movies
    return { family, rawId: raw, cleanId };
  }

  // Series
  if (suffixes.length === 0) {
    return null; // Series requires at least season
  }

  const season = parseNumericPart(suffixes[0]);
  if (season === undefined) return null;

  if (suffixes.length === 1) {
    // Valid season-pack request
    return { family, rawId: raw, cleanId, season, isSeasonPack: true };
  }

  if (suffixes.length === 2) {
    const episode = parseNumericPart(suffixes[1]);
    if (episode === undefined) return null;
    return { family, rawId: raw, cleanId, season, episode };
  }

  return null;
}
