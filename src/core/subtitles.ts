/**
 * Subtitle language normalizer, filter, and track formatter.
 * Canonical implementation used across Gateway and Scraper Fleets.
 */

import { parseHttpUrl } from './streamHeaders.js';

export interface SubtitleTrack {
  id?: string;
  url: string;
  lang: string;
  label?: string;
  title?: string;
}

export const LANGUAGE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  // English aliases
  english: 'en', eng: 'en', en: 'en',
  'en-us': 'en', 'en-gb': 'en',
  'e-sub': 'en', 'e.sub': 'en', 'e sub': 'en', esub: 'en',
  // Hindi & Indic
  hindi: 'hi', hin: 'hi', hi: 'hi',
  tamil: 'ta', tam: 'ta', ta: 'ta',
  telugu: 'te', tel: 'te', te: 'te',
  malayalam: 'ml', mal: 'ml', ml: 'ml',
  kannada: 'kn', kan: 'kn', kn: 'kn',
  bengali: 'bn', ben: 'bn', bn: 'bn',
  marathi: 'mr', mar: 'mr', mr: 'mr',
  // Other major languages
  spanish: 'es', spa: 'es', es: 'es',
  french: 'fr', fre: 'fr', fra: 'fr', fr: 'fr',
  german: 'de', ger: 'de', deu: 'de', de: 'de',
  japanese: 'ja', jpn: 'ja', ja: 'ja',
  korean: 'ko', kor: 'ko', ko: 'ko',
  chinese: 'zh', chi: 'zh', zho: 'zh', zh: 'zh',
  arabic: 'ar', ara: 'ar', ar: 'ar',
  russian: 'ru', rus: 'ru', ru: 'ru',
  portuguese: 'pt', por: 'pt', pt: 'pt',
  'pt-br': 'pt', 'brazilian portuguese': 'pt',
  multi: 'multi', multilingual: 'multi', mul: 'multi',
  und: 'unknown', unknown: 'unknown',
});

export function normalizeSubtitleLanguage(rawLang: string | undefined): string {
  if (!rawLang || typeof rawLang !== 'string') return 'unknown';
  const clean = rawLang.trim().toLowerCase().replace(/[._]/g, '-');
  if (LANGUAGE_ALIASES[clean]) {
    return LANGUAGE_ALIASES[clean];
  }
  const hyphenIdx = clean.indexOf('-');
  if (hyphenIdx > 0) {
    const base = clean.slice(0, hyphenIdx);
    if (LANGUAGE_ALIASES[base]) {
      return LANGUAGE_ALIASES[base];
    }
  }
  return clean.length <= 3 ? clean : 'unknown';
}

export const langCode = normalizeSubtitleLanguage;

export function filterSubtitleTracks(
  tracks: SubtitleTrack[] | undefined,
  mode: 'all' | 'none' | 'languages',
  selectedLangs: string[],
  includeUnknown: boolean,
): SubtitleTrack[] | undefined {
  if (!tracks || tracks.length === 0) return undefined;
  if (mode === 'none') return undefined;
  if (mode === 'all') return tracks;

  const allowed = new Set(selectedLangs.map((l) => l.trim().toLowerCase()));

  const filtered = tracks.filter((track) => {
    const norm = normalizeSubtitleLanguage(track.lang || track.label);
    if (norm === 'unknown') {
      return includeUnknown;
    }
    return allowed.has(norm);
  });

  return filtered.length > 0 ? filtered : undefined;
}

export function normalizeSubtitlesTrackList(
  raw: unknown,
  idPrefix: string,
): SubtitleTrack[] {
  if (!Array.isArray(raw)) return [];
  const result: SubtitleTrack[] = [];
  const seenUrls = new Set<string>();

  raw.forEach((item) => {
    if (!item) return;
    let url = '';
    let rawLang = '';
    let title: string | undefined;

    if (typeof item === 'string') {
      url = item.trim();
    } else if (typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      url = String(obj.url || obj.uri || obj.file || obj.src || '').trim();
      rawLang = String(obj.lang || obj.language || obj.label || obj.name || '').trim();
      if (typeof obj.title === 'string' && obj.title.trim()) {
        title = obj.title.trim();
      }
    }

    if (!parseHttpUrl(url) || seenUrls.has(url)) return;
    seenUrls.add(url);

    const normLang = normalizeSubtitleLanguage(rawLang);
    const lang = normLang === 'unknown' ? (rawLang ? rawLang.slice(0, 3) : 'en') : normLang;
    const id = result.length === 0 ? idPrefix : `${idPrefix}-${result.length}`;

    result.push({
      id,
      url,
      lang,
      ...(title ? { title } : {}),
    });
  });

  return result;
}
