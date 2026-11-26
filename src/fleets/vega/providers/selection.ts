import { promises as fs } from "node:fs";
import path from "node:path";
import {
  isProviderEnabledWithOverrides,
  normalizeProviderOverrides,
} from "../../../core/policy.js";
import { isAdoptedUpstreamDisabled } from "../../../core/providerPolicy.js";
import type { ProviderCatalogResponse } from "../../../core/contract.js";
import type { AppConfig } from "../config.js";
import type {
  LoggerLike,
  ProviderBundle,
  ProviderSnapshot,
  UpstreamProviderEntry,
} from "../types.js";
import { loadProviderBundle } from "./loader.js";
import { parseManifest } from "./updater.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface SelectionResult {
  snapshot: ProviderSnapshot;
  catalog: ProviderCatalogResponse;
}

export class ProviderSelectionController {
  private readonly loadErrors = new Map<string, string>();

  constructor(
    private readonly config: AppConfig,
    private readonly logger: LoggerLike,
  ) {}

  private isEnabled(id: string): boolean {
    return isProviderEnabledWithOverrides(
      id,
      {
        enabled: this.config.enabledProviders,
        disabled: this.config.disabledProviders,
      },
      this.config.runtimeOverrides,
      this.config.hardDisabledProviders,
    );
  }

  private isAdopted(id: string): boolean {
    return isAdoptedUpstreamDisabled(id, {
      adoptUpstreamDisabled: this.config.adoptUpstreamDisabled,
    });
  }

  private isActive(entry: UpstreamProviderEntry): boolean {
    return (!entry.disabled || this.isAdopted(entry.value)) && this.isEnabled(entry.value);
  }

  getCatalog(snapshot: ProviderSnapshot | null): ProviderCatalogResponse {
    const entries = snapshot?.entries ?? [];
    const loaded = new Set(
      Array.from(snapshot?.bundles.keys() ?? [], (value) => value.toLowerCase()),
    );
    const known = new Set(entries.map((entry) => entry.value.toLowerCase()));
    const providers = entries.map((entry) => {
      const key = entry.value.toLowerCase();
      const change = snapshot?.changes?.[key];
      return {
        id: entry.value,
        name: entry.display_name || entry.value,
        types: entry.type ? [entry.type] : ["movie", "tv"],
        enabled: this.isActive(entry),
        upstreamEnabled: !entry.disabled,
        adopted: this.isAdopted(entry.value),
        loaded: loaded.has(key),
        locked: this.config.hardDisabledProviders.some(
          (id) => id.toLowerCase() === key,
        ),
        missing: false,
        lastError: this.loadErrors.get(key) ?? null,
        version: entry.version || "",
        isNew: change?.isNew ?? false,
        updated: change?.updated ?? false,
        previousVersion: change?.previousVersion ?? null,
      };
    });
    for (const rawId of Object.keys(this.config.runtimeOverrides)) {
      if (rawId === "*") continue;
      const key = rawId.toLowerCase();
      if (known.has(key)) continue;
      providers.push({
        id: rawId,
        name: rawId,
        types: ["movie", "tv"],
        enabled: false,
        upstreamEnabled: false,
        adopted: false,
        loaded: false,
        locked: this.config.hardDisabledProviders.some(
          (id) => id.toLowerCase() === key,
        ),
        missing: true,
        lastError: "provider not present in snapshot",
        version: "",
        isNew: false,
        updated: false,
        previousVersion: null,
      });
    }
    return {
      fleet: "vega",
      version: this.config.selectionVersion,
      providers,
      reconciliation: snapshot?.reconciliation,
    };
  }

  async apply(
    snapshot: ProviderSnapshot,
    overrides: Record<string, boolean>,
    version: number,
  ): Promise<SelectionResult> {
    this.config.runtimeOverrides = Object.fromEntries(normalizeProviderOverrides(overrides));
    this.config.selectionVersion = version;

    const entries = snapshot.entries ?? (await this.readEntries(snapshot.rootDir));
    const desired = entries.filter((entry) => this.isActive(entry));
    const bundles = new Map<string, ProviderBundle>();

    for (const entry of desired) {
      const existing = snapshot.bundles.get(entry.value);
      if (existing) {
        bundles.set(entry.value, existing);
        continue;
      }
      const key = entry.value.toLowerCase();
      try {
        const bundle = await loadProviderBundle(entry, path.join(snapshot.rootDir, entry.value));
        bundles.set(entry.value, bundle);
        this.loadErrors.delete(key);
      } catch (error) {
        const message = errorMessage(error);
        this.loadErrors.set(key, message);
        this.logger.warn("provider_selection_load_failed", {
          provider: entry.value,
          error: message,
        });
      }
    }

    const nextSnapshot: ProviderSnapshot = {
      ...snapshot,
      entries,
      bundles,
      createdAt: Date.now(),
    };
    this.logger.info("vega_selection_applied", {
      version,
      enabled: bundles.size,
      total: entries.length,
    });
    return { snapshot: nextSnapshot, catalog: this.getCatalog(nextSnapshot) };
  }

  private async readEntries(rootDir: string): Promise<UpstreamProviderEntry[]> {
    try {
      return parseManifest(await fs.readFile(path.join(rootDir, "manifest.json")));
    } catch (error) {
      this.logger.warn("provider_selection_manifest_failed", {
        rootDir,
        error: errorMessage(error),
      });
      return [];
    }
  }
}
