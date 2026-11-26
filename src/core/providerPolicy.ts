import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const FLEETS = ['sa7', 'nuvio', 'vega'] as const;
export type FleetName = (typeof FLEETS)[number];

export type DuplicateMode = 'primary' | 'backup';

export interface FleetDenyPolicy {
  deny: string[];
}

export interface ProfilePolicy {
  duplicateMode?: DuplicateMode;
  sa7?: FleetDenyPolicy;
  nuvio?: FleetDenyPolicy;
  vega?: FleetDenyPolicy;
}

export interface DuplicateGroup {
  sa7?: string[];
  nuvio?: string[];
  vega?: string[];
}

export type DuplicateGroups = Record<string, DuplicateGroup>;

export interface ProviderPolicyConfig {
  defaultProfile: string;
  duplicatePriority: FleetName[];
  locked: string[];
  duplicates: DuplicateGroups;
  adoptUpstreamDisabled: string[];
  profiles: Record<string, ProfilePolicy>;
}

export interface ProviderPolicyPayload {
  version: number;
  locked: string[];
  disabled: string[];
  overrides: Record<string, boolean>;
  adoptUpstreamDisabled: string[];
}

const ProviderIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_.*-]+$/);

const FleetDenySchema = z
  .object({
    deny: z.array(ProviderIdSchema).default([]),
  })
  .default({ deny: [] });

const ProfileSchema = z.object({
  duplicateMode: z.enum(['primary', 'backup']).optional(),
  sa7: FleetDenySchema.optional(),
  nuvio: FleetDenySchema.optional(),
  vega: FleetDenySchema.optional(),
});

const DuplicateGroupSchema = z.object({
  sa7: z.array(ProviderIdSchema).optional(),
  nuvio: z.array(ProviderIdSchema).optional(),
  vega: z.array(ProviderIdSchema).optional(),
});

const ProviderPolicyFileSchema = z.object({
  defaultProfile: z.string().trim().min(1).default('railway'),
  duplicatePriority: z.array(z.enum(FLEETS)).min(1).default(['nuvio', 'vega', 'sa7']),
  locked: z.array(ProviderIdSchema).default([]),
  duplicates: z.record(z.string().min(1), DuplicateGroupSchema).default({}),
  adoptUpstreamDisabled: z.array(ProviderIdSchema).default([]),
  profiles: z.record(z.string().min(1), ProfileSchema).default({}),
});

const ProviderPolicyPayloadSchema = z.object({
  version: z.number().int().min(0).default(0),
  locked: z.array(ProviderIdSchema).default([]),
  disabled: z.array(ProviderIdSchema).default([]),
  overrides: z.record(z.string(), z.boolean()).default({}),
  adoptUpstreamDisabled: z.array(ProviderIdSchema).default([]),
});

function normalizeId(value: string): string {
  return value.trim().toLowerCase();
}

function dedupeIds(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = value === '*' ? '*' : normalizeId(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

export function loadProviderPolicy(
  filePath = path.resolve(process.cwd(), 'config', 'providers.json'),
): ProviderPolicyConfig {
  if (!fs.existsSync(filePath)) {
    return {
      defaultProfile: 'railway',
      duplicatePriority: ['nuvio', 'vega', 'sa7'],
      locked: [],
      duplicates: {},
      adoptUpstreamDisabled: [],
      profiles: {},
    };
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
  const parsed = ProviderPolicyFileSchema.parse(raw);
  const profiles: Record<string, ProfilePolicy> = {};
  for (const [name, profile] of Object.entries(parsed.profiles)) {
    profiles[name] = {
      ...(profile.duplicateMode ? { duplicateMode: profile.duplicateMode } : {}),
      sa7: { deny: dedupeIds(profile.sa7?.deny ?? []) },
      nuvio: { deny: dedupeIds(profile.nuvio?.deny ?? []) },
      vega: { deny: dedupeIds(profile.vega?.deny ?? []) },
    };
  }

  const duplicates: DuplicateGroups = {};
  for (const [group, copies] of Object.entries(parsed.duplicates)) {
    duplicates[group] = {
      ...(copies.sa7 ? { sa7: dedupeIds(copies.sa7) } : {}),
      ...(copies.nuvio ? { nuvio: dedupeIds(copies.nuvio) } : {}),
      ...(copies.vega ? { vega: dedupeIds(copies.vega) } : {}),
    };
  }

  return {
    defaultProfile: parsed.defaultProfile,
    duplicatePriority: parsed.duplicatePriority,
    locked: dedupeIds(parsed.locked),
    duplicates,
    adoptUpstreamDisabled: dedupeIds(parsed.adoptUpstreamDisabled),
    profiles,
  };
}

/**
 * `generic` and unknown profile names fall back to the deploy-time default so
 * local runs and renamed platforms keep working without a policy edit.
 */
export function resolvePolicyProfileName(
  config: ProviderPolicyConfig,
  requested: string | undefined,
): string {
  const name = requested?.trim();
  if (name && name !== 'generic' && config.profiles[name]) return name;
  if (config.profiles[config.defaultProfile]) return config.defaultProfile;
  return name || config.defaultProfile;
}

export function duplicateModeForProfile(
  config: ProviderPolicyConfig,
  profileName: string,
): DuplicateMode {
  const explicit = config.profiles[profileName]?.duplicateMode;
  if (explicit) return explicit;
  return profileName === config.defaultProfile ? 'primary' : 'backup';
}

function primaryFleetForGroup(
  config: ProviderPolicyConfig,
  group: Partial<Record<FleetName, string[]>>,
): FleetName | null {
  for (const fleet of config.duplicatePriority) {
    if ((group[fleet] ?? []).length > 0) return fleet;
  }
  return null;
}

/**
 * Duplicate allocation is derived, never hand-maintained:
 * - primary profiles keep only the first fleet in `duplicatePriority`.
 * - backup profiles keep every non-primary copy, including same-fleet variants.
 */
export function resolveDuplicateDenials(
  config: ProviderPolicyConfig,
  profileName: string,
  fleet: FleetName,
): string[] {
  const mode = duplicateModeForProfile(config, profileName);
  const denied: string[] = [];
  for (const group of Object.values(config.duplicates)) {
    const primaryFleet = primaryFleetForGroup(config, group);
    if (!primaryFleet) continue;
    const copies = group[fleet] ?? [];
    if (copies.length === 0) continue;
    const isPrimary = fleet === primaryFleet;
    if ((mode === 'primary' && !isPrimary) || (mode === 'backup' && isPrimary)) {
      denied.push(...copies);
    }
  }
  return dedupeIds(denied);
}

export function resolveProfileDenials(
  config: ProviderPolicyConfig,
  profileName: string,
  fleet: FleetName,
): string[] {
  return dedupeIds(config.profiles[profileName]?.[fleet]?.deny ?? []);
}

function normalizeOverrides(
  overrides: Record<string, boolean> | null | undefined,
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  if (!overrides) return result;
  for (const [rawId, enabled] of Object.entries(overrides)) {
    const id = normalizeId(rawId);
    if (id) result[id] = Boolean(enabled);
  }
  return result;
}

export function buildProviderPolicyPayload(
  config: ProviderPolicyConfig,
  profileName: string,
  fleet: FleetName,
  overrides: Record<string, boolean> | null | undefined,
  version: number,
): ProviderPolicyPayload {
  return {
    version: Number.isFinite(version) ? Math.max(0, Math.trunc(version)) : 0,
    locked: dedupeIds(config.locked),
    disabled: dedupeIds([
      ...resolveProfileDenials(config, profileName, fleet),
      ...resolveDuplicateDenials(config, profileName, fleet),
    ]),
    overrides: normalizeOverrides(overrides),
    adoptUpstreamDisabled: dedupeIds(config.adoptUpstreamDisabled),
  };
}

export function parseProviderPolicyPayload(raw: string | undefined): ProviderPolicyPayload {
  if (!raw) {
    return { version: 0, locked: [], disabled: [], overrides: {}, adoptUpstreamDisabled: [] };
  }
  try {
    const parsed = ProviderPolicyPayloadSchema.parse(JSON.parse(raw));
    return {
      version: parsed.version,
      locked: dedupeIds(parsed.locked),
      disabled: dedupeIds(parsed.disabled),
      overrides: normalizeOverrides(parsed.overrides),
      adoptUpstreamDisabled: dedupeIds(parsed.adoptUpstreamDisabled),
    };
  } catch {
    return { version: 0, locked: [], disabled: [], overrides: {}, adoptUpstreamDisabled: [] };
  }
}

export function isAdoptedUpstreamDisabled(
  id: string,
  payload: { adoptUpstreamDisabled: readonly string[] },
): boolean {
  const key = normalizeId(id);
  return payload.adoptUpstreamDisabled.some((value) => normalizeId(value) === key);
}

export function isLockedProvider(id: string, locked: readonly string[]): boolean {
  const key = normalizeId(id);
  return locked.some((value) => normalizeId(value) === key);
}

/**
 * Workers evaluate: locked -> admin override -> disabled (profile + duplicate).
 * Keep this in one place so all three fleets agree.
 */
export function isProviderEnabledByPolicy(
  id: string,
  payload: ProviderPolicyPayload,
): boolean {
  const key = normalizeId(id);
  if (isLockedProvider(key, payload.locked)) return false;
  if (Object.prototype.hasOwnProperty.call(payload.overrides, key)) {
    return payload.overrides[key] === true;
  }
  if (Object.prototype.hasOwnProperty.call(payload.overrides, '*')) {
    return payload.overrides['*'] === true;
  }
  const disabled = new Set(payload.disabled.map(normalizeId));
  return !disabled.has('*') && !disabled.has(key);
}
