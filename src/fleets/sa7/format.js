const { normalizeSubtitles } = require('./filters');
const { isBlockerUrl, isArchiveUrl, isWebPage, isExternalUrl } = require('./lib/url-classifier');
const { qualityRank, sizeBytesOf } = require('./lib/stream-quality');

const BLOCKED_PROXY_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
  'proxy-authenticate',
  'te',
  'trailer',
  'keep-alive',
]);
const PROXY_HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function sanitizeProxyHeaders(headers) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return null;
  const result = {};
  let count = 0;
  for (const [rawName, rawValue] of Object.entries(headers)) {
    if (count >= 50) break;
    const name = String(rawName).trim();
    if (!name || name.length > 128 || !PROXY_HEADER_NAME.test(name)) continue;
    if (BLOCKED_PROXY_HEADERS.has(name.toLowerCase())) continue;
    if (typeof rawValue !== 'string' || rawValue.length > 8192) continue;
    if (/[\r\n]/.test(rawValue)) continue;
    result[name] = rawValue;
    count += 1;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function toStremioStream(stream, provider) {
  if (!stream) return null;

  const targetUrl = stream.url || stream.externalUrl;
  const hasInfoHash = typeof stream.infoHash === 'string' && stream.infoHash.length > 0;
  if (!targetUrl && !hasInfoHash) return null;
  if (targetUrl && isBlockerUrl(targetUrl)) return null;

  const isArchive = Boolean(targetUrl && isArchiveUrl(targetUrl));
  const isExternal = Boolean(targetUrl && isExternalUrl(targetUrl, stream));

  let name = provider.name;
  if (isArchive && !name.startsWith('🔲')) {
    name = `🔲 ${name}`;
  }

  let title = stream.description || stream.title || stream.name || 'Stream';
  if (isExternal && !title.startsWith('🖥️')) {
    const fallback = isArchive ? 'Archive' : 'External Link';
    title = `🖥️ ${title || fallback}`;
  }

  const out = {
    name,
    title,
  };

  if (targetUrl) {
    // Keep the full DRM object; the gateway validates it later.
    if (stream.drm && typeof stream.drm === 'object' && !Array.isArray(stream.drm)) {
      out.drm = stream.drm;
    }
    if (isExternal) {
      out.externalUrl = targetUrl;
    } else {
      out.url = targetUrl;
      const hints = {};
      const videoSize = sizeBytesOf(stream);
      if (videoSize != null) hints.videoSize = videoSize;
      const proxyHeaders = sanitizeProxyHeaders(stream.headers);
      if (proxyHeaders) {
        hints.proxyHeaders = { request: proxyHeaders };
        hints.notWebReady = true;
      }
      if (stream.behaviorHints && stream.behaviorHints.bingeGroup) {
        hints.bingeGroup = stream.behaviorHints.bingeGroup;
      }
      if (Object.keys(hints).length > 0) out.behaviorHints = hints;

      const subtitles = normalizeSubtitles(stream.subtitles);
      if (subtitles.length > 0) out.subtitles = subtitles;
    }
  } else {
    out.infoHash = stream.infoHash;
    if (stream.fileIdx != null) out.fileIdx = stream.fileIdx;
  }

  return out;
}

module.exports = { isWebPage, isExternalUrl, qualityRank, toStremioStream };
