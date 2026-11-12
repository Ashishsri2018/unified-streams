/**
 * Subtitle language normalizer and track filter.
 * Normalizes language codes/names to 2-character ISO 639-1 base codes where applicable.
 */

export interface SubtitleTrack {
  id?: string;
  url: string;
  lang: string;
  label?: string;
}

const LANGUAGE_ALIASES: Record<string, string> = {
  // English aliases
  english: 'en',
  eng: 'en',
  en: 'en',
  'en-us': 'en',
  'en-gb': 'en',
  'e-sub': 'en',
  'e.sub': 'en',
  'e sub': 'en',
  esub: 'en',
  // Hindi & Indic
  hindi: 'hi',
  hin: 'hi',
  hi: 'hi',
  tamil: 'ta',
  tam: 'ta',
  ta: 'ta',
  telugu: 'te',
  tel: 'te',
  te: 'te',
  malayalam: 'ml',
  mal: 'ml',
  ml: 'ml',
  kannada: 'kn',
  kan: 'kn',
  kn: 'kn',
  bengali: 'bn',
  ben: 'bn',
  bn: 'bn',
  marathi: 'mr',
  mar: 'mr',
  mr: 'mr',
  // Other major languages
  spanish: 'es',
  spa: 'es',
  es: 'es',
  french: 'fr',
  fre: 'fr',
  fra: 'fr',
  fr: 'fr',
  german: 'de',
  ger: 'de',
  deu: 'de',
  de: 'de',
  japanese: 'ja',
  jpn: 'ja',
  ja: 'ja',
  korean: 'ko',
  kor: 'ko',
  ko: 'ko',
  chinese: 'zh',
  chi: 'zh',
  zho: 'zh',
  zh: 'zh',
  arabic: 'ar',
  ara: 'ar',
  ar: 'ar',
  russian: 'ru',
  rus: 'ru',
  ru: 'ru',
  portuguese: 'pt',
  por: 'pt',
  pt: 'pt',
  'pt-br': 'pt',
  'brazilian portuguese': 'pt',
  multi: 'multi',
  und: 'unknown',
  unknown: 'unknown',
};

export function normalizeSubtitleLanguage(rawLang: string | undefined): string {
  if (!rawLang) return 'unknown';
  const clean = rawLang.trim().toLowerCase();
  if (LANGUAGE_ALIASES[clean]) {
    return LANGUAGE_ALIASES[clean];
  }
  // If format is like 'en-US' or 'zh-CN', extract base code
  const hyphenIdx = clean.indexOf('-');
  if (hyphenIdx > 0) {
    const base = clean.slice(0, hyphenIdx);
    if (LANGUAGE_ALIASES[base]) {
      return LANGUAGE_ALIASES[base];
    }
  }
  return clean;
}

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
