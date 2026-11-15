/**
 * Subtitle language normalizer and track filter.
 * Re-exports canonical implementations from src/core/subtitles.js.
 */

export {
  LANGUAGE_ALIASES,
  normalizeSubtitleLanguage,
  filterSubtitleTracks,
  normalizeSubtitlesTrackList,
} from '../core/subtitles.js';
export type { SubtitleTrack } from '../core/subtitles.js';
