import { describe, it, expect } from 'vitest';
import { parseStreamId as parseNuvioId } from '../../src/fleets/nuvio/addon/parseId.js';
import { parseStreamId as parseVegaId } from '../../src/fleets/vega/addon/parseId.js';

describe.each([
  ['nuvio', parseNuvioId],
  ['vega', parseVegaId],
])('%s stream id parser', (_name, parseStreamId) => {
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
});
