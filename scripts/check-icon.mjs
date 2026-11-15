import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const PNG_PATH = path.join(rootDir, 'assets', 'logo.png');
const SVG_PATH = path.join(rootDir, 'assets', 'logo.svg');
const ICO_PATH = path.join(rootDir, 'assets', 'favicon.ico');

const MAX_PNG_BYTES = 512 * 1024; // 512 KB

function verifyPng() {
  if (!fs.existsSync(PNG_PATH)) {
    throw new Error(`Missing logo.png at ${PNG_PATH}`);
  }

  const stat = fs.statSync(PNG_PATH);
  if (stat.size > MAX_PNG_BYTES) {
    throw new Error(`logo.png is too large: ${stat.size} bytes (max ${MAX_PNG_BYTES})`);
  }

  const buf = fs.readFileSync(PNG_PATH);
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(pngSig)) {
    throw new Error('Invalid PNG signature in assets/logo.png');
  }

  // IHDR chunk is immediately after signature: length (4), "IHDR" (4), width (4), height (4)
  const ihdrType = buf.toString('ascii', 12, 16);
  if (ihdrType !== 'IHDR') {
    throw new Error(`Expected IHDR chunk, got ${ihdrType}`);
  }

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);

  if (width !== 512 || height !== 512) {
    throw new Error(`Expected 512x512 logo.png, got ${width}x${height}`);
  }

  console.log(`[check-icon] OK: assets/logo.png is valid 512x512 PNG (${stat.size} bytes)`);
}

function verifySvgAndFavicon() {
  if (!fs.existsSync(SVG_PATH)) {
    throw new Error(`Missing logo.svg at ${SVG_PATH}`);
  }
  const svgStat = fs.statSync(SVG_PATH);
  if (svgStat.size === 0) {
    throw new Error('assets/logo.svg is empty');
  }
  console.log(`[check-icon] OK: assets/logo.svg present (${svgStat.size} bytes)`);

  if (!fs.existsSync(ICO_PATH)) {
    throw new Error(`Missing favicon.ico at ${ICO_PATH}`);
  }
  const icoStat = fs.statSync(ICO_PATH);
  if (icoStat.size === 0) {
    throw new Error('assets/favicon.ico is empty');
  }
  console.log(`[check-icon] OK: assets/favicon.ico present (${icoStat.size} bytes)`);
}

try {
  verifyPng();
  verifySvgAndFavicon();
  console.log('[check-icon] All icon checks passed.');
} catch (err) {
  console.error('[check-icon] ERROR:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
