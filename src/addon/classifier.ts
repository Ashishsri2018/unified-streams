/**
 * URL Classifier for Stremio streams.
 * Distinguishes direct playable media from external web/embed/archive links
 * and filters out blocker/anti-bot endpoints.
 */

const ARCHIVE_EXTENSIONS = /\.(zip|rar|7z|tar|gz|bz2|iso)$/i;
const DIRECT_MEDIA_EXTENSIONS = /\.(mp4|mkv|m4v|webm|avi|mov|flv|m3u8|mpd)($|\?)/i;
const EMBED_OR_WEB_PATTERNS = [
  /\/embed\//i,
  /\/player\//i,
  /\/watch\//i,
  /\/e\//i,
  /\/v\//i,
  /t\.me\//i,
  /telegram\./i,
];

export function isBlockerUrl(rawUrl: string): boolean {
  const lower = rawUrl.toLowerCase();
  return lower.includes('/slowdown') || lower.includes('/ratelimit') || lower.includes('/antibot');
}

export function isExternalUrl(rawUrl: string): boolean {
  if (ARCHIVE_EXTENSIONS.test(rawUrl)) return true;

  try {
    const parsed = new URL(rawUrl);
    const pathname = parsed.pathname;

    // Check direct media extensions
    if (DIRECT_MEDIA_EXTENSIONS.test(pathname)) {
      return false;
    }

    // Direct hosts (R2, Google UserContent, S3, etc.)
    const host = parsed.hostname.toLowerCase();
    if (
      host.endsWith('.r2.cloudflarestorage.com') ||
      host.endsWith('.googleusercontent.com') ||
      host.includes('direct-stream')
    ) {
      return false;
    }

    // Embed/web patterns
    for (const pattern of EMBED_OR_WEB_PATTERNS) {
      if (pattern.test(rawUrl)) return true;
    }

    // HTML / PHP / ASP / generic web page
    if (/\.(html?|php|aspx?)($|\?)/i.test(pathname)) {
      return true;
    }

    // If no direct video extension is present, treat as external
    return true;
  } catch {
    return false;
  }
}

export function canonicalizeStreamKey(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const port = parsed.port ? `:${parsed.port}` : '';
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    // Retain query parameters (tokens/signatures) but discard hash fragments
    return `${parsed.protocol}//${host}${port}${pathname}${parsed.search}`;
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}
