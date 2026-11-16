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
