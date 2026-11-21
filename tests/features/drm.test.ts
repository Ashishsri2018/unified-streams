import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { normalizeDrm } from '../../src/core/drm.js';
import { redactObject } from '../../src/core/redact.js';
import { mergeAndFilterStreams } from '../../src/addon/merge.js';
import { StreamFilterConfig } from '../../src/addon/filters.js';
import { mapScraperStreams } from '../../src/fleets/nuvio/addon/mapStreams.js';
import { mapProviderStreams } from '../../src/fleets/vega/pipeline/mapStreams.js';

const require = createRequire(import.meta.url);
const { toStremioStream } = require('../../src/fleets/sa7/format.js');

const baseConfig: StreamFilterConfig = {
  minRes: null,
  maxRes: null,
  includeUnknownRes: true,
  maxSizeGB: null,
  includeUnknownSize: true,
  subtitleMode: 'none',
  subtitleLangs: [],
  includeUnknownSubtitleLang: true,
};

const drm = {
  type: 'clearkey',
  clearKeys: { '00112233445566778899aabbccddeeff': 'ffeeddccbbaa99887766554433221100' },
  headers: { Authorization: 'Bearer license-token' },
  custom: { keep: true },
};

describe('DRM passthrough', () => {
  it('preserves every field on a recognizable DRM object', () => {
    expect(normalizeDrm(drm)).toEqual(drm);
  });

  it('recognizes provider type aliases and license-based DRM', () => {
    expect(normalizeDrm({ type: 'org.w3.clearkey', clearKeys: { k: 'v' } })).toBeDefined();
    expect(
      normalizeDrm({ type: 'com.widevine.alpha', licenseUrl: 'https://license.test/wv' }),
    ).toEqual({ type: 'com.widevine.alpha', licenseUrl: 'https://license.test/wv' });
    expect(
      normalizeDrm({ type: 'com.microsoft.playready', licenseUrl: 'https://license.test/pr' }),
    ).toBeDefined();
  });

  it('infers ClearKey when clearKeys is present without a type', () => {
    expect(normalizeDrm({ clearKeys: { k: 'v' } })).toEqual({ clearKeys: { k: 'v' } });
  });

  it('drops non-objects and unrecognized shapes', () => {
    expect(normalizeDrm(null)).toBeUndefined();
    expect(normalizeDrm([])).toBeUndefined();
    expect(normalizeDrm('drm')).toBeUndefined();
    expect(normalizeDrm({})).toBeUndefined();
    expect(normalizeDrm({ type: 'unknown' })).toBeUndefined();
  });

  it('redacts DRM metadata from logs', () => {
    expect(redactObject({ drm })).toEqual({ drm: '[REDACTED]' });
    expect(redactObject({ clearKeys: drm.clearKeys })).toEqual({ clearKeys: '[REDACTED]' });
  });

  it('keeps DRM on direct streams and drops it for external links', () => {
    const direct = mergeAndFilterStreams(
      [{ fleet: 'vega', streams: [{ name: 'V', title: 'T', url: 'https://cdn.test/movie.mpd', drm }] }],
      baseConfig,
    );
    expect(direct).toHaveLength(1);
    expect(direct[0].drm).toEqual(drm);

    const external = mergeAndFilterStreams(
      [
        {
          fleet: 'vega',
          streams: [{ name: 'V', title: 'T', externalUrl: 'https://example.com/embed/1', drm }],
        },
      ],
      baseConfig,
    );
    expect(external[0].drm).toBeUndefined();
  });

  it('prefers the DRM-bearing copy when the same URL is duplicated', () => {
    const merged = mergeAndFilterStreams(
      [
        {
          fleet: 'vega',
          streams: [
            { name: 'No DRM', title: 'No DRM', url: 'https://cdn.test/movie.mpd' },
            { name: 'DRM', title: 'DRM', url: 'https://cdn.test/movie.mpd', drm },
          ],
        },
      ],
      baseConfig,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].drm).toEqual(drm);
  });

  it('passes DRM through every fleet mapper', () => {
    const nuvio = mapScraperStreams(
      [{ name: 'N', url: 'https://cdn.test/nuvio.mpd', drm }],
      { scraperId: 's', scraperName: 'S', proxyEnabled: false },
    );
    expect(nuvio[0].drm).toEqual(drm);

    const vega = mapProviderStreams(
      [{ server: 'V', link: 'https://cdn.test/vega.mpd', drm }],
      { providerValue: 'v', providerName: 'V', includeMagnets: false },
    );
    expect(vega[0].drm).toEqual(drm);

    const sa7 = toStremioStream({ url: 'https://cdn.test/sa7.mpd', drm }, { name: 'SA7' });
    expect(sa7.drm).toEqual(drm);
  });
});
