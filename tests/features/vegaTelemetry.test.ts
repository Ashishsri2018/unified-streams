import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/fleets/vega/config.js';
import { StreamPipeline } from '../../src/fleets/vega/pipeline/streamHandler.js';
import type {
  CinemetaApi,
  LoggerLike,
  ProviderBundle,
  ProviderContextLike,
  ProviderRegistryApi,
  ProviderSnapshot,
} from '../../src/fleets/vega/types.js';

function logger(): LoggerLike {
  const value: LoggerLike = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child: () => value,
  };
  return value;
}

describe('vega provider telemetry', () => {
  it('records deadline-truncated providers as skipped, not empty', async () => {
    const config = loadConfig({
      PORT: '7003',
      DATA_DIR: '/tmp/vega-telemetry-test',
      UPDATE_ON_START: 'false',
      GLOBAL_DEADLINE_MS: '2000',
      SEARCH_TIMEOUT_MS: '10000',
      SETTLE_MS: '0',
      EMPTY_FENCE_MS: '0',
      STREAM_CACHE_TTL_MS: '0',
      PROVIDER_CACHE_TTL_MS: '1000',
    });

    const bundle: ProviderBundle = {
      entry: {
        display_name: 'Slow Provider',
        value: 'slow',
        version: '1.0.0',
        disabled: false,
      },
      dir: '/tmp/vega-telemetry-test/slow',
      modules: {
        posts: {
          getSearchPosts: () => new Promise(() => {}),
        },
        meta: {
          getMeta: () => ({}),
        },
        stream: {
          getStreams: () => [],
        },
      },
    };

    const snapshot: ProviderSnapshot = {
      sha: 'test',
      rootDir: '/tmp/vega-telemetry-test',
      urls: {},
      bundles: new Map([['slow', bundle]]),
      createdAt: Date.now(),
    };

    const registry: ProviderRegistryApi = {
      context: {} as ProviderContextLike,
      listProviders: () => [bundle],
      getActiveSnapshot: () => snapshot,
      acquire: () => ({ snapshot, release: () => {} }),
      onActivate: () => () => {},
    };

    const cinemeta: CinemetaApi = {
      getMeta: async () => ({
        id: 'tt1234567',
        type: 'movie',
        name: 'Test Movie',
        year: '2020',
      }),
    };

    const pipeline = new StreamPipeline({
      config,
      logger: logger(),
      registry,
      cinemeta,
    });

    await pipeline.handle({ type: 'movie', imdbId: 'tt1234567' });
    await new Promise((resolve) => setTimeout(resolve, 200));

    const stat = pipeline
      .getMetrics()
      .providerStats.find((entry) => entry.id === 'slow');

    expect(stat).toBeDefined();
    expect(stat?.skipped).toBe(1);
    expect(stat?.calls).toBe(0);
    expect(stat?.empty).toBe(0);
    expect(stat?.errors).toBe(0);
    expect(stat?.timeouts).toBe(0);

    pipeline.dispose();
  }, 10000);

  it('treats providers that resolve no streams as empty, not errors', async () => {
    const config = loadConfig({
      PORT: '7003',
      DATA_DIR: '/tmp/vega-telemetry-test',
      UPDATE_ON_START: 'false',
      GLOBAL_DEADLINE_MS: '2000',
      SEARCH_TIMEOUT_MS: '10000',
      SETTLE_MS: '0',
      EMPTY_FENCE_MS: '0',
      STREAM_CACHE_TTL_MS: '0',
      PROVIDER_CACHE_TTL_MS: '1000',
    });

    const bundle: ProviderBundle = {
      entry: {
        display_name: 'Empty Provider',
        value: 'empty-provider',
        version: '1.0.0',
        disabled: false,
      },
      dir: '/tmp/vega-telemetry-test/empty-provider',
      modules: {
        posts: {
          getSearchPosts: async () => [
            { title: 'Test Movie', link: 'https://example.test/movie' },
          ],
        },
        meta: {
          getMeta: async () => ({
            imdbId: 'tt1234567',
            type: 'movie',
            title: 'Test Movie',
            year: '2020',
            linkList: [
              {
                directLinks: [
                  { link: 'https://example.test/1.mp4', type: 'movie' },
                ],
              },
            ],
          }),
        },
        stream: {
          getStreams: async () => [],
        },
      },
    };

    const snapshot: ProviderSnapshot = {
      sha: 'test',
      rootDir: '/tmp/vega-telemetry-test',
      urls: {},
      bundles: new Map([['empty-provider', bundle]]),
      createdAt: Date.now(),
    };

    const registry: ProviderRegistryApi = {
      context: {} as ProviderContextLike,
      listProviders: () => [bundle],
      getActiveSnapshot: () => snapshot,
      acquire: () => ({ snapshot, release: () => {} }),
      onActivate: () => () => {},
    };

    const cinemeta: CinemetaApi = {
      getMeta: async () => ({
        id: 'tt1234567',
        type: 'movie',
        name: 'Test Movie',
        year: '2020',
      }),
    };

    const pipeline = new StreamPipeline({
      config,
      logger: logger(),
      registry,
      cinemeta,
    });

    await pipeline.handle({ type: 'movie', imdbId: 'tt1234567' });

    const stat = pipeline
      .getMetrics()
      .providerStats?.find((entry) => entry.id === 'empty-provider');

    expect(stat).toBeDefined();
    expect(stat?.state).toBe('closed');
    expect(stat?.calls).toBe(1);
    expect(stat?.ok).toBe(1);
    expect(stat?.empty).toBe(1);
    expect(stat?.errors).toBe(0);
    expect(stat?.timeouts).toBe(0);
    expect(stat?.successRate).toBe(1);
    expect(stat?.lastError).toBeNull();

    pipeline.dispose();
  }, 10000);
});
