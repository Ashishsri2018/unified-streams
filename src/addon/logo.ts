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

const assetCache = new Map<string, Buffer>();

async function serveAsset(
  type: 'png' | 'svg' | 'ico',
  req: Request,
  res: Response,
): Promise<void> {
  const asset = ASSETS[type];
  let body = assetCache.get(asset.path);
  if (!body) {
    try {
      body = await fs.promises.readFile(asset.path);
      assetCache.set(asset.path, body);
    } catch {
      res.status(404).end();
      return;
    }
  }

  res.setHeader('Content-Type', asset.contentType);
  res.setHeader('Content-Length', body.length);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }

  res.status(200).end(body);
}

export async function handleLogoPng(req: Request, res: Response): Promise<void> {
  await serveAsset('png', req, res);
}

export async function handleLogoSvg(req: Request, res: Response): Promise<void> {
  await serveAsset('svg', req, res);
}

export async function handleFavicon(req: Request, res: Response): Promise<void> {
  await serveAsset('ico', req, res);
}
