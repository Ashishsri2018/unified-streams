'use strict';

const { resolutionOf, sizeBytesOf } = require('./lib/stream-quality');
const { langCode, normalizeSubtitles } = require('./lib/subtitles');

function streamPassesFilters(stream) {
  return Boolean(stream);
}

function subtitleMatchesConfig() {
  return true;
}

module.exports = {
  streamPassesFilters,
  normalizeSubtitles,
  subtitleMatchesConfig,
  resolutionOf,
  sizeBytesOf,
  langCode,
};
