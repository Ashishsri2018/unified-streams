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
|  |      * Stream Merger & Classifier: direct playable vs externalUrl (HTML only) |  |
|  |      * Stream Tagging: 🖥️ for externalUrl title, 🔲 for zip/archive name     |  |
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
- `config/`: Default settings (`defaults.env`), per-instance profiles (`instances/beamup.env`, `instances/railway.env`), and canonical provider policy (`providers.json`). Loading order is defaults → selected profile → platform environment.
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

## 4. Live Deployment & Credentials
- **Repository**: `https://github.com/Ashishsri2018/unified-streams`
- **Beamup Deployment**:
  - Remote: `dokku@a.baby-beamup.club:a38b6dd4fcd1/unified-streams-docker`
  - Public Base URL: `https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club`
  - Manifest URL: `https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club/manifest.json`
  - Configure URL: `https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club/configure`
  - Health Endpoint: `https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club/health`
  - Status Dashboard: `https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club/status`
- **Railway Deployment**:
  - Project: `melodious-tranquility` (ID: `bfb0020e-4e61-4f42-9feb-115a06a38be2`)
  - Environment: `production` (ID: `fbfbc17f-875f-4af5-8759-31780c7314a6`)
  - Service: `unified-streams` (ID: `02132873-33e4-47cf-986f-15ef3f6050da`)
  - Public URL: `https://unified-streams-production.up.railway.app`
- **Platform-Differentiated Timeout Strategy**:
  - `INSTANCE_PROFILE` selects `config/instances/<profile>.env`; values are overlaid on `config/defaults.env` and then platform env wins. CI sets only `INSTANCE_PROFILE` plus credentials, so later runtime overrides persist across deploys.
  - **Beamup Deployment**: `config/instances/beamup.env` sets `BACKEND_TIMEOUT_MS=12000` (12s), `GLOBAL_DEADLINE_MS=13000` (13s), and derived worker deadline `11000` (11s) to fit strictly within Beamup's ~14s reverse proxy cut-off.
  - **Railway Deployment**: `config/instances/railway.env` sets `BACKEND_TIMEOUT_MS=27000` (27s), `GLOBAL_DEADLINE_MS=29000` (29s), and derived worker deadline `26000` (26s), taking advantage of Railway's support for extended connection durations to yield streams from slower scrapers (e.g. `4khdHub`, `Maelith`).
  - Both profiles set 40-way concurrency (`SEARCH_CONCURRENCY`, `SCRAPER_CONCURRENCY`, `SA7_CONCURRENCY`).
- **Dual CI/CD Deployment Pipeline (`.github/workflows/ci.yml`)**:
  - Runs on `main` push and manual `workflow_dispatch`.
  - Stages:
    1. `Verify`: Policy check, icon check, ESLint, TypeScript typecheck, Vitest feature tests, build.
    2. `Docker`: Docker build & container smoke test.
    3. Concurrently deploys to:
       - `deploy-beamup`: Syncs `INSTANCE_PROFILE=beamup` plus Dokku credentials (`TMDB_API_KEY`, `FEBBOX_UI_COOKIE`, `GRAMCINEMA_TOKEN`, `PUBLIC_BASE_URL`) and pushes to Beamup Dokku.
       - `deploy-railway`: Installs Railway CLI, sets `INSTANCE_PROFILE=railway`, syncs credentials (`TMDB_API_KEY`, `FEBBOX_UI_COOKIE`, `GRAMCINEMA_TOKEN`), and triggers `railway up --service unified-streams --detach`.
  - `Cleanup Legacy Environment` (`workflow_dispatch`) is a one-time task that unsets legacy Beamup provider env vars (`SA7_*`, `NUVIO_*`, `VEGA_*`). Run it once after the profile-based Beamup deploy finishes; the restart makes the current release use the profile and `instances.beamup` policy. Subsequent deploys keep the minimal CI env sync.
- **Active Fleets & Per-Instance Provider Policy**:
  - `config/providers.json` holds a default policy per fleet plus optional `instances.<profile>` overrides. A fleet can use `allow` or `deny` mode; `*` disables a whole fleet.
  - Hard-disabled classes (`youtube`, `torrentio`, `internetArchive`, `brellor`) are enforced in the gateway derivation and cannot be re-enabled by a profile or environment allow list.
  - **Railway Instance Routing (Primary)**:
    - SA7 (14 active): 14 duplicate scrapers disabled (`moviesdrive, 4khdhub, hdhub4u, vegamovies, castle, anizone, moviebox, moviesmod, torrentio, reanime, animeworld, animesalt, anizen, anikage`), leaving 14 active scrapers (`dahmermovies, dahmermovies-tv, desiflix, einthusan, kurage, movix-vf, multimovies, netmirror, playimdb, puretoons, redflix, toonstream, topcartoons, vidrock`).
    - Nuvio (30 active): Baseline 20 duplicates/BDIX/dead scrapers + `sylphera` disabled (21 disabled), leaving 30 active scrapers.
    - Vega (25 active): Baseline 13 torrent/IA/youtube/duplicate scrapers + `animeworld, movies4u, luxMovies` (and `rogmovies`) disabled (16 disabled), leaving 25 active scrapers.
    - Total active providers on Railway = **69 providers**.
  - **Beamup Instance Routing (Duplicate & Exclusive Scrapers)**:
    - Beamup runs the duplicate scrapers disabled in Railway along with its exclusive scrapers:
      - `sa7` (13 active): `moviesdrive`, `4khdhub`, `hdhub4u`, `vegamovies`, `castle`, `anizone`, `moviebox`, `moviesmod`, `reanime`, `animeworld`, `animesalt`, `anizen`, `anikage` (the 13 redundant duplicate scrapers disabled on Railway).
      - `nuvio` (1 active): `sylphera` (Beamup-exclusive).
      - `vega` (4 active): `animeworld`, `movies4u`, `luxMovies` (RogMovies), `mod` (MoviesMod).
    - Enforced by `instances.beamup` in `config/providers.json` (SA7 allowlist mode for the 13 duplicates, Nuvio `sylphera` allow, Vega `animeworld`/`movies4u`/`luxMovies`/`mod` allow). Runtime `*_ENABLED_*` and `*_DISABLED_*` env vars can override this per instance without a code change.
  - **Search Timeout per Instance**:
    - `SEARCH_TIMEOUT_MS` defaults to 10s (`config/defaults.env`), and `src/core/env.ts` clamps it to the worker deadline. `config/instances/railway.env` raises it to 15s to accommodate slower scrapers within the 27s backend budget.
  - **Instance-Level Environment Overrides & Alias Mapping**:
    - Any deployment instance can selectively customize scrapers purely via environment variables without requiring code changes.
    - In `src/core/env.ts`, `deriveVegaEnv` automatically aliases `rogmovies` / `rogmovie` to `luxMovies` (and vice-versa), ensuring consistent scraper targeting across fleets. Quotes are stripped and lists are merged with base canonical policy.
- **Provider Credentials Pipeline**:
  - `FEBBOX_UI_COOKIE`: Ingested by gateway from environment / GitHub Actions secrets, formatted as `ui=<token>`, and passed to Vega worker via `PROVIDER_SETTINGS_JSON.kv.febboxCookie` for authenticated Showbox streams.
  - `GRAMCINEMA_TOKEN`: Ingested by gateway from environment / GitHub Actions secrets, stripped of `gc_session=` or `Bearer ` prefixes, and forwarded to Nuvio worker via `SCRAPER_SETTINGS_JSON.fjoral.cinemaTvToken` for authenticated GramCinema (`bollywood.eu.org`) streams. `fjoral` resolution settings default `enable720p`, `enable1080p`, and `enable2160p` to true.
  - `KARTOONS_TOKEN`: Ingested by gateway from environment / GitHub Actions secrets, stripped of `token=` or `Bearer ` prefixes, and forwarded to Vega worker via `PROVIDER_SETTINGS_JSON.kv.kartoons_device_session.token` for authenticated Kartoons (`kartoon.to`) streams.
  - CI/CD Deployment Sync: GitHub Actions CI syncs Dokku environment variables (`TMDB_API_KEY`, `FEBBOX_UI_COOKIE`, `GRAMCINEMA_TOKEN`, `KARTOONS_TOKEN`, `PUBLIC_BASE_URL`) directly before deploying code to Beamup.
- **Provider Observability & Upstream Constraints**:
  - Both Vega and Nuvio track per-provider outcomes and populate `lastError` (including network timeouts, HTTP errors, and failure stages) so the `/status` dashboard provides real-time diagnostics for failing or degraded scrapers.
  - Showbox two-tier architecture: Showbox requires Tier 1 metadata discovery on `showbox.media` before utilizing the FebBox direct stream cookie in Tier 2. When `showbox.media` resets connections from datacenter IPs, discovery fails gracefully without crashing.
