'use strict';

const path = require('node:path');

// Attempt to load canonical core streamQuality when built
let core = null;
try {
  const corePath = path.resolve(process.cwd(), 'dist/core/streamQuality.js');
  core = require(corePath);
} catch {
  core = null;
}

const RES_PATTERNS = [
  [/\b(2160p?|4k|uhd)\b/i, 2160],
  [/\b(1440p?|2k|qhd)\b/i, 1440],
  [/\b1080p?\b/i, 1080],
  [/\b720p?\b/i, 720],
  [/\b(480p?|sd)\b/i, 480],
  [/\b360p?\b/i, 360],
];

const DIRECT_RES = Object.assign(Object.create(null), {
  '4k': 2160, '2160': 2160, '2160p': 2160,
  '1440': 1440, '1440p': 1440,
  '1080': 1080, '1080p': 1080,
  '720': 720, '720p': 720,
  '480': 480, '480p': 480,
  '360': 360, '360p': 360,
});

function resolutionOf(stream) {
  if (core && typeof core.inferResolution === 'function') {
    return core.inferResolution(stream);
  }
  if (!stream) return null;
  const quality = String(stream.quality || '').trim().toLowerCase();
  if (Object.hasOwn(DIRECT_RES, quality)) return DIRECT_RES[quality];

  const text = [stream.quality, stream.title, stream.description, stream.name]
    .filter((value) => typeof value === 'string' && value.length > 0)
    .join(' ');
  for (const [pattern, height] of RES_PATTERNS) {
    if (pattern.test(text)) return height;
  }
  return null;
}

const QUALITY_PATTERNS = [
  [/\b(4k|uhd|2160p?)\b/i, 0],
  [/\b1080p?\b/i, 1],
  [/\b720p?\b/i, 2],
  [/\b(480p?|360p?|sd)\b/i, 3],
  [/(\bcam\b|hdcam|\bcamrip\b|\bts\b|telesync)/i, 5],
];

function qualityRank(stream) {
  if (core && typeof core.inferQualityRank === 'function') {
    return core.inferQualityRank(stream);
  }
  if (!stream) return 4;
  const text = `${stream.quality || ''} ${stream.title || ''} ${stream.name || ''}`;
  for (const [pattern, rank] of QUALITY_PATTERNS) {
    if (pattern.test(text)) return rank;
  }
  return 4;
}

const SIZE_UNITS = { tb: 1024 ** 4, gb: 1024 ** 3, mb: 1024 ** 2, kb: 1024 };

function sizeBytesOf(stream) {
  if (core && typeof core.inferSizeBytes === 'function') {
    return core.inferSizeBytes(stream);
  }
  if (!stream) return null;
  for (const value of [stream.size, stream.title, stream.description]) {
    if (typeof value !== 'string') continue;
    const match = value.match(/([\d.]+)\s*(tb|gb|mb|kb)\b/i);
    if (!match) continue;
    const amount = Number.parseFloat(match[1]);
    if (Number.isFinite(amount)) return Math.round(amount * SIZE_UNITS[match[2].toLowerCase()]);
  }
  return null;
}

module.exports = {
  resolutionOf,
  qualityRank,
  sizeBytesOf,
};
