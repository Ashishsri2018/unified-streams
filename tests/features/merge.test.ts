import { describe, it, expect } from 'vitest';
import { isBlockerUrl, isArchiveUrl, isExternalUrl, canonicalizeStreamKey } from '../../src/addon/classifier.js';
import { mergeAndFilterStreams, FleetStreamsInput } from '../../src/addon/merge.js';
import { StreamFilterConfig } from '../../src/addon/filters.js';

describe('classifier and merger', () => {
  it('classifies direct media vs external URLs correctly', () => {
    expect(isBlockerUrl('https://example.com/slowdown')).toBe(true);
    expect(isBlockerUrl('https://example.com/stream.mp4')).toBe(false);

    // Compressed archives are externalUrl because mobile players cannot open them
    expect(isExternalUrl('https://archive.org/download/item.zip')).toBe(true);
    expect(isExternalUrl('https://example.com/movie.rar')).toBe(true);
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

  it('drops rotated signing params from the dedupe key but keeps selectors', () => {
    // CloudFront re-signed copies of the same file collapse.
    expect(
      canonicalizeStreamKey('https://cdn.example.com/v.m3u8?Expires=1&KeyName=Signature&Signature=abc'),
    ).toBe(
      canonicalizeStreamKey('https://cdn.example.com/v.m3u8?Expires=2&KeyName=Signature&Signature=def'),
    );

    // febbox: sign/t rotate but quality selects a distinct rendition.
    expect(
      canonicalizeStreamKey('https://hls.test/1.m3u8?sign=a&t=1&client=febbox&quality=1080p'),
    ).toBe(canonicalizeStreamKey('https://hls.test/1.m3u8?sign=b&t=2&client=febbox&quality=1080p'));
    expect(
      canonicalizeStreamKey('https://hls.test/1.m3u8?sign=a&t=1&client=febbox&quality=1080p'),
    ).not.toBe(canonicalizeStreamKey('https://hls.test/1.m3u8?sign=b&t=2&client=febbox&quality=720p'));

    // Goldenkite-style `s` tokens are dropped, but `q` selectors are preserved.
    expect(
      canonicalizeStreamKey('https://cdn.test/a/master.m3u8?s=s1.111.4.aaa'),
    ).toBe(canonicalizeStreamKey('https://cdn.test/a/master.m3u8?s=s1.222.4.bbb'));
    expect(
      canonicalizeStreamKey('https://cdn.test/video.m3u8?q=english'),
    ).not.toBe(canonicalizeStreamKey('https://cdn.test/video.m3u8?q=german'));
  });

  it('keeps the surviving signed URL intact when deduplicating', () => {
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
    const first = 'https://cdn.test/v.m3u8?Expires=1&KeyName=Signature&Signature=abc';
    const second = 'https://cdn.test/v.m3u8?Expires=2&KeyName=Signature&Signature=def';

    const merged = mergeAndFilterStreams(
      [
        { fleet: 'vega', streams: [{ title: 'A', quality: '1080p', url: first }] },
        { fleet: 'sa7', streams: [{ title: 'B', quality: '1080p', url: second }] },
      ],
      defaultFilters,
      10,
    );

    expect(merged).toHaveLength(1);
    // The returned URL keeps its own signature; nothing is stripped for playback.
    expect(merged[0].url).toBe(first);
  });

  it('injects a non-browser UA for the Vidlink/Haylox host when none is present', () => {
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
    const url = 'https://bcdn.hakunaymatata.com/resource/abc.mp4?sign=x&t=1';

    const merged = mergeAndFilterStreams(
      [{ fleet: 'nuvio', streams: [{ name: 'Vidlink', title: '720p', quality: '720p', url }] }],
      defaultFilters,
      10,
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].url).toBe(url);
    expect(merged[0].behaviorHints?.proxyHeaders?.request?.['User-Agent']).toBe('okhttp/4.12.0');
    expect(merged[0].behaviorHints?.notWebReady).toBe(true);
  });

  it('preserves a provider UA and leaves other hosts untouched', () => {
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

    const merged = mergeAndFilterStreams(
      [
        {
          fleet: 'nuvio',
          streams: [
            {
              name: 'Vidlink',
              quality: '720p',
              url: 'https://bcdn.hakunaymatata.com/resource/abc.mp4',
              behaviorHints: { proxyHeaders: { request: { 'User-Agent': 'Custom/1.0' } } },
            },
            {
              name: 'Other',
              quality: '720p',
              url: 'https://cdn.example.com/video.mp4',
            },
          ],
        },
      ],
      defaultFilters,
      10,
    );

    const sensitive = merged.find((s) => s.url?.includes('hakunaymatata'));
    expect(sensitive?.behaviorHints?.proxyHeaders?.request?.['User-Agent']).toBe('Custom/1.0');

    const other = merged.find((s) => s.url?.includes('cdn.example.com'));
    expect(other?.behaviorHints?.proxyHeaders).toBeUndefined();
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

  it('drops playback-only behavior hints from externalUrl streams', () => {
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
          {
            title: 'Embed player',
            externalUrl: 'https://example.com/embed/123',
            behaviorHints: {
              bingeGroup: 'provider-1080p',
              proxyHeaders: { request: { Referer: 'https://example.com/' } },
              notWebReady: true,
            },
          },
        ],
      },
    ];

    const merged = mergeAndFilterStreams(inputs, defaultFilters, 10);
    expect(merged).toHaveLength(1);
    expect(merged[0].externalUrl).toBe('https://example.com/embed/123');
    expect(merged[0].behaviorHints).toEqual({ bingeGroup: 'sa7:provider-1080p' });
  });

  it('routes zip/archive files to externalUrl with 🔲 and 🖥️ markers', () => {
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

    // Archives must carry both markers and be opened as external links
    const zip1 = merged.find((s) => s.title === '🖥️ Archive 1');
    expect(zip1?.name).toBe('🔲 Nuvio 1080p');
    expect(zip1?.url).toBeUndefined();
    expect(zip1?.externalUrl).toBe('https://example.com/files/season1.zip');

    const rar = merged.find((s) => s.title === '🖥️ Archive 2');
    expect(rar?.name).toBe('🔲 Already prefixed');
    expect(rar?.url).toBeUndefined();
    expect(rar?.externalUrl).toBe('https://example.com/files/season2.rar');

    const archiveNoName = merged.find((s) => s.title === '🖥️ No name archive');
    expect(archiveNoName?.name).toBe('🔲 Archive');
    expect(archiveNoName?.url).toBeUndefined();
    expect(archiveNoName?.externalUrl).toBe('https://example.com/files/movie.7z');
  });

  it('ranks direct containers even when the URL has a hash fragment', () => {
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
        fleet: 'vega',
        streams: [
          { title: 'Hash MP4', url: 'https://cdn.test/video.mp4#t=10' },
          { title: 'HLS', url: 'https://cdn.test/video/master.m3u8' },
        ],
      },
    ];

    const merged = mergeAndFilterStreams(inputs, defaultFilters, 10);
    expect(merged[0].title).toBe('Hash MP4');
  });

  it('keeps duplicate URLs from the highest-priority fleet (nuvio > vega > sa7)', () => {
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
          { title: 'SA7 copy', quality: '1080p', url: 'https://cdn.test/shared.mp4', behaviorHints: { bingeGroup: 'sa7' } },
        ],
      },
      {
        fleet: 'vega',
        streams: [
          { title: 'Vega copy', quality: '1080p', url: 'https://cdn.test/shared.mp4', behaviorHints: { bingeGroup: 'vega' } },
        ],
      },
      {
        fleet: 'nuvio',
        streams: [
          { title: 'Nuvio copy', quality: '1080p', url: 'https://cdn.test/shared.mp4', behaviorHints: { bingeGroup: 'nuvio' } },
        ],
      },
    ];

    const merged = mergeAndFilterStreams(inputs, defaultFilters, 100);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('Nuvio copy');
  });

  it('keeps a valid lower-ranked duplicate when the higher-ranked copy is filtered out', () => {
    const filters: StreamFilterConfig = {
      minRes: null,
      maxRes: 1080,
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
        streams: [{ title: 'Nuvio 4K', quality: '2160p', url: 'https://cdn.test/shared.mp4' }],
      },
      {
        fleet: 'vega',
        streams: [{ title: 'Vega 1080p', quality: '1080p', url: 'https://cdn.test/shared.mp4' }],
      },
    ];

    const merged = mergeAndFilterStreams(inputs, filters, 100);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('Vega 1080p');
  });
});
