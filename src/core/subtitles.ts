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
  // English aliases & variants
  english: 'en', eng: 'en', en: 'en',
  'en-us': 'en', 'en-gb': 'en', 'en-uk': 'en', 'en-eu': 'en',
  'eng-us': 'en', 'eng-gb': 'en', 'eng-uk': 'en', 'eng-eu': 'en',
  'e-sub': 'en', 'e.sub': 'en', 'e sub': 'en', esub: 'en',
  // Hindi & Indic
  hindi: 'hi', hin: 'hi', hi: 'hi',
  tamil: 'ta', tam: 'ta', ta: 'ta',
  telugu: 'te', tel: 'te', te: 'te',
  malayalam: 'ml', mal: 'ml', ml: 'ml',
  kannada: 'kn', kan: 'kn', kn: 'kn',
  bengali: 'bn', ben: 'bn', bn: 'bn',
  marathi: 'mr', mar: 'mr', mr: 'mr',
  // Spanish
  spanish: 'es', spa: 'es', es: 'es',
  espanol: 'es', 'español': 'es', 'es-es': 'es', 'es-la': 'es',
  // French
  french: 'fr', fre: 'fr', fra: 'fr', fr: 'fr',
  francais: 'fr', 'français': 'fr', 'fr-fr': 'fr', 'fr-ca': 'fr',
  // German
  german: 'de', ger: 'de', deu: 'de', de: 'de',
  deutsch: 'de', 'de-de': 'de',
  // Italian
  italian: 'it', ita: 'it', it: 'it',
  italiano: 'it', 'it-it': 'it',
  // Japanese
  japanese: 'ja', jpn: 'ja', ja: 'ja',
  // Korean
  korean: 'ko', kor: 'ko', ko: 'ko',
  // Chinese
  chinese: 'zh', chi: 'zh', zho: 'zh', zh: 'zh',
  'zh-cn': 'zh', 'zh-tw': 'zh',
  // Arabic
  arabic: 'ar', ara: 'ar', ar: 'ar',
  // Russian
  russian: 'ru', rus: 'ru', ru: 'ru',
  // Portuguese
  portuguese: 'pt', por: 'pt', pt: 'pt',
  'pt-br': 'pt', 'pt-pt': 'pt',
  'brazilian-portuguese': 'pt', 'brazilian portuguese': 'pt', brazilian: 'pt',
  'português': 'pt', portugues: 'pt',
  // Turkish, Polish, Dutch, Swedish, Greek, Basque
  turkish: 'tr', tur: 'tr', tr: 'tr',
  polish: 'pl', pol: 'pl', pl: 'pl',
  dutch: 'nl', nld: 'nl', dut: 'nl', nl: 'nl',
  swedish: 'sv', swe: 'sv', sv: 'sv',
  greek: 'el', ell: 'el', gre: 'el', el: 'el',
  basque: 'eu', baq: 'eu', eus: 'eu', eu: 'eu',
  // Multilingual & Unknown
  multi: 'multi', multilingual: 'multi', mul: 'multi',
  und: 'unknown', unknown: 'unknown',
});

export function normalizeSubtitleLanguage(rawLang: string | undefined): string {
  if (!rawLang || typeof rawLang !== 'string') return 'unknown';

  let clean = rawLang.trim().toLowerCase();
  if (!clean) return 'unknown';

  // Strip parenthetical/bracketed content (e.g. "English (US)" -> "English", "eng [cc]" -> "eng")
  const stripped = clean.replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim();
  if (stripped) {
    clean = stripped;
  }

  // Normalize delimiters (e.g. "eng eu" -> "eng-eu", "e_sub" -> "e-sub", "en.us" -> "en-us")
  clean = clean.replace(/[._\s]+/g, '-');

  if (LANGUAGE_ALIASES[clean]) {
    return LANGUAGE_ALIASES[clean];
  }

  // Handle prefix/subtag (e.g. "en-us" -> "en", "eng-eu" -> "eng", "es-la" -> "es")
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
  if (mode === 'languages' && (!selectedLangs || selectedLangs.length === 0)) return tracks;

  // Build allowed set containing both normalized language codes and raw inputs
  const allowed = new Set<string>();
  for (const lang of selectedLangs) {
    const raw = lang.trim().toLowerCase();
    if (raw) {
      allowed.add(raw);
      const normalized = normalizeSubtitleLanguage(raw);
      if (normalized && normalized !== 'unknown') {
        allowed.add(normalized);
      }
    }
  }

  const filtered = tracks.filter((track) => {
    let norm = normalizeSubtitleLanguage(track.lang);
    if (norm === 'unknown' && (track.label || track.title)) {
      norm = normalizeSubtitleLanguage(track.label || track.title);
    }

    if (norm === 'unknown') {
      return includeUnknown;
    }

    if (allowed.has(norm)) return true;
    if (track.lang && allowed.has(track.lang.trim().toLowerCase())) return true;
    if (track.label && allowed.has(track.label.trim().toLowerCase())) return true;

    return false;
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
