import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request, Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

const ASSETS = {
  png: {
    path: path.join(rootDir, 'assets', 'logo.png'),
    contentType: 'image/png',
  },
  svg: {
    path: path.join(rootDir, 'assets', 'logo.svg'),
    contentType: 'image/svg+xml; charset=utf-8',
  },
  ico: {
    path: path.join(rootDir, 'assets', 'favicon.ico'),
    contentType: 'image/x-icon',
  },
};

function serveAsset(type: 'png' | 'svg' | 'ico', req: Request, res: Response): void {
  const asset = ASSETS[type];
  if (!fs.existsSync(asset.path)) {
    res.status(404).end();
    return;
  }

  const stat = fs.statSync(asset.path);
  res.setHeader('Content-Type', asset.contentType);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }

  fs.createReadStream(asset.path).pipe(res);
}

export function handleLogoPng(req: Request, res: Response): void {
  serveAsset('png', req, res);
}

export function handleLogoSvg(req: Request, res: Response): void {
  serveAsset('svg', req, res);
}

export function handleFavicon(req: Request, res: Response): void {
  serveAsset('ico', req, res);
}
