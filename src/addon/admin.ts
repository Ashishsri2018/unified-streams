import crypto from 'node:crypto';
import express, { Request, Response, Router } from 'express';
import { z } from 'zod';
import { HARD_DISABLED_PROVIDERS } from '../core/env.js';
import { isProviderLocked } from '../core/policy.js';
import { FLEETS, type FleetName } from '../core/providerOverrides.js';
import type { ProviderCatalogResponse } from '../core/contract.js';
import type { StreamHandlerContext } from './stream.js';
import { getPublicBaseUrl } from './configure.js';
import { logger } from '../core/logger.js';
import {
  clearSessionCookie,
  isAuthenticated,
  sameOrigin,
  setSessionCookie,
  verifyAdminToken,
} from './adminAuth.js';
import { renderAdminLoginPage, renderAdminPage } from './adminHtml.js';

const ToggleSchema = z.object({
  fleet: z.enum(FLEETS),
  id: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_.*-]+$/),
  enabled: z.boolean().nullable(),
});

interface FleetCatalog {
  fleet: FleetName;
  version: number;
  providers: ProviderCatalogResponse['providers'];
  error: string | null;
}

interface AdminCatalog {
  version: number;
  fleets: FleetCatalog[];
}

function newNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

function setHtmlHeaders(res: Response, nonce: string): void {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none';`,
  );
}

export function createAdminRouter(ctx: StreamHandlerContext): Router {
  const router = express.Router();
  const store = ctx.overridesStore;
  const adminToken = ctx.adminToken;
  if (!store || !adminToken) {
    throw new Error('admin router requires token and overrides store');
  }
  const overrides = store;

  let toggleQueue: Promise<unknown> = Promise.resolve();
  function serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = toggleQueue.then(task, task);
    toggleQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function readCatalog(): Promise<AdminCatalog> {
    const fleets = await Promise.all(
      FLEETS.map(async (fleet): Promise<FleetCatalog> => {
        const result = await ctx.workers[fleet].getProviders();
        if ('error' in result) {
          return { fleet, version: 0, providers: [], error: result.error };
        }
        return { fleet, version: result.version, providers: result.providers, error: null };
      }),
    );
    return { version: overrides.getVersion(), fleets };
  }

  router.post('/login', express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
    if (!sameOrigin(req)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const token = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>).token : undefined;
    if (!verifyAdminToken(token, adminToken)) {
      logger.warn('admin.login_failed', { ip: req.ip });
      const nonce = newNonce();
      res.status(401);
      setHtmlHeaders(res, nonce);
      res.send(
        renderAdminLoginPage({
          addonName: 'Unified Streams',
          logoUrl: `${getPublicBaseUrl(req, ctx.publicBaseUrl)}/logo.svg`,
          scriptNonce: nonce,
          error: 'Invalid admin token.',
        }),
      );
      return;
    }
    setSessionCookie(req, res, adminToken);
    res.redirect(303, '/admin');
  });

  router.post('/logout', (req, res) => {
    if (!sameOrigin(req)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    clearSessionCookie(req, res);
    res.redirect(303, '/admin');
  });

  router.use((req: Request, res: Response, next) => {
    if (isAuthenticated(req, adminToken)) {
      next();
      return;
    }
    if (req.path.startsWith('/api/')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.status(401);
    const nonce = newNonce();
    setHtmlHeaders(res, nonce);
    res.send(
      renderAdminLoginPage({
        addonName: 'Unified Streams',
        logoUrl: `${getPublicBaseUrl(req, ctx.publicBaseUrl)}/logo.svg`,
        scriptNonce: nonce,
      }),
    );
  });

  router.get('/', (req, res) => {
    const nonce = newNonce();
    setHtmlHeaders(res, nonce);
    res.send(
      renderAdminPage({
        addonName: 'Unified Streams',
        logoUrl: `${getPublicBaseUrl(req, ctx.publicBaseUrl)}/logo.svg`,
        configureUrl: `${getPublicBaseUrl(req, ctx.publicBaseUrl)}/configure`,
        scriptNonce: nonce,
        settings: ctx.adminSettings,
        version: overrides.getVersion(),
      }),
    );
  });

  router.get('/api/catalog', async (_req, res) => {
    try {
      res.status(200).json(await readCatalog());
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post(
    '/api/providers/toggle',
    express.json({ limit: '16kb' }),
    async (req, res) => {
      if (!sameOrigin(req)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const parsed = ToggleSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid toggle request' });
        return;
      }
      const { fleet, id, enabled } = parsed.data;
      const key = id.toLowerCase();
      if (enabled !== null && isProviderLocked(key, HARD_DISABLED_PROVIDERS)) {
        res.status(409).json({ error: `${id} is hard-disabled by policy` });
        return;
      }

      await serialize(async () => {
        try {
          const catalog = await readCatalog();
          const target = catalog.fleets.find((item) => item.fleet === fleet);
          if (!target || target.error) {
            res.status(503).json({ error: target?.error ?? `${fleet} catalog unavailable` });
            return;
          }
          const known = target.providers.some((provider) => provider.id.toLowerCase() === key);
          if (!known && enabled !== null) {
            res.status(404).json({ error: `${id} is not present in the ${fleet} catalog` });
            return;
          }

          const previousOverrides = overrides.getFleet(fleet);
          const nextOverrides: Record<string, boolean> = { ...previousOverrides };
          if (enabled === null) {
            delete nextOverrides[key];
          } else {
            nextOverrides[key] = enabled;
          }
          const currentValue = previousOverrides[key];
          const changed = enabled === null ? currentValue !== undefined : currentValue !== enabled;
          if (!changed) {
            res.status(200).json({ ok: true, version: overrides.getVersion(), catalog: await readCatalog() });
            return;
          }

          const version = overrides.getVersion() + 1;
          const selection = await ctx.workers[fleet].setProviderSelection(nextOverrides, version);
          if (!selection.ok) {
            res.status(502).json({
              ok: false,
              version,
              error: selection.error ?? 'worker rejected provider selection',
            });
            return;
          }

          try {
            overrides.setOverride(fleet, id, enabled);
          } catch (error) {
            await ctx.workers[fleet].setProviderSelection(previousOverrides, version - 1).catch(() => undefined);
            logger.error('admin.persist_failed', error, { fleet, provider: id });
            res.status(500).json({ ok: false, error: 'Failed to persist provider override' });
            return;
          }

          ctx.cache.clear();
          logger.info('admin.provider_selection', {
            fleet,
            provider: id,
            enabled,
            version: overrides.getVersion(),
          });
          res.status(200).json({
            ok: true,
            version: overrides.getVersion(),
            catalog: await readCatalog(),
          });
        } catch (error) {
          logger.error('admin.toggle_failed', error, { fleet, provider: id });
          if (!res.headersSent) {
            res.status(500).json({ ok: false, error: 'Provider toggle failed' });
          }
        }
      });
    },
  );

  return router;
}
