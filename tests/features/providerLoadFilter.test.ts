import { describe, it, expect } from 'vitest';
import { selectScrapers } from '../../src/fleets/nuvio/nuvio/manifest.js';
import type { NuvioManifest, NuvioScraperEntry } from '../../src/fleets/nuvio/types.js';

function scraper(id: string, enabled = true): NuvioScraperEntry {
  return {
    id,
    name: id,
    description: null,
    version: '1.0.0',
    author: null,
    supportedTypes: ['movie', 'tv'],
    filename: `providers/${id}.js`,
    enabled,
    formats: [],
    contentLanguage: [],
    hasSettings: false,
    disabledPlatforms: [],
  };
}

const manifest: NuvioManifest = {
  name: 'Test',
  version: '1.0.0',
  scrapers: [scraper('alpha'), scraper('beta', false), scraper('gamma')],
};

describe('nuvio compile-time scraper selection', () => {
  it('excludes manifest-disabled and policy-disabled scrapers', () => {
    expect(selectScrapers(manifest, []).map((s) => s.id)).toEqual(['alpha', 'gamma']);
    expect(selectScrapers(manifest, ['gamma']).map((s) => s.id)).toEqual(['alpha']);
  });

  it('honors allow lists, deny-all, and case-insensitive ids', () => {
    expect(selectScrapers(manifest, [], ['gamma']).map((s) => s.id)).toEqual(['gamma']);
    expect(selectScrapers(manifest, ['*'])).toEqual([]);
    expect(selectScrapers(manifest, ['GAMMA']).map((s) => s.id)).toEqual(['alpha']);
  });
});
