/**
 * Stream HTTP Headers and Host sanitization utilities.
 * Shared between gateway and scraper fleets.
 */

const BLOCKED_HEADERS = new Set([
  'connection',
  'keep-alive',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  'content-type',
  'accept-encoding',
]);

const PLACEHOLDER_HOSTS = new Set([
  'example.com',
  'www.example.com',
  'example.org',
  'example.net',
  'localhost',
  'localhost.localdomain',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
]);

const VALID_HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Sanitizes upstream request headers for proxying:
 * - Strips hop-by-hop headers (Connection, Host, Transfer-Encoding, etc.)
 * - Strips Proxy-* headers
 * - Enforces valid HTTP header token names and rejects CRLF injection
 */
export function sanitizeProxyHeaders(raw: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!isRecord(raw)) return result;

  for (const [rawName, rawValue] of Object.entries(raw)) {
    if (typeof rawValue !== 'string') continue;
    const name = rawName.trim();
    const value = rawValue.trim();
    if (!name || !value) continue;
    if (!VALID_HEADER_NAME.test(name)) continue;
    if (/[\r\n]/.test(value)) continue;

    const lower = name.toLowerCase();
    if (BLOCKED_HEADERS.has(lower) || lower.startsWith('proxy-')) continue;
    result[name] = value;
  }
  return result;
}

/**
 * Identifies dummy, documentation, loopback, or placeholder hosts.
 */
export function isPlaceholderHost(hostname: string): boolean {
  if (!hostname || typeof hostname !== 'string') return true;
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (PLACEHOLDER_HOSTS.has(host)) return true;
  return (
    host.endsWith('.example.com') ||
    host.endsWith('.example.org') ||
    host.endsWith('.example.net')
  );
}

/**
 * Safely parses a string into a URL object only if protocol is http: or https:.
 */
export function parseHttpUrl(value: string): URL | null {
  if (!value || typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}
