'use strict';

const path = require('node:path');

// Attempt to load canonical core classifier when built
let core = null;
try {
  const corePath = path.resolve(process.cwd(), 'dist/core/urlClassifier.js');
  core = require(corePath);
} catch {
  core = null;
}

const ARCHIVE_EXTENSIONS = /\.(zip|rar|7z|tar|gz|bz2|iso|xz)($|\?|&|#)/i;
const BLOCKER_URL_PATTERN = /\/(slowdown|ratelimit|antibot)\b/i;
const DIRECT_MEDIA_PATTERN = /(?:\.|\/)(mp4|mkv|m4v|webm|avi|mov|flv|m3u8|mpd|ts)(?:$|[?&#/])/i;
const HTML_EXTENSIONS = /\.(html?|php|aspx?|jsp|cgi)($|\?|&|#)/i;

const EMBED_PATH_PATTERNS = [
  /\/embed(?:\/|\?|$)/i,
  /\/e\/[a-zA-Z0-9_-]+/i,
  /\/v\/[a-zA-Z0-9_-]+/i,
  /\/iframe(?:\/|\?|$)/i,
  /\/player(?:\/|\?|$)/i,
  /\/watch(?:\/|\?|$)/i,
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

function isBlockerUrl(rawUrl) {
  if (core && typeof core.isBlockerUrl === 'function') return core.isBlockerUrl(rawUrl);
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  return BLOCKER_URL_PATTERN.test(rawUrl);
}

function isArchiveUrl(rawUrl) {
  if (core && typeof core.isArchiveUrl === 'function') return core.isArchiveUrl(rawUrl);
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  if (ARCHIVE_EXTENSIONS.test(rawUrl)) return true;
  try {
    const parsed = new URL(rawUrl);
    return ARCHIVE_EXTENSIONS.test(parsed.pathname);
  } catch {
    return false;
  }
}

function isDirectMediaUrl(rawUrl) {
  if (core && typeof core.isDirectMediaUrl === 'function') return core.isDirectMediaUrl(rawUrl);
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl);
    const pathname = parsed.pathname;
    if (DIRECT_MEDIA_PATTERN.test(pathname)) return true;
    for (const param of ['url', 'stream', 'link', 'source', 'src', 'file', 'm3u8']) {
      const val = parsed.searchParams.get(param);
      if (val && DIRECT_MEDIA_PATTERN.test(val)) return true;
    }
    return false;
  } catch {
    return DIRECT_MEDIA_PATTERN.test(rawUrl);
  }
}

function isWebPage(url, stream = {}) {
  if (core && typeof core.isWebPage === 'function') return core.isWebPage(url, stream);
  if (typeof stream.externalUrl === 'string' && stream.externalUrl.length > 0) return true;
  if (typeof url !== 'string' || url.length === 0) return false;

  const textHint = `${stream.server || ''} ${stream.name || ''} ${stream.title || ''}`;
  if (/\[embed\]|\bembed\b/i.test(textHint) && !isDirectMediaUrl(url)) {
    return true;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const pathname = parsed.pathname.toLowerCase();
  const hostname = parsed.hostname.toLowerCase();

  if (isDirectMediaUrl(url)) return false;

  if (
    hostname.endsWith('.r2.cloudflarestorage.com') ||
    hostname === 'video-downloads.googleusercontent.com' ||
    (hostname === 'pixeldrain.com' && pathname.startsWith('/api/file/'))
  ) {
    return false;
  }

  if (HTML_EXTENSIONS.test(pathname)) return true;

  const fullPathAndQuery = `${pathname}${parsed.search}`;
  for (const pattern of EMBED_PATH_PATTERNS) {
    if (pattern.test(fullPathAndQuery)) return true;
  }

  for (const domain of KNOWN_EMBED_DOMAINS) {
    if (hostname.includes(domain)) return true;
  }

  return false;
}

function isExternalUrl(url, stream = {}) {
  if (core && typeof core.isExternalUrl === 'function') return core.isExternalUrl(url, stream);
  if (isArchiveUrl(url)) return true;
  return isWebPage(url, stream);
}

module.exports = {
  isBlockerUrl,
  isArchiveUrl,
  isDirectMediaUrl,
  isWebPage,
  isExternalUrl,
};
