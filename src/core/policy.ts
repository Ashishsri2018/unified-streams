import fs from 'node:fs';
import path from 'node:path';

export interface FleetPolicy {
  mode: 'allow' | 'deny';
  ids: string[];
}

export interface ProviderPolicyConfig {
  sa7: FleetPolicy;
  nuvio: FleetPolicy;
  vega: FleetPolicy;
}

const DEFAULT_DISABLED_PROVIDERS = new Set([
  'torrentio',
  'internetarchive',
  'youtube',
  'brellor',
  'mxplayer',
]);

export class ProviderPolicy {
  private config: ProviderPolicyConfig;

  constructor(customConfig?: ProviderPolicyConfig) {
    if (customConfig) {
      this.config = customConfig;
    } else {
      this.config = this.loadFromFile();
    }
  }

  private loadFromFile(): ProviderPolicyConfig {
    const policyPath = path.resolve(process.cwd(), 'config', 'providers.json');
    if (!fs.existsSync(policyPath)) {
      return {
        sa7: { mode: 'allow', ids: [] },
        nuvio: { mode: 'deny', ids: [] },
        vega: { mode: 'deny', ids: [] },
      };
    }
    const raw = fs.readFileSync(policyPath, 'utf-8');
    return JSON.parse(raw) as ProviderPolicyConfig;
  }

  isProviderEnabled(fleet: 'sa7' | 'nuvio' | 'vega', providerId: string): boolean {
    const cleanId = providerId.trim().toLowerCase();

    // Default disabled classes are never enabled by policy
    if (DEFAULT_DISABLED_PROVIDERS.has(cleanId)) {
      return false;
    }

    const fleetPolicy = this.config[fleet];
    if (!fleetPolicy) return false;

    const list = new Set(fleetPolicy.ids.map((id) => id.toLowerCase()));

    if (fleetPolicy.mode === 'allow') {
      return list.has(cleanId);
    } else {
      // mode === 'deny'
      return !list.has(cleanId);
    }
  }

  getEffectiveProviders(fleet: 'sa7' | 'nuvio' | 'vega', availableIds: string[]): string[] {
    return availableIds.filter((id) => this.isProviderEnabled(fleet, id));
  }

  getPolicyConfig(): ProviderPolicyConfig {
    return JSON.parse(JSON.stringify(this.config)) as ProviderPolicyConfig;
  }
}
