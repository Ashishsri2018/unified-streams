import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

describe('SA7 provider module resolution', () => {
  it('resolves cheerio from snapshot directories outside the app root', () => {
    require('../../src/fleets/sa7/lib/cheerio-hook.js');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa7-cheerio-'));
    try {
      const providerPath = path.join(dir, 'provider.js');
      fs.writeFileSync(providerPath, "module.exports = require('cheerio-without-node-native');\n");
      const providerRequire = createRequire(providerPath);
      const wrapper = providerRequire('./provider.js');
      const direct = providerRequire('cheerio');

      expect(wrapper).toBe(direct);
      expect(typeof wrapper.load).toBe('function');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
