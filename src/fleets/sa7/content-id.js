'use strict';

const path = require('node:path');

let core = null;
try {
  const corePath = path.resolve(process.cwd(), 'dist/core/contentId.js');
  core = require(corePath);
} catch {
  core = null;
}

const CONTENT_PATTERNS = [
  { source: 'imdb', pattern: /^(tt\d+)(?::(\d+)(?::(\d+))?)?$/ },
  { source: 'tmdb', pattern: /^tmdb:(\d+)(?::(\d+)(?::(\d+))?)?$/ },
];

const TMDB_CONTENT_ID = /^tmdb:(\d+)$/;

function parseContentId(raw, type) {
  if (typeof raw !== 'string') return null;

  if (core && typeof core.parseContentId === 'function') {
    const mediaType = type === 'movie' ? 'movie' : 'series';
    const parsed = core.parseContentId(mediaType, raw);
    if (parsed) {
      const source = parsed.family === 'tmdb' ? 'tmdb' : 'imdb';
      const id = source === 'tmdb' ? Number(parsed.cleanId.slice('tmdb:'.length)) : parsed.cleanId;
      return {
        source,
        id,
        season: parsed.season != null ? parsed.season : null,
        episode: parsed.episode != null ? parsed.episode : null,
      };
    }
  }

  for (const { source, pattern } of CONTENT_PATTERNS) {
    const match = pattern.exec(raw);
    if (!match) continue;
    return {
      source,
      id: source === 'tmdb' ? Number(match[1]) : match[1],
      season: match[2] === undefined ? null : Number(match[2]),
      episode: match[3] === undefined ? null : Number(match[3]),
    };
  }

  return null;
}

function toContentId(parsed) {
  return parsed.source === 'tmdb' ? `tmdb:${parsed.id}` : parsed.id;
}

function tmdbIdOf(contentId) {
  const match = TMDB_CONTENT_ID.exec(String(contentId));
  return match ? Number(match[1]) : null;
}

module.exports = { parseContentId, toContentId, tmdbIdOf };
