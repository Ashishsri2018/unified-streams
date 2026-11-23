import http from 'node:http';

export interface FleetHandlers {
  health(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    requestId: string,
  ): unknown;
  stream(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string,
    requestId: string,
  ): unknown;
  reload(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    requestId: string,
  ): unknown;
  providers?(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    requestId: string,
  ): unknown;
  selectProviders?(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    requestId: string,
    body: unknown,
  ): unknown;
}

const MAX_INTERNAL_BODY_BYTES = 64 * 1024;

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_INTERNAL_BODY_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

export interface FleetInstance {
  port: number;
  internalToken: string;
  handlers: FleetHandlers;
  dispose?: () => Promise<void>;
}

export function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  requestId?: string,
): void {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  };
  if (requestId) headers['x-request-id'] = requestId;
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function sanitizeRequestId(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw && /^[A-Za-z0-9._:-]{1,128}$/.test(raw)) return raw;
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeSendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  requestId?: string,
): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  sendJson(res, status, body, requestId);
}

export function createInternalServer(host: string, instance: FleetInstance): http.Server {
  const { internalToken, handlers } = instance;
  return http.createServer(async (req, res) => {
    const requestId = sanitizeRequestId(req.headers['x-request-id']);

    if (internalToken && req.headers['x-internal-token'] !== internalToken) {
      return safeSendJson(res, 401, { error: 'Unauthorized' }, requestId);
    }

    let pathname: string;
    try {
      const parsedUrl = new URL(req.url || '/', `http://${host}:${instance.port}`);
      pathname = parsedUrl.pathname;
    } catch {
      return safeSendJson(res, 400, { error: 'Bad Request' }, requestId);
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        allow: 'GET, HEAD, POST, OPTIONS',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
      });
      return res.end();
    }

    if (
      req.method === 'HEAD' &&
      (pathname === '/internal/health' ||
        pathname === '/internal/providers' ||
        pathname.startsWith('/internal/stream/'))
    ) {
      const headers: Record<string, string> = {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      };
      if (pathname.startsWith('/internal/stream/')) headers['x-cache'] = 'bypass';
      res.writeHead(200, headers);
      return res.end();
    }

    try {
      if (pathname === '/internal/health') {
        return await handlers.health(req, res, requestId);
      }
      if (pathname.startsWith('/internal/stream/')) {
        return await handlers.stream(req, res, pathname, requestId);
      }
      if (pathname === '/internal/providers' && req.method === 'GET' && handlers.providers) {
        return await handlers.providers(req, res, requestId);
      }
      if (
        pathname === '/internal/providers/selection' &&
        req.method === 'POST' &&
        handlers.selectProviders
      ) {
        let body: unknown;
        try {
          body = await readJsonBody(req);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return safeSendJson(res, 400, { ok: false, error: message }, requestId);
        }
        return await handlers.selectProviders(req, res, requestId, body);
      }
      if (pathname === '/internal/reload' && req.method === 'POST') {
        return await handlers.reload(req, res, requestId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (pathname.startsWith('/internal/stream/')) {
        return safeSendJson(res, 200, { streams: [], error: message }, requestId);
      }
      return safeSendJson(res, 500, { error: message }, requestId);
    }

    return safeSendJson(res, 404, { error: 'Not Found' }, requestId);
  });
}

export function listen(server: http.Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

export function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}
