import { describe, expect, it, vi } from 'vitest';
import { ProviderRegistry } from '../../src/fleets/vega/providers/registry.js';
import { ProviderSelectionController } from '../../src/fleets/vega/providers/selection.js';
import type { AppConfig } from '../../src/fleets/vega/config.js';
import type {
  LoggerLike,
  ProviderContextLike,
  ProviderSnapshot,
  UpstreamProviderEntry,
} from '../../src/fleets/vega/types.js';

const logger: LoggerLike = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => logger,
};

function entry(value: string, version: string): UpstreamProviderEntry {
  return {
    display_name: value,
    value,
    version,
    disabled: false,
  };
}

function snapshot(sha: string, entries: UpstreamProviderEntry[]): ProviderSnapshot {
  return {
    sha,
    rootDir: `/tmp/${sha}`,
    urls: {},
    bundles: new Map(),
    entries,
    createdAt: 1,
  };
}

function controllerConfig(): AppConfig {
  return {
    enabledProviders: [],
    disabledProviders: [],
    runtimeOverrides: {},
    selectionVersion: 0,
  } as unknown as AppConfig;
}

describe('Vega provider change badges', () => {
  it('reports changes and keeps them across selection snapshot copies', async () => {
    const registry = new ProviderRegistry({
      context: {} as ProviderContextLike,
      logger,
    });
    const controller = new ProviderSelectionController(controllerConfig(), logger);

    const baseline = snapshot('a', [entry('alpha', '1.0.0'), entry('beta', '2.0.0')]);
    registry.activate(baseline);
    expect(controller.getCatalog(baseline).providers.every((provider) => !provider.isNew && !provider.updated)).toBe(true);

    const next = snapshot('b', [
      entry('alpha', '1.1.0'),
      entry('beta', '2.0.0'),
      entry('gamma', '3.0.0'),
    ]);
    registry.activate(next);
    const changed = controller.getCatalog(next);
    const byId = Object.fromEntries(changed.providers.map((provider) => [provider.id, provider]));

    expect(byId.alpha).toMatchObject({
      version: '1.1.0',
      isNew: false,
      updated: true,
      previousVersion: '1.0.0',
    });
    expect(byId.beta).toMatchObject({
      version: '2.0.0',
      isNew: false,
      updated: false,
      previousVersion: null,
    });
    expect(byId.gamma).toMatchObject({
      version: '3.0.0',
      isNew: true,
      updated: false,
      previousVersion: null,
    });

    const selectionCopy = { ...next, createdAt: 2 };
    registry.activate(selectionCopy);
    const afterSelection = Object.fromEntries(
      controller.getCatalog(selectionCopy).providers.map((provider) => [provider.id, provider]),
    );
    expect(afterSelection.alpha).toMatchObject({ updated: true, previousVersion: '1.0.0' });
    expect(afterSelection.gamma).toMatchObject({ isNew: true });

    await registry.dispose();
  });
});
