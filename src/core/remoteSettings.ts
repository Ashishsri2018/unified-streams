import { z } from 'zod';
import type { ManifestProxyConfigFile } from './manifestProxyConfig.js';
import type { ProviderOverridesFile } from './providerOverrides.js';

export interface RemoteSettingsBlob extends ProviderOverridesFile {
  manifestProxy?: ManifestProxyConfigFile;
}

const RemoteSettingsResponseSchema = z.object({
  settings: z.unknown().nullable().optional(),
  version: z.number().int().min(0).optional(),
  updatedAt: z.string().optional(),
});

const RemoteSaveResponseSchema = z.object({
  ok: z.literal(true),
  version: z.number().int().min(0),
  updatedAt: z.string().optional(),
});

export interface RemoteSettingsClientOptions {
  endpoint?: string;
  token?: string;
  timeoutMs?: number;
}

export interface RemoteSaveResult {
  version: number;
  updatedAt?: string;
}

export class RemoteSettingsClient {
  private readonly endpoint?: string;
  private readonly token?: string;
  private readonly timeoutMs: number;

  constructor(options: RemoteSettingsClientOptions) {
    this.endpoint = options.endpoint?.replace(/\/+$/, '') || undefined;
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  isConfigured(): boolean {
    return Boolean(this.endpoint);
  }

  async load(): Promise<unknown | null> {
    const endpoint = this.requireEndpoint();
    const data = await this.requestJson(endpoint, { method: 'GET' }, RemoteSettingsResponseSchema);
    return data.settings ?? null;
  }

  async save(settings: RemoteSettingsBlob): Promise<RemoteSaveResult> {
    const endpoint = this.requireEndpoint();
    const data = await this.requestJson(
      endpoint,
      {
        method: 'PUT',
        body: JSON.stringify({ settings }),
      },
      RemoteSaveResponseSchema,
    );
    return {
      version: data.version,
      ...(data.updatedAt ? { updatedAt: data.updatedAt } : {}),
    };
  }

  private requireEndpoint(): string {
    if (!this.endpoint) {
      throw new Error('Cloudflare settings endpoint is not configured');
    }
    return `${this.endpoint}/v1/settings`;
  }

  private async requestJson<T>(
    url: string,
    init: { method: 'GET' | 'PUT'; body?: string },
    schema: z.ZodType<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {};
      if (init.body) headers['content-type'] = 'application/json';
      if (this.token) headers.authorization = `Bearer ${this.token}`;
      const response = await fetch(url, {
        method: init.method,
        headers,
        ...(init.body ? { body: init.body } : {}),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Cloudflare settings HTTP ${response.status}`);
      }
      const raw = (await response.json()) as unknown;
      return schema.parse(raw);
    } finally {
      clearTimeout(timer);
    }
  }
}
