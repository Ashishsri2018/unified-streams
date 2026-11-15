/**
 * Redaction utility to ensure sensitive information (tokens, secrets, cookies,
 * and signed/tokenized stream URLs) is never leaked into logs or error dumps.
 */

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /api[_-]?key[:=]\s*["']?[A-Za-z0-9-_]+["']?/gi,
  /token[:=]\s*["']?[A-Za-z0-9-_]+["']?/gi,
  /password[:=]\s*["']?[^"'\s]+["']?/gi,
  /secret[:=]\s*["']?[^"'\s]+["']?/gi,
  /cf_clearance=[^;\s]+/gi,
  /session[_-]?id=[^;\s]+/gi,
];

/**
 * Sanitizes a URL by preserving scheme and hostname, while stripping query parameters
 * that frequently contain auth signatures or tokens.
 */
export function sanitizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.search) {
      return `${parsed.origin}${parsed.pathname}?__REDACTED__`;
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    // If not a valid URL, replace potential query params
    const qIdx = rawUrl.indexOf('?');
    if (qIdx !== -1) {
      return `${rawUrl.slice(0, qIdx)}?__REDACTED__`;
    }
    return rawUrl;
  }
}

/**
 * Redacts known sensitive patterns from string values.
 */
export function redactString(input: string): string {
  let result = input;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

/**
 * Deeply redacts an object, sanitizing URLs and masking sensitive keys.
 */
export function redactObject<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return redactString(obj) as unknown as T;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item)) as unknown as T;
  }

  const output: Record<string, unknown> = {};
  const sensitiveKeys = new Set([
    'password',
    'token',
    'secret',
    'apikey',
    'api_key',
    'cookie',
    'cookies',
    'authorization',
    'internal_token',
    'github_token',
    'tmdb_api_key',
  ]);

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.has(lowerKey)) {
      output[key] = '[REDACTED]';
    } else if (typeof value === 'string' && (lowerKey.includes('url') || lowerKey.includes('link'))) {
      output[key] = sanitizeUrl(value);
    } else {
      output[key] = redactObject(value);
    }
  }

  return output as T;
}
