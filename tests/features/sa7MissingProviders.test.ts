import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const config = require('../../src/fleets/sa7/config.js');
const providers = require('../../src/fleets/sa7/providers.js');

function writeSnapshot(root: string, ids: string[]): void {
  const providersDir = path.join(root, 'providers');
  fs.mkdirSync(providersDir, { recursive: true });
  fs.writeFileSync(
    path.join(root, 'manifest.json'),
    JSON.stringify({
      manifestVersion: 1,
      providers: ids.map((id) => ({ id, filename: `providers/${id}.js` })),
    }),
  );
  for (const id of ids) {
    fs.writeFileSync(path.join(providersDir, `${id}.js`), 'exports.getStreams = async () => [];\n');
  }
}

describe('SA7 missing provider warning', () => {
  it('warns when a configured provider disappears from the manifest', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sa7-missing-'));
    writeSnapshot(root, ['sylphera', 'kethrax']);
    config.apply({
      PROVIDER_MANIFEST: path.join(root, 'manifest.json'),
      PROVIDER_DIR: path.join(root, 'providers'),
      DISABLED_PROVIDERS: 'sylphera',
    });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      providers.reloadProviders();

      writeSnapshot(root, ['dexter', 'kethrax']);
      providers.reloadProviders();

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('configured provider(s) missing from manifest: sylphera'),
      );
    } finally {
      warn.mockRestore();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
