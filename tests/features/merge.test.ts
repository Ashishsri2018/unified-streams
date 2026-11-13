import { describe, it, expect } from 'vitest';
import { isBlockerUrl, isArchiveUrl, isExternalUrl, canonicalizeStreamKey } from '../../src/addon/classifier.js';
import { mergeAndFilterStreams, FleetStreamsInput } from '../../src/addon/merge.js';
import { StreamFilterConfig } from '../../src/addon/filters.js';

describe('classifier and merger', () => {
  it('classifies direct media vs external URLs correctly', () => {
    expect(isBlockerUrl('https://example.com/slowdown')).toBe(true);
    expect(isBlockerUrl('https://example.com/stream.mp4')).toBe(false);

    // Compressed archive files are NOT externalUrl
    expect(isExternalUrl('https://archive.org/download/item.zip')).toBe(false);
    expect(isExternalUrl('https://example.com/movie.rar')).toBe(false);
    expect(isArchiveUrl('https://archive.org/download/item.zip')).toBe(true);
    expect(isArchiveUrl('https://example.com/movie.rar')).toBe(true);
    expect(isArchiveUrl('https://example.com/movie.mp4')).toBe(false);

    // Links with no extension are NOT externalUrl
    expect(
      isExternalUrl(
        'https://dash-hls-bridge.johndoesemc.workers.dev/?url=https%3A%2F%2Fsacdn.hakunaymatata.com%2Fdash%2Fmaster.m3u8',
      ),
    ).toBe(false);
    expect(isExternalUrl('https://cdn.example.com/stream/token123')).toBe(false);

    // Only HTML / web embed pages are externalUrl
    expect(isExternalUrl('https://example.com/player/embed.html')).toBe(true);
    expect(isExternalUrl('https://example.com/embed/123')).toBe(true);
    expect(isExternalUrl('https://t.me/stream_bot')).toBe(true);
    expect(isExternalUrl('https://moviesapi.to/watch/123')).toBe(true);

    // Direct playable media is NOT externalUrl
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
          { title: 'Embed player', externalUrl: 'https://example.com/embed/123' },
          { title: '🖥️ Already prefixed', externalUrl: 'https://example.com/player/test.html' },
          { externalUrl: 'https://example.com/watch/live.html' },
        ],
      },
    ];

    const merged = mergeAndFilterStreams(inputs, defaultFilters, 10);
    expect(merged[0].title).toBe('🖥️ Embed player');
    expect(merged[1].title).toBe('🖥️ Already prefixed');
    expect(merged[2].title).toBe('🖥️ External Link');
  });

  it('adds 🔲 emoji to name for zip/archive files and keeps them in url, not externalUrl', () => {
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
          { name: 'Nuvio 1080p', title: 'Archive 1', url: 'https://example.com/files/season1.zip' },
          { name: '🔲 Already prefixed', title: 'Archive 2', externalUrl: 'https://example.com/files/season2.rar' },
          { title: 'No name archive', url: 'https://example.com/files/movie.7z' },
          {
            name: 'Bridge Stream',
            title: 'Dash HLS',
            url: 'https://dash-hls-bridge.johndoesemc.workers.dev/?url=https%3A%2F%2Fsacdn.hakunaymatata.com%2Fmaster.m3u8',
          },
        ],
      },
    ];

    const merged = mergeAndFilterStreams(inputs, defaultFilters, 10);
    expect(merged).toHaveLength(4);

    // Bridge stream (no extension) must be in url, not externalUrl, and not have 🖥️ or 🔲
    const bridge = merged.find((s) => s.title === 'Dash HLS');
    expect(bridge?.url).toContain('dash-hls-bridge');
    expect(bridge?.externalUrl).toBeUndefined();
    expect(bridge?.name).toBe('Bridge Stream');

    // Zip files must have 🔲 in name, be in url, and NOT in externalUrl
    const zip1 = merged.find((s) => s.title === 'Archive 1');
    expect(zip1?.name).toBe('🔲 Nuvio 1080p');
    expect(zip1?.url).toBe('https://example.com/files/season1.zip');
    expect(zip1?.externalUrl).toBeUndefined();

    const rar = merged.find((s) => s.title === 'Archive 2');
    expect(rar?.name).toBe('🔲 Already prefixed');
    expect(rar?.url).toBe('https://example.com/files/season2.rar');
    expect(rar?.externalUrl).toBeUndefined();

    const archiveNoName = merged.find((s) => s.title === 'No name archive');
    expect(archiveNoName?.name).toBe('🔲 Archive');
    expect(archiveNoName?.url).toBe('https://example.com/files/movie.7z');
    expect(archiveNoName?.externalUrl).toBeUndefined();
  });
});
