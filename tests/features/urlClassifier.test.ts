import { describe, it, expect } from 'vitest';
import {
  isBlockerUrl,
  isArchiveUrl,
  isDirectMediaUrl,
  isWebPage,
  isExternalUrl,
  normalizeStreamKey,
} from '../../src/core/urlClassifier.js';
import { mergeAndFilterStreams, FleetStreamsInput } from '../../src/addon/merge.js';
import { StreamFilterConfig } from '../../src/addon/filters.js';

describe('urlClassifier canonical rules', () => {
  const toroplayUrl =
    'https://c.toroplay.cymru/api/watch/m3u8?url=https%3A%2F%2Fmegap.shiora.top%2F072b030ba126b2f4b2374f342be9ed44%2Fa4c39abcf0e3bf1ead6970accd8cc8a7%2Fmaster.m3u8&ref=https%3A%2F%2Fmegaplay.buzz%2F&e=1798296464&s=o0JSzWfoXwGCCfUzcuYo-g';

  const defaultFilters: StreamFilterConfig = {
    minRes: null,
    maxRes: null,
    includeUnknownRes: true,
    maxSizeGB: null,
    includeUnknownSize: true,
    subtitleMode: 'all',
    subtitleLangs: [],
    includeUnknownSubtitleLang: true,
  };

  it('correctly classifies Toroplay API m3u8 watch link as direct media and NOT externalUrl', () => {
    expect(isDirectMediaUrl(toroplayUrl)).toBe(true);
    expect(isWebPage(toroplayUrl)).toBe(false);
    expect(isExternalUrl(toroplayUrl)).toBe(false);
    expect(isArchiveUrl(toroplayUrl)).toBe(false);
    expect(isBlockerUrl(toroplayUrl)).toBe(false);
  });

  it('treats other streaming API endpoints with container paths as direct media', () => {
    expect(isDirectMediaUrl('https://example.com/api/watch/m3u8')).toBe(true);
    expect(isExternalUrl('https://example.com/api/watch/m3u8')).toBe(false);

    expect(isDirectMediaUrl('https://example.com/api/watch/mp4')).toBe(true);
    expect(isExternalUrl('https://example.com/api/watch/mp4')).toBe(false);

    expect(isDirectMediaUrl('https://example.com/stream/m3u8')).toBe(true);
    expect(isExternalUrl('https://example.com/stream/m3u8')).toBe(false);

    expect(isDirectMediaUrl('https://example.com/stream/mpd')).toBe(true);
    expect(isExternalUrl('https://example.com/stream/mpd')).toBe(false);

    expect(isDirectMediaUrl('https://proxy.example.org/watch/m3u8?token=xyz')).toBe(true);
    expect(isExternalUrl('https://proxy.example.org/watch/m3u8?token=xyz')).toBe(false);
  });

  it('keeps genuine web embed and player pages as externalUrl', () => {
    expect(isWebPage('https://example.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(isExternalUrl('https://example.com/watch?v=dQw4w9WgXcQ')).toBe(true);

    expect(isWebPage('https://example.com/watch/tt1234567')).toBe(true);
    expect(isExternalUrl('https://example.com/watch/tt1234567')).toBe(true);

    expect(isWebPage('https://example.com/embed/12345')).toBe(true);
    expect(isExternalUrl('https://example.com/embed/12345')).toBe(true);

    expect(isWebPage('https://moviesapi.to/watch/123')).toBe(true);
    expect(isExternalUrl('https://moviesapi.to/watch/123')).toBe(true);

    expect(isWebPage('https://example.com/player/movie.html')).toBe(true);
    expect(isExternalUrl('https://example.com/player/movie.html')).toBe(true);
  });

  it('detects blockers and archives accurately', () => {
    expect(isBlockerUrl('https://stream.net/slowdown')).toBe(true);
    expect(isBlockerUrl('https://stream.net/ratelimit')).toBe(true);
    expect(isBlockerUrl('https://stream.net/antibot')).toBe(true);
    expect(isBlockerUrl('https://stream.net/video.mp4')).toBe(false);

    expect(isArchiveUrl('https://storage.net/pack.zip')).toBe(true);
    expect(isArchiveUrl('https://storage.net/pack.rar')).toBe(true);
    expect(isArchiveUrl('https://storage.net/pack.7z')).toBe(true);
    expect(isArchiveUrl('https://storage.net/pack.iso')).toBe(true);
    expect(isArchiveUrl('https://storage.net/pack.tar.gz')).toBe(true);
    expect(isArchiveUrl('https://storage.net/video.mp4')).toBe(false);
  });

  it('normalizes stream keys including magnets and URLs', () => {
    const key1 = normalizeStreamKey('https://CDN.TEST/Stream.mp4?Token=123#frag');
    expect(key1).toBe('https://cdn.test/Stream.mp4?Token=123');

    const key2 = normalizeStreamKey('magnet:?xt=urn:btih:ABCDEF1234567890&dn=Movie');
    expect(key2).toBe('magnet:abcdef1234567890');
  });

  it('merges Toroplay stream as direct url without 🖥️ prefix at gateway', () => {
    const inputs: FleetStreamsInput[] = [
      {
        fleet: 'nuvio',
        streams: [
          {
            name: 'Nuvio Toroplay',
            title: '1080p Stream',
            quality: '1080p',
            url: toroplayUrl,
          },
        ],
      },
    ];

    const merged = mergeAndFilterStreams(inputs, defaultFilters, 10);
    expect(merged).toHaveLength(1);
    expect(merged[0].url).toBe(toroplayUrl);
    expect(merged[0].externalUrl).toBeUndefined();
    expect(merged[0].title).toBe('1080p Stream');
    expect(merged[0].title.startsWith('🖥️')).toBe(false);
  });
});
