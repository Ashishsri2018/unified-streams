import express, { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import compression from 'compression';
import { StreamHandlerContext, handleStreamRoute } from './stream.js';
import { handleHealth, handleStats } from './health.js';
import { handleStatusPage } from './status.js';
import { handleProvidersPage } from './providers.js';
import { createAdminRouter } from './admin.js';
import { handleConfigure, getPublicBaseUrl } from './configure.js';
import { handleManifestProxyRoute } from './manifestProxy.js';
import { buildManifest } from './manifest.js';
import { handleLogoPng, handleLogoSvg, handleFavicon } from './logo.js';
import { logger } from '../core/logger.js';

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}

export function createGatewayApp(ctx: StreamHandlerContext, startedAt: number): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(compression());

  // Strict 404 for subtitles on every method (Do not advertise or expose /subtitles)
  app.all(['/subtitles*', '/:config/subtitles*'], (_req: Request, res: Response) => {
    res.status(404).end();
  });

  // Global OPTIONS handler for CORS preflight
  app.options('*', (_req: Request, res: Response) => {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.status(204).end();
  });

  // Root discovery endpoint
  const handleRoot = (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'HEAD') return res.status(200).end();
    res.status(200).json({
      ok: true,
      name: 'Unified Streams',
      version: ctx.addonVersion,
      manifest: '/manifest.json',
      configure: '/configure',
      health: '/health',
      providers: '/providers',
      ...(ctx.adminToken ? { admin: '/admin' } : {}),
    });
  };
  app.get('/', handleRoot);
  app.head('/', handleRoot);

  // Manifest routes
  const handleManifestRoute = (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'HEAD') return res.status(200).end();

    const baseUrl = getPublicBaseUrl(req, ctx.publicBaseUrl);
    const manifest = buildManifest({
      addonVersion: ctx.addonVersion,
      baseUrl,
      hasTmdb: Boolean(ctx.hasTmdb),
    });
    res.status(200).json(manifest);
  };
  app.get(['/manifest.json', '/:config/manifest.json'], handleManifestRoute);
  app.head(['/manifest.json', '/:config/manifest.json'], handleManifestRoute);

  // Configure routes
  app.get(['/configure', '/:config/configure'], (req, res) => handleConfigure(req, res, ctx.publicBaseUrl));
  app.head(['/configure', '/:config/configure'], (req, res) => handleConfigure(req, res, ctx.publicBaseUrl));

  // Manifest-only HLS proxy. Media segments stay on the upstream CDN.
  const manifestProxy = ctx.manifestProxy;
  if (manifestProxy) {
    const proxyRoute = asyncRoute((req, res) =>
      handleManifestProxyRoute(
        req,
        res,
        manifestProxy,
        getPublicBaseUrl(req, ctx.publicBaseUrl),
      ),
    );
    app.get('/proxy/manifest', proxyRoute);
    app.head('/proxy/manifest', proxyRoute);
  }

  // Stream routes
  const streamRoute = asyncRoute((req, res) => handleStreamRoute(req, res, ctx));
  app.get(['/stream/:type/:id.json', '/:config/stream/:type/:id.json'], streamRoute);
  app.head(['/stream/:type/:id.json', '/:config/stream/:type/:id.json'], streamRoute);

  // Observability routes
  const healthRoute = asyncRoute((req, res) => handleHealth(req, res, ctx, startedAt));
  app.get('/health', healthRoute);
  app.head('/health', healthRoute);

  const statsRoute = asyncRoute((req, res) => handleStats(req, res, ctx, startedAt));
  app.get('/stats', statsRoute);
  app.head('/stats', statsRoute);

  const statusRoute = asyncRoute((req, res) =>
    handleStatusPage(req, res, ctx, startedAt, ctx.publicBaseUrl),
  );
  app.get('/status', statusRoute);
  app.head('/status', statusRoute);

  app.get('/providers', (req, res) => handleProvidersPage(req, res, ctx.publicBaseUrl));
  app.head('/providers', (req, res) => handleProvidersPage(req, res, ctx.publicBaseUrl));

  // Provider admin is unavailable unless both a token and override store exist.
  if (ctx.adminToken && ctx.overridesStore) {
    app.use('/admin', createAdminRouter(ctx));
  } else {
    app.all('/admin*', (_req: Request, res: Response) => {
      res.status(404).end();
    });
  }

  // Branding asset routes
  const logoPng = asyncRoute((req, res) => handleLogoPng(req, res));
  app.get('/logo.png', logoPng);
  app.head('/logo.png', logoPng);
  const logoSvg = asyncRoute((req, res) => handleLogoSvg(req, res));
  app.get('/logo.svg', logoSvg);
  app.head('/logo.svg', logoSvg);
  const favicon = asyncRoute((req, res) => handleFavicon(req, res));
  app.get('/favicon.ico', favicon);
  app.head('/favicon.ico', favicon);

  // Method not allowed handler for known routes
  app.all('*', (req: Request, res: Response) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD, OPTIONS');
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }
    res.status(404).json({ error: 'Not Found' });
  });

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('gateway_route_failed', error, {
      route: req.path,
      method: req.method,
      error: message,
    });
    if (res.headersSent) {
      res.end();
      return;
    }
    if (req.path.includes('/stream/')) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ streams: [] });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}
