import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import { decodeUserConfig } from './userConfig.js';
import { renderConfigurePageHtml } from './configureHtml.js';

function escapeJsonForScript(json: string): string {
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function normalizeBaseUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname || url.username || url.password) return null;
    const path = url.pathname.replace(/\/+$/, '');
    return `${url.protocol}//${url.host}${path}`;
  } catch {
    return null;
  }
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(',')[0]?.trim() || undefined;
}

export function getPublicBaseUrl(req: Request, configuredPublicUrl?: string): string {
  if (configuredPublicUrl && configuredPublicUrl.trim()) {
    const configured = normalizeBaseUrl(configuredPublicUrl.trim());
    if (configured) return configured;
  }
  const proto = firstHeaderValue(req.headers['x-forwarded-proto']);
  const host = firstHeaderValue(req.headers['x-forwarded-host']) ?? req.headers.host;
  const candidateProto = proto === 'https' || proto === 'http' ? proto : req.protocol;
  const candidate = host ? normalizeBaseUrl(`${candidateProto}://${host}`) : null;
  if (candidate) return candidate;
  const fallbackProto = req.protocol === 'https' ? 'https' : 'http';
  return `${fallbackProto}://localhost:7000`;
}

export function handleConfigure(req: Request, res: Response, configuredPublicUrl?: string): void {
  const baseUrl = getPublicBaseUrl(req, configuredPublicUrl);
  const rawConfig = req.params.config;
  const userConfig = decodeUserConfig(rawConfig);
  const prefillJson = escapeJsonForScript(JSON.stringify(userConfig));
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

  const html = renderConfigurePageHtml(baseUrl, prefillJson, nonce);
  res.status(200).send(html);
}
