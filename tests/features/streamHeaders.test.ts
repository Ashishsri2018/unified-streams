import { describe, it, expect } from 'vitest';
import {
  sanitizeProxyHeaders,
  isPlaceholderHost,
  parseHttpUrl,
} from '../../src/core/streamHeaders.js';

describe('streamHeaders core module', () => {
  describe('sanitizeProxyHeaders', () => {
    it('strips hop-by-hop and proxy-* headers', () => {
      const input = {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://stream.provider.to/',
        'Connection': 'keep-alive',
        'Keep-Alive': 'timeout=5',
        'Host': 'stream.provider.to',
        'Transfer-Encoding': 'chunked',
        'Upgrade': 'websocket',
        'Proxy-Authorization': 'Basic dXNlcjpwYXNz',
        'proxy-connection': 'keep-alive',
        'Content-Length': '1024',
      };

      const sanitized = sanitizeProxyHeaders(input);
      expect(sanitized).toEqual({
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://stream.provider.to/',
      });
    });

    it('rejects CRLF injection and invalid header names', () => {
      const input = {
        'Valid-Header': 'Normal Value',
        'Injected\r\nHeader': 'Bad',
        'Invalid Name': 'Bad',
        'Evil': 'Value\r\nInjected: true',
        'Empty': '',
      };

      const sanitized = sanitizeProxyHeaders(input);
      expect(sanitized).toEqual({
        'Valid-Header': 'Normal Value',
      });
    });

    it('handles non-record or null inputs safely', () => {
      expect(sanitizeProxyHeaders(null)).toEqual({});
      expect(sanitizeProxyHeaders(undefined)).toEqual({});
      expect(sanitizeProxyHeaders('not-an-object')).toEqual({});
      expect(sanitizeProxyHeaders([1, 2, 3])).toEqual({});
    });
  });

  describe('isPlaceholderHost', () => {
    it('identifies placeholder and loopback hostnames', () => {
      expect(isPlaceholderHost('example.com')).toBe(true);
      expect(isPlaceholderHost('sub.example.com')).toBe(true);
      expect(isPlaceholderHost('test.example.org')).toBe(true);
      expect(isPlaceholderHost('localhost')).toBe(true);
      expect(isPlaceholderHost('127.0.0.1')).toBe(true);
      expect(isPlaceholderHost('0.0.0.0')).toBe(true);
      expect(isPlaceholderHost('[::1]')).toBe(true);
      expect(isPlaceholderHost('realstream.com')).toBe(false);
      expect(isPlaceholderHost('cdn.megaplay.buzz')).toBe(false);
      expect(isPlaceholderHost('')).toBe(true);
    });
  });

  describe('parseHttpUrl', () => {
    it('parses valid HTTP/HTTPS URLs', () => {
      const http = parseHttpUrl('http://example.com/stream.m3u8');
      expect(http?.hostname).toBe('example.com');
      expect(http?.pathname).toBe('/stream.m3u8');

      const https = parseHttpUrl('https://secure.net/video.mp4?k=1');
      expect(https?.hostname).toBe('secure.net');
      expect(https?.protocol).toBe('https:');
    });

    it('rejects non-HTTP protocols and malformed URLs', () => {
      expect(parseHttpUrl('ftp://example.com/file')).toBeNull();
      expect(parseHttpUrl('magnet:?xt=urn:btih:123')).toBeNull();
      expect(parseHttpUrl('not a url')).toBeNull();
      expect(parseHttpUrl('')).toBeNull();
    });
  });
});
