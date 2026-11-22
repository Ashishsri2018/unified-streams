'use strict';

// Provider scrapers frequently label every returned link with the episode that
// was requested, even when the underlying link is a pack or another episode.
// This guard inspects the link's own filename/URL text and drops streams that
// explicitly point at a different season or episode. Streams with no episode
// markers are kept because they may be packs or ambiguous labels.

function normalize(value) {
  return String(value).replace(/[–—~]/g, '-');
}

function addRange(target, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return;
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  target.push([low, high]);
}

function addSeasonRange(target, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return;
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  for (let season = low; season <= high; season += 1) target.add(season);
}

function parseEpisodeMarkers(value) {
  const text = normalize(value);
  const seasons = new Set();
  const episodes = new Set();
  const ranges = [];

  // S01E05, S01 EP05, S01 E05-06
  for (const match of text.matchAll(
    /\bS(\d{1,2})[\s._-]*E(?:P|pisode)?\s*\.?\s*(\d{1,4})(?!\d)(?:\s*-\s*(?:E(?:P)?\s*\.?\s*)?(\d{1,4})(?!\d))?/gi,
  )) {
    seasons.add(Number(match[1]));
    if (match[3] === undefined) episodes.add(Number(match[2]));
    else addRange(ranges, Number(match[2]), Number(match[3]));
  }

  // Season 1 Episode 5, Season 1 - Episode 5-6
  for (const match of text.matchAll(
    /\bSeason[\s._-]*(\d{1,2})\b[^\d]{0,24}?\b(?:Episode|Ep|E)\s*\.?\s*(\d{1,4})(?!\d)(?:\s*-\s*(?:Episode|Ep|E)?\s*\.?\s*(\d{1,4})(?!\d))?/gi,
  )) {
    seasons.add(Number(match[1]));
    if (match[3] === undefined) episodes.add(Number(match[2]));
    else addRange(ranges, Number(match[2]), Number(match[3]));
  }

  // 1x05, 1x05-06
  for (const match of text.matchAll(
    /(?<![\p{L}\p{N}])(\d{1,2})\s*x\s*(\d{1,4})(?![\p{L}\p{N}])(?:\s*-\s*(?:E(?:P)?\s*\.?\s*)?(\d{1,4})(?![\p{L}\p{N}]))?/giu,
  )) {
    seasons.add(Number(match[1]));
    if (match[3] === undefined) episodes.add(Number(match[2]));
    else addRange(ranges, Number(match[2]), Number(match[3]));
  }

  // Episode 5 & 6, Episodes 1, 2 and 3
  for (const match of text.matchAll(
    /(?<![\p{L}\p{N}])(?:Episodes?|Eps?|Ep|E)\s*\.?\s*(\d{1,4})(?![\p{L}\p{N}])((?:\s*(?:,|&|\/|\band\b)\s*(?:and\b\s*)?(?:Episodes?|Eps?|Ep|E)?\s*\.?\s*\d{1,4}(?![\p{L}\p{N}]))+)/giu,
  )) {
    episodes.add(Number(match[1]));
    for (const extra of match[2].matchAll(/\d{1,4}/g)) {
      episodes.add(Number(extra[0]));
    }
  }

  // Episode 5, Ep 5, E05, Episode 5-6
  for (const match of text.matchAll(
    /(?<![\p{L}\p{N}])(?:Episodes?|Eps?|Ep|E)\s*\.?\s*(\d{1,4})(?![\p{L}\p{N}])(?:\s*-\s*(?:Episodes?|Eps?|Ep|E)?\s*\.?\s*(\d{1,4})(?![\p{L}\p{N}]))?/giu,
  )) {
    if (match[2] === undefined) episodes.add(Number(match[1]));
    else addRange(ranges, Number(match[1]), Number(match[2]));
  }

  return { seasons, episodes, ranges };
}

function decodePath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function streamTexts(stream) {
  const texts = [];
  for (const key of ['filename', 'fileName', 'file']) {
    const value = stream[key];
    if (typeof value === 'string' && value.trim()) texts.push(value);
  }

  const target = stream.url || stream.externalUrl;
  if (typeof target === 'string' && target.trim()) {
    try {
      texts.push(decodePath(new URL(target).pathname));
    } catch {
      texts.push(target.split(/[?#]/, 1)[0]);
    }
  }

  for (const key of ['name', 'title', 'description']) {
    const value = stream[key];
    if (typeof value === 'string' && value.trim()) texts.push(value);
  }

  return texts;
}

function streamMatchesEpisode(stream, season, episode) {
  if (!stream || !Number.isInteger(season) || !Number.isInteger(episode)) return true;

  for (const text of streamTexts(stream)) {
    const { seasons, episodes, ranges } = parseEpisodeMarkers(text);
    if (seasons.size === 0 && episodes.size === 0 && ranges.length === 0) continue;

    // Explicit season marker that excludes the request: wrong season.
    if (seasons.size > 0 && !seasons.has(season)) return false;

    // Season-only marker (e.g. "Season 1 Complete"): treat as a pack.
    if (episodes.size === 0 && ranges.length === 0) continue;

    if (episodes.has(episode)) continue;
    if (ranges.some(([low, high]) => episode >= low && episode <= high)) continue;
    return false;
  }

  return true;
}

module.exports = {
  parseEpisodeMarkers,
  streamMatchesEpisode,
};
