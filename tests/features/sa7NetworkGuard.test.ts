import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { assertSafeSa7Response, MAX_SAFE_RESPONSE_BYTES } = require(
  '../../src/fleets/sa7/lib/tracker.js',
);

function response(url: string, headers: Record<string, string>) {
  return { headers: new Headers(headers), url };
}

describe('SA7 response guard', () => {
  it('blocks media downloads advertised with a huge content-length', () => {
    const url = 'https://hubcloud.mov/drive/t3dl.php?id=h1atrhmmprbntnt';
    expect(() =>
      assertSafeSa7Response(
        url,
        response(url, {
          'content-type': 'text/html; charset=UTF-8',
          'content-length': '2427569820',
        }),
      ),
    ).toThrow(/blocked oversized response/);
  });

  it('blocks binary content types even without a content-length', () => {
    const url = 'https://hubcloud.mov/drive/t3dl.php?id=h1atrhmmprbntnt';
    expect(() =>
      assertSafeSa7Response(
        url,
        response(url, { 'content-type': 'application/octet-stream' }),
      ),
    ).toThrow(/blocked binary response/);
  });

  it('blocks media files by final redirect URL', () => {
    const url = 'https://hubcloud.mov/drive/t3dl.php?id=h1atrhmmprbntnt';
    const finalUrl =
      'https://t3oc.example.r2.cloudflarestorage.com/Steps.2026.1080p.WEB-DL.mkv?sig=1';
    expect(() =>
      assertSafeSa7Response(
        url,
        response(finalUrl, { 'content-type': 'text/plain; charset=UTF-8' }),
      ),
    ).toThrow(/blocked media\/archive response/);
  });

  it('allows ordinary HTML and JSON pages', () => {
    const html = 'https://new15.hdhub4u.cl/steps-2026-webrip-hindi-full-movie/';
    expect(() =>
      assertSafeSa7Response(
        html,
        response(html, {
          'content-type': 'text/html; charset=utf-8',
          'content-length': '240000',
        }),
      ),
    ).not.toThrow();

    const json = 'https://api.example.com/search?q=steps';
    expect(() =>
      assertSafeSa7Response(
        json,
        response(json, {
          'content-type': 'application/json',
          'content-length': '1200',
        }),
      ),
    ).not.toThrow();
  });

  it('allows HLS playlist text responses', () => {
    const url = 'https://cdn.example.com/master.m3u8';
    expect(() =>
      assertSafeSa7Response(
        url,
        response(url, {
          'content-type': 'application/vnd.apple.mpegurl',
          'content-length': '800',
        }),
      ),
    ).not.toThrow();
  });

  it('uses a 16 MiB safety ceiling', () => {
    expect(MAX_SAFE_RESPONSE_BYTES).toBe(16 * 1024 * 1024);
  });
});
