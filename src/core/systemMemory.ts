import fs from 'node:fs';
import os from 'node:os';

export type SystemMemorySource = 'cgroup-v2' | 'cgroup-v1' | 'os' | 'unavailable';

export interface SystemMemory {
  totalBytes: number | null;
  usedBytes: number | null;
  availableBytes: number | null;
  source: SystemMemorySource;
}

const CACHE_TTL_MS = 5000;
let cached: { at: number; value: SystemMemory } | null = null;

function readNumber(filePath: string): number | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw || raw === 'max') return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

function build(used: number, total: number | null, source: SystemMemorySource): SystemMemory {
  return {
    totalBytes: total,
    usedBytes: used,
    availableBytes: total !== null ? Math.max(0, total - used) : null,
    source,
  };
}

function readUncached(): SystemMemory {
  const v2Used = readNumber('/sys/fs/cgroup/memory.current');
  if (v2Used !== null) {
    return build(v2Used, readNumber('/sys/fs/cgroup/memory.max'), 'cgroup-v2');
  }

  const v1Used = readNumber('/sys/fs/cgroup/memory/memory.usage_in_bytes');
  if (v1Used !== null) {
    const rawLimit = readNumber('/sys/fs/cgroup/memory/memory.limit_in_bytes');
    const v1Total = rawLimit !== null && rawLimit < 2 ** 50 ? rawLimit : null;
    return build(v1Used, v1Total, 'cgroup-v1');
  }

  const total = os.totalmem();
  const available = os.freemem();
  if (total > 0) {
    return {
      totalBytes: total,
      usedBytes: Math.max(0, total - available),
      availableBytes: available,
      source: 'os',
    };
  }

  return { totalBytes: null, usedBytes: null, availableBytes: null, source: 'unavailable' };
}

export function readSystemMemory(now = Date.now()): SystemMemory {
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.value;
  const value = readUncached();
  cached = { at: now, value };
  return value;
}
