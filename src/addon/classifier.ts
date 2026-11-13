/**
 * URL Classifier for Stremio streams.
 * Distinguishes direct playable media from external HTML/embed links
 * and filters out blocker/anti-bot endpoints.
 */

export const ARCHIVE_EXTENSIONS = /\.(zip|rar|7z|tar|gz|bz2|iso|xz)($|\?|&|#)/i;
const DIRECT_MEDIA_EXTENSIONS = /\.(mp4|mkv|m4v|webm|avi|mov|flv|m3u8|mpd)($|\?|&|#)/i;
const HTML_EXTENSIONS = /\.(html?|php|aspx?|jsp|cgi)($|\?|&|#)/i;

const EMBED_OR_WEB_PATTERNS = [
  /\/embed(?:\/|\?|$)/i,
  /\/player(?:\/|\?|$)/i,
  /\/watch(?:\/|\?|$)/i,
  /\/e\/[a-zA-Z0-9_-]+/i,
  /\/v\/[a-zA-Z0-9_-]+/i,
  /\/iframe(?:\/|\?|$)/i,
  /\/tg\/(?:go|bot)\b/i,
  /t\.me\//i,
  /telegram\./i,
];

const KNOWN_EMBED_DOMAINS = [
  'moviesapi.to',
  'vidspark.to',
  'rubystm.com',
  'streamruby.net',
  'filesforever.link',
  'modiplay.xyz',
  'screenscape.me',
  'peachify.top',
  'nxsha.app',
  'nhdapi.com',
  'moviesnexus.fun',
  'vidrift.net',
  'vidout.pages.dev',
  'filmu.in',
  'vidbolt.xyz',
  'primesrc.',
  'xpass.',
  'vidrock.',
  'vaplayer.',
  'telegram.me',
  't.me',
  '2embed.to',
  '2embed.cc',
  'autoembed.to',
  'multimovies.site',
  'superembed.stream',
  'player.smashystream.com',
  'streamwish.to',
  'vidlox.me',
  'doodstream.com',
  'dood.to',
  'dood.so',
  'mixdrop.co',
  'filelions.to',
  'streamtape.com',
];

export function isBlockerUrl(rawUrl: string): boolean {
  const lower = rawUrl.toLowerCase();
  return lower.includes('/slowdown') || lower.includes('/ratelimit') || lower.includes('/antibot');
}

export function isArchiveUrl(rawUrl: string): boolean {
  if (ARCHIVE_EXTENSIONS.test(rawUrl)) return true;
  try {
    const parsed = new URL(rawUrl);
    return ARCHIVE_EXTENSIONS.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function isExternalUrl(rawUrl: string): boolean {
  // Compressed files are NOT externalUrl
  if (isArchiveUrl(rawUrl)) return false;

  try {
    const parsed = new URL(rawUrl);
    const pathname = parsed.pathname;

    // Direct media extensions (mp4, mkv, m3u8, mpd, etc.)
    if (DIRECT_MEDIA_EXTENSIONS.test(pathname)) {
      return false;
    }

    // Direct hosts (R2, Google UserContent, direct-stream, pixeldrain direct file API)
    const host = parsed.hostname.toLowerCase();
    if (
      host.endsWith('.r2.cloudflarestorage.com') ||
      host.endsWith('.googleusercontent.com') ||
      host.includes('direct-stream') ||
      (host === 'pixeldrain.com' && pathname.startsWith('/api/file/'))
    ) {
      return false;
    }

    // HTML / PHP / ASP / web script extensions -> HTML page
    if (HTML_EXTENSIONS.test(pathname)) {
      return true;
    }

    // Embed/web patterns in full path or query
    const fullPathAndQuery = `${pathname}${parsed.search}`;
    for (const pattern of EMBED_OR_WEB_PATTERNS) {
      if (pattern.test(fullPathAndQuery)) return true;
    }

    // Known embed / web player domains
    for (const domain of KNOWN_EMBED_DOMAINS) {
      if (host.includes(domain)) return true;
    }

    // Links with no extension or unlisted extensions are NOT externalUrl.
    // Only HTML pages belong in externalUrl.
    return false;
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
