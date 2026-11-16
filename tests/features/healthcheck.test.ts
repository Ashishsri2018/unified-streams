import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(new URL('../../scripts/healthcheck.mjs', import.meta.url));

function runCheck(port: number): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      env: { ...process.env, PORT: String(port) },
      stdio: 'ignore',
    });
    child.on('error', reject);
    child.on('close', (code) => resolve(code));
  });
}

describe('scripts/healthcheck.mjs', () => {
  let server: Server | null = null;
  let observedMethods: string[] = [];
  let responseStatus = 200;
  let responseBody = '';
  let hang = false;

  async function startServer(): Promise<number> {
    observedMethods = [];
    server = createServer((req, res) => {
      observedMethods.push(req.method || '');
      if (hang) return;
      res.statusCode = responseStatus;
      res.setHeader('content-type', 'application/json');
      res.end(responseBody);
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    return (server.address() as AddressInfo).port;
  }

  async function stopServer(): Promise<void> {
    if (!server) return;
    const current = server;
    server = null;
    await new Promise<void>((resolve) => current.close(() => resolve()));
  }

  afterEach(async () => {
    hang = false;
    responseStatus = 200;
    responseBody = '';
    await stopServer();
  });

  it('uses a HEAD liveness probe and passes on HTTP 200', async () => {
    const port = await startServer();
    expect(await runCheck(port)).toBe(0);
    expect(observedMethods).toEqual(['HEAD']);
  });

  it('passes on HTTP 200 even when the body reports an error status', async () => {
    responseBody = JSON.stringify({ status: 'error', ok: false });
    const port = await startServer();
    expect(await runCheck(port)).toBe(0);
  });

  it('fails on HTTP 503', async () => {
    responseStatus = 503;
    const port = await startServer();
    expect(await runCheck(port)).toBe(1);
  });

  it('fails when the port is not listening', async () => {
    const port = await startServer();
    await stopServer();
    expect(await runCheck(port)).toBe(1);
  });

  it('fails when the endpoint hangs past the 5s timeout', async () => {
    hang = true;
    const port = await startServer();
    expect(await runCheck(port)).toBe(1);
  }, 10000);
});
