import crypto from 'node:crypto';
import express, { Request, Response, Router } from 'express';
import { z } from 'zod';
import { isProviderLocked } from '../core/policy.js';
import {
  isAdoptedUpstreamDisabled,
  loadProviderPolicy,
} from '../core/providerPolicy.js';
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

const ProxyAddSchema = z.object({
  match: z.string().trim().min(1).max(2048),
  headers: z.record(z.string(), z.string()).optional(),
});

const ProxyToggleSchema = z.object({
  id: z.string().trim().min(1).max(128),
  enabled: z.boolean(),
});

const ProxyIdSchema = z.object({
  id: z.string().trim().min(1).max(128),
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
  const policy = loadProviderPolicy();

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
      logger.warn('admin.origin_rejected', {
        origin: req.header('origin')?.slice(0, 200),
        host: req.header('host'),
        forwardedHost: req.header('x-forwarded-host'),
      });
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
      logger.warn('admin.origin_rejected', {
        origin: req.header('origin')?.slice(0, 200),
        host: req.header('host'),
        forwardedHost: req.header('x-forwarded-host'),
        route: 'logout',
      });
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
        remoteBackupEnabled: Boolean(ctx.remoteSettings?.isConfigured()),
        manifestProxyEnabled: Boolean(ctx.manifestProxy?.store),
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
        logger.warn('admin.origin_rejected', {
          origin: req.header('origin')?.slice(0, 200),
          host: req.header('host'),
          forwardedHost: req.header('x-forwarded-host'),
          route: 'toggle',
        });
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
      if (isProviderLocked(key, policy.locked)) {
        res.status(409).json({ error: `${id} is locked by policy` });
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
          const catalogEntry = target.providers.find(
            (provider) => provider.id.toLowerCase() === key,
          );
          if (!catalogEntry && enabled !== null) {
            res.status(404).json({ error: `${id} is not present in the ${fleet} catalog` });
            return;
          }
          if (
            enabled === true &&
            catalogEntry &&
            catalogEntry.upstreamEnabled === false &&
            !isAdoptedUpstreamDisabled(id, policy)
          ) {
            res.status(409).json({
              error: `${id} is disabled upstream; add it to adoptUpstreamDisabled and redeploy`,
            });
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

  router.get('/api/manifest-proxy', (_req, res) => {
    const proxyStore = ctx.manifestProxy?.store;
    if (!proxyStore) {
      res.status(503).json({ error: 'manifest proxy is not configured' });
      return;
    }
    res.status(200).json({ version: proxyStore.getVersion(), entries: proxyStore.getEntries() });
  });

  router.post(
    '/api/manifest-proxy/add',
    express.json({ limit: '32kb' }),
    async (req, res) => {
      if (!sameOrigin(req)) {
        logger.warn('admin.origin_rejected', {
          origin: req.header('origin')?.slice(0, 200),
          host: req.header('host'),
          forwardedHost: req.header('x-forwarded-host'),
          route: 'manifest_proxy_add',
        });
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const proxyStore = ctx.manifestProxy?.store;
      if (!proxyStore) {
        res.status(503).json({ error: 'manifest proxy is not configured' });
        return;
      }
      const parsed = ProxyAddSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid manifest proxy entry' });
        return;
      }
      await serialize(async () => {
        try {
          const entry = proxyStore.add(parsed.data);
          ctx.cache.clear();
          logger.info('admin.manifest_proxy_added', {
            id: entry.id,
            host: new URL(entry.match).hostname,
            version: proxyStore.getVersion(),
          });
          res.status(200).json({
            ok: true,
            version: proxyStore.getVersion(),
            entry,
            entries: proxyStore.getEntries(),
          });
        } catch (error) {
          res.status(400).json({
            error: error instanceof Error ? error.message : 'Failed to add manifest proxy entry',
          });
        }
      });
    },
  );

  router.post(
    '/api/manifest-proxy/toggle',
    express.json({ limit: '8kb' }),
    async (req, res) => {
      if (!sameOrigin(req)) {
        logger.warn('admin.origin_rejected', {
          origin: req.header('origin')?.slice(0, 200),
          host: req.header('host'),
          forwardedHost: req.header('x-forwarded-host'),
          route: 'manifest_proxy_toggle',
        });
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const proxyStore = ctx.manifestProxy?.store;
      if (!proxyStore) {
        res.status(503).json({ error: 'manifest proxy is not configured' });
        return;
      }
      const parsed = ProxyToggleSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid manifest proxy toggle' });
        return;
      }
      await serialize(async () => {
        try {
          const entry = proxyStore.toggle(parsed.data.id, parsed.data.enabled);
          ctx.cache.clear();
          logger.info('admin.manifest_proxy_toggled', {
            id: entry.id,
            enabled: entry.enabled,
            version: proxyStore.getVersion(),
          });
          res.status(200).json({
            ok: true,
            version: proxyStore.getVersion(),
            entries: proxyStore.getEntries(),
          });
        } catch (error) {
          res.status(404).json({
            error: error instanceof Error ? error.message : 'Manifest proxy entry not found',
          });
        }
      });
    },
  );

  router.post(
    '/api/manifest-proxy/remove',
    express.json({ limit: '8kb' }),
    async (req, res) => {
      if (!sameOrigin(req)) {
        logger.warn('admin.origin_rejected', {
          origin: req.header('origin')?.slice(0, 200),
          host: req.header('host'),
          forwardedHost: req.header('x-forwarded-host'),
          route: 'manifest_proxy_remove',
        });
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const proxyStore = ctx.manifestProxy?.store;
      if (!proxyStore) {
        res.status(503).json({ error: 'manifest proxy is not configured' });
        return;
      }
      const parsed = ProxyIdSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid manifest proxy remove request' });
        return;
      }
      await serialize(async () => {
        const removed = proxyStore.remove(parsed.data.id);
        if (!removed) {
          res.status(404).json({ error: 'Manifest proxy entry not found' });
          return;
        }
        ctx.cache.clear();
        logger.info('admin.manifest_proxy_removed', {
          id: removed.id,
          enabled: removed.enabled,
          version: proxyStore.getVersion(),
        });
        res.status(200).json({
          ok: true,
          version: proxyStore.getVersion(),
          entries: proxyStore.getEntries(),
        });
      });
    },
  );

  router.post('/api/providers/save', async (req, res) => {
    if (!sameOrigin(req)) {
      logger.warn('admin.origin_rejected', {
        origin: req.header('origin')?.slice(0, 200),
        host: req.header('host'),
        forwardedHost: req.header('x-forwarded-host'),
        route: 'save',
      });
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const remote = ctx.remoteSettings;
    if (!remote || !remote.isConfigured()) {
      res.status(503).json({ error: 'Cloudflare settings backup is not configured' });
      return;
    }

    await serialize(async () => {
      try {
        const proxyStore = ctx.manifestProxy?.store;
        const saved = await remote.save({
          ...overrides.get(),
          ...(proxyStore ? { manifestProxy: proxyStore.get() } : {}),
        });
        logger.info('admin.provider_overrides_saved', {
          version: overrides.getVersion(),
          manifestProxyVersion: proxyStore?.getVersion() ?? 0,
          remoteVersion: saved.version,
        });
        res.status(200).json({
          ok: true,
          remoteVersion: saved.version,
          ...(saved.updatedAt ? { remoteUpdatedAt: saved.updatedAt } : {}),
        });
      } catch (error) {
        logger.error('admin.provider_overrides_save_failed', error);
        res.status(502).json({ ok: false, error: 'Failed to save overrides to Cloudflare' });
      }
    });
  });

  return router;
}
