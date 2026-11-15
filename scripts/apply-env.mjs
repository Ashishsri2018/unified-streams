import path from 'node:path';
import { parseArgs } from 'node:util';
import { parseDefaultsEnv } from '../src/core/env.js';

const { values } = parseArgs({
  options: {
    check: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    apply: { type: 'boolean', default: false },
  },
  strict: false,
});

const defaultsPath = path.resolve(process.cwd(), 'config', 'defaults.env');
const defaults = parseDefaultsEnv(defaultsPath);

const allowedKeys = new Set([
  ...Object.keys(defaults),
  'SA7_ENABLED_PROVIDERS',
  'SA7_DISABLED_PROVIDERS',
  'NUVIO_ENABLED_SCRAPERS',
  'NUVIO_DISABLED_SCRAPERS',
  'VEGA_ENABLED_PROVIDERS',
  'VEGA_DISABLED_PROVIDERS',
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
