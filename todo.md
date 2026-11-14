# Unified Streams — Implementation Roadmap (todo.md)

- [x] **Phase 1: Project Scaffold & Infrastructure**
  - [x] Initialize repository files: `.gitignore`, `.dockerignore`, `.nvmrc`
  - [x] Create root `package.json` with unified dependencies and scripts
  - [x] Set up `tsconfig.json` (strict mode, target ES2022, module NodeNext)
  - [x] Set up `eslint.config.js`
  - [x] Set up `vitest.config.ts`
  - [x] Add `config/defaults.env` and `.env.example`
  - [x] Add `config/providers.json` (canonical provider policy)
  - [x] Add assets (`assets/logo.png`, `assets/logo.svg`, `assets/favicon.ico`)
  - [x] Add scripts skeleton (`scripts/check-provider-policy.mjs`, `scripts/check-icon.mjs`, etc.)
  - [x] Create documentation skeletons (`README.md`, `NOTICE.md`, `docs/runbook.md`, `docs/decisions.md`)
  - [x] Run `npm install` and establish unified `package-lock.json`

- [x] **Phase 2: Shared Core Modules & Feature Tests**
  - [x] `src/core/env.ts` (Zod schema for global settings, defaults merge, `deriveFleetEnv()`, strict validation)
  - [x] `src/core/redact.ts` (secrets and stream URL sanitization)
  - [x] `src/core/logging/` (event vocabulary, sinks: stdout & cloudflare, async bounded queue)
  - [x] `src/core/logger.ts` (structured logger adhering to BUILD_PLAN event schema)
  - [x] `src/core/telemetry.ts` (canonical telemetry schema, sliding-window provider & fleet metrics)
  - [x] `src/core/cache.ts` (180s complete, 30s partial, non-empty only, concurrency coalescing)
  - [x] `src/core/contentId.ts` (`tt`, `tmdb:`, `mal:` parser with season/episode normalization)
  - [x] `src/core/metadata.ts` (Cinemeta + TMDB + Jikan resolver with rate limiting & positive/negative caches)
  - [x] `src/core/jikan.ts` (Jikan v4 client with 3 req/sec and 60 req/min rate limit queue)
  - [x] `src/core/policy.ts` (Provider policy loader, allow/deny resolver, audit validation)
  - [x] `src/core/contract.ts` (Worker request/response interfaces, headers, outcome types)
  - [x] `src/core/workerClient.ts` (Loopback HTTP client with deadline clamp, request-id propagation)
  - [x] `src/core/concurrency.ts` (Circuit breaker, timeout guard, bounded semaphore)
  - [x] `src/addon/filters.ts` (Resolution, file size, separate subtitle filtering)
  - [x] `src/addon/subtitles.ts` (Subtitle language normalizer, alias mapping e.g. E-Sub -> en)
  - [x] `src/addon/merge.ts` (Stream merger, URL classifier direct vs external, dedupe, sorting, caps)
  - [x] `src/addon/userConfig.ts` (User config v2 encoding/decoding and v1 compatibility)
  - [x] Feature tests for all core modules in `tests/features/`

- [x] **Phase 3: Fleets / Internal Workers**
  - [x] Isolate SA7 provider runtime under `src/fleets/sa7/` with CJS marker, implement `/internal/*` routes
  - [x] Isolate Nuvio provider runtime under `src/fleets/nuvio/`, implement `/internal/*` routes
  - [x] Isolate Vega provider runtime under `src/fleets/vega/`, implement `/internal/*` routes
  - [x] Enforce per-provider 100 stream cap and timeout clamp in workers
  - [x] Verify each fleet independently via unit/contract tests

- [x] **Phase 4: Gateway & Configure Page**
  - [x] `src/addon/manifest.ts` (Stremio manifest with dynamic `idPrefixes`, CORS, cache headers)
  - [x] `src/addon/userConfig.ts` (v2 config encoder/decoder, v1 backward compatibility)
  - [x] `src/addon/configure.ts` (Accessible, responsive configure page with resolution/size/subtitle controls)
  - [x] `src/addon/stream.ts` (Public stream handler with coalescing, deadline, filtering, caching)
  - [x] `src/addon/health.ts` & `src/addon/stats.ts` (Aggregated health & stats endpoints)
  - [x] `src/addon/status.ts` & `src/addon/statusHtml.ts` (Rich dark-mode status dashboard with per-provider metrics table, filter search, fleet cards, and 15s auto-refresh)
  - [x] `src/addon/logo.ts` (Asset serving with correct MIME types and cache headers)
  - [x] `src/addon/app.ts` (Express gateway app with explicit GET, HEAD, OPTIONS for all routes)
  - [x] Root `/` endpoint returning service discovery JSON
  - [x] Comprehensive HTTP contract tests (`GET`, `HEAD`, `OPTIONS`, `405`, `404`)

- [x] **Phase 5: In-Process Updater Scheduler**
  - [x] `src/core/updater/scheduler.ts` (Jittered 20-24h scheduler)
  - [x] Upstream fetchers: GitHub (SA7, Vega) and Codeberg (Nuvio)
  - [x] Atomic snapshot installer with validation, rollback, and worker reload trigger
  - [x] Updater tests and baseline snapshot verification

- [x] **Phase 6: Logging & Cloudflare Ingest**
  - [x] Cloudflare sink implementation with batched HTTP POST and circuit breaker
  - [x] Cloudflare Worker ingest files (`cloudflare/ingest-worker/`) & D1 migration (`cloudflare/migrations/`)
  - [x] Log query tool (`scripts/logs-query.mjs`)

- [x] **Phase 7: Policy & Audit Verification**
  - [x] Ensure `config/providers.json` matches `provider-audit.csv`
  - [x] Implement `scripts/check-provider-policy.mjs`
  - [x] Ensure disabled duplicate reserve pool is correctly wired

- [x] **Phase 8: Build, Docker & CI/CD**
  - [x] Create multi-stage `Dockerfile` and `docker-entrypoint.sh`
  - [x] Create `.github/workflows/ci.yml`, `release.yml`, `rollback.yml`
  - [x] Create `scripts/apply-env.mjs` for one-shot bulk env import
  - [x] Configure dual Beamup + Railway CI/CD pipeline in `.github/workflows/ci.yml`
  - [x] Integrate Railway project `melodious-tranquility` with disconnected GitHub webhooks (CI as single deploy source)
  - [x] Configure platform-differentiated timeouts: 27s backend / 29s global on Railway vs 12s backend / 13s global on Beamup
  - [x] Sync credentials (`RAILWAY_TOKEN`, `TMDB_API_KEY`, `GRAMCINEMA_TOKEN`, `FEBBOX_UI_COOKIE`) across GitHub Secrets, Dokku, and Railway
  - [x] Verify end-to-end tests, lint, typecheck, build
  - [x] Verify live runtime smoke test (Gateway on 7000, SA7 on 7001, Nuvio on 7002, Vega on 7003 — 89 active providers)

- [x] **Phase 9: Staging Deployment & Cutover**
  - [x] Initialize git commit and configure GitHub remote (`Ashishsri2018/unified-streams`)
  - [x] Configure CI environment secrets (`BEAMUP_REMOTE`, `BEAMUP_SSH_PRIVATE_KEY`, `PUBLIC_BASE_URL`, `TMDB_API_KEY`)
  - [x] Deploy to Beamup application (`unified-streams-docker`) and verify single-session env apply
  - [x] Validate live health check (`status: "ok"`, 89 providers) and stream merging
  - [x] Verify live manifest, logo, and configure page via public base URL (`https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club`)

- [ ] **Phase 10: Post-Launch Provider Tuning**
  - [x] Audit Status Page Provider Errors & Timeouts (diagnosed causes for Vega errors and Nuvio timeouts)
  - [x] Configure ShowBox FebBox authentication cookie (`FEBBOX_UI_COOKIE`) in GitHub Secrets, Dokku env, and Vega KV store
  - [x] Configure GramCinema session token (`GRAMCINEMA_TOKEN`) in GitHub Secrets, Dokku env, and Nuvio scraper settings
  - [x] Enhance provider `lastError` propagation and observability across Vega and Nuvio
  - [x] Update GitHub Actions CI deploy job to sync Dokku secrets on every deployment
  - [x] Verify Fjoral (GramCinema) upstream token authentication, 720p filter default, and direct CDN link generation
  - [x] Verify Showbox FebBox cookie validity and document upstream `showbox.media` TLS reset constraint
  - [x] Fix 0% success rate providers in SA7: alias `cheerio-without-node-native` to `cheerio` (fixing RedFlix and TopCartoons) and align circuit breaker metrics with Nuvio/Vega
  - [x] Tune timeout budgets: 13s global deadline, 12s backend worker abort, 11s worker budget; add 🖥️ emoji to externalUrl stream titles
  - [x] Enforce HTML-only externalUrl classification: extensionless streams (e.g. dash-hls-bridge) remain in url, compressed files (zip, rar) remain in url with 🔲 emoji in name
  - [x] Live addon verification: tested 1 movie (Interstellar), 1 series (Breaking Bad S01E01), and 1 anime (Attack on Titan S01E01) on Beamup with 100% accurate 🖥️ tagging on externalUrl streams
  - [x] Convert SA7 provider policy from allow-list to deny-list (`SA7_DISABLED_PROVIDERS`), aligning with Nuvio and Vega conventions
  - [x] Enable instance-level environment variable overrides for disabled providers (`SA7_DISABLED_PROVIDERS`, `NUVIO_DISABLED_SCRAPERS`, `VEGA_DISABLED_PROVIDERS`) without requiring code changes
  - [x] Configure 4-provider exclusive routing on Beamup (Vega: animeworld, movies4u, luxMovies/RogMovies; Nuvio: sylphera; SA7: disabled) and primary routing on Railway (excluding Beamup 4, duplicates, IA, YouTube, torrents)
  - [ ] Monitor provider success/timeout rates via `/stats`
  - [ ] Conduct weekly review of failing providers (>30% timeouts or >50% errors)
  - [ ] Swap underperforming providers with reserve pool providers via reversible `config/providers.json` PRs

- [ ] **Phase 11: Logic Bug Fixes & Codebase Hardening**
  - [ ] Fix SA7 unknown resolution dropping bug on configured requests (`src/fleets/sa7/worker.js`)
  - [ ] Fix SA7 season pack regex parser (`src/fleets/sa7/content-id.js`)
  - [ ] Allow Season 0 (specials) in Nuvio and Vega internal stream parsers (`parseId.ts`)
  - [ ] Hydrate prefilled configuration in configure page HTML (`src/addon/configureHtml.ts`)
  - [ ] Wire `UpdaterScheduler` and `MetadataResolver` into `StreamHandlerContext` and `/health`
  - [ ] Update `scripts/healthcheck.mjs` to avoid terminating container during transient single-worker restarts
  - [ ] Fix status dashboard 503 crash in `src/addon/statusHtml.ts`
  - [ ] Add request queue serialization to `src/core/jikan.ts` to prevent race conditions on upstream limits
  - [ ] Generate CSP nonces for HTML pages and remove `'unsafe-inline'`
  - [ ] Remove unused legacy dead code in SA7 (`server.js`, `run.js`)
  - [ ] Fix container rank regex for URLs with `#` hash fragments (`src/addon/merge.ts`)
  - [ ] Normalize SA7 `lastError` object into string in `src/addon/health.ts`
