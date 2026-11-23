export interface ProviderSelection {
  enabled: readonly string[];
  disabled: readonly string[];
}

function normalizeList(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => String(value).trim().toLowerCase()).filter(Boolean));
}

export function isProviderEnabled(id: string, selection: ProviderSelection): boolean {
  const key = String(id).trim().toLowerCase();
  const disabled = normalizeList(selection.disabled);
  if (disabled.has('*') || disabled.has(key)) return false;
  if (selection.enabled.length === 0) return true;
  return normalizeList(selection.enabled).has(key);
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
