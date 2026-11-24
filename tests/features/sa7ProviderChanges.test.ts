import { afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const config = require('../../src/fleets/sa7/config.js');
const providers = require('../../src/fleets/sa7/providers.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sa7-changes-'));

function writeSnapshot(entries: Array<{ id: string; version: string }>): void {
  const providersDir = path.join(root, 'providers');
  fs.mkdirSync(providersDir, { recursive: true });
  fs.writeFileSync(
    path.join(root, 'manifest.json'),
    JSON.stringify({
      manifestVersion: 1,
      providers: entries.map((entry) => ({
        id: entry.id,
        version: entry.version,
        filename: `providers/${entry.id}.js`,
      })),
    }),
  );
  for (const entry of entries) {
    fs.writeFileSync(path.join(providersDir, `${entry.id}.js`), 'exports.getStreams = async () => [];\n');
  }
}

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('SA7 provider change badges', () => {
  it('reports new and updated providers against the first snapshot', () => {
    writeSnapshot([
      { id: 'alpha', version: '1.0.0' },
      { id: 'beta', version: '2.0.0' },
    ]);
    config.apply({
      PROVIDER_MANIFEST: path.join(root, 'manifest.json'),
      PROVIDER_DIR: path.join(root, 'providers'),
    });
    providers.reloadProviders();
    const initial = providers.getCatalog();
    expect(initial.providers.every((provider: { isNew: boolean; updated: boolean }) => !provider.isNew && !provider.updated)).toBe(true);

    writeSnapshot([
      { id: 'alpha', version: '1.1.0' },
      { id: 'beta', version: '2.0.0' },
      { id: 'gamma', version: '3.0.0' },
    ]);
    providers.reloadProviders();
    const catalog = providers.getCatalog();
    const byId = Object.fromEntries(
      catalog.providers.map((provider: { id: string }) => [provider.id, provider]),
    );

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
  });
});
