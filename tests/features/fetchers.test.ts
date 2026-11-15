import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchCodebergHead, fetchGitHubHead } from '../../src/core/updater/fetchers.js';

describe('updater fetchers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchCodebergHead', () => {
    it('resolves branch head sha via Codeberg /branches/:branch endpoint', async () => {
      const mockSha = '264ad4b096cd0f8d62b2c249dd9595e31a6f9b3b2e9e61266dea6a9db30a98e1';
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        expect(String(url)).toBe('https://codeberg.org/api/v1/repos/eclipsia/nuvio-plugin/branches/main');
        return new Response(
          JSON.stringify({
            name: 'main',
            commit: { id: mockSha },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json', etag: 'W/"test-etag"' },
          },
        );
      });

      const head = await fetchCodebergHead('eclipsia/nuvio-plugin', 'main');
      expect(head).not.toBeNull();
      expect(head?.sha).toBe(mockSha);
      expect(head?.etag).toBe('W/"test-etag"');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('falls back to /commits?sha=:branch query when /branches/:branch returns 404', async () => {
      const mockSha = 'abcdef1234567890abcdef1234567890abcdef12';
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('/branches/')) {
          return new Response('404 Not Found', { status: 404 });
        }
        if (urlStr.includes('/commits?sha=')) {
          return new Response(
            JSON.stringify([{ sha: mockSha }]),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }
        return new Response('bad request', { status: 400 });
      });

      const head = await fetchCodebergHead('eclipsia/nuvio-plugin', 'main');
      expect(head).not.toBeNull();
      expect(head?.sha).toBe(mockSha);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('returns null when both branch and commit endpoints fail', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return new Response('Internal Server Error', { status: 500 });
      });

      const head = await fetchCodebergHead('eclipsia/nuvio-plugin', 'main');
      expect(head).toBeNull();
    });

    it('returns null on malformed json or missing commit id', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return new Response('invalid json', { status: 200, headers: { 'content-type': 'application/json' } });
      });

      const head = await fetchCodebergHead('eclipsia/nuvio-plugin', 'main');
      expect(head).toBeNull();
    });

    it('returns null when fetch aborts or times out', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        throw new DOMException('The operation was aborted', 'AbortError');
      });

      const head = await fetchCodebergHead('eclipsia/nuvio-plugin', 'main');
      expect(head).toBeNull();
    });
  });

  describe('fetchGitHubHead', () => {
    it('resolves commit head sha via GitHub API', async () => {
      const mockSha = '1111222233334444555566667777888899990000';
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
        expect(String(url)).toBe('https://api.github.com/repos/test/repo/commits/main');
        const headers = init?.headers as Record<string, string>;
        expect(headers?.['authorization']).toBe('Bearer my-token');
        return new Response(
          JSON.stringify({ sha: mockSha }),
          {
            status: 200,
            headers: { 'content-type': 'application/json', etag: 'W/"gh-etag"' },
          },
        );
      });

      const head = await fetchGitHubHead('test/repo', 'main', 'my-token');
      expect(head).not.toBeNull();
      expect(head?.sha).toBe(mockSha);
      expect(head?.etag).toBe('W/"gh-etag"');
    });

    it('returns null when GitHub API fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return new Response('404', { status: 404 });
      });

      const head = await fetchGitHubHead('test/repo', 'main');
      expect(head).toBeNull();
    });
  });
});
