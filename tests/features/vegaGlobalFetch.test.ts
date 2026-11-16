import { describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import { installGlobalFetch } from '../../src/fleets/vega/providers/sdk/context.js';
import type { HttpTransportApi, LoggerLike } from '../../src/fleets/vega/types.js';

describe('Vega global fetch shim', () => {
  it('keeps loopback worker calls on native fetch instead of the provider transport', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const request = vi.fn().mockRejectedValue(new Error('provider transport should not be used'));
    const originalFetch = globalThis.fetch;

    try {
      installGlobalFetch({
        transport: { request } as unknown as HttpTransportApi,
        cookieJar: {} as never,
        logger: {} as LoggerLike,
        getActiveUrls: () => null,
      });

      const response = await fetch(`http://127.0.0.1:${port}/internal/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(request).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
