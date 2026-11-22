import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CookieJar } from '../../src/fleets/vega/providers/sdk/cookieJar.js';
import type { LoggerLike } from '../../src/fleets/vega/types.js';

const logger: LoggerLike = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => logger,
};

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

async function openJar(): Promise<CookieJar> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vega-cookie-'));
  dirs.push(dir);
  return CookieJar.open({ filePath: path.join(dir, 'cookies.json'), logger });
}

describe('Vega cookie jar scope', () => {
  it('keeps host-only cookies on the exact host', async () => {
    const jar = await openJar();
    jar.captureFromResponse('https://www.example.com/login', ['sid=abc; Path=/']);

    expect(await jar.getCookieHeader('https://www.example.com/')).toBe('sid=abc');
    expect(await jar.getCookieHeader('https://api.example.com/')).toBeUndefined();
  });

  it('shares cookies that set an explicit parent Domain', async () => {
    const jar = await openJar();
    jar.captureFromResponse('https://www.example.com/login', [
      'sid=abc; Domain=example.com; Path=/',
    ]);

    expect(await jar.getCookieHeader('https://api.example.com/')).toBe('sid=abc');
  });

  it('only sends Secure cookies over HTTPS', async () => {
    const jar = await openJar();
    jar.captureFromResponse('https://www.example.com/login', [
      'sid=abc; Secure; Path=/',
    ]);

    expect(await jar.getCookieHeader('http://www.example.com/')).toBeUndefined();
    expect(await jar.getCookieHeader('https://www.example.com/')).toBe('sid=abc');
  });
});
