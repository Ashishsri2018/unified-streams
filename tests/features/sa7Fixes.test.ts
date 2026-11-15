import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseContentId } = require('../../src/fleets/sa7/content-id.js');

describe('SA7 content id parser', () => {
  it('parses season packs for IMDb and TMDB ids', () => {
    expect(parseContentId('tt0944947:1')).toMatchObject({
      source: 'imdb',
      id: 'tt0944947',
      season: 1,
      episode: null,
    });
    expect(parseContentId('tmdb:1399:2')).toMatchObject({
      source: 'tmdb',
      id: 1399,
      season: 2,
      episode: null,
    });
  });

  it('still parses full season and episode ids', () => {
    expect(parseContentId('tt0944947:1:2')).toMatchObject({
      source: 'imdb',
      id: 'tt0944947',
      season: 1,
      episode: 2,
    });
  });
});
