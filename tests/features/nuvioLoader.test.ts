import { describe, it, expect, beforeEach } from 'vitest';
import { loadScraper } from '../../src/fleets/nuvio/nuvio/loader.js';
import type { NuvioScraperEntry } from '../../src/fleets/nuvio/types.js';

const entry: NuvioScraperEntry = {
  id: 'counter',
  name: 'Counter',
  description: null,
  version: '1.0.0',
  author: null,
  supportedTypes: ['movie', 'tv'],
  filename: 'providers/counter.js',
  enabled: true,
  formats: [],
  contentLanguage: [],
  hasSettings: true,
  disabledPlatforms: [],
};

const code = `
globalThis.__evalCount = (globalThis.__evalCount || 0) + 1;
async function onSettings() {
  return [
    { type: 'toggle', key: 'flag', label: 'Flag', defaultValue: true },
    { type: 'text', key: 'token', label: 'Token', defaultValue: 'default-token' },
  ];
}
async function getStreams() {
  return [{ name: String(SCRAPER_SETTINGS.flag) + ':' + SCRAPER_SETTINGS.token, url: 'http://example.com/v' }];
}
module.exports = { getStreams, onSettings };
`;

declare global {
  var __evalCount: number | undefined;
}

describe('nuvio scraper loading', () => {
  beforeEach(() => {
    globalThis.__evalCount = 0;
  });

  it('compiles each scraper exactly once and applies onSettings defaults', async () => {
    const loaded = await loadScraper({
      entry,
      code,
      tmdbApiKey: null,
      envSettings: {},
      fetchTimeoutMs: 1000,
    });

    expect(globalThis.__evalCount).toBe(1);
    expect(loaded.settings).toEqual({ flag: true, token: 'default-token' });
    expect(await loaded.getStreams(1, 'movie')).toEqual([
      { name: 'true:default-token', url: 'http://example.com/v' },
    ]);
  });

  it('keeps environment overrides without a second compile', async () => {
    const loaded = await loadScraper({
      entry,
      code,
      tmdbApiKey: null,
      envSettings: { flag: false, token: 'override' },
      fetchTimeoutMs: 1000,
    });

    expect(globalThis.__evalCount).toBe(1);
    expect(loaded.settings).toEqual({ flag: false, token: 'override' });
    expect(await loaded.getStreams(1, 'movie')).toEqual([
      { name: 'false:override', url: 'http://example.com/v' },
    ]);
  });
});
