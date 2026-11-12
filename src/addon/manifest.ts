export interface ManifestOptions {
  addonVersion: string;
  baseUrl: string;
  hasTmdb: boolean;
  hasMal: boolean;
  userConfigEncoded?: string;
}

export interface StremioManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  logo: string;
  types: Array<'movie' | 'series'>;
  resources: Array<'stream'>;
  idPrefixes: string[];
  catalogs: [];
  behaviorHints: {
    configurable: boolean;
  };
}

export const MANIFEST_ID = 'org.unifiedstreams.addon';

export function buildManifest(options: ManifestOptions): StremioManifest {
  const prefixes = ['tt'];
  if (options.hasTmdb) prefixes.push('tmdb:');
  if (options.hasMal) prefixes.push('mal:');

  const cleanBase = options.baseUrl.replace(/\/+$/, '');
  const logo = `${cleanBase}/logo.png?v=${options.addonVersion}`;

  return {
    id: MANIFEST_ID,
    version: options.addonVersion,
    name: 'Unified Streams',
    description: 'Unified streams from SA7, Nuvio, and Vega',
    logo,
    types: ['movie', 'series'],
    resources: ['stream'],
    idPrefixes: prefixes,
    catalogs: [],
    behaviorHints: {
      configurable: true,
    },
  };
}
