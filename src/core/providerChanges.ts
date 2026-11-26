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

export interface ProviderManifestState {
  id: string;
  upstreamEnabled: boolean;
}

export interface ProviderReconciliationResult {
  added: Array<{ id: string; upstreamEnabled: boolean }>;
  removed: string[];
  stateChanged: Array<{
    id: string;
    from: 'enabled' | 'disabled';
    to: 'enabled' | 'disabled';
  }>;
}

export function reconcileProviderStates(
  previous: readonly ProviderManifestState[] | null | undefined,
  current: readonly ProviderManifestState[],
): ProviderReconciliationResult {
  const result: ProviderReconciliationResult = { added: [], removed: [], stateChanged: [] };
  if (!previous) return result;

  const before = new Map<string, boolean>();
  for (const entry of previous) {
    const id = String(entry.id ?? '').trim().toLowerCase();
    if (id) before.set(id, Boolean(entry.upstreamEnabled));
  }
  const after = new Map<string, boolean>();
  for (const entry of current) {
    const id = String(entry.id ?? '').trim().toLowerCase();
    if (id) after.set(id, Boolean(entry.upstreamEnabled));
  }

  for (const [id, upstreamEnabled] of after) {
    if (!before.has(id)) {
      result.added.push({ id, upstreamEnabled });
      continue;
    }
    if (before.get(id) !== upstreamEnabled) {
      result.stateChanged.push({
        id,
        from: before.get(id) ? 'enabled' : 'disabled',
        to: upstreamEnabled ? 'enabled' : 'disabled',
      });
    }
  }
  for (const id of before.keys()) {
    if (!after.has(id)) result.removed.push(id);
  }
  return result;
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
