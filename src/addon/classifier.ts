/**
 * Gateway URL Classifier wrapper.
 * Re-exports canonical classification utilities from core/urlClassifier.
 */

export {
  ARCHIVE_EXTENSIONS,
  BLOCKER_URL_PATTERN,
  DIRECT_MEDIA_PATTERN,
  HTML_EXTENSIONS,
  EMBED_OR_WEB_PATTERNS,
  KNOWN_EMBED_DOMAINS,
  StreamTextHint,
  isBlockerUrl,
  isArchiveUrl,
  isDirectMediaUrl,
  isWebPage,
  isExternalUrl,
  normalizeStreamKey,
  canonicalizeStreamKey,
} from '../core/urlClassifier.js';
