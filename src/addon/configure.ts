import type { Request, Response } from 'express';
import { decodeUserConfig } from './userConfig.js';
import { renderConfigurePageHtml } from './configureHtml.js';

export function getPublicBaseUrl(req: Request, configuredPublicUrl?: string): string {
  if (configuredPublicUrl && configuredPublicUrl.trim()) {
    return configuredPublicUrl.replace(/\/+$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() || req.headers.host || 'localhost:7000';
  return `${proto}://${host}`;
}

export function handleConfigure(req: Request, res: Response, configuredPublicUrl?: string): void {
  const baseUrl = getPublicBaseUrl(req, configuredPublicUrl);
  const rawConfig = req.params.config;
  const userConfig = decodeUserConfig(rawConfig);
  const prefillJson = JSON.stringify(userConfig);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:;");
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }

  const html = renderConfigurePageHtml(baseUrl, prefillJson);
  res.status(200).send(html);
}
