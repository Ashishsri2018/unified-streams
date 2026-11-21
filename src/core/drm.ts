/**
 * DRM metadata passthrough.
 *
 * Provider engines emit DRM in slightly different shapes. The gateway is not a DRM
 * authority: it only verifies that the value is a plausible object and preserves every
 * field so DRM-capable clients can consume information this gateway does not understand.
 */

export interface DrmInfo {
  type?: string;
  clearKeys?: Record<string, string>;
  licenseUrl?: string;
  keyId?: string;
  key?: string;
  kty?: string;
  keyRequestParameters?: Record<string, string>;
  headers?: Record<string, string>;
  [key: string]: unknown;
}

const CLEARKEY_TYPES = new Set(['clearkey', 'org.w3.clearkey']);
const WIDEVINE_TYPES = new Set(['widevine', 'com.widevine.alpha']);
const PLAYREADY_TYPES = new Set(['playready', 'com.microsoft.playready']);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns a shallow copy of a recognizable DRM object, preserving unknown fields.
 * Invalid or unsupported values are dropped so clients never receive junk.
 */
export function normalizeDrm(value: unknown): DrmInfo | undefined {
  if (!isPlainObject(value)) return undefined;

  const type = isNonEmptyString(value.type) ? value.type.trim().toLowerCase() : undefined;
  const clearKeys = value.clearKeys;
  const hasClearKeys = isPlainObject(clearKeys) && Object.keys(clearKeys).length > 0;
  const licenseUrl = isNonEmptyString(value.licenseUrl) ? value.licenseUrl.trim() : undefined;

  const recognized =
    (type !== undefined &&
      (CLEARKEY_TYPES.has(type) || WIDEVINE_TYPES.has(type) || PLAYREADY_TYPES.has(type))) ||
    hasClearKeys ||
    licenseUrl !== undefined;

  if (!recognized) return undefined;

  // Keep the original field names and values; clients may support more than this gateway.
  return { ...value } as DrmInfo;
}
