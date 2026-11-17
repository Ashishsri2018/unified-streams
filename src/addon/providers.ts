import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import { getPublicBaseUrl } from './configure.js';
import { renderProvidersPage } from './providersHtml.js';

export function handleProvidersPage(
  req: Request,
  res: Response,
  configuredPublicUrl?: string,
): void {
  const baseUrl = getPublicBaseUrl(req, configuredPublicUrl);
  const nonce = crypto.randomBytes(16).toString('base64');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}' https:; img-src 'self' data: https:;`,
  );
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }

  const html = renderProvidersPage({
    addonName: 'Unified Streams',
    logoUrl: `${baseUrl}/logo.svg`,
    configureUrl: `${baseUrl}/configure`,
    scriptNonce: nonce,
  });

  res.status(200).send(html);
}
