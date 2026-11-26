import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    check: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    apply: { type: 'boolean', default: false },
  },
  strict: false,
});

const defaultsPath = path.resolve(process.cwd(), 'config', 'defaults.env');

function parseDefaultsEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf-8');
  const result = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      result[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
  }
  return result;
}

const defaults = parseDefaultsEnv(defaultsPath);

const allowedKeys = new Set([
  ...Object.keys(defaults),
  'PUBLIC_BASE_URL',
  'TMDB_API_KEY',
  'PROVIDER_SETTINGS_JSON',
  'SCRAPER_SETTINGS_JSON',
  'FEBBOX_UI_COOKIE',
  'GRAMCINEMA_TOKEN',
  'KARTOONS_TOKEN',
  'COOKIES_FILE',
  'GITHUB_TOKEN',
  'INTERNAL_TOKEN',
  'CLOUDFLARE_LOG_ENDPOINT',
  'CLOUDFLARE_LOG_TOKEN',
  'CLOUDFLARE_SETTINGS_ENDPOINT',
  'CLOUDFLARE_SETTINGS_TOKEN',
  'MANIFEST_PROXY_SECRET',
  'MANIFEST_PROXY_TOKEN_TTL_MS',
  'ADDON_VERSION',
  'GIT_COMMIT',
]);

const merged = { ...defaults };
for (const [k, v] of Object.entries(process.env)) {
  if (allowedKeys.has(k) && v !== undefined && v !== '') {
    // Beamup sets PORT; do not overwrite from env
    if (k === 'PORT') continue;
    merged[k] = v;
  }
}

if (values.check) {
  console.log(`[apply-env] Validated ${Object.keys(merged).length} configuration keys:`);
  console.log(Object.keys(merged).sort().join(', '));
  process.exit(0);
}

if (values['dry-run']) {
  console.log(`[apply-env] Planned changes for ${Object.keys(merged).length} keys:`);
  for (const k of Object.keys(merged).sort()) {
    console.log(`  - ${k}: [configured]`);
  }
  process.exit(0);
}

console.log(`[apply-env] Merged environment ready (${Object.keys(merged).length} keys).`);
