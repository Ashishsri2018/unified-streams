import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import {
  extractSeasons,
  isSeasonPack,
  matchesEpisode,
  parseEpisodeRanges,
} from '../../src/fleets/vega/pipeline/episodes.js';

const require = createRequire(import.meta.url);
const { streamMatchesEpisode, parseEpisodeMarkers } = require(
  '../../src/fleets/sa7/lib/episode-match.js',
);

describe('Vega episode matching', () => {
  it('keeps the season when the provider separates it with a bullet', () => {
    expect(parseEpisodeRanges('Season 1 • EP 1–10')).toEqual([
      { season: 1, from: 1, to: 10 },
    ]);
    expect(matchesEpisode('Season 1 • EP 1–10', 1, 5)).toBe(true);
    expect(matchesEpisode('Season 1 • EP 1–10', 2, 5)).toBe(false);
  });

  it('parses spaced season/episode markers', () => {
    expect(parseEpisodeRanges('S01 EP05')).toEqual([{ season: 1, from: 5, to: 5 }]);
    expect(matchesEpisode('S01 EP05', 1, 5)).toBe(true);
    expect(matchesEpisode('Season 1 E5', 1, 5)).toBe(true);
  });

  it('matches episode lists', () => {
    expect(matchesEpisode('Episode 5 & 6', 1, 6)).toBe(true);
    expect(matchesEpisode('Episode 5 & 6', 1, 7)).toBe(false);
    expect(matchesEpisode('Episodes 1, 2 and 3', 1, 3)).toBe(true);
    expect(matchesEpisode('Episodes 1, 2 and 3', 1, 4)).toBe(false);
  });

  it('expands season ranges', () => {
    expect([...extractSeasons('Show Season 1-3')]).toEqual([1, 2, 3]);
    expect([...extractSeasons('Show S01-S02')]).toEqual([1, 2]);
    expect(isSeasonPack('Season 2 • EP 1–10', 2)).toBe(true);
  });

  it('supports episodes above 999 (long-running anime)', () => {
    expect(parseEpisodeRanges('Episode 1100')).toEqual([{ from: 1100, to: 1100 }]);
    expect(parseEpisodeRanges('S21E1100')).toEqual([{ season: 21, from: 1100, to: 1100 }]);
    expect(parseEpisodeRanges('Episode 1000-1100')).toEqual([{ from: 1000, to: 1100 }]);
    expect(matchesEpisode('One Piece Episode 1100', 21, 1100)).toBe(true);
    expect(matchesEpisode('One Piece S21E1100', 21, 1100)).toBe(true);
    expect(matchesEpisode('One Piece Episode 1000-1100', 21, 1099)).toBe(true);
  });
});

describe('SA7 episode post-filter', () => {
  it('drops streams whose own filename points at another episode', () => {
    expect(streamMatchesEpisode({ filename: 'Show.S01E02.1080p.mkv' }, 1, 5)).toBe(false);
    expect(streamMatchesEpisode({ filename: 'Show.S01E05.1080p.mkv' }, 1, 5)).toBe(true);
  });

  it('drops streams for another season', () => {
    expect(streamMatchesEpisode({ filename: 'Show.S02E05.1080p.mkv' }, 1, 5)).toBe(false);
    expect(
      streamMatchesEpisode({ filename: 'Show.Season.2.Episode.5.mkv' }, 1, 5),
    ).toBe(false);
  });

  it('prefers the filename over a provider-generated episode label', () => {
    expect(
      streamMatchesEpisode({ filename: 'Show.S01E02.mkv', title: 'Show S01E05' }, 1, 5),
    ).toBe(false);
  });

  it('checks URL paths and episode ranges', () => {
    expect(streamMatchesEpisode({ url: 'https://cdn/x/Show.S01E02.mkv' }, 1, 5)).toBe(false);
    expect(streamMatchesEpisode({ url: 'https://cdn/x/Show.S01E05.mkv' }, 1, 5)).toBe(true);
    expect(streamMatchesEpisode({ filename: 'Show.S01E01-E05.mkv' }, 1, 5)).toBe(true);
    expect(streamMatchesEpisode({ filename: 'Show.S01E01-E05.mkv' }, 1, 6)).toBe(false);
  });

  it('keeps packs and unlabelled streams', () => {
    expect(streamMatchesEpisode({ filename: 'Show.S01.Complete.1080p' }, 1, 5)).toBe(true);
    expect(streamMatchesEpisode({ title: '1080p WEB-DL' }, 1, 5)).toBe(true);
    expect(streamMatchesEpisode({}, 1, 5)).toBe(true);
  });

  it('parses marker sets directly', () => {
    const markers = parseEpisodeMarkers('Show.S01E05-E06.1080p');
    expect([...markers.seasons]).toEqual([1]);
    expect(markers.ranges).toEqual([[5, 6]]);
  });

  it('supports episodes above 999 (long-running anime)', () => {
    expect(
      streamMatchesEpisode({ filename: 'One.Piece.S21E1100.1080p.mkv' }, 21, 1100),
    ).toBe(true);
    expect(streamMatchesEpisode({ filename: 'One.Piece.E1100.mkv' }, 21, 1100)).toBe(true);
    expect(streamMatchesEpisode({ title: 'One Piece Episode 1100' }, 21, 1100)).toBe(true);
    expect(streamMatchesEpisode({ filename: 'One.Piece.S21E1099.mkv' }, 21, 1100)).toBe(
      false,
    );
  });
});
