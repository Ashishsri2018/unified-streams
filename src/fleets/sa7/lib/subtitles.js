'use strict';

const path = require('node:path');

// Attempt to load canonical core subtitles when built
let core = null;
try {
  const corePath = path.resolve(process.cwd(), 'dist/core/subtitles.js');
  core = require(corePath);
} catch {
  core = null;
}

const LANG_ALIASES = {
  en: 'en', eng: 'en', english: 'en',
  hi: 'hi', hin: 'hi', hindi: 'hi',
  ta: 'ta', tam: 'ta', tamil: 'ta',
  te: 'te', tel: 'te', telugu: 'te',
  ml: 'ml', mal: 'ml', malayalam: 'ml',
  kn: 'kn', kan: 'kn', kannada: 'kn',
  ja: 'ja', jpn: 'ja', japanese: 'ja',
  ko: 'ko', kor: 'ko', korean: 'ko',
  fr: 'fr', fre: 'fr', french: 'fr',
  es: 'es', spa: 'es', spanish: 'es',
  de: 'de', ger: 'de', german: 'de',
  ru: 'ru', rus: 'ru', russian: 'ru',
  ar: 'ar', ara: 'ar', arabic: 'ar',
  zh: 'zh', chi: 'zh', chinese: 'zh',
  multi: 'multi', multilingual: 'multi', mul: 'multi',
};

function langCode(value) {
  if (core && typeof core.normalizeSubtitleLanguage === 'function') {
    const res = core.normalizeSubtitleLanguage(value);
    return res === 'unknown' ? 'und' : res;
  }
  const key = String(value || '').trim().toLowerCase().replace(/[._]/g, '-').split('-')[0];
  return LANG_ALIASES[key] || (key.length > 0 && key.length <= 3 ? key : 'und');
}

function normalizeSubtitles(subtitles) {
  if (core && typeof core.normalizeSubtitlesTrackList === 'function') {
    return core.normalizeSubtitlesTrackList(subtitles, 'sa7-sub');
  }
  if (!Array.isArray(subtitles)) return [];
  const result = [];
  for (const subtitle of subtitles) {
    if (!subtitle) continue;
    const url = typeof subtitle === 'string' ? subtitle : subtitle.url || subtitle.file || subtitle.src;
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) continue;
    const label = subtitle.lang || subtitle.language || subtitle.label || subtitle.name || 'und';
    result.push({
      id: String(subtitle.id || url),
      url,
      lang: langCode(label),
    });
  }
  return result;
}

module.exports = {
  langCode,
  normalizeSubtitles,
};
