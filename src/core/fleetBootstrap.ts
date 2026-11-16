import fs from 'node:fs';
import path from 'node:path';
import type { AppEnv } from './env.js';

export function ensureFleetDirs(env: AppEnv): void {
  const dirs = [
    env.DATA_DIR,
    path.join(env.DATA_DIR, 'sa7'),
    path.join(env.DATA_DIR, 'nuvio'),
    path.join(env.DATA_DIR, 'vega'),
    path.join(env.DATA_DIR, 'tmp'),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  const vegaTarget = path.join(env.DATA_DIR, 'vega', 'providers', 'Zenda-Cross');
  if (!fs.existsSync(vegaTarget)) {
    const distBaseline = path.resolve(process.cwd(), 'dist/fleets/vega/providers-baseline/Zenda-Cross');
    const srcBaseline = path.resolve(process.cwd(), 'src/fleets/vega/providers-baseline/Zenda-Cross');
    const baseline = fs.existsSync(distBaseline) ? distBaseline : srcBaseline;
    if (fs.existsSync(baseline)) {
      fs.mkdirSync(path.dirname(vegaTarget), { recursive: true });
      fs.cpSync(baseline, vegaTarget, { recursive: true });
    }
  }

  const sa7Target = path.join(env.DATA_DIR, 'sa7', 'cb-providers');
  if (!fs.existsSync(path.join(sa7Target, 'manifest.json'))) {
    const distSa7 = path.resolve(process.cwd(), 'dist/fleets/sa7/vendor/cb-providers');
    const srcSa7 = path.resolve(process.cwd(), 'src/fleets/sa7/vendor/cb-providers');
    const bundled = fs.existsSync(distSa7) ? distSa7 : srcSa7;
    if (fs.existsSync(bundled)) {
      fs.mkdirSync(sa7Target, { recursive: true });
      fs.cpSync(bundled, sa7Target, { recursive: true });
    }
  }
}
