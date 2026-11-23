export interface ProviderSelection {
  enabled: readonly string[];
  disabled: readonly string[];
}

export type ProviderOverrides = Readonly<Record<string, boolean>>;

function normalizeList(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => String(value).trim().toLowerCase()).filter(Boolean));
}

function normalizeId(value: string): string {
  return String(value).trim().toLowerCase();
}

export function isProviderEnabled(id: string, selection: ProviderSelection): boolean {
  const key = normalizeId(id);
  const disabled = normalizeList(selection.disabled);
  if (disabled.has('*') || disabled.has(key)) return false;
  if (selection.enabled.length === 0) return true;
  return normalizeList(selection.enabled).has(key);
}

export function normalizeProviderOverrides(
  overrides: ProviderOverrides | null | undefined,
): Map<string, boolean> {
  const normalized = new Map<string, boolean>();
  if (!overrides) return normalized;
  for (const [rawId, enabled] of Object.entries(overrides)) {
    const id = normalizeId(rawId);
    if (id) normalized.set(id, Boolean(enabled));
  }
  return normalized;
}

/**
 * Applies runtime admin overrides on top of the deploy-time selection.
 * Precedence: hard-disabled > runtime override > baseline selection.
 */
export function isProviderEnabledWithOverrides(
  id: string,
  selection: ProviderSelection,
  overrides: ProviderOverrides | null | undefined,
  hardDisabled: readonly string[] = [],
): boolean {
  const key = normalizeId(id);
  const hard = normalizeList(hardDisabled);
  if (hard.has(key)) return false;
  const normalized = normalizeProviderOverrides(overrides);
  if (normalized.has(key)) return normalized.get(key) === true;
  if (normalized.has('*')) return normalized.get('*') === true;
  return isProviderEnabled(id, selection);
}

function overrideValue(
  id: string,
  overrides: ProviderOverrides | null | undefined,
): boolean | undefined {
  const key = normalizeId(id);
  if (!overrides) return undefined;
  for (const [rawId, enabled] of Object.entries(overrides)) {
    if (normalizeId(rawId) === key) return Boolean(enabled);
  }
  return undefined;
}

export function isProviderLocked(id: string, hardDisabled: readonly string[]): boolean {
  return normalizeList(hardDisabled).has(normalizeId(id));
}

export function providerOverrideFor(
  id: string,
  overrides: ProviderOverrides | null | undefined,
): boolean | undefined {
  return overrideValue(id, overrides);
}

export function selectEnabledProviders<T>(
  entries: readonly T[],
  selection: ProviderSelection,
  getId: (entry: T) => string,
): T[] {
  return entries.filter((entry) => isProviderEnabled(getId(entry), selection));
}

/**
 * Returns configured provider IDs that were present in the previous manifest but
 * have disappeared from the current one. Upstream renames must be reconciled in
 * config/providers.json; without this the stale ID silently stops applying.
 */
export function findDepartedProviderIds(
  previousIds: Iterable<string>,
  currentIds: Iterable<string>,
  selection: ProviderSelection,
): string[] {
  const current = new Set(
    Array.from(currentIds, (id) => String(id).trim().toLowerCase()).filter(Boolean),
  );
  const configured = normalizeList([...selection.enabled, ...selection.disabled]);
  configured.delete('*');

  const departed = new Set<string>();
  for (const raw of previousIds) {
    const id = String(raw).trim().toLowerCase();
    if (id && configured.has(id) && !current.has(id)) departed.add(id);
  }
  return [...departed].sort();
}
