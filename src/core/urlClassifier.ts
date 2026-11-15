/**
 * Canonical URL and stream classifier.
 * Single source of truth for:
 * - Direct playable media recognition (extensions and streaming API endpoints like /api/watch/m3u8)
 * - Compressed archive detection (.zip, .rar, etc.)
 * - HTML web / embed page detection
 * - Blocker / anti-bot endpoint filtering
 * - Canonical stream key normalization for cross-fleet deduplication
 */

export const ARCHIVE_EXTENSIONS = /\.(zip|rar|7z|tar|gz|bz2|iso|xz)($|\?|&|#)/i;
export const BLOCKER_URL_PATTERN = /\/(slowdown|ratelimit|antibot)\b/i;

// Direct media extensions or path segments (e.g. .m3u8, /m3u8, .mp4, /mp4, .mpd, /mpd)
export const DIRECT_MEDIA_PATTERN = /(?:\.|\/)(mp4|mkv|m4v|webm|avi|mov|flv|m3u8|mpd|ts)(?:$|[?&#/])/i;
export const HTML_EXTENSIONS = /\.(html?|php|aspx?|jsp|cgi)($|\?|&|#)/i;

export const EMBED_OR_WEB_PATTERNS = [
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

export const KNOWN_EMBED_DOMAINS = [
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

export interface StreamTextHint {
  server?: unknown;
  name?: unknown;
  title?: unknown;
  tag?: unknown;
  tags?: unknown[];
  quality?: unknown;
  externalUrl?: unknown;
}

export function isBlockerUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  return BLOCKER_URL_PATTERN.test(rawUrl);
}

export function isArchiveUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  if (ARCHIVE_EXTENSIONS.test(rawUrl)) return true;
  try {
    const parsed = new URL(rawUrl);
    return ARCHIVE_EXTENSIONS.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function isDirectMediaUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl);
    const pathname = parsed.pathname;
    if (DIRECT_MEDIA_PATTERN.test(pathname)) {
      return true;
    }
    // Check direct media in query parameters (e.g. ?url=...master.m3u8)
    for (const param of ['url', 'stream', 'link', 'source', 'src', 'file', 'm3u8']) {
      const val = parsed.searchParams.get(param);
      if (val && DIRECT_MEDIA_PATTERN.test(val)) {
        return true;
      }
    }
    return false;
  } catch {
    return DIRECT_MEDIA_PATTERN.test(rawUrl);
  }
}

function isDirectHost(hostname: string, pathname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host.endsWith('.r2.cloudflarestorage.com') ||
    host.endsWith('.googleusercontent.com') ||
    host.includes('direct-stream') ||
    (host === 'pixeldrain.com' && pathname.startsWith('/api/file/'))
  );
}

function hasEmbedTextHint(rawUrl: string, hint?: StreamTextHint): boolean {
  if (!hint) return false;
  const tagsStr = Array.isArray(hint.tags)
    ? hint.tags.filter((t): t is string => typeof t === 'string').join(' ')
    : '';
  const textHint = [
    typeof hint.server === 'string' ? hint.server : '',
    typeof hint.name === 'string' ? hint.name : '',
    typeof hint.title === 'string' ? hint.title : '',
    typeof hint.tag === 'string' ? hint.tag : '',
    tagsStr,
    typeof hint.quality === 'string' ? hint.quality : '',
  ].join(' ');
  return /\[embed\]|\bembed\b/i.test(textHint) && !isDirectMediaUrl(rawUrl);
}

export function isWebPage(rawUrl: string, hint?: StreamTextHint): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  if (typeof hint?.externalUrl === 'string' && hint.externalUrl.length > 0) return true;
  if (hasEmbedTextHint(rawUrl, hint)) return true;

  try {
    const parsed = new URL(rawUrl);
    const pathname = parsed.pathname;
    const hostname = parsed.hostname.toLowerCase();

    // Direct media paths / extensions always take precedence over embed patterns
    if (isDirectMediaUrl(rawUrl)) return false;

    // Direct hosts
    if (isDirectHost(hostname, pathname)) return false;

    // HTML / script extensions
    if (HTML_EXTENSIONS.test(pathname)) return true;

    // Embed/web patterns in full path and query
    const fullPathAndQuery = `${pathname}${parsed.search}`;
    for (const pattern of EMBED_OR_WEB_PATTERNS) {
      if (pattern.test(fullPathAndQuery)) return true;
    }

    // Known embed / web player domains
    for (const domain of KNOWN_EMBED_DOMAINS) {
      if (hostname.includes(domain)) return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function isExternalUrl(rawUrl: string, hint?: StreamTextHint): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  if (isArchiveUrl(rawUrl)) return true;
  return isWebPage(rawUrl, hint);
}

export function normalizeStreamKey(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (/^magnet:\?/i.test(trimmed)) {
    const match = trimmed.match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
    return match ? `magnet:${match[1]!.toLowerCase()}` : trimmed.toLowerCase();
  }
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const port = parsed.port ? `:${parsed.port}` : '';
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    return `${parsed.protocol}//${host}${port}${pathname}${parsed.search}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

export const canonicalizeStreamKey = normalizeStreamKey;
