import { describe, it, expect } from 'vitest';
import { parseStreamId as parseNuvioId, contentIdOf as nuvioContentIdOf } from '../../src/fleets/nuvio/addon/parseId.js';
import { parseStreamId as parseVegaId, contentIdOf as vegaContentIdOf } from '../../src/fleets/vega/addon/parseId.js';

describe.each([
  ['nuvio', parseNuvioId, nuvioContentIdOf],
  ['vega', parseVegaId, vegaContentIdOf],
])('%s stream id parser', (_name, parseStreamId, contentIdOf) => {
  it('accepts season 0 specials', () => {
    expect(parseStreamId('series', 'tt0944947:0:1')).toMatchObject({
      type: 'series',
      imdbId: 'tt0944947',
      season: 0,
      episode: 1,
    });
  });

  it('rejects negative seasons', () => {
    expect(parseStreamId('series', 'tt0944947:-1:1')).toBeNull();
  });

  it('parses movie IMDb and TMDB IDs', () => {
    const imdbMovie = parseStreamId('movie', 'tt1234567.json');
    expect(imdbMovie).toEqual({
      type: 'movie',
      imdbId: 'tt1234567',
    });
    if (imdbMovie) expect(contentIdOf(imdbMovie)).toBe('tt1234567');

    const tmdbMovie = parseStreamId('movie', 'tmdb:550');
    expect(tmdbMovie).toEqual({
      type: 'movie',
      tmdbId: 550,
    });
    if (tmdbMovie) expect(contentIdOf(tmdbMovie)).toBe('tmdb:550');
  });

  it('parses series with seasons and episodes', () => {
    const series = parseStreamId('series', 'tt0944947:1:2');
    expect(series).toEqual({
      type: 'series',
      imdbId: 'tt0944947',
      season: 1,
      episode: 2,
    });
  });

  it('rejects series without seasons', () => {
    expect(parseStreamId('series', 'tt0944947')).toBeNull();
  });

  it('rejects movie with season numbers', () => {
    expect(parseStreamId('movie', 'tt1234567:1:1')).toBeNull();
  });

  it('rejects invalid types and malformed strings', () => {
    expect(parseStreamId('anime', 'tt1234567')).toBeNull();
    expect(parseStreamId('movie', 'invalid-id')).toBeNull();
    expect(parseStreamId('series', 'tt1234567:bad:ep')).toBeNull();
  });
});
