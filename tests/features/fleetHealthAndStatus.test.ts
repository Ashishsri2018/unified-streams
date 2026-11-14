import { describe, it, expect, vi } from 'vitest';
import { parseNuvioManifest, normalizeScraperFilename } from '../../src/fleets/nuvio/nuvio/manifest.js';
import { SnapshotManager } from '../../src/fleets/nuvio/nuvio/snapshot.js';
import { aggregateFleetProviders } from '../../src/addon/health.js';
import type { WorkerHealth } from '../../src/core/telemetry.js';

describe('fleet health and manifest normalization', () => {
  describe('normalizeScraperFilename', () => {
    it('accepts standard relative provider path', () => {
      expect(normalizeScraperFilename('providers/esvyl.js')).toBe('providers/esvyl.js');
    });

    it('normalizes full Codeberg page URLs to relative provider path', () => {
      expect(
        normalizeScraperFilename('https://eclipsia.codeberg.page/nuvio-plugin/providers/brellor.js'),
      ).toBe('providers/brellor.js');
    });

    it('rejects unsafe or invalid filenames', () => {
      expect(normalizeScraperFilename('http://evil.com/malicious.exe')).toBeNull();
      expect(normalizeScraperFilename('providers/../../etc/passwd')).toBeNull();
      expect(normalizeScraperFilename('')).toBeNull();
    });
  });

  describe('parseNuvioManifest with remote URL filenames', () => {
    it('parses manifest containing full URL filenames correctly', () => {
      const manifestJson = JSON.stringify({
        name: 'Eclipsia',
        version: '12.5.0',
        scrapers: [
          {
            id: 'brellor',
            name: 'Brellor.',
            description: 'Classic/Vintage',
            version: '1.1.0',
            author: 'Eclipsia',
            supportedTypes: ['movie', 'tv'],
            filename: 'https://eclipsia.codeberg.page/nuvio-plugin/providers/brellor.js',
            enabled: true,
          },
          {
            id: 'esvyl',
            name: 'Esvyl.',
            description: 'VidBolt',
            version: '1.0.0',
            author: 'Eclipsia',
            supportedTypes: ['series'],
            filename: 'providers/esvyl.js',
            enabled: true,
          },
        ],
      });

      const parsed = parseNuvioManifest(Buffer.from(manifestJson, 'utf8'));
      expect(parsed.scrapers).toHaveLength(2);
      expect(parsed.scrapers[0].id).toBe('brellor');
      expect(parsed.scrapers[0].filename).toBe('providers/brellor.js');
      expect(parsed.scrapers[1].id).toBe('esvyl');
      expect(parsed.scrapers[1].filename).toBe('providers/esvyl.js');
    });
  });

  describe('Nuvio SnapshotManager.ensure stale-while-revalidate', () => {
    it('returns existing snapshot immediately without blocking on network when stale', async () => {
      const mockConfig = {
        updateIntervalHours: 20,
        downloadConcurrency: 2,
        pinnedSha: null,
      } as any;

      const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      };

      const mockClient = {
        resolveHead: vi.fn().mockRejectedValue(new Error('Network should not be called synchronously')),
        fetchFile: vi.fn(),
      } as any;

      const manager = new SnapshotManager(mockConfig, mockLogger, mockClient);

      // Preload an active snapshot with a timestamp older than 20 hours
      const oldTimestamp = Date.now() - 25 * 3600 * 1000;
      const existingSnapshot = {
        sha: 'test-sha',
        fetchedAt: oldTimestamp,
        scrapers: [{ entry: { id: 'test-scraper' } }],
      } as any;

      (manager as any).snapshot = existingSnapshot;

      // ensure() should return existingSnapshot immediately without throwing or blocking
      const result = await manager.ensure();
      expect(result).toBe(existingSnapshot);
      expect(mockClient.resolveHead).not.toHaveBeenCalled();
    });
  });

  describe('aggregateFleetProviders status reflection', () => {
    it('marks fleet as working (ok) when healthy with active providers and no updater errors', () => {
      const fleets: Record<string, WorkerHealth | { error: string }> = {
        nuvio: {
          fleet: 'nuvio',
          ok: true,
          status: 'ok',
          startedAt: new Date().toISOString(),
          uptimeSec: 100,
          snapshot: { sha: 'abc', fetchedAt: new Date().toISOString(), ageMs: 1000, refreshing: false, lastError: null },
          providers: { total: 44, circuits: { open: 0, halfOpen: 0 }, stats: [] },
          metrics: { requests: 10, cacheHits: 0, cacheMisses: 10, emptyResults: 0, deadlineHits: 0, settleHits: 0, providerFailures: 0 },
        },
      };

      const result = aggregateFleetProviders(fleets, Date.now(), { nuvio: 5 }, {
        nuvio: { sha: 'abc', fetchedAt: new Date().toISOString(), ageMs: 1000, refreshing: false, lastError: null },
      });

      expect(result.components).toHaveLength(1);
      const nuvioComp = result.components[0];
      expect(nuvioComp.name).toBe('nuvio');
      expect((nuvioComp as any).status).toBe('ok');
      expect(nuvioComp.latencyMs).toBe(5);
      expect(nuvioComp.error).toBeUndefined();
    });

    it('marks fleet as degraded when its updater or snapshot has failed', () => {
      const fleets: Record<string, WorkerHealth | { error: string }> = {
        nuvio: {
          fleet: 'nuvio',
          ok: true,
          status: 'ok',
          startedAt: new Date().toISOString(),
          uptimeSec: 100,
          snapshot: { sha: 'abc', fetchedAt: new Date().toISOString(), ageMs: 1000, refreshing: false, lastError: null },
          providers: { total: 44, circuits: { open: 0, halfOpen: 0 }, stats: [] },
          metrics: { requests: 10, cacheHits: 0, cacheMisses: 10, emptyResults: 0, deadlineHits: 0, settleHits: 0, providerFailures: 0 },
        },
      };

      const result = aggregateFleetProviders(fleets, Date.now(), { nuvio: 5 }, {
        nuvio: { sha: null, fetchedAt: null, ageMs: null, refreshing: false, lastError: 'Remote head fetch failed' },
      });

      expect(result.components).toHaveLength(1);
      const nuvioComp = result.components[0];
      expect((nuvioComp as any).status).toBe('degraded');
      expect(nuvioComp.error).toContain('Remote head fetch failed');
    });

    it('marks fleet as error when unreachable or 0 providers available', () => {
      const fleets: Record<string, WorkerHealth | { error: string }> = {
        sa7: { error: 'ECONNREFUSED 127.0.0.1:7001' },
      };

      const result = aggregateFleetProviders(fleets, Date.now());
      expect(result.components).toHaveLength(1);
      const sa7Comp = result.components[0];
      expect((sa7Comp as any).status).toBe('error');
      expect(sa7Comp.ok).toBe(false);
      expect(sa7Comp.error).toContain('ECONNREFUSED');
    });
  });
});
