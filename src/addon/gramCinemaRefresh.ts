import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { logger } from '../core/logger.js';
import type { StremioStream } from './filters.js';

const API_BASE = 'https://tga-hd.api.hashhackers.com';
const ORIGIN = 'https://bollywood.eu.org';
const REFERER = `${ORIGIN}/`;
const USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0.1 Mobile/15E148 Safari/604.1';
const CDN_HOST_PATTERN = /^cdn\d+\.apranet\.eu\.org$/i;
const FILE_ID_PATTERN = /^[A-Za-z0-9_-]{6,200}$/;
const TOKEN_KIND = 'gc';
const MAX_TOKEN_LENGTH = 4096;
const MAX_URL_LENGTH = 4096;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Stream lists can be cached by clients for a long time, so refresh tokens must
 * outlive a normal playback session. The token only identifies the Telegram
 * file; the CDN link itself is re-signed on every proxy request.
 */
export const GRAMCINEMA_REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface TokenPayload {
  k: string;
  i: string;
  e: number;
}

export interface VerifiedGramCinemaToken {
  fileId: string;
  exp: number;
}

export interface GramCinemaRefreshRuntime {
  /** GramCinema / bollywood.eu.org bearer token used for genLink calls. */
  token: string;
  /** HMAC secret shared with the manifest proxy. */
  secret: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  cacheTtlMs?: number;
  cache?: Map<string, { url: string; expiresAt: number }>;
}

export interface GramCinemaRewriteOptions {
  baseUrl: string;
  secret: string;
  ttlMs?: number;
  now?: number;
}

type RefreshResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'upstream' | 'timeout' };

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function hmac(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

function tokenSignature(body: string, secret: string): string {
  // Domain-separate these tokens from manifest proxy tokens even when both use
  // the same secret.
  return hmac(`${TOKEN_KIND}.${body}`, secret);
}

export function signGramCinemaRefreshToken(
  fileId: string,
  secret: string,
  ttlMs = GRAMCINEMA_REFRESH_TOKEN_TTL_MS,
  now = Date.now(),
): string {
  if (!FILE_ID_PATTERN.test(fileId)) throw new Error('invalid GramCinema file id');
  const payload: TokenPayload = {
    k: TOKEN_KIND,
    i: fileId,
    e: now + Math.max(60_000, Math.trunc(ttlMs)),
  };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${tokenSignature(body, secret)}`;
}

export function verifyGramCinemaRefreshToken(
  token: string,
  secret: string,
  now = Date.now(),
): VerifiedGramCinemaToken | null {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;

  const expected = tokenSignature(body, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  if (record.k !== TOKEN_KIND) return null;
  if (typeof record.i !== 'string' || !FILE_ID_PATTERN.test(record.i)) return null;
  if (typeof record.e !== 'number' || !Number.isFinite(record.e) || record.e <= now) return null;
  return { fileId: record.i, exp: record.e };
}

/**
 * GramCinema links have the shape
 * `https://cdn3.apranet.eu.org/dl/<telegram-file-id>/...`. The first path
 * segment is the id accepted by `/genLink?type=mix_media&id=...`.
 */
export function extractGramCinemaFileId(rawUrl: string): string | null {
  if (!rawUrl || rawUrl.length > MAX_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;
  if (!CDN_HOST_PATTERN.test(url.hostname)) return null;
  if (!url.pathname.startsWith('/dl/')) return null;

  const segments = url.pathname.split('/').filter(Boolean);
  const fileId = segments[1];
  if (!fileId || !FILE_ID_PATTERN.test(fileId)) return null;
  return fileId;
}

function fileExtension(rawUrl: string): string {
  try {
    const match = new URL(rawUrl).pathname.match(/\.(mkv|mp4)$/i);
    return match ? match[1].toLowerCase() : '';
  } catch {
    return '';
  }
}

export function buildGramCinemaProxyUrl(
  fileId: string,
  options: GramCinemaRewriteOptions,
  extension = '',
): string {
  const token = signGramCinemaRefreshToken(
    fileId,
    options.secret,
    options.ttlMs ?? GRAMCINEMA_REFRESH_TOKEN_TTL_MS,
    options.now,
  );
  const suffix = extension ? `.${extension}` : '';
  return `${options.baseUrl.replace(/\/+$/, '')}/proxy/gramcinema/${encodeURIComponent(fileId)}${suffix}?t=${encodeURIComponent(token)}`;
}

export function rewriteGramCinemaStreamUrl(
  stream: StremioStream,
  options: GramCinemaRewriteOptions,
): StremioStream {
  if (!stream.url || stream.externalUrl) return stream;
  const fileId = extractGramCinemaFileId(stream.url);
  if (!fileId) return stream;
  return {
    ...stream,
    url: buildGramCinemaProxyUrl(fileId, options, fileExtension(stream.url)),
  };
}

function parseGenLinkResponse(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.success !== true) return null;
  if (typeof record.url !== 'string') return null;
  // The provider applies the same encoding; genLink can return raw spaces in
  // the filename segment.
  const url = record.url.replace(/ /g, '%20');
  if (!url || url.length > MAX_URL_LENGTH || /\s/.test(url)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.port && parsed.port !== '443') return null;
    if (!CDN_HOST_PATTERN.test(parsed.hostname)) return null;
  } catch {
    return null;
  }
  return url;
}

async function fetchFreshLink(
  fileId: string,
  runtime: GramCinemaRefreshRuntime,
  now: number,
): Promise<RefreshResult> {
  const cached = runtime.cache?.get(fileId);
  if (cached && cached.expiresAt > now) return { ok: true, url: cached.url };

  const fetchImpl = runtime.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), runtime.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetchImpl(
      `${API_BASE}/genLink?type=mix_media&id=${encodeURIComponent(fileId)}`,
      {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: '*/*',
          Authorization: `Bearer ${runtime.token}`,
          Origin: ORIGIN,
          Referer: REFERER,
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) return { ok: false, reason: 'upstream' };
    const data: unknown = await response.json();
    const freshUrl = parseGenLinkResponse(data);
    if (!freshUrl) return { ok: false, reason: 'upstream' };

    // genLink calls count against the GramCinema account's daily limit. Keep a
    // short per-process cache so range requests and retries reuse one link.
    runtime.cache?.set(fileId, {
      url: freshUrl,
      expiresAt: now + Math.max(60_000, runtime.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS),
    });
    return { ok: true, url: freshUrl };
  } catch (error) {
    if (controller.signal.aborted) return { ok: false, reason: 'timeout' };
    logger.debug('gramcinema_refresh_upstream_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, reason: 'upstream' };
  } finally {
    clearTimeout(timer);
  }
}

function fileIdHash(fileId: string): string {
  return crypto.createHash('sha256').update(fileId).digest('hex').slice(0, 12);
}

export async function handleGramCinemaRefreshRoute(
  req: Request,
  res: Response,
  runtime: GramCinemaRefreshRuntime,
): Promise<void> {
  const startedAt = Date.now();
  const token = typeof req.query.t === 'string' ? req.query.t : '';
  if (!token) {
    res.status(400).json({ error: 'missing token' });
    return;
  }

  const now = runtime.now?.() ?? Date.now();
  const verified = verifyGramCinemaRefreshToken(token, runtime.secret, now);
  if (!verified) {
    res.status(403).json({ error: 'invalid or expired token' });
    return;
  }

  const result = await fetchFreshLink(verified.fileId, runtime, now);
  const durationMs = Date.now() - startedAt;
  const idHash = fileIdHash(verified.fileId);

  if (!result.ok) {
    const status = result.reason === 'timeout' ? 504 : 502;
    logger.warn('gramcinema_refresh_failed', {
      status,
      durationMs,
      fileIdHash: idHash,
      reason: result.reason,
    });
    res
      .status(status)
      .json({ error: result.reason === 'timeout' ? 'upstream timeout' : 'upstream failed' });
    return;
  }

  let host = 'invalid';
  try {
    host = new URL(result.url).hostname;
  } catch {
    // parseGenLinkResponse already validated the URL; keep the log safe.
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Location');
  res.setHeader('Location', result.url);
  logger.info('gramcinema_refresh_served', { status: 302, durationMs, fileIdHash: idHash, host });
  res.status(302).end();
}
