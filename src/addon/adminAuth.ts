import crypto from 'node:crypto';
import type { Request, Response } from 'express';

export const ADMIN_COOKIE = 'us_admin';
const SESSION_MESSAGE = 'unified-streams-admin-v1';
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

function digest(value: string): Buffer {
  return crypto.createHash('sha256').update(value).digest();
}

function safeEqual(left: string, right: string): boolean {
  const a = digest(left);
  const b = digest(right);
  return crypto.timingSafeEqual(a, b);
}

export function sessionToken(adminToken: string): string {
  return crypto.createHmac('sha256', adminToken).update(SESSION_MESSAGE).digest('hex');
}

export function isAuthenticated(req: Request, adminToken: string | undefined): boolean {
  if (!adminToken) return false;
  const cookies = parseCookies(req.headers.cookie);
  const value = cookies[ADMIN_COOKIE];
  if (!value) return false;
  return safeEqual(value, sessionToken(adminToken));
}

export function verifyAdminToken(candidate: unknown, adminToken: string): boolean {
  return typeof candidate === 'string' && candidate.length > 0 && safeEqual(candidate, adminToken);
}

export function setSessionCookie(req: Request, res: Response, adminToken: string): void {
  const parts = [
    `${ADMIN_COOKIE}=${sessionToken(adminToken)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];
  if (isSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const parts = [`${ADMIN_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (isSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key && value) result[key] = value;
  }
  return result;
}

function isSecure(req: Request): boolean {
  const forwarded = req.header('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0]?.trim() === 'https';
  return req.secure;
}

function hostNames(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase().replace(/\.$/, ''))
    .filter(Boolean)
    .map((item) => item.replace(/:\d+$/, ''));
}

export function sameOrigin(req: Request): boolean {
  const site = req.header('sec-fetch-site');
  if (site === 'same-origin' || site === 'none') return true;

  const origin = req.header('origin');
  if (!origin) return true;

  let originHost: string;
  try {
    originHost = new URL(origin).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return false;
  }

  const candidates = [
    ...hostNames(req.header('host')),
    ...hostNames(req.header('x-forwarded-host')),
  ];
  return candidates.includes(originHost);
}
