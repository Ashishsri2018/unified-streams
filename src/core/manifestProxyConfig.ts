import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const MANIFEST_PROXY_MODES = ['manifest'] as const;
export type ManifestProxyMode = (typeof MANIFEST_PROXY_MODES)[number];

export interface ManifestProxyEntry {
  id: string;
  match: string;
  mode: ManifestProxyMode;
  enabled: boolean;
  headers: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ManifestProxyConfigFile {
  version: number;
  updatedAt?: string;
  entries: ManifestProxyEntry[];
}

export interface ManifestProxyStoreOptions {
  filePath: string;
  onWarning?: (message: string) => void;
}

const MAX_ENTRIES = 50;
const MAX_HEADERS = 20;
const MAX_URL_LENGTH = 2048;
const MAX_HEADER_VALUE = 1024;
const BLOCKED_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'transfer-encoding',
  'cookie',
  'set-cookie',
]);

const SAFE_HEADER_NAME = /^[A-Za-z0-9-]+$/;

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return a >= 224;
}

function isPrivateIpv6(hostname: string): boolean {
  const value = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (value === '::1' || value === '::') return true;
  if (value.startsWith('fc') || value.startsWith('fd')) return true;
  if (value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) {
    return true;
  }
  if (value.startsWith('ff')) return true;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  // IPv4-compatible forms such as `::127.0.0.1` also route to the embedded
  // address even though they are deprecated.
  const compatible = value.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
  if (compatible) return isPrivateIpv4(compatible[1]);
  // URL parsers normalize some IPv4-mapped/compatible addresses to hex groups,
  // e.g. `::ffff:7f00:1` or `::7f00:1` for 127.0.0.1. Decode them before the
  // private check.
  const hexGroups = value.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexGroups) {
    const high = Number.parseInt(hexGroups[1], 16);
    const low = Number.parseInt(hexGroups[2], 16);
    return isPrivateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return false;
}

/**
 * Best-effort literal check. Hostnames are resolved again before every
 * upstream fetch; this only rejects obvious local targets at config time.
 */
export function isPrivateHostname(hostname: string): boolean {
  const value = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!value) return true;
  if (value === 'localhost' || value.endsWith('.localhost')) return true;
  if (value.endsWith('.local')) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) return isPrivateIpv4(value);
  if (value.includes(':')) return isPrivateIpv6(value);
  return false;
}

export function normalizeManifestProxyMatch(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('URL is required');
  if (trimmed.length > MAX_URL_LENGTH) throw new Error('URL is too long');
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('URL is invalid');
  }
  if (url.protocol !== 'https:') throw new Error('URL must use https');
  if (url.username || url.password) throw new Error('URL must not contain credentials');
  if (url.port && url.port !== '443') throw new Error('URL must use the standard https port');
  if (url.search || url.hash) throw new Error('URL must not contain a query or fragment');
  if (isPrivateHostname(url.hostname)) {
    throw new Error('URL host must be public');
  }
  const pathname = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  return `${url.origin}${pathname}`;
}

function validateHeaders(raw: unknown): Record<string, string> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('headers must be an object');
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_HEADERS) throw new Error('too many headers');
  const result: Record<string, string> = {};
  const seen = new Set<string>();
  for (const [rawName, rawValue] of entries) {
    const name = rawName.trim();
    if (!SAFE_HEADER_NAME.test(name)) throw new Error(`invalid header name '${name}'`);
    const key = name.toLowerCase();
    if (BLOCKED_HEADERS.has(key)) throw new Error(`header '${name}' is not allowed`);
    if (seen.has(key)) throw new Error(`duplicate header '${name}'`);
    seen.add(key);
    if (typeof rawValue !== 'string') throw new Error(`header '${name}' must be a string`);
    const value = rawValue.trim();
    if (!value || value.length > MAX_HEADER_VALUE) {
      throw new Error(`header '${name}' has an invalid length`);
    }
    if (/[\r\n\0]/.test(value)) throw new Error(`header '${name}' contains invalid characters`);
    result[name] = value;
  }
  return result;
}

const EntrySchema = z.object({
  id: z.string().trim().min(1).max(128),
  match: z.string().trim().min(1).max(MAX_URL_LENGTH),
  mode: z.enum(MANIFEST_PROXY_MODES).default('manifest'),
  enabled: z.boolean().default(true),
  headers: z.record(z.string(), z.string()).default({}),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

const ConfigFileSchema = z.object({
  version: z.number().int().min(0).default(0),
  updatedAt: z.string().optional(),
  entries: z.array(EntrySchema).max(MAX_ENTRIES).default([]),
});

const VIDY_HEADERS: Record<string, string> = {
  Referer: 'https://www.vidy.st/',
  Origin: 'https://www.vidy.st',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

/**
 * Built-in entries are merged with persisted entries. A persisted entry with
 * the same id overrides the built-in one (used to disable or edit a default).
 */
export const DEFAULT_MANIFEST_PROXY_ENTRIES: readonly ManifestProxyEntry[] = [
  {
    id: 'vidy-moon',
    match: 'https://moon.goldenkite.top/',
    mode: 'manifest',
    enabled: true,
    headers: { ...VIDY_HEADERS },
    createdAt: '2026-11-24T00:00:00.000Z',
    updatedAt: '2026-11-24T00:00:00.000Z',
  },
  {
    id: 'vidy-sun2',
    match: 'https://sun2.warmsquare.top/',
    mode: 'manifest',
    enabled: true,
    headers: { ...VIDY_HEADERS },
    createdAt: '2026-11-24T00:00:00.000Z',
    updatedAt: '2026-11-24T00:00:00.000Z',
  },
];

export function emptyManifestProxyConfig(): ManifestProxyConfigFile {
  return { version: 0, entries: [] };
}

export function parseManifestProxyConfig(raw: unknown): ManifestProxyConfigFile {
  const parsed = ConfigFileSchema.parse(raw);
  const entries = parsed.entries.map((entry) => ({
    id: entry.id,
    match: normalizeManifestProxyMatch(entry.match),
    mode: entry.mode,
    enabled: entry.enabled,
    headers: validateHeaders(entry.headers),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  }));
  return {
    version: parsed.version,
    ...(parsed.updatedAt ? { updatedAt: parsed.updatedAt } : {}),
    entries,
  };
}

function mergeEntries(persisted: readonly ManifestProxyEntry[]): ManifestProxyEntry[] {
  const byId = new Map<string, ManifestProxyEntry>();
  for (const entry of DEFAULT_MANIFEST_PROXY_ENTRIES) byId.set(entry.id, { ...entry });
  for (const entry of persisted) byId.set(entry.id, { ...entry });
  return Array.from(byId.values());
}

export function findManifestProxyEntry(
  rawUrl: string,
  entries: readonly ManifestProxyEntry[],
): ManifestProxyEntry | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (rawUrl.length > MAX_URL_LENGTH) return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;
  if (isPrivateHostname(url.hostname)) return null;

  let best: ManifestProxyEntry | null = null;
  const normalizedUrl = url.href;
  for (const entry of entries) {
    if (!entry.enabled || entry.mode !== 'manifest') continue;
    if (!normalizedUrl.startsWith(entry.match)) continue;
    if (!best || entry.match.length > best.match.length) best = entry;
  }
  return best;
}

function uniqueId(): string {
  return `mp-${crypto.randomUUID()}`;
}

export class ManifestProxyStore {
  private readonly filePath: string;
  private readonly onWarning?: (message: string) => void;
  private state: ManifestProxyConfigFile = emptyManifestProxyConfig();

  constructor(options: ManifestProxyStoreOptions) {
    this.filePath = options.filePath;
    this.onWarning = options.onWarning;
  }

  getFilePath(): string {
    return this.filePath;
  }

  get(): ManifestProxyConfigFile {
    return this.state;
  }

  getVersion(): number {
    return this.state.version;
  }

  getEntries(): ManifestProxyEntry[] {
    return mergeEntries(this.state.entries);
  }

  load(): ManifestProxyConfigFile {
    if (!fs.existsSync(this.filePath)) {
      this.state = emptyManifestProxyConfig();
      return this.state;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as unknown;
      this.state = parseManifestProxyConfig(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.onWarning?.(`manifest proxy config ignored: ${message}`);
      this.state = emptyManifestProxyConfig();
    }
    return this.state;
  }

  replace(next: unknown): ManifestProxyConfigFile {
    return this.persist(parseManifestProxyConfig(next));
  }

  add(input: { match: string; headers?: unknown }): ManifestProxyEntry {
    const match = normalizeManifestProxyMatch(input.match);
    const headers = validateHeaders(input.headers);
    const entries = this.getEntries();
    if (entries.length >= MAX_ENTRIES) throw new Error(`at most ${MAX_ENTRIES} entries are allowed`);
    if (entries.some((entry) => entry.match === match)) {
      throw new Error('an entry for this URL prefix already exists');
    }
    const now = new Date().toISOString();
    const entry: ManifestProxyEntry = {
      id: uniqueId(),
      match,
      mode: 'manifest',
      enabled: true,
      headers,
      createdAt: now,
      updatedAt: now,
    };
    this.persist({
      ...this.state,
      version: this.state.version + 1,
      updatedAt: now,
      entries: [...this.state.entries, entry],
    });
    return entry;
  }

  toggle(id: string, enabled: boolean): ManifestProxyEntry {
    const current = this.getEntries().find((entry) => entry.id === id);
    if (!current) throw new Error('entry not found');
    const now = new Date().toISOString();
    const existing = this.state.entries.find((entry) => entry.id === id);
    const next: ManifestProxyEntry = {
      ...(existing ?? current),
      enabled,
      updatedAt: now,
    };
    const entries = existing
      ? this.state.entries.map((entry) => (entry.id === id ? next : entry))
      : [...this.state.entries, next];
    this.persist({
      ...this.state,
      version: this.state.version + 1,
      updatedAt: now,
      entries,
    });
    return next;
  }

  remove(id: string): ManifestProxyEntry | null {
    const current = this.getEntries().find((entry) => entry.id === id);
    if (!current) return null;
    const isDefault = DEFAULT_MANIFEST_PROXY_ENTRIES.some((entry) => entry.id === id);
    const now = new Date().toISOString();
    if (isDefault) {
      // Built-in entries cannot be deleted from code; persist a disabled copy.
      const existing = this.state.entries.find((entry) => entry.id === id);
      const disabled: ManifestProxyEntry = {
        ...(existing ?? current),
        enabled: false,
        updatedAt: now,
      };
      const entries = existing
        ? this.state.entries.map((entry) => (entry.id === id ? disabled : entry))
        : [...this.state.entries, disabled];
      this.persist({
        ...this.state,
        version: this.state.version + 1,
        updatedAt: now,
        entries,
      });
      return disabled;
    }
    this.persist({
      ...this.state,
      version: this.state.version + 1,
      updatedAt: now,
      entries: this.state.entries.filter((entry) => entry.id !== id),
    });
    return current;
  }

  private persist(next: ManifestProxyConfigFile): ManifestProxyConfigFile {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const temp = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
    fs.renameSync(temp, this.filePath);
    this.state = next;
    return next;
  }
}

export function createManifestProxyStore(options: {
  dataDir: string;
  onWarning?: (message: string) => void;
}): ManifestProxyStore {
  return new ManifestProxyStore({
    filePath: path.join(options.dataDir, 'manifest-proxy.json'),
    ...(options.onWarning ? { onWarning: options.onWarning } : {}),
  });
}
