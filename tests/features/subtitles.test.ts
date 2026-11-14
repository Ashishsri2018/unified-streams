import { describe, it, expect } from 'vitest';
import {
  normalizeSubtitleLanguage,
  filterSubtitleTracks,
  normalizeSubtitlesTrackList,
  SubtitleTrack,
} from '../../src/addon/subtitles.js';

describe('subtitle normalization and filtering', () => {
  it('normalizes subtitle track lists from heterogeneous inputs', () => {
    const raw = [
      { uri: 'https://sub.test/en.vtt', language: 'English' },
      { url: 'https://sub.test/hi.vtt', lang: 'hin' },
      { src: 'https://sub.test/es.vtt', label: 'Spanish', title: 'Full Spanish' },
      { url: 'https://sub.test/dup.vtt', lang: 'en' },
      { url: 'https://sub.test/dup.vtt', lang: 'en' }, // duplicate url
      { url: 'invalid-url', lang: 'en' },
    ];

    const tracks = normalizeSubtitlesTrackList(raw, 'sub-prefix');
    expect(tracks).toHaveLength(4);
    expect(tracks[0]).toEqual({ id: 'sub-prefix', url: 'https://sub.test/en.vtt', lang: 'en' });
    expect(tracks[1]).toEqual({ id: 'sub-prefix-1', url: 'https://sub.test/hi.vtt', lang: 'hi' });
    expect(tracks[2]).toEqual({
      id: 'sub-prefix-2',
      url: 'https://sub.test/es.vtt',
      lang: 'es',
      title: 'Full Spanish',
    });
    expect(tracks[3]).toEqual({ id: 'sub-prefix-3', url: 'https://sub.test/dup.vtt', lang: 'en' });
  });

  it('normalizes various language aliases and codes', () => {
    expect(normalizeSubtitleLanguage('English')).toBe('en');
    expect(normalizeSubtitleLanguage('eng')).toBe('en');
    expect(normalizeSubtitleLanguage('en-US')).toBe('en');
    expect(normalizeSubtitleLanguage('E-Sub')).toBe('en');
    expect(normalizeSubtitleLanguage('ESub')).toBe('en');
    expect(normalizeSubtitleLanguage('Hindi')).toBe('hi');
    expect(normalizeSubtitleLanguage('Brazilian Portuguese')).toBe('pt');
    expect(normalizeSubtitleLanguage('pt-BR')).toBe('pt');
    expect(normalizeSubtitleLanguage(undefined)).toBe('unknown');
    expect(normalizeSubtitleLanguage('und')).toBe('unknown');
  });

  it('filters subtitle tracks based on mode and language selection', () => {
    const tracks: SubtitleTrack[] = [
      { url: 'https://sub.test/en.vtt', lang: 'English' },
      { url: 'https://sub.test/hi.vtt', lang: 'Hindi' },
      { url: 'https://sub.test/es.vtt', lang: 'Spanish' },
      { url: 'https://sub.test/unknown.vtt', lang: 'und' },
    ];

    // mode: all
    expect(filterSubtitleTracks(tracks, 'all', [], false)).toEqual(tracks);

    // mode: none
    expect(filterSubtitleTracks(tracks, 'none', [], false)).toBeUndefined();

    // mode: languages (en and hi only, unknown false)
    const filtered = filterSubtitleTracks(tracks, 'languages', ['en', 'hi'], false);
    expect(filtered).toHaveLength(2);
    expect(filtered?.map((t) => t.lang)).toEqual(['English', 'Hindi']);

    // mode: languages (en only, unknown true)
    const withUnknown = filterSubtitleTracks(tracks, 'languages', ['en'], true);
    expect(withUnknown).toHaveLength(2);
    expect(withUnknown?.map((t) => t.lang)).toEqual(['English', 'und']);
  });
});
