import express, { Express, Request, Response } from 'express';
import compression from 'compression';
import { StreamHandlerContext, handleStreamRoute } from './stream.js';
import { handleHealth, handleStats } from './health.js';
import { handleStatusPage } from './status.js';
import { handleConfigure, getPublicBaseUrl } from './configure.js';
import { buildManifest } from './manifest.js';
import { handleLogoPng, handleLogoSvg, handleFavicon } from './logo.js';

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

    const baseUrl = getPublicBaseUrl(req, process.env.PUBLIC_BASE_URL);
    const manifest = buildManifest({
      addonVersion: ctx.addonVersion,
      baseUrl,
      hasTmdb: Boolean(process.env.TMDB_API_KEY),
      hasMal: process.env.MAL_ENABLED === 'true',
      userConfigEncoded: req.params.config,
    });
    res.status(200).json(manifest);
  };
  app.get(['/manifest.json', '/:config/manifest.json'], handleManifestRoute);
  app.head(['/manifest.json', '/:config/manifest.json'], handleManifestRoute);

  // Configure routes
  app.get(['/configure', '/:config/configure'], (req, res) => handleConfigure(req, res, process.env.PUBLIC_BASE_URL));
  app.head(['/configure', '/:config/configure'], (req, res) => handleConfigure(req, res, process.env.PUBLIC_BASE_URL));

  // Stream routes
  app.get(['/stream/:type/:id.json', '/:config/stream/:type/:id.json'], (req, res) => handleStreamRoute(req, res, ctx));
  app.head(['/stream/:type/:id.json', '/:config/stream/:type/:id.json'], (req, res) => handleStreamRoute(req, res, ctx));

  // Observability routes
  app.get('/health', (req, res) => handleHealth(req, res, ctx, startedAt));
  app.head('/health', (req, res) => handleHealth(req, res, ctx, startedAt));

  app.get('/stats', (req, res) => handleStats(req, res, ctx, startedAt));
  app.head('/stats', (req, res) => handleStats(req, res, ctx, startedAt));

  app.get('/status', (req, res) => handleStatusPage(req, res, ctx, startedAt, process.env.PUBLIC_BASE_URL));
  app.head('/status', (req, res) => handleStatusPage(req, res, ctx, startedAt, process.env.PUBLIC_BASE_URL));

  // Branding asset routes
  app.get('/logo.png', handleLogoPng);
  app.head('/logo.png', handleLogoPng);
  app.get('/logo.svg', handleLogoSvg);
  app.head('/logo.svg', handleLogoSvg);
  app.get('/favicon.ico', handleFavicon);
  app.head('/favicon.ico', handleFavicon);

  // Method not allowed handler for known routes
  app.all('*', (req: Request, res: Response) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD, OPTIONS');
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }
    res.status(404).json({ error: 'Not Found' });
  });

  return app;
}
