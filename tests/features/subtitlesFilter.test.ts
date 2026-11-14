import { describe, it, expect } from 'vitest';
import { filterStream, StreamFilterConfig, StremioStream } from '../../src/addon/filters.js';
import { SubtitleTrack } from '../../src/addon/subtitles.js';

describe('stream subtitle filtering', () => {
  const baseConfig: StreamFilterConfig = {
    minRes: null,
    maxRes: null,
    includeUnknownRes: true,
    maxSizeGB: null,
    includeUnknownSize: true,
    subtitleMode: 'languages',
    subtitleLangs: ['en'],
    includeUnknownSubtitleLang: true,
  };

  const sampleTracks: SubtitleTrack[] = [
    { url: 'https://subs.test/en.vtt', lang: 'eng' },
    { url: 'https://subs.test/es.vtt', lang: 'spa' },
    { url: 'https://subs.test/unknown.vtt', lang: 'und' },
  ];

  it('filters subtitle tracks while keeping the stream object', () => {
    const stream: StremioStream = {
      name: 'Stream 1',
      title: '1080p Stream',
      url: 'https://video.test/stream.mp4',
      subtitles: [...sampleTracks],
    };

    const result = filterStream(stream, baseConfig);
    expect(result).not.toBeNull();
    expect(result?.url).toBe('https://video.test/stream.mp4');
    expect(result?.subtitles).toHaveLength(2); // 'eng' and 'und' (since includeUnknown is true)
    expect(result?.subtitles?.map((s) => s.lang)).toEqual(['eng', 'und']);
  });

  it('never removes a stream when all subtitles are filtered out', () => {
    const stream: StremioStream = {
      name: 'Stream 2',
      title: 'Spanish Only Stream',
      url: 'https://video.test/spanish.mp4',
      subtitles: [{ url: 'https://subs.test/es.vtt', lang: 'es' }],
    };

    // User only wants English ('en') and no unknown subtitles
    const config: StreamFilterConfig = {
      ...baseConfig,
      subtitleLangs: ['en'],
      includeUnknownSubtitleLang: false,
    };

    const result = filterStream(stream, config);
    expect(result).not.toBeNull();
    expect(result?.url).toBe('https://video.test/spanish.mp4');
    expect(result?.subtitles).toBeUndefined(); // Subtitles removed, but stream kept!
  });

  it('passes streams without subtitle tracks through untouched', () => {
    const stream: StremioStream = {
      name: 'Stream 3',
      title: 'Inline Embedded MKV',
      url: 'https://video.test/movie.mkv',
    };

    const result = filterStream(stream, baseConfig);
    expect(result).not.toBeNull();
    expect(result?.url).toBe('https://video.test/movie.mkv');
    expect(result?.subtitles).toBeUndefined();
  });

  it('preserves all subtitle tracks when mode is all or languages selection is empty', () => {
    const stream: StremioStream = {
      name: 'Stream 4',
      title: 'Multi-sub Stream',
      url: 'https://video.test/multi.mp4',
      subtitles: [...sampleTracks],
    };

    const allConfig: StreamFilterConfig = {
      ...baseConfig,
      subtitleMode: 'all',
      subtitleLangs: [],
    };

    const result = filterStream(stream, allConfig);
    expect(result).not.toBeNull();
    expect(result?.subtitles).toHaveLength(3);
  });

  it('matches complex language variants (eng-us, eng eu, English [CC]) against en', () => {
    const variantTracks: SubtitleTrack[] = [
      { url: 'https://subs.test/1.vtt', lang: 'eng-us' },
      { url: 'https://subs.test/2.vtt', lang: 'eng eu' },
      { url: 'https://subs.test/3.vtt', lang: 'English [CC]' },
      { url: 'https://subs.test/4.vtt', lang: 'French' },
    ];

    const stream: StremioStream = {
      name: 'Stream 5',
      title: 'Variant Subs',
      url: 'https://video.test/variants.mp4',
      subtitles: variantTracks,
    };

    const result = filterStream(stream, {
      ...baseConfig,
      subtitleLangs: ['en'],
      includeUnknownSubtitleLang: false,
    });

    expect(result).not.toBeNull();
    expect(result?.subtitles).toHaveLength(3);
    expect(result?.subtitles?.map((s) => s.url)).toEqual([
      'https://subs.test/1.vtt',
      'https://subs.test/2.vtt',
      'https://subs.test/3.vtt',
    ]);
  });
});
