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

    // Known embed domains with /e/ or /v/ paths are externalUrl
    expect(isWebPage('https://streamtape.com/e/6879879')).toBe(true);
    expect(isExternalUrl('https://streamtape.com/e/6879879')).toBe(true);

    // Streamtape /get_video is a direct download endpoint (redirects to video)
    const streamtapeDirect =
      'https://streamtape.com/get_video?id=A3L8K9MYvptX8Ve&expires=1795087142&ip=FHEsDRWnDS9X&token=c360AKsODOGJ';
    expect(isDirectMediaUrl(streamtapeDirect)).toBe(true);
    expect(isWebPage(streamtapeDirect)).toBe(false);
    expect(isExternalUrl(streamtapeDirect)).toBe(false);
    expect(isWebPage('https://doodstream.com/e/12345')).toBe(true);
    expect(isExternalUrl('https://doodstream.com/e/12345')).toBe(true);
    expect(isWebPage('https://mixdrop.co/e/abcdef')).toBe(true);
    expect(isExternalUrl('https://mixdrop.co/e/abcdef')).toBe(true);
    expect(isWebPage('https://filelions.to/v/98765')).toBe(true);
    expect(isExternalUrl('https://filelions.to/v/98765')).toBe(true);
  });

  it('keeps extensionless CDN and streaming paths in url, NOT externalUrl', () => {
    const satellaUrl =
      'https://media.satella.buzz/e/aw7-LEwFQNvJKVTJ.MBGfIQpPPdAzj3rpKu8UREMpS3HOny78CIE8Cd4Yun-ONQ2mvFPLOHtRW6fr3Nm0z_cksxZ8lHI_zYuqR_aqNWDHmBqzKWcy-WVbMSOtc45fD0KeYTUjhrD3XTyfk1TqbjcK1TmCs8UE2mj5OT5jNkoZA4c6Vsxs3Bswl-1Ej__iqWvvDsS0Y_vbRYQAM5NVWJTPpiHKSpbvSZ8RkXrbD4WJqF66_Xl9PIeKl1_yPyhoJe5VduIhqqARcuOz6rokvAyMj3PIwRNJDUsQt57Jjr0qYzoAJwdPsfiQPhoCmw';

    expect(isArchiveUrl(satellaUrl)).toBe(false);
    expect(isWebPage(satellaUrl)).toBe(false);
    expect(isExternalUrl(satellaUrl)).toBe(false);

    // Other arbitrary CDN extensionless stream endpoints
    const cdnUrl1 = 'https://cdn.example.com/v/987654321';
    const cdnUrl2 = 'https://media.stream.io/stream/live-playback-token';
    const cdnUrl3 = 'https://dash-hls-bridge.johndoesemc.workers.dev/?url=https%3A%2F%2Fsacdn.hakunaymatata.com%2Fdash%2Fmaster.m3u8';
    const cdnUrl4 = 'https://fast-edge.org/playback/asset-uuid-12345';

    expect(isWebPage(cdnUrl1)).toBe(false);
    expect(isExternalUrl(cdnUrl1)).toBe(false);
    expect(isWebPage(cdnUrl2)).toBe(false);
    expect(isExternalUrl(cdnUrl2)).toBe(false);
    expect(isWebPage(cdnUrl3)).toBe(false);
    expect(isExternalUrl(cdnUrl3)).toBe(false);
    expect(isWebPage(cdnUrl4)).toBe(false);
    expect(isExternalUrl(cdnUrl4)).toBe(false);

    // Merging extensionless streams keeps them in url without 🖥️ prefix
    const inputs: FleetStreamsInput[] = [
      {
        fleet: 'nuvio',
        streams: [
          {
            name: 'Satella Stream',
            title: '1080p MP4',
            url: satellaUrl,
          },
          {
            name: 'Edge Stream',
            title: '720p CDN',
            url: cdnUrl1,
          },
        ],
      },
    ];

    const merged = mergeAndFilterStreams(inputs, defaultFilters, 10);
    expect(merged).toHaveLength(2);
    expect(merged[0].url).toBe(satellaUrl);
    expect(merged[0].externalUrl).toBeUndefined();
    expect(merged[0].title).toBe('1080p MP4');
    expect(merged[0].title.startsWith('🖥️')).toBe(false);

    expect(merged[1].url).toBe(cdnUrl1);
    expect(merged[1].externalUrl).toBeUndefined();
    expect(merged[1].title).toBe('720p CDN');
    expect(merged[1].title.startsWith('🖥️')).toBe(false);
  });

  it('keeps direct proxy stream endpoints in url, even on known embed domains', () => {
    const vidboltProxyUrl =
      'https://proxy.vidbolt.xyz/f/x_D5ryyq2yiLY1bXEXfM07X9AoZkk_EwzIwtPvM5A5THNM-UjBSTa1z-RKTN7C3yfbfe4g2bKYjgeJQvAnmEFnATjrHySOmnu6hrWXJncxcKIH10vjzFq8xO1QxUr4nSq7k0q_Oa315fGF6qd8tskeSAadtg-EE6O0pLzAJCKsJg4fBVUfgQAk2MP0S-skSYjA';

    expect(isDirectMediaUrl(vidboltProxyUrl)).toBe(false);
    expect(isWebPage(vidboltProxyUrl)).toBe(false);
    expect(isExternalUrl(vidboltProxyUrl)).toBe(false);

    const inputs: FleetStreamsInput[] = [
      {
        fleet: 'nuvio',
        streams: [
          {
            name: 'VidBolt',
            title: '1080p Proxy',
            quality: '1080p',
            url: vidboltProxyUrl,
          },
        ],
      },
    ];

    const merged = mergeAndFilterStreams(inputs, defaultFilters, 10);
    expect(merged).toHaveLength(1);
    expect(merged[0].url).toBe(vidboltProxyUrl);
    expect(merged[0].externalUrl).toBeUndefined();
    expect(merged[0].title).toBe('1080p Proxy');
    expect(merged[0].title.startsWith('🖥️')).toBe(false);
  });

  it('recognizes 3gp and other media extensions as direct media in url', () => {
    const mediaUrls = [
      'https://example.com/video.3gp',
      'https://example.com/video.3g2',
      'https://example.com/video.ogv',
      'https://example.com/video.ogg',
      'https://example.com/video.wmv',
      'https://example.com/video.asf',
      'https://example.com/video.mpg',
      'https://example.com/video.mpeg',
      'https://example.com/video.m2ts',
      'https://example.com/video.vob',
      'https://example.com/audio.mp3',
      'https://example.com/audio.aac',
      'https://example.com/audio.flac',
      'https://example.com/audio.wav',
      'https://example.com/audio.m4a',
      'https://example.com/audio.opus',
      'https://example.com/video.3gp?token=secret#t=30',
    ];

    for (const url of mediaUrls) {
      expect(isDirectMediaUrl(url)).toBe(true);
      expect(isWebPage(url)).toBe(false);
      expect(isExternalUrl(url)).toBe(false);
      expect(isArchiveUrl(url)).toBe(false);
    }

    const inputs: FleetStreamsInput[] = [
      {
        fleet: 'vega',
        streams: [
          {
            name: 'Vega Mobile',
            title: 'Mobile 3GP Stream',
            url: 'https://example.com/video.3gp',
          },
        ],
      },
    ];

    const merged = mergeAndFilterStreams(inputs, defaultFilters, 10);
    expect(merged).toHaveLength(1);
    expect(merged[0].url).toBe('https://example.com/video.3gp');
    expect(merged[0].externalUrl).toBeUndefined();
    expect(merged[0].title).toBe('Mobile 3GP Stream');
    expect(merged[0].title.startsWith('🖥️')).toBe(false);
  });

  it('detects blockers and archives accurately including zip, rar, 7z, tar, tgz, etc.', () => {
    expect(isBlockerUrl('https://stream.net/slowdown')).toBe(true);
    expect(isBlockerUrl('https://stream.net/ratelimit')).toBe(true);
    expect(isBlockerUrl('https://stream.net/antibot')).toBe(true);
    expect(isBlockerUrl('https://stream.net/video.mp4')).toBe(false);
    expect(isBlockerUrl('https://stream.net/video.3gp')).toBe(false);

    const archiveUrls = [
      'https://storage.net/pack.zip',
      'https://storage.net/pack.rar',
      'https://storage.net/pack.7z',
      'https://storage.net/pack.iso',
      'https://storage.net/pack.tar',
      'https://storage.net/pack.tar.gz',
      'https://storage.net/pack.tgz',
      'https://storage.net/pack.bz2',
      'https://storage.net/pack.tbz2',
      'https://storage.net/pack.xz',
      'https://storage.net/pack.zst',
      'https://storage.net/pack.zip?auth=token#frag',
    ];

    for (const url of archiveUrls) {
      expect(isArchiveUrl(url)).toBe(true);
      expect(isExternalUrl(url)).toBe(true);
    }

    expect(isArchiveUrl('https://storage.net/video.mp4')).toBe(false);
    expect(isArchiveUrl('https://storage.net/video.3gp')).toBe(false);

    // Merging archives places them into externalUrl with 🔲 and 🖥️
    const inputs: FleetStreamsInput[] = [
      {
        fleet: 'sa7',
        streams: [
          {
            name: 'SA7 Pack',
            title: 'Season 1 Zip',
            url: 'https://storage.net/season1.zip',
          },
        ],
      },
    ];

    const merged = mergeAndFilterStreams(inputs, defaultFilters, 10);
    expect(merged).toHaveLength(1);
    expect(merged[0].externalUrl).toBe('https://storage.net/season1.zip');
    expect(merged[0].url).toBeUndefined();
    expect(merged[0].name).toBe('🔲 SA7 Pack');
    expect(merged[0].title).toBe('🖥️ Season 1 Zip');
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
