import { describe, it, expect } from 'vitest';
import { isBlockerUrl, isExternalUrl, canonicalizeStreamKey } from '../../src/addon/classifier.js';
import { mergeAndFilterStreams, FleetStreamsInput } from '../../src/addon/merge.js';
import { StreamFilterConfig } from '../../src/addon/filters.js';

describe('classifier and merger', () => {
  it('classifies direct media vs external URLs correctly', () => {
    expect(isBlockerUrl('https://example.com/slowdown')).toBe(true);
    expect(isBlockerUrl('https://example.com/stream.mp4')).toBe(false);

    expect(isExternalUrl('https://archive.org/download/item.zip')).toBe(true);
    expect(isExternalUrl('https://example.com/player/embed.html')).toBe(true);
    expect(isExternalUrl('https://t.me/stream_bot')).toBe(true);

    expect(isExternalUrl('https://cdn.example.com/video/master.m3u8')).toBe(false);
    expect(isExternalUrl('https://cdn.example.com/movie.mp4')).toBe(false);
  });

  it('canonicalizes stream keys preserving query tokens', () => {
    const key1 = canonicalizeStreamKey('https://CDN.EXAMPLE.COM/video.mp4?token=abc#t=10');
    expect(key1).toBe('https://cdn.example.com/video.mp4?token=abc');

    const key2 = canonicalizeStreamKey('https://cdn.example.com/dir/');
    expect(key2).toBe('https://cdn.example.com/dir');
  });

  it('merges, deduplicates, and sorts direct before external links', () => {
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

    const inputs: FleetStreamsInput[] = [
      {
        fleet: 'sa7',
        streams: [
          { title: 'External embed', url: 'https://example.com/embed/123' },
          { title: 'Direct 720p', quality: '720p', url: 'https://cdn.test/720.mp4' },
        ],
      },
      {
        fleet: 'vega',
        streams: [
          { title: 'Direct 1080p', quality: '1080p', url: 'https://cdn.test/1080.mp4' },
          { title: 'Duplicate 720p', quality: '720p', url: 'https://cdn.test/720.mp4' },
          { title: 'Blocker link', url: 'https://cdn.test/slowdown' },
        ],
      },
    ];

    const merged = mergeAndFilterStreams(inputs, defaultFilters, 100);

    // Blocker dropped
    expect(merged.some((s) => s.url?.includes('slowdown'))).toBe(false);

    // Duplicate dropped (should have 3 items total)
    expect(merged).toHaveLength(3);

    // Direct streams sorted first by quality descending (1080p, then 720p), then external
    expect(merged[0].quality).toBe('1080p');
    expect(merged[0].url).toBe('https://cdn.test/1080.mp4');

    expect(merged[1].quality).toBe('720p');
    expect(merged[1].url).toBe('https://cdn.test/720.mp4');

    expect(merged[2].externalUrl).toBe('https://example.com/embed/123');
    expect(merged[2].url).toBeUndefined();
    expect(merged[2].title).toBe('🖥️ External embed');
  });

  it('prefixes externalUrl streams with an identification emoji', () => {
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

    const inputs: FleetStreamsInput[] = [
      {
        fleet: 'nuvio',
        streams: [
          { title: 'Pixeldrain 1080p', externalUrl: 'https://pixeldrain.dev/api/file/123' },
          { title: '🖥️ Already prefixed', externalUrl: 'https://example.com/stream' },
          { externalUrl: 'https://example.com/notitle' },
        ],
      },
    ];

    const merged = mergeAndFilterStreams(inputs, defaultFilters, 10);
    expect(merged[0].title).toBe('🖥️ Pixeldrain 1080p');
    expect(merged[1].title).toBe('🖥️ Already prefixed');
    expect(merged[2].title).toBe('🖥️ External Link');
  });
});
