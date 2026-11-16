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

export function createInternalServer(host: string, instance: FleetInstance): http.Server {
  const { internalToken, handlers } = instance;
  return http.createServer(async (req, res) => {
    const requestId = (req.headers['x-request-id'] as string) || '';

    if (internalToken && req.headers['x-internal-token'] !== internalToken) {
      return sendJson(res, 401, { error: 'Unauthorized' }, requestId);
    }

    const parsedUrl = new URL(req.url || '/', `http://${host}:${instance.port}`);
    const pathname = parsedUrl.pathname;

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
      (pathname === '/internal/health' || pathname.startsWith('/internal/stream/'))
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
      if (pathname === '/internal/reload' && req.method === 'POST') {
        return await handlers.reload(req, res, requestId);
      }
    } catch (error) {
      return sendJson(
        res,
        200,
        { streams: [], error: error instanceof Error ? error.message : String(error) },
        requestId,
      );
    }

    return sendJson(res, 404, { error: 'Not Found' }, requestId);
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
