import { z } from 'zod';
import { StreamFilterConfig } from './filters.js';

export const UserConfigSchema = z.object({
  v: z.literal(2).default(2),
  minRes: z.number().int().min(240).max(4320).nullable().default(null),
  maxRes: z.number().int().min(240).max(4320).nullable().default(null),
  includeUnknownRes: z.boolean().default(true),
  maxSizeGB: z.number().min(0.1).max(1024).nullable().default(null),
  includeUnknownSize: z.boolean().default(true),
  subtitleMode: z.enum(['all', 'none', 'languages']).default('all'),
  subtitleLangs: z.array(z.string().min(1).max(20)).max(20).default([]),
  includeUnknownSubtitleLang: z.boolean().default(true),
  backends: z.array(z.enum(['sa7', 'nuvio', 'vega'])).min(1).default(['sa7', 'nuvio', 'vega']),
});

export type UserConfig = z.infer<typeof UserConfigSchema>;

export const DEFAULT_USER_CONFIG: UserConfig = {
  v: 2,
  minRes: null,
  maxRes: null,
  includeUnknownRes: true,
  maxSizeGB: null,
  includeUnknownSize: true,
  subtitleMode: 'all',
  subtitleLangs: [],
  includeUnknownSubtitleLang: true,
  backends: ['sa7', 'nuvio', 'vega'],
};

export function encodeUserConfig(config: Partial<UserConfig>): string {
  const merged: UserConfig = { ...DEFAULT_USER_CONFIG, ...config, v: 2 };
  const json = JSON.stringify(merged);
  return Buffer.from(json, 'utf-8').toString('base64url');
}

export function decodeUserConfig(encoded: string | undefined): UserConfig {
  if (!encoded || encoded.length > 4096) {
    return { ...DEFAULT_USER_CONFIG };
  }

  try {
    let rawJson: string;
    // Handle standard base64url or base64
    try {
      rawJson = Buffer.from(encoded, 'base64url').toString('utf-8');
    } catch {
      rawJson = Buffer.from(encoded, 'base64').toString('utf-8');
    }

    const parsed = JSON.parse(rawJson) as Record<string, unknown>;

    // Handle v1 config backwards compatibility
    if (!parsed.v || parsed.v === 1) {
      return parseV1Config(parsed);
    }

    const validated = UserConfigSchema.safeParse(parsed);
    if (!validated.success) {
      return { ...DEFAULT_USER_CONFIG };
    }

    // Safety: minRes > maxRes is invalid -> reset both
    if (
      validated.data.minRes !== null &&
      validated.data.maxRes !== null &&
      validated.data.minRes > validated.data.maxRes
    ) {
      return { ...validated.data, minRes: null, maxRes: null };
    }

    return validated.data;
  } catch {
    return { ...DEFAULT_USER_CONFIG };
  }
}

function parseV1Config(v1: Record<string, unknown>): UserConfig {
  const backends: Array<'sa7' | 'nuvio' | 'vega'> = [];
  if (Array.isArray(v1.backends)) {
    for (const b of v1.backends) {
      if (b === 'sa7' || b === 'nuvio' || b === 'vega') {
        backends.push(b);
      }
    }
  }

  return {
    ...DEFAULT_USER_CONFIG,
    backends: backends.length > 0 ? backends : ['sa7', 'nuvio', 'vega'],
  };
}

export function toFilterConfig(config: UserConfig): StreamFilterConfig {
  const subtitleMode =
    config.subtitleMode === 'none'
      ? 'none'
      : config.subtitleLangs.length > 0
        ? 'languages'
        : 'all';

  return {
    minRes: config.minRes,
    maxRes: config.maxRes,
    includeUnknownRes: config.includeUnknownRes,
    maxSizeGB: config.maxSizeGB,
    includeUnknownSize: config.includeUnknownSize,
    subtitleMode,
    subtitleLangs: config.subtitleLangs,
    includeUnknownSubtitleLang: config.includeUnknownSubtitleLang,
  };
}
