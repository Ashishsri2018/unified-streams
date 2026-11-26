import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_MANIFEST_PROXY_ENTRIES,
  createManifestProxyStore,
  findManifestProxyEntry,
  isPrivateHostname,
  normalizeManifestProxyMatch,
} from '../../src/core/manifestProxyConfig.js';

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-proxy-'));
  const store = createManifestProxyStore({ dataDir: dir });
  store.load();
  return {
    dir,
    store,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

describe('manifest proxy config', () => {
  it('merges built-in entries with an empty local file', () => {
    const { store, cleanup } = tempStore();
    try {
      const entries = store.getEntries();
      expect(entries.map((entry) => entry.id)).toEqual(
        DEFAULT_MANIFEST_PROXY_ENTRIES.map((entry) => entry.id),
      );
      expect(entries.every((entry) => entry.enabled)).toBe(true);
      expect(entries[0].headers.Referer).toBe('https://www.vidy.st/');
      expect(
        findManifestProxyEntry('https://MOON.goldenkite.top/master.m3u8', entries),
      ).toMatchObject({ id: 'vidy-moon' });
    } finally {
      cleanup();
    }
  });

  it('normalizes matches and rejects unsafe URLs', () => {
    expect(normalizeManifestProxyMatch('https://Example.com')).toBe('https://example.com/');
    expect(normalizeManifestProxyMatch('https://example.com/path')).toBe(
      'https://example.com/path/',
    );
    expect(() => normalizeManifestProxyMatch('http://example.com/')).toThrow(/https/);
    expect(() => normalizeManifestProxyMatch('https://user:pass@example.com/')).toThrow(
      /credentials/,
    );
    expect(() => normalizeManifestProxyMatch('https://example.com:8443/')).toThrow(/port/);
    expect(() => normalizeManifestProxyMatch('https://example.com/?a=1')).toThrow(/query/);
    expect(() => normalizeManifestProxyMatch('https://127.0.0.1/')).toThrow(/public/);
    expect(() => normalizeManifestProxyMatch('https://[::ffff:7f00:1]/')).toThrow(/public/);
    expect(() => normalizeManifestProxyMatch('https://localhost/')).toThrow(/public/);
  });

  it('flags private hosts and literals', () => {
    expect(isPrivateHostname('127.0.0.1')).toBe(true);
    expect(isPrivateHostname('10.0.0.1')).toBe(true);
    expect(isPrivateHostname('172.20.0.1')).toBe(true);
    expect(isPrivateHostname('192.168.1.1')).toBe(true);
    expect(isPrivateHostname('169.254.1.1')).toBe(true);
    expect(isPrivateHostname('[::1]')).toBe(true);
    expect(isPrivateHostname('fd00::1')).toBe(true);
    expect(isPrivateHostname('[::ffff:7f00:1]')).toBe(true);
    expect(isPrivateHostname('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateHostname('::7f00:1')).toBe(true);
    expect(isPrivateHostname('::127.0.0.1')).toBe(true);
    expect(isPrivateHostname('ff02::1')).toBe(true);
    expect(isPrivateHostname('::ffff:808:808')).toBe(false);
    expect(isPrivateHostname('printer.local')).toBe(true);
    expect(isPrivateHostname('example.com')).toBe(false);
  });

  it('adds, persists, toggles, and removes custom entries', () => {
    const { dir, store, cleanup } = tempStore();
    try {
      const entry = store.add({
        match: 'https://cdn.example.com/hls',
        headers: { Referer: 'https://example.com/' },
      });
      expect(entry.match).toBe('https://cdn.example.com/hls/');
      expect(store.getVersion()).toBe(1);
      expect(findManifestProxyEntry('https://cdn.example.com/hls/master.m3u8', store.getEntries()))
        .toMatchObject({ id: entry.id });

      const reloaded = createManifestProxyStore({ dataDir: dir });
      reloaded.load();
      expect(reloaded.getVersion()).toBe(1);
      expect(reloaded.getEntries().some((item) => item.id === entry.id)).toBe(true);

      store.toggle(entry.id, false);
      expect(store.getVersion()).toBe(2);
      expect(
        findManifestProxyEntry('https://cdn.example.com/hls/master.m3u8', store.getEntries()),
      ).toBeNull();

      store.remove(entry.id);
      expect(store.getVersion()).toBe(3);
      expect(store.getEntries().some((item) => item.id === entry.id)).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('disables a built-in entry instead of deleting it', () => {
    const { store, cleanup } = tempStore();
    try {
      const removed = store.remove('vidy-moon');
      expect(removed).toMatchObject({ id: 'vidy-moon', enabled: false });
      expect(
        findManifestProxyEntry('https://moon.goldenkite.top/master.m3u8', store.getEntries()),
      ).toBeNull();

      store.toggle('vidy-moon', true);
      expect(
        findManifestProxyEntry('https://moon.goldenkite.top/master.m3u8', store.getEntries()),
      ).toMatchObject({ id: 'vidy-moon' });
    } finally {
      cleanup();
    }
  });

  it('rejects duplicate matches and unsafe headers', () => {
    const { store, cleanup } = tempStore();
    try {
      expect(() => store.add({ match: 'https://moon.goldenkite.top/' })).toThrow(/already exists/);
      expect(() =>
        store.add({
          match: 'https://cdn.example.com/',
          headers: { Host: 'evil.example' },
        }),
      ).toThrow(/not allowed/);
      expect(() =>
        store.add({
          match: 'https://cdn.example.com/',
          headers: { Referer: 'https://example.com/\r\nX: y' },
        }),
      ).toThrow(/invalid characters/);
    } finally {
      cleanup();
    }
  });

  it('uses the longest matching enabled prefix', () => {
    const { store, cleanup } = tempStore();
    try {
      const broad = store.add({ match: 'https://cdn.example.com/' });
      const narrow = store.add({ match: 'https://cdn.example.com/private/' });
      expect(
        findManifestProxyEntry('https://cdn.example.com/private/a.m3u8', store.getEntries())?.id,
      ).toBe(narrow.id);
      expect(
        findManifestProxyEntry('https://cdn.example.com/public/a.m3u8', store.getEntries())?.id,
      ).toBe(broad.id);
      store.toggle(narrow.id, false);
      expect(
        findManifestProxyEntry('https://cdn.example.com/private/a.m3u8', store.getEntries())?.id,
      ).toBe(broad.id);
    } finally {
      cleanup();
    }
  });

  it('ignores corrupt local files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-proxy-'));
    try {
      fs.writeFileSync(path.join(dir, 'manifest-proxy.json'), '{not json');
      const warnings: string[] = [];
      const store = createManifestProxyStore({
        dataDir: dir,
        onWarning: (message) => warnings.push(message),
      });
      store.load();
      expect(store.getVersion()).toBe(0);
      expect(store.getEntries()).toHaveLength(DEFAULT_MANIFEST_PROXY_ENTRIES.length);
      expect(warnings[0]).toContain('manifest proxy config ignored');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
