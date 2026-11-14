import { describe, it, expect } from 'vitest';
import { filterStream, inferResolution, inferSizeBytes, StreamFilterConfig, StremioStream } from '../../src/addon/filters.js';

describe('stream filters', () => {
  const baseConfig: StreamFilterConfig = {
    minRes: null,
    maxRes: null,
    includeUnknownRes: true,
    maxSizeGB: null,
    includeUnknownSize: true,
    subtitleMode: 'all',
    subtitleLangs: ['en'],
    includeUnknownSubtitleLang: true,
  };

  it('infers resolution correctly from stream properties', () => {
    expect(inferResolution({ quality: '1080p' })).toBe(1080);
    expect(inferResolution({ title: 'Movie 4K UHD Remux' })).toBe(2160);
    expect(inferResolution({ name: 'FastStream 720p HD' })).toBe(720);
    expect(inferResolution({ title: 'SD 480p' })).toBe(480);
    expect(inferResolution({ title: 'Unknown quality video' })).toBeNull();
  });

  it('infers size correctly from stream size or title text', () => {
    expect(inferSizeBytes({ size: 2147483648 })).toBe(2147483648);
    expect(inferSizeBytes({ title: 'Video 1080p - 2.5 GB' })).toBe(2.5 * 1024 * 1024 * 1024);
    expect(inferSizeBytes({ description: 'Size: 850 MB' })).toBe(850 * 1024 * 1024);
    expect(inferSizeBytes({ title: 'No size here' })).toBeNull();
  });

  it('filters by max resolution (e.g. 720p max excludes 1080p+)', () => {
    const config: StreamFilterConfig = { ...baseConfig, maxRes: 720, includeUnknownRes: false };

    const stream480: StremioStream = { quality: '480p', url: 'https://test/480.mp4' };
    const stream720: StremioStream = { quality: '720p', url: 'https://test/720.mp4' };
    const stream1080: StremioStream = { quality: '1080p', url: 'https://test/1080.mp4' };
    const stream4k: StremioStream = { quality: '2160p', url: 'https://test/4k.mp4' };
    const streamUnknown: StremioStream = { url: 'https://test/unknown.mp4' };

    expect(filterStream(stream480, config)).not.toBeNull();
    expect(filterStream(stream720, config)).not.toBeNull();
    expect(filterStream(stream1080, config)).toBeNull();
    expect(filterStream(stream4k, config)).toBeNull();
    expect(filterStream(streamUnknown, config)).toBeNull();
  });

  it('handles exact resolution when minRes === maxRes', () => {
    const config: StreamFilterConfig = { ...baseConfig, minRes: 1080, maxRes: 1080 };
    expect(filterStream({ quality: '1080p' }, config)).not.toBeNull();
    expect(filterStream({ quality: '720p' }, config)).toBeNull();
  });

  it('filters by file size in GB', () => {
    const config: StreamFilterConfig = { ...baseConfig, maxSizeGB: 2.0, includeUnknownSize: false };

    const small: StremioStream = { title: '1.2 GB', url: 'https://test/1.mp4' };
    const large: StremioStream = { title: '3.5 GB', url: 'https://test/2.mp4' };
    const unknown: StremioStream = { title: 'Movie', url: 'https://test/3.mp4' };

    expect(filterStream(small, config)).not.toBeNull();
    expect(filterStream(large, config)).toBeNull();
    expect(filterStream(unknown, config)).toBeNull();
  });

  it('never filters or rewrites inline stream subtitles', () => {
    const subtitles = [
      { id: 'en', url: 'https://sub.test/en.vtt', lang: 'en' },
      { id: 'hi', url: 'https://sub.test/hi.vtt', lang: 'hi' },
      { id: 'und', url: 'https://sub.test/und.vtt', lang: 'und' },
    ];
    const stream: StremioStream = {
      title: '1080p',
      url: 'https://test/movie.mp4',
      subtitles,
    };

    const modes: Array<StreamFilterConfig['subtitleMode']> = ['all', 'none', 'languages'];

    for (const subtitleMode of modes) {
      const result = filterStream(stream, { ...baseConfig, subtitleMode, subtitleLangs: ['en'] });
      expect(result).not.toBeNull();
      expect(result?.subtitles).toEqual(subtitles);
      expect(result?.url).toBe('https://test/movie.mp4');
    }
  });
});
