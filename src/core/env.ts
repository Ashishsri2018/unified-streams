import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  buildProviderPolicyPayload,
  loadProviderPolicy,
  resolvePolicyProfileName,
  type FleetName,
} from './providerPolicy.js';

type Fleet = FleetName;

export const DEFAULT_ANIMEAPI_URL = 'https://animeapi.my.id';
export const DEFAULT_KITSU_URL = 'https://kitsu.io/api/edge';
export const DEFAULT_TVMAZE_URL = 'https://api.tvmaze.com';

const OptionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().url().optional(),
);

export const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(7000),
  DATA_DIR: z.string().default('/data'),
  INSTANCE_PROFILE: z.string().regex(/^[A-Za-z0-9_-]+$/).default('generic'),
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
  BACKEND_TIMEOUT_MS: z.coerce.number().int().min(500).default(12000),
  HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).default(20000),
  GLOBAL_DEADLINE_MS: z.coerce.number().int().min(1000).default(13000),
  MAX_STREAMS_PER_PROVIDER: z.coerce.number().int().min(1).default(100),
  MAX_STREAMS: z.coerce.number().int().min(1).default(1000),
  SEARCH_CONCURRENCY: z.coerce.number().int().min(1).default(30),
  SEARCH_TIMEOUT_MS: z.coerce.number().int().min(1000).default(10000),
  SCRAPER_CONCURRENCY: z.coerce.number().int().min(1).default(30),
  SA7_CONCURRENCY: z.coerce.number().int().min(1).default(30),
  CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().min(1).default(3),
  CIRCUIT_COOLDOWN_MS: z.coerce.number().int().min(1000).default(300000),
  UPDATE_ON_START: z.preprocess((val) => {
    if (val === undefined) return undefined;
    if (typeof val === 'boolean') return val;
    const normalized = String(val).trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }, z.boolean()).default(true),
  UPDATE_INTERVAL_MIN_HOURS: z.coerce.number().int().min(1).default(20),
  UPDATE_INTERVAL_MAX_HOURS: z.coerce.number().int().min(1).default(24),
  CINEMETA_URL: z.string().url().default('https://v3-cinemeta.strem.io'),
  TMDB_URL: z.string().url().default('https://api.themoviedb.org/3'),
  ANIMEAPI_URL: z.string().url().default(DEFAULT_ANIMEAPI_URL),
  KITSU_URL: z.string().url().default(DEFAULT_KITSU_URL),
  TVMAZE_URL: z.string().url().default(DEFAULT_TVMAZE_URL),
  JIKAN_URL: z.string().url().default('https://api.jikan.moe/v4'),
  JIKAN_MAX_RPS: z.coerce.number().int().min(1).default(3),
  JIKAN_MAX_RPM: z.coerce.number().int().min(1).default(60),
  SA7_INTERNAL_URL: z.string().default('http://127.0.0.1:7001'),
  NUVIO_INTERNAL_URL: z.string().default('http://127.0.0.1:7002'),
  VEGA_INTERNAL_URL: z.string().default('http://127.0.0.1:7003'),
  PUBLIC_BASE_URL: z.string().optional(),
  ADMIN_TOKEN: z.string().optional(),
  TMDB_API_KEY: z.string().optional(),
  PROVIDER_SETTINGS_JSON: z.string().optional(),
  SCRAPER_SETTINGS_JSON: z.string().optional(),
  FEBBOX_UI_COOKIE: z.string().optional(),
  GRAMCINEMA_TOKEN: z.string().optional(),
  KARTOONS_TOKEN: z.string().optional(),
  COOKIES_FILE: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  INTERNAL_TOKEN: z.string().optional(),
  CLOUDFLARE_LOG_ENDPOINT: z.string().optional(),
  CLOUDFLARE_LOG_TOKEN: z.string().optional(),
  CLOUDFLARE_SETTINGS_ENDPOINT: OptionalUrl,
  CLOUDFLARE_SETTINGS_TOKEN: z.string().optional(),
  MANIFEST_PROXY_SECRET: z.string().optional(),
  MANIFEST_PROXY_TOKEN_TTL_MS: z.coerce.number().int().min(60000).default(21600000),
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

function loadProfileEnv(profile: string): Record<string, string> {
  if (!/^[A-Za-z0-9_-]+$/.test(profile)) return {};
  const profilePath = path.resolve(process.cwd(), 'config', 'instances', `${profile}.env`);
  return parseDefaultsEnv(profilePath);
}

export function loadAppEnv(customEnv: NodeJS.ProcessEnv = process.env): AppEnv {
  const defaultsPath = path.resolve(process.cwd(), 'config', 'defaults.env');
  const defaults = parseDefaultsEnv(defaultsPath);
  const requestedProfile =
    (customEnv.INSTANCE_PROFILE && customEnv.INSTANCE_PROFILE.trim()) ||
    defaults.INSTANCE_PROFILE ||
    'generic';
  const profileDefaults = loadProfileEnv(requestedProfile);
  const merged: Record<string, unknown> = { ...defaults, ...profileDefaults };

  for (const [key, value] of Object.entries(customEnv)) {
    if (value !== undefined && value !== '') {
      merged[key] = value;
    }
  }

  return EnvSchema.parse(merged);
}

export const WORKER_DEADLINE_MARGIN_MS = 1000;

export const RESOLVE_MIN_MS = 250;
export const METADATA_RESOLVE_MAX_MS = 5000;
export const MAL_RESOLVE_MIN_MS = 500;
export const MAL_RESOLVE_MAX_MS = 2000;

function deriveResolveBudgetMs(env: AppEnv, minMs: number, maxMs: number): number {
  const headroom = env.GLOBAL_DEADLINE_MS - env.BACKEND_TIMEOUT_MS;
  return Math.max(minMs, Math.min(maxMs, headroom));
}

export function deriveMetadataResolveBudgetMs(env: AppEnv): number {
  return deriveResolveBudgetMs(env, RESOLVE_MIN_MS, METADATA_RESOLVE_MAX_MS);
}

export function deriveMalResolveBudgetMs(env: AppEnv): number {
  return deriveResolveBudgetMs(env, MAL_RESOLVE_MIN_MS, MAL_RESOLVE_MAX_MS);
}

export function deriveFleetEnv(
  env: AppEnv,
  fleet: Fleet,
  port: number,
  runtimeOverrides: Record<string, boolean> = {},
  selectionVersion = 0,
): Record<string, string> {
  // The gateway aborts a worker fetch at BACKEND_TIMEOUT_MS. Workers must finish
  // (and return partial results) before that hard cutoff, so keep a safety margin.
  const workerDeadlineMs = Math.max(2000, env.BACKEND_TIMEOUT_MS - WORKER_DEADLINE_MARGIN_MS);
  let fleetSettings = '{}';
  if (env.PROVIDER_SETTINGS_JSON) {
    try {
      const parsed = JSON.parse(env.PROVIDER_SETTINGS_JSON) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        if (parsed[fleet]) {
          fleetSettings = JSON.stringify(parsed[fleet]);
        } else if (fleet === 'vega' && (parsed.kv || parsed.skipTimings !== undefined)) {
          fleetSettings = JSON.stringify(parsed);
        }
      }
    } catch {
      fleetSettings = '{}';
    }
  }

  const fleetDataDir = path.join(env.DATA_DIR, fleet);
  const policyConfig = loadProviderPolicy();
  const profileName = resolvePolicyProfileName(policyConfig, env.INSTANCE_PROFILE);
  const policyPayload = buildProviderPolicyPayload(
    policyConfig,
    profileName,
    fleet,
    runtimeOverrides,
    selectionVersion,
  );

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
    GLOBAL_DEADLINE_MS: String(workerDeadlineMs),
    MAX_STREAMS_PER_PROVIDER: String(env.MAX_STREAMS_PER_PROVIDER),
    CIRCUIT_FAILURE_THRESHOLD: String(env.CIRCUIT_FAILURE_THRESHOLD),
    CIRCUIT_COOLDOWN_MS: String(env.CIRCUIT_COOLDOWN_MS),
    BREAKER_FAILURE_THRESHOLD: String(env.CIRCUIT_FAILURE_THRESHOLD),
    BREAKER_COOLDOWN_MS: String(env.CIRCUIT_COOLDOWN_MS),
    INTERNAL_TOKEN: env.INTERNAL_TOKEN || '',
    PROVIDER_SETTINGS_JSON: fleetSettings,
    PROVIDER_POLICY_JSON: JSON.stringify(policyPayload),
  };

  if (env.TMDB_API_KEY) {
    outEnv.TMDB_API_KEY = env.TMDB_API_KEY;
  }
  if (env.CINEMETA_URL) {
    outEnv.CINEMETA_URL = env.CINEMETA_URL;
  }
  if (env.TMDB_URL) {
    outEnv.TMDB_URL = env.TMDB_URL;
  }
  if (env.GITHUB_TOKEN) {
    // Vega's in-worker updater fetches upstream heads itself; without the token
    // it falls back to a content hash that never matches the scheduler's git SHA.
    outEnv.GITHUB_TOKEN = env.GITHUB_TOKEN;
  }

  if (fleet === 'sa7') {
    outEnv.ADDON_DEADLINE_MS = String(workerDeadlineMs);
    outEnv.MAX_PER_PROVIDER_STREAMS = String(env.MAX_STREAMS_PER_PROVIDER);
    outEnv.MAX_TOTAL_STREAMS = String(env.MAX_STREAMS);
    outEnv.BREAKER_FAILURE_THRESHOLD = String(env.CIRCUIT_FAILURE_THRESHOLD);
    outEnv.BREAKER_COOLDOWN_MS = String(env.CIRCUIT_COOLDOWN_MS);
    outEnv.PROVIDER_CONCURRENCY = String(env.SA7_CONCURRENCY);

    const sa7Root = path.join(fleetDataDir, 'cb-providers');
    const sa7Manifest = path.join(sa7Root, 'manifest.json');
    if (fs.existsSync(sa7Manifest)) {
      outEnv.PROVIDER_MANIFEST = sa7Manifest;
      outEnv.PROVIDER_DIR = path.join(sa7Root, 'providers');
      outEnv.SA7_SNAPSHOT_FILE = path.join(sa7Root, 'UPSTREAM_COMMIT');
    }
  } else if (fleet === 'nuvio') {
    const distBundled = path.resolve(process.cwd(), 'dist/fleets/nuvio/snapshot');
    const srcBundled = path.resolve(process.cwd(), 'src/fleets/nuvio/snapshot');
    outEnv.NUVIO_BUNDLED_DIR = fs.existsSync(distBundled) ? distBundled : srcBundled;
    outEnv.NUVIO_CACHE_DIR = fleetDataDir;
    outEnv.SCRAPER_CONCURRENCY = String(env.SCRAPER_CONCURRENCY);
    outEnv.SCRAPER_TIMEOUT_MS = String(workerDeadlineMs);
    outEnv.HTTP_TIMEOUT_MS = String(env.HTTP_TIMEOUT_MS);

    let scraperSettings: Record<string, Record<string, unknown>> = {};
    if (env.SCRAPER_SETTINGS_JSON) {
      try {
        const parsed = JSON.parse(env.SCRAPER_SETTINGS_JSON);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          scraperSettings = parsed as Record<string, Record<string, unknown>>;
        }
      } catch {
        scraperSettings = {};
      }
    }
    if (env.PROVIDER_SETTINGS_JSON) {
      try {
        const parsed = JSON.parse(env.PROVIDER_SETTINGS_JSON) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object' && parsed.nuvio && typeof parsed.nuvio === 'object') {
          scraperSettings = { ...(parsed.nuvio as Record<string, Record<string, unknown>>), ...scraperSettings };
        }
      } catch {
        // ignore
      }
    }
    if (env.GRAMCINEMA_TOKEN) {
      let rawToken = env.GRAMCINEMA_TOKEN.trim();
      if (rawToken.startsWith('gc_session=')) {
        rawToken = rawToken.slice('gc_session='.length).trim();
      }
      if (rawToken.toLowerCase().startsWith('bearer ')) {
        rawToken = rawToken.slice(7).trim();
      }
      if (rawToken) {
        scraperSettings.fjoral = {
          enable720p: true,
          enable1080p: true,
          enable2160p: true,
          ...(scraperSettings.fjoral || {}),
          cinemaTvToken: rawToken,
        };
      }
    }
    if (Object.keys(scraperSettings).length > 0) {
      outEnv.SCRAPER_SETTINGS_JSON = JSON.stringify(scraperSettings);
    }
  } else if (fleet === 'vega') {
    outEnv.SEARCH_CONCURRENCY = String(env.SEARCH_CONCURRENCY);
    outEnv.SEARCH_TIMEOUT_MS = String(Math.min(env.SEARCH_TIMEOUT_MS, workerDeadlineMs));
    outEnv.META_TIMEOUT_MS = String(Math.min(15000, workerDeadlineMs));
    outEnv.STREAM_TIMEOUT_MS = String(Math.min(20000, workerDeadlineMs));
    outEnv.SETTLE_MS = '0';
    outEnv.EMPTY_FENCE_MS = '0';

    let vegaSettings: { skipTimings?: boolean; kv?: Record<string, unknown> } = {};
    try {
      vegaSettings = JSON.parse(fleetSettings);
      if (!vegaSettings || typeof vegaSettings !== 'object' || Array.isArray(vegaSettings)) {
        vegaSettings = {};
      }
    } catch {
      vegaSettings = {};
    }
    if (!vegaSettings.kv || typeof vegaSettings.kv !== 'object' || Array.isArray(vegaSettings.kv)) {
      vegaSettings.kv = {};
    }
    if (env.FEBBOX_UI_COOKIE) {
      const cookie = env.FEBBOX_UI_COOKIE.trim();
      if (cookie) {
        vegaSettings.kv.febboxCookie = cookie.startsWith('ui=') ? cookie : `ui=${cookie}`;
      }
    }
    if (env.KARTOONS_TOKEN) {
      let rawToken = env.KARTOONS_TOKEN.trim();
      if (rawToken.startsWith('token=')) {
        rawToken = rawToken.slice('token='.length).trim();
      }
      if (rawToken.toLowerCase().startsWith('bearer ')) {
        rawToken = rawToken.slice(7).trim();
      }
      if (rawToken) {
        const existing = vegaSettings.kv.kartoons_device_session;
        let session: Record<string, unknown> = {};
        if (typeof existing === 'string') {
          try {
            const parsed = JSON.parse(existing);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              session = parsed as Record<string, unknown>;
            }
          } catch {
            session = {};
          }
        } else if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
          session = { ...(existing as Record<string, unknown>) };
        }
        vegaSettings.kv.kartoons_device_session = { ...session, token: rawToken };
      }
    }
    if (Object.keys(vegaSettings.kv).length > 0 || vegaSettings.skipTimings !== undefined) {
      outEnv.PROVIDER_SETTINGS_JSON = JSON.stringify(vegaSettings);
    }
  }

  return outEnv;
}
