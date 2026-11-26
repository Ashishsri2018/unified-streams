import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import type { Request, Response } from 'express';
import {
  findManifestProxyEntry,
  isPrivateHostname,
  type ManifestProxyStore,
} from '../core/manifestProxyConfig.js';
import { logger } from '../core/logger.js';
import type { StremioStream } from './filters.js';

const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const MAX_UPSTREAM_URL_LENGTH = 4096;

const HLS_CONTENT_TYPES = new Set([
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'audio/mpegurl',
  'text/plain',
]);

interface TokenPayload {
  u: string;
  e: number;
}

export interface VerifiedManifestToken {
  url: string;
  exp: number;
}

export interface ManifestProxyRuntime {
  secret: string;
  ttlMs: number;
  store: ManifestProxyStore;
  lookupHost?: (hostname: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

export interface ManifestProxyMergeOptions {
  baseUrl: string;
  secret: string;
  ttlMs: number;
  store: ManifestProxyStore;
  now?: () => number;
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function hmac(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

export function signManifestProxyToken(
  upstreamUrl: string,
  secret: string,
  ttlMs: number,
  now = Date.now(),
): string {
  const url = new URL(upstreamUrl);
  if (url.protocol !== 'https:') throw new Error('manifest proxy URL must use https');
  if (upstreamUrl.length > MAX_UPSTREAM_URL_LENGTH) throw new Error('manifest proxy URL is too long');
  const payload: TokenPayload = {
    u: upstreamUrl,
    e: now + Math.max(60_000, Math.trunc(ttlMs)),
  };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${hmac(body, secret)}`;
}

export function verifyManifestProxyToken(
  token: string,
  secret: string,
  now = Date.now(),
): VerifiedManifestToken | null {
  if (!token || token.length > 8192) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;
  const expected = hmac(body, secret);
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
  if (typeof record.u !== 'string' || typeof record.e !== 'number') return null;
  if (record.u.length === 0 || record.u.length > MAX_UPSTREAM_URL_LENGTH) return null;
  if (!Number.isFinite(record.e) || record.e <= now) return null;
  try {
    if (new URL(record.u).protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return { url: record.u, exp: record.e };
}

function proxyUrlFor(
  upstreamUrl: string,
  baseUrl: string,
  secret: string,
  ttlMs: number,
  now?: number,
): string {
  const token = signManifestProxyToken(upstreamUrl, secret, ttlMs, now);
  return `${baseUrl.replace(/\/+$/, '')}/proxy/manifest?t=${encodeURIComponent(token)}`;
}

function isHlsPlaylistUrl(raw: string): boolean {
  try {
    const pathname = new URL(raw).pathname.toLowerCase();
    return pathname.endsWith('.m3u8') || pathname.endsWith('.m3u');
  } catch {
    return false;
  }
}

function resolveUri(value: string, baseUrl: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed)) {
    return trimmed;
  }
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return value;
  }
}

function rewriteUriValue(
  value: string,
  upstreamUrl: string,
  baseUrl: string,
  secret: string,
  ttlMs: number,
  now?: number,
): string {
  const absolute = resolveUri(value, upstreamUrl);
  if (!absolute.startsWith('https:')) return absolute;
  if (!isHlsPlaylistUrl(absolute)) return absolute;
  return proxyUrlFor(absolute, baseUrl, secret, ttlMs, now);
}

/**
 * Rewrites only HLS playlist URIs. Media segments, init maps, and keys are
 * resolved against the upstream playlist but stay on their upstream host.
 */
export function rewriteManifest(
  text: string,
  upstreamUrl: string,
  baseUrl: string,
  secret: string,
  ttlMs: number,
  now?: number,
): string {
  const normalized = text.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const output: string[] = [];
  let expectStreamUri = false;

  for (const line of lines) {
    if (line.startsWith('#')) {
      if (line.startsWith('#EXT-X-STREAM-INF')) expectStreamUri = true;
      if (line.includes('URI="')) {
        output.push(
          line.replace(/URI="([^"]*)"/g, (_match, value: string) => {
            const rewritten = rewriteUriValue(
              value,
              upstreamUrl,
              baseUrl,
              secret,
              ttlMs,
              now,
            );
            return `URI="${rewritten}"`;
          }),
        );
      } else {
        output.push(line);
      }
      continue;
    }

    if (!line.trim()) {
      output.push(line);
      continue;
    }

    if (expectStreamUri) {
      const absolute = resolveUri(line, upstreamUrl);
      output.push(
        absolute.startsWith('https:')
          ? proxyUrlFor(absolute, baseUrl, secret, ttlMs, now)
          : absolute,
      );
      expectStreamUri = false;
      continue;
    }

    output.push(rewriteUriValue(line, upstreamUrl, baseUrl, secret, ttlMs, now));
  }

  return output.join('\n');
}

export function rewriteManifestStreamUrl(
  stream: StremioStream,
  options: ManifestProxyMergeOptions,
): StremioStream {
  if (!stream.url || stream.externalUrl) return stream;
  const entry = findManifestProxyEntry(stream.url, options.store.getEntries());
  if (!entry) return stream;
  return {
    ...stream,
    url: proxyUrlFor(
      stream.url,
      options.baseUrl,
      options.secret,
      options.ttlMs,
      options.now?.(),
    ),
  };
}

function defaultLookupHost(hostname: string): Promise<string[]> {
  return dns.lookup(hostname, { all: true, verbatim: true }).then((rows) => rows.map((row) => row.address));
}

async function assertPublicUrl(
  rawUrl: string,
  lookupHost: (hostname: string) => Promise<string[]>,
): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (rawUrl.length > MAX_UPSTREAM_URL_LENGTH) return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== '443') return false;
  if (isPrivateHostname(url.hostname)) return false;
  const lookupName = url.hostname.replace(/^\[|\]$/g, '');
  try {
    const addresses = await lookupHost(lookupName);
    if (addresses.length === 0) return false;
    return addresses.every((address) => !isPrivateHostname(address));
  } catch {
    return false;
  }
}

type FetchResult =
  | { ok: true; body: string; contentType: string }
  | { ok: false; reason: 'upstream' | 'timeout' };

async function fetchManifest(
  startUrl: string,
  runtime: ManifestProxyRuntime,
): Promise<FetchResult> {
  const lookupHost = runtime.lookupHost ?? defaultLookupHost;
  const fetchImpl = runtime.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), runtime.timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    let currentUrl = startUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const entry = findManifestProxyEntry(currentUrl, runtime.store.getEntries());
      if (!entry) return { ok: false, reason: 'upstream' };
      if (!(await assertPublicUrl(currentUrl, lookupHost))) {
        return { ok: false, reason: 'upstream' };
      }
      const response = await fetchImpl(currentUrl, {
        method: 'GET',
        headers: {
          ...entry.headers,
          accept: 'application/vnd.apple.mpegurl,application/x-mpegurl,text/plain,*/*',
        },
        redirect: 'manual',
        signal: controller.signal,
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) return { ok: false, reason: 'upstream' };
        let nextUrl: string;
        try {
          nextUrl = new URL(location, currentUrl).toString();
        } catch {
          return { ok: false, reason: 'upstream' };
        }
        if (!findManifestProxyEntry(nextUrl, runtime.store.getEntries())) {
          return { ok: false, reason: 'upstream' };
        }
        currentUrl = nextUrl;
        continue;
      }

      if (!response.ok) return { ok: false, reason: 'upstream' };
      const declaredLength = Number(response.headers.get('content-length') ?? '0');
      if (Number.isFinite(declaredLength) && declaredLength > MAX_MANIFEST_BYTES) {
        return { ok: false, reason: 'upstream' };
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > MAX_MANIFEST_BYTES) return { ok: false, reason: 'upstream' };
      const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      const text = buffer.toString('utf-8').replace(/^\uFEFF/, '');
      if (!HLS_CONTENT_TYPES.has(contentType) && !text.trimStart().startsWith('#EXTM3U')) {
        return { ok: false, reason: 'upstream' };
      }
      return { ok: true, body: text, contentType: contentType || 'application/vnd.apple.mpegurl' };
    }
    return { ok: false, reason: 'upstream' };
  } catch (error) {
    if (controller.signal.aborted) return { ok: false, reason: 'timeout' };
    logger.debug('manifest_proxy_upstream_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, reason: 'upstream' };
  } finally {
    clearTimeout(timer);
  }
}

function setProxyResponseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
}

export async function handleManifestProxyRoute(
  req: Request,
  res: Response,
  runtime: ManifestProxyRuntime,
  publicBaseUrl?: string,
): Promise<void> {
  const startedAt = Date.now();
  const token = typeof req.query.t === 'string' ? req.query.t : '';
  if (!token) {
    res.status(400).json({ error: 'missing token' });
    return;
  }
  const now = runtime.now?.() ?? Date.now();
  const verified = verifyManifestProxyToken(token, runtime.secret, now);
  if (!verified) {
    res.status(403).json({ error: 'invalid or expired token' });
    return;
  }
  const entry = findManifestProxyEntry(verified.url, runtime.store.getEntries());
  if (!entry) {
    res.status(403).json({ error: 'host is not allowed' });
    return;
  }

  const result = await fetchManifest(verified.url, runtime);
  const durationMs = Date.now() - startedAt;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex').slice(0, 12);
  const host = (() => {
    try {
      return new URL(verified.url).hostname;
    } catch {
      return 'invalid';
    }
  })();

  if (!result.ok) {
    const status = result.reason === 'timeout' ? 504 : 502;
    logger.warn('manifest_proxy_failed', {
      host,
      status,
      durationMs,
      tokenHash,
      reason: result.reason,
    });
    res.status(status).json({ error: result.reason === 'timeout' ? 'upstream timeout' : 'upstream failed' });
    return;
  }

  setProxyResponseHeaders(res);
  logger.info('manifest_proxy_served', { host, status: 200, durationMs, tokenHash });
  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }
  const baseUrl =
    publicBaseUrl?.replace(/\/+$/, '') ||
    `${req.protocol}://${req.get('host') ?? 'localhost'}`;
  res.status(200).send(
    rewriteManifest(result.body, verified.url, baseUrl, runtime.secret, runtime.ttlMs, now),
  );
}
