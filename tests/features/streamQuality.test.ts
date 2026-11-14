import { describe, it, expect } from 'vitest';
import {
  inferResolution,
  inferQuality,
  inferQualityRank,
  getContainerRank,
  parseSizeBytes,
  inferSizeBytes,
  inferFileSizeBytes,
} from '../../src/core/streamQuality.js';

describe('streamQuality core module', () => {
  describe('inferResolution & inferQuality', () => {
    it('infers resolutions from various text labels and formats', () => {
      expect(inferResolution('Movie 2160p UHD HDR')).toBe(2160);
      expect(inferResolution({ quality: '4K' })).toBe(2160);
      expect(inferResolution({ title: 'Show S01E01 1440p QHD' })).toBe(1440);
      expect(inferResolution({ description: 'FHD 1080p stream' })).toBe(1080);
      expect(inferResolution({ name: 'Fast 720p HD' })).toBe(720);
      expect(inferResolution({ behaviorHints: { bingeGroup: '576p' } })).toBe(576);
      expect(inferResolution({ url: 'https://stream.test/video-480p.mp4' })).toBe(480);
      expect(inferResolution({ title: '360p mobile' })).toBe(360);
      expect(inferResolution({ quality: '8k' })).toBe(4320);
      expect(inferResolution('Random title with no resolution')).toBeNull();
      expect(inferQuality('Random title with no resolution')).toBe(0);
      expect(inferQuality('Movie 1080p')).toBe(1080);
    });
  });

  describe('inferQualityRank', () => {
    it('ranks quality correctly from highest to lowest', () => {
      expect(inferQualityRank('Movie 4K UHD')).toBe(0);
      expect(inferQualityRank('Movie 1080p')).toBe(1);
      expect(inferQualityRank('Movie 720p')).toBe(2);
      expect(inferQualityRank('Movie 480p')).toBe(3);
      expect(inferQualityRank('Unknown release')).toBe(4);
      expect(inferQualityRank('Movie 1080p CAM')).toBe(5);
      expect(inferQualityRank('Telesync TS rip')).toBe(5);
    });
  });

  describe('getContainerRank', () => {
    it('ranks direct video files above playlists and unknown formats', () => {
      expect(getContainerRank('https://cdn.test/video.mp4')).toBe(0);
      expect(getContainerRank('https://cdn.test/movie.mkv?token=123')).toBe(0);
      expect(getContainerRank('https://cdn.test/clip.webm#frag')).toBe(0);
      expect(getContainerRank('https://cdn.test/stream/master.m3u8')).toBe(2);
      expect(getContainerRank('https://cdn.test/live/manifest.mpd')).toBe(2);
      expect(getContainerRank('https://cdn.test/direct-stream')).toBe(1);
      expect(getContainerRank(undefined)).toBe(3);
      expect(getContainerRank('')).toBe(3);
    });
  });

  describe('parseSizeBytes & inferSizeBytes', () => {
    it('parses sizes with metric and binary units, dots and commas', () => {
      expect(parseSizeBytes('File size: 2.5 GB')).toBe(Math.round(2.5 * 1024 ** 3));
      expect(parseSizeBytes('Size: 1,5 GiB')).toBe(Math.round(1.5 * 1024 ** 3));
      expect(parseSizeBytes('Download: 750 MB')).toBe(750 * 1024 ** 2);
      expect(parseSizeBytes('Short clip 20.4 MiB')).toBe(Math.round(20.4 * 1024 ** 2));
      expect(parseSizeBytes('Huge file 1.2 TB')).toBe(Math.round(1.2 * 1024 ** 4));
      expect(parseSizeBytes('Tiny payload 500 KB')).toBe(500 * 1024);
      expect(parseSizeBytes('No size present')).toBeNull();
      expect(inferFileSizeBytes({ title: 'No size' })).toBe(0);
    });

    it('infers size from stream object properties', () => {
      expect(inferSizeBytes({ size: 1234567 })).toBe(1234567);
      expect(inferSizeBytes({ size: '1.2 GB' })).toBe(Math.round(1.2 * 1024 ** 3));
      expect(inferSizeBytes({ title: 'Movie 1080p [3.2 GB]' })).toBe(Math.round(3.2 * 1024 ** 3));
      expect(inferSizeBytes({ description: 'Size: 800 MB' })).toBe(800 * 1024 ** 2);
      expect(inferSizeBytes({})).toBeNull();
    });
  });
});
