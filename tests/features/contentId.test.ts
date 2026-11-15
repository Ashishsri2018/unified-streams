import { describe, it, expect } from 'vitest';
import { parseContentId } from '../../src/core/contentId.js';

describe('contentId parser', () => {
  it('parses valid IMDb movie and series IDs', () => {
    const movie = parseContentId('movie', 'tt0111161');
    expect(movie).toEqual({ family: 'tt', rawId: 'tt0111161', cleanId: 'tt0111161' });

    const seriesPack = parseContentId('series', 'tt0944947:1');
    expect(seriesPack).toEqual({
      family: 'tt',
      rawId: 'tt0944947:1',
      cleanId: 'tt0944947',
      season: 1,
      isSeasonPack: true,
    });

    const seriesEp = parseContentId('series', 'tt0944947:1:1');
    expect(seriesEp).toEqual({
      family: 'tt',
      rawId: 'tt0944947:1:1',
      cleanId: 'tt0944947',
      season: 1,
      episode: 1,
    });

    const specialEp = parseContentId('series', 'tt0944947:0:1');
    expect(specialEp?.season).toBe(0);
  });

  it('rejects invalid IMDb combinations', () => {
    expect(parseContentId('movie', 'tt0111161:1')).toBeNull(); // movie with season
    expect(parseContentId('series', 'tt0944947')).toBeNull(); // series without season
    expect(parseContentId('movie', 'tt12')).toBeNull(); // too short
    expect(parseContentId('movie', 'tt0111161/../')).toBeNull(); // forbidden path traversal
  });

  it('parses TMDB IDs', () => {
    const movie = parseContentId('movie', 'tmdb:550');
    expect(movie).toEqual({ family: 'tmdb', rawId: 'tmdb:550', cleanId: 'tmdb:550' });

    const seriesEp = parseContentId('series', 'tmdb:1399:1:2');
    expect(seriesEp).toEqual({
      family: 'tmdb',
      rawId: 'tmdb:1399:1:2',
      cleanId: 'tmdb:1399',
      season: 1,
      episode: 2,
    });
  });

  it('parses MAL IDs according to spec', () => {
    const animeMovie = parseContentId('movie', 'mal:20');
    expect(animeMovie).toEqual({ family: 'mal', rawId: 'mal:20', cleanId: 'mal:20' });

    // MAL single suffix is episode (uses season 1)
    const animeEp = parseContentId('series', 'mal:20:5');
    expect(animeEp).toEqual({
      family: 'mal',
      rawId: 'mal:20:5',
      cleanId: 'mal:20',
      season: 1,
      episode: 5,
    });

    // MAL two suffixes is season + episode
    const animeSeasonEp = parseContentId('series', 'mal:20:2:5');
    expect(animeSeasonEp).toEqual({
      family: 'mal',
      rawId: 'mal:20:2:5',
      cleanId: 'mal:20',
      season: 2,
      episode: 5,
    });

    // Series without episode must return null
    expect(parseContentId('series', 'mal:20')).toBeNull();
  });

  it('handles URL-encoded IDs', () => {
    const encoded = parseContentId('series', 'tt0944947%3A1%3A2');
    expect(encoded).toEqual({
      family: 'tt',
      rawId: 'tt0944947:1:2',
      cleanId: 'tt0944947',
      season: 1,
      episode: 2,
    });
  });
});
