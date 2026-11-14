/**
 * Nuvio fleet URL classifier wrapper.
 * Re-exports canonical classification utilities from core/urlClassifier.
 */

export {
  BLOCKER_URL_PATTERN,
  StreamTextHint,
  isBlockerUrl,
  isArchiveUrl,
  isDirectMediaUrl,
  isWebPage,
  isExternalUrl,
  normalizeStreamKey,
} from "../../../core/urlClassifier.js";
