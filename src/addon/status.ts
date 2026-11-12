import type { Request, Response } from 'express';
import { StreamHandlerContext } from './stream.js';
import { getPublicBaseUrl } from './configure.js';
import { renderStatusPage } from './statusHtml.js';

export async function handleStatusPage(
  req: Request,
  res: Response,
  _ctx: StreamHandlerContext,
  _startedAt: number,
  configuredPublicUrl?: string,
): Promise<void> {
  const baseUrl = getPublicBaseUrl(req, configuredPublicUrl);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:;",
  );
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }

  const html = renderStatusPage({
    addonName: 'Unified Streams',
    logoUrl: `${baseUrl}/logo.svg`,
    configureUrl: `${baseUrl}/configure`,
  });

  res.status(200).send(html);
}
