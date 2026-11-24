import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const FLEETS = ['sa7', 'nuvio', 'vega'] as const;
export type FleetName = (typeof FLEETS)[number];

const ProviderIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_.*-]+$/);

const FleetOverridesSchema = z.record(ProviderIdSchema, z.boolean());

const ProviderOverridesFileSchema = z.object({
  version: z.number().int().min(0).default(0),
  updatedAt: z.string().optional(),
  fleets: z
    .object({
      sa7: FleetOverridesSchema.default({}),
      nuvio: FleetOverridesSchema.default({}),
      vega: FleetOverridesSchema.default({}),
    })
    .default({ sa7: {}, nuvio: {}, vega: {} }),
});

export interface ProviderOverridesFile {
  version: number;
  updatedAt?: string;
  fleets: Record<FleetName, Record<string, boolean>>;
}

export function parseProviderOverrides(raw: unknown): ProviderOverridesFile {
  const parsed = ProviderOverridesFileSchema.parse(raw);
  return {
    version: parsed.version,
    ...(parsed.updatedAt ? { updatedAt: parsed.updatedAt } : {}),
    fleets: {
      sa7: normalizeFleetOverrides(parsed.fleets.sa7),
      nuvio: normalizeFleetOverrides(parsed.fleets.nuvio),
      vega: normalizeFleetOverrides(parsed.fleets.vega),
    },
  };
}

export interface ProviderOverridesStoreOptions {
  filePath: string;
  onWarning?: (message: string) => void;
}

export function emptyProviderOverrides(): ProviderOverridesFile {
  return {
    version: 0,
    fleets: { sa7: {}, nuvio: {}, vega: {} },
  };
}

function normalizeFleetOverrides(
  value: Record<string, boolean>,
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const [rawId, enabled] of Object.entries(value)) {
    const id = rawId.trim().toLowerCase();
    if (id) result[id] = enabled;
  }
  return result;
}

export class ProviderOverridesStore {
  private readonly filePath: string;
  private readonly onWarning?: (message: string) => void;
  private state: ProviderOverridesFile = emptyProviderOverrides();

  constructor(options: ProviderOverridesStoreOptions) {
    this.filePath = options.filePath;
    this.onWarning = options.onWarning;
  }

  getFilePath(): string {
    return this.filePath;
  }

  get(): ProviderOverridesFile {
    return this.state;
  }

  getVersion(): number {
    return this.state.version;
  }

  getFleet(fleet: FleetName): Record<string, boolean> {
    return this.state.fleets[fleet] ?? {};
  }

  load(): ProviderOverridesFile {
    if (!fs.existsSync(this.filePath)) {
      this.state = emptyProviderOverrides();
      return this.state;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as unknown;
      this.state = parseProviderOverrides(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.onWarning?.(`provider overrides ignored: ${message}`);
      this.state = emptyProviderOverrides();
    }
    return this.state;
  }

  setOverride(fleet: FleetName, id: string, enabled: boolean | null): ProviderOverridesFile {
    const next: ProviderOverridesFile = {
      ...this.state,
      version: this.state.version + 1,
      updatedAt: new Date().toISOString(),
      fleets: {
        sa7: { ...this.state.fleets.sa7 },
        nuvio: { ...this.state.fleets.nuvio },
        vega: { ...this.state.fleets.vega },
      },
    };
    const target = next.fleets[fleet];
    const key = id.trim().toLowerCase();
    if (enabled === null) {
      delete target[key];
    } else {
      target[key] = enabled;
    }
    return this.persist(next);
  }

  replace(next: ProviderOverridesFile): ProviderOverridesFile {
    return this.persist({
      ...next,
      fleets: {
        sa7: normalizeFleetOverrides(next.fleets.sa7),
        nuvio: normalizeFleetOverrides(next.fleets.nuvio),
        vega: normalizeFleetOverrides(next.fleets.vega),
      },
    });
  }

  private persist(next: ProviderOverridesFile): ProviderOverridesFile {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const temp = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
    fs.renameSync(temp, this.filePath);
    this.state = next;
    return next;
  }
}

export function createProviderOverridesStore(options: {
  dataDir: string;
  onWarning?: (message: string) => void;
}): ProviderOverridesStore {
  return new ProviderOverridesStore({
    filePath: path.join(options.dataDir, 'provider-overrides.json'),
    ...(options.onWarning ? { onWarning: options.onWarning } : {}),
  });
}
