export interface ProviderVersion {
  id: string;
  version: string;
}

export interface ProviderChange {
  isNew: boolean;
  updated: boolean;
  previousVersion: string | null;
}

export type ProviderChangeMap = Record<string, ProviderChange>;

function normalizeVersion(value: unknown): string {
  return String(value ?? '').trim();
}

export function computeProviderChanges(
  baseline: readonly ProviderVersion[] | null | undefined,
  current: readonly ProviderVersion[],
): ProviderChangeMap {
  const changes: ProviderChangeMap = {};
  if (!baseline || baseline.length === 0) return changes;

  const previous = new Map<string, string>();
  for (const entry of baseline) {
    const id = String(entry.id ?? '').trim().toLowerCase();
    if (!id) continue;
    previous.set(id, normalizeVersion(entry.version));
  }

  for (const entry of current) {
    const id = String(entry.id ?? '').trim().toLowerCase();
    if (!id) continue;
    const version = normalizeVersion(entry.version);
    const previousVersion = previous.get(id);
    if (previousVersion === undefined) {
      changes[id] = { isNew: true, updated: false, previousVersion: null };
      continue;
    }
    if (previousVersion !== version) {
      changes[id] = { isNew: false, updated: true, previousVersion };
    }
  }

  return changes;
}
