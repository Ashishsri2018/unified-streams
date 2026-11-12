import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(7000),
  DATA_DIR: z.string().default('/data'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  LOG_SINK: z.enum(['stdout', 'cloudflare']).default('stdout'),
  LOG_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  LOG_SLOW_MS: z.coerce.number().int().min(100).default(2000),
  LOG_BATCH_SIZE: z.coerce.number().int().min(1).default(200),
  LOG_FLUSH_MS: z.coerce.number().int().min(100).default(5000),
  LOG_QUEUE_MAX: z.coerce.number().int().min(100).default(10000),
  CACHE_TTL_MS: z.coerce.number().int().min(1000).default(180000),
  CACHE_PARTIAL_TTL_MS: z.coerce.number().int().min(1000).default(30000),
  BACKEND_TIMEOUT_MS: z.coerce.number().int().min(500).default(10000),
  GLOBAL_DEADLINE_MS: z.coerce.number().int().min(1000).default(12000),
  MAX_STREAMS_PER_PROVIDER: z.coerce.number().int().min(1).default(100),
  MAX_STREAMS: z.coerce.number().int().min(1).default(1000),
  CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().min(1).default(3),
  CIRCUIT_COOLDOWN_MS: z.coerce.number().int().min(1000).default(300000),
  UPDATE_ON_START: z.preprocess((val) => val === 'true' || val === true || val === '1', z.boolean()).default(true),
  UPDATE_INTERVAL_MIN_HOURS: z.coerce.number().int().min(1).default(20),
  UPDATE_INTERVAL_MAX_HOURS: z.coerce.number().int().min(1).default(24),
  CINEMETA_URL: z.string().url().default('https://v3-cinemeta.strem.io'),
  MAL_ENABLED: z.preprocess((val) => val === 'true' || val === true || val === '1', z.boolean()).default(false),
  JIKAN_URL: z.string().url().default('https://api.jikan.moe/v4'),
  JIKAN_MAX_RPS: z.coerce.number().int().min(1).default(3),
  JIKAN_MAX_RPM: z.coerce.number().int().min(1).default(60),
  SA7_INTERNAL_URL: z.string().default('http://127.0.0.1:7001'),
  NUVIO_INTERNAL_URL: z.string().default('http://127.0.0.1:7002'),
  VEGA_INTERNAL_URL: z.string().default('http://127.0.0.1:7003'),
  PUBLIC_BASE_URL: z.string().optional(),
  TMDB_API_KEY: z.string().optional(),
  PROVIDER_SETTINGS_JSON: z.string().optional(),
  COOKIES_FILE: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  INTERNAL_TOKEN: z.string().optional(),
  CLOUDFLARE_LOG_ENDPOINT: z.string().optional(),
  CLOUDFLARE_LOG_TOKEN: z.string().optional(),
  ADDON_VERSION: z.string().default('1.0.0'),
  GIT_COMMIT: z.string().default('development'),
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function parseDefaultsEnv(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf-8');
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      result[key] = val;
    }
  }
  return result;
}

export function loadAppEnv(customEnv: NodeJS.ProcessEnv = process.env): AppEnv {
  const defaultsPath = path.resolve(process.cwd(), 'config', 'defaults.env');
  const defaults = parseDefaultsEnv(defaultsPath);
  const merged: Record<string, unknown> = { ...defaults };

  for (const [key, value] of Object.entries(customEnv)) {
    if (value !== undefined && value !== '') {
      merged[key] = value;
    }
  }

  return EnvSchema.parse(merged);
}

export function deriveFleetEnv(
  env: AppEnv,
  fleet: 'sa7' | 'nuvio' | 'vega',
  port: number,
): Record<string, string> {
  let fleetSettings = '{}';
  if (env.PROVIDER_SETTINGS_JSON) {
    try {
      const parsed = JSON.parse(env.PROVIDER_SETTINGS_JSON) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object' && parsed[fleet]) {
        fleetSettings = JSON.stringify(parsed[fleet]);
      }
    } catch {
      fleetSettings = '{}';
    }
  }

  const fleetDataDir = path.join(env.DATA_DIR, fleet);
  const outEnv: Record<string, string> = {
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(port),
    FLEET: fleet,
    DATA_DIR: fleetDataDir,
    LOG_LEVEL: env.LOG_LEVEL,
    LOG_FORMAT: env.LOG_FORMAT,
    STREAM_CACHE_TTL_MS: '0', // Workers must not cache stream responses
    PROVIDER_TIMEOUT_MS: String(env.BACKEND_TIMEOUT_MS),
    GLOBAL_DEADLINE_MS: String(env.GLOBAL_DEADLINE_MS),
    MAX_STREAMS_PER_PROVIDER: String(env.MAX_STREAMS_PER_PROVIDER),
    CIRCUIT_FAILURE_THRESHOLD: String(env.CIRCUIT_FAILURE_THRESHOLD),
    CIRCUIT_COOLDOWN_MS: String(env.CIRCUIT_COOLDOWN_MS),
    INTERNAL_TOKEN: env.INTERNAL_TOKEN || '',
    PROVIDER_SETTINGS_JSON: fleetSettings,
  };

  if (fleet === 'nuvio') {
    const distBundled = path.resolve(process.cwd(), 'dist/fleets/nuvio/snapshot');
    const srcBundled = path.resolve(process.cwd(), 'src/fleets/nuvio/snapshot');
    outEnv.NUVIO_BUNDLED_DIR = fs.existsSync(distBundled) ? distBundled : srcBundled;
    outEnv.NUVIO_CACHE_DIR = fleetDataDir;
  }

  return outEnv;
}
