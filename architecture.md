# Unified Streams Architecture

## 1. Overview
Unified Streams is a production-grade Stremio stream addon combining three provider engines (SA7, Nuvio, and Vega) behind a single public gateway, single container, single configuration system, single cache, and unified telemetry schema.

```
                           +-------------------------------------+
                           |            Stremio Client           |
                           +-------------------------------------+
                                              |
                          GET/HEAD/OPTIONS    |  Public HTTP (Port 7000)
                                              v
+------------------------------------------------------------------------------------+
| Gateway Container                                                                  |
|                                                                                    |
|  +------------------------------------------------------------------------------+  |
|  | Gateway (src/addon/app.ts)                                                   |  |
|  |                                                                              |  |
|  |  - Public Routes:                                                            |  |
|  |      /manifest.json, /:config/manifest.json                                  |  |
|  |      /stream/:type/:id.json, /:config/stream/:type/:id.json                  |  |
|  |      /configure, /:config/configure                                          |  |
|  |      /health, /stats, /status, /                                             |  |
|  |      /logo.png, /logo.svg, /favicon.ico                                      |  |
|  |                                                                              |  |
|  |  - Core Subsystems:                                                          |  |
|  |      * Env & Policy Validation (Zod)                                         |  |
|  |      * Gateway Cache: 180s full TTL, 30s partial TTL, non-empty only         |  |
|  |      * Content ID Parser: tt, tmdb:, mal:                                    |  |
|  |      * Metadata Resolver: Cinemeta, TMDB, Jikan (rate-limited)               |  |
|  |      * Stream Merger & Classifier: direct playable vs externalUrl            |  |
|  |      * Filters: Resolution, File Size, Separate Subtitles                    |  |
|  |      * Concurrency: Global deadline (12s), Timeout clamp, Request coalescing|  |
|  |      * Telemetry: Canonical sliding-window health & stats                    |  |
|  |      * Logger: Structured JSON lines, Redaction, Async queue, Stdout/CF Sink |  |
|  |      * Updater Scheduler: 20-24h jittered jobs for SA7, Nuvio, Vega         |  |
|  +------------------------------------------------------------------------------+  |
|         |                                 |                                 |      |
|         | HTTP 127.0.0.1:7001             | HTTP 127.0.0.1:7002             | HTTP |
|         v                                 v                                 v      |
|  +-------------------+          +-------------------+          +-----------------+ |
|  | SA7 Worker        |          | Nuvio Worker      |          | Vega Worker     | |
|  | (fleets/sa7)      |          | (fleets/nuvio)    |          | (fleets/vega)   | |
|  |                   |          |                   |          |                 | |
|  | - Port 7001       |          | - Port 7002       |          | - Port 7003     | |
|  | - Loopback only   |          | - Loopback only   |          | - Loopback only | |
|  | - /internal/*     |          | - /internal/*     |          | - /internal/*   | |
|  | - Cap 100/provider|          | - Cap 100/provider|          | - Cap 100/prov  | |
|  | - No stream cache |          | - No stream cache |          | - No stream cach| |
|  +-------------------+          +-------------------+          +-----------------+ |
+------------------------------------------------------------------------------------+
```

## 2. Directory Layout
- `config/`: Default settings (`defaults.env`) and canonical provider policy (`providers.json`).
- `assets/`: Static branding assets (`logo.png` 512x512, `logo.svg`, `favicon.ico`).
- `src/core/`: Shared runtime utilities:
  - `env.ts`: Unified environment schema and fleet derivation.
  - `logger.ts` & `logging/`: Structured event logging, sinks, redaction.
  - `telemetry.ts`: Canonical health and stats metrics aggregation.
  - `cache.ts`: Gateway response cache with coalescing and TTL policies.
  - `contentId.ts` & `metadata.ts` & `jikan.ts`: ID parsing and upstream metadata resolution.
  - `policy.ts`: Provider policy enforcement and verification.
  - `workerClient.ts`: Internal HTTP client with deadline management.
  - `updater/`: In-process snapshot downloaders and installers.
- `src/addon/`: Gateway application layer:
  - `app.ts`: Express application with explicit HTTP method handlers.
  - `manifest.ts`: Stremio manifest generator.
  - `configure.ts`: Accessible, responsive configuration UI.
  - `stream.ts`: Stream resolution orchestrator.
  - `filters.ts`: Canonical stream filtering (resolution, size, subtitles).
  - `merge.ts`: URL classification, deduplication, and sorting.
  - `health.ts` & `stats.ts`: Observability endpoints with aggregated provider metrics across fleets.
  - `status.ts` & `statusHtml.ts`: Dark-mode real-time status dashboard with per-provider metrics table, filter search, fleet cards, and 15s auto-refresh.
- `src/fleets/`: Worker implementations:
  - `sa7/`: SA7 scraper engine running in isolated CommonJS context.
  - `nuvio/`: Nuvio scraper engine running in ES context.
  - `vega/`: Vega scraper engine running in ES context.
- `cloudflare/`: Optional remote log ingestion Worker and D1 schema.
- `scripts/`: Dev, policy check, icon verification, and deployment scripts.

## 3. Strict Rules & Boundaries
- Gateway is the only public interface.
- Workers bind exclusively to `127.0.0.1` and expose only `/internal/health`, `/internal/stream`, and `/internal/reload`.
- No stream response caching in workers; gateway cache alone handles response caching (180s full, 30s partial, never empty).
- `HEAD` requests on all public routes return identical status/headers without executing provider fan-out or streaming full bodies.
- All errors fail open to `{ "streams": [] }` with HTTP 200, never HTTP 5xx.
- No `any` type in TypeScript; strict typing enforced throughout.
- Single responsibility rule: any function or component exceeding 150 lines is refactored into smaller helper functions.

## 4. Live Deployment
- **Repository**: `https://github.com/Ashishsri2018/unified-streams`
- **Beamup Remote**: `dokku@a.baby-beamup.club:a38b6dd4fcd1/unified-streams-docker`
- **Public Base URL**: `https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club`
- **Manifest URL**: `https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club/manifest.json`
- **Configure URL**: `https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club/configure`
- **Health Endpoint**: `https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club/health`
- **Active Fleets & Providers**: 89 total (SA7: 19, Nuvio: 30, Vega: 40)
