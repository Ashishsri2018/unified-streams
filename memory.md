# Unified Streams Memory Log

## Current Status
- Completed Phase 1 (Project Scaffold & Infrastructure):
  - Repository initialized with `.nvmrc`, `.gitignore`, `.dockerignore`.
  - Unified root `package.json` with strict engine and single lockfile installed via `npm install`.
  - Configured `tsconfig.json` (strict NodeNext), `eslint.config.js` (strict typing, zero `any`), and `vitest.config.ts`.
  - Created `config/defaults.env`, `.env.example`, and canonical `config/providers.json`.
  - Created 512x512 PNG branding icon (`assets/logo.png`), vector fallback (`assets/logo.svg`), and favicon (`assets/favicon.ico`).
  - Added and verified validation scripts: `scripts/check-icon.mjs` and `scripts/check-provider-policy.mjs`.
  - Added skeletons for `README.md`, `NOTICE.md`, `CHANGELOG.md`, `docs/runbook.md`, and `docs/decisions.md`.
- Completed Phase 2 (Shared Core Modules & Feature Tests):
  - Created `src/core/redact.ts`, `src/core/logging/events.ts`, `src/core/logging/sink.ts`, `src/core/logging/stdoutSink.ts`, `src/core/logging/queue.ts`, `src/core/logger.ts`, `src/core/env.ts`, `src/core/cache.ts`, `src/core/telemetry.ts`, `src/core/contentId.ts`, `src/core/jikan.ts`, `src/core/metadata.ts`, `src/core/policy.ts`, `src/core/contract.ts`, `src/core/workerClient.ts`, `src/core/concurrency.ts`, `src/addon/subtitles.ts`, `src/addon/classifier.ts`, `src/addon/filters.ts`, `src/addon/merge.ts`, `src/addon/userConfig.ts`.
  - Added comprehensive feature tests in `tests/features/`: contentId, subtitles, filters, merge, cache, core (policy & concurrency), userConfig. All tests passing.
- Completed Phase 3 (Fleets / Internal Workers):
  - Created `src/fleets/sa7/worker.js` with isolated CommonJS marker, internal routes (`/internal/health`, `/internal/stream`, `/internal/reload`), per-provider stream cap of 100, and zero public exposure.
  - Created `src/fleets/nuvio/worker.ts` with internal routes, Codeberg snapshot integration, and stream cache disabled.
  - Created `src/fleets/vega/worker.ts` with internal routes, baseline provider registry, and stream cache disabled.
  - Verified WorkerClient interaction with internal routes and contracts via `tests/features/workers.test.ts`.
- Completed Phase 4 (Gateway & Configure Page):
  - Created `src/addon/manifest.ts` with dynamic `idPrefixes` (IMDb, TMDB, MAL), CORS headers, and cache-control.
  - Created `src/addon/configureHtml.ts` and `src/addon/configure.ts` with dark-mode responsive UI, stream quality, file-size limits, separate subtitle track selection, live URL copy/install buttons.
  - Created `src/addon/logo.ts` with streaming asset serving (`/logo.png`, `/logo.svg`, `/favicon.ico`) and fast HEAD responses.
  - Created `src/addon/stream.ts` with single gateway cache, coalescing, per-worker timeout, URL classification, stream filtering, and non-empty only caching.
  - Created `src/addon/health.ts`, `src/addon/stats.ts`, and `src/addon/status.ts` HTML dashboard.
  - Created `src/addon/app.ts` with explicit GET, HEAD, OPTIONS handling, root discovery endpoint, 404 subtitles protection, and 405 Method Not Allowed.
  - Added comprehensive HTTP contract test suite (`tests/features/app.test.ts`), passing all 32 feature tests.
- Completed Phase 5 (In-Process Updater Scheduler):
  - Created `src/core/updater/state.ts` for atomic state persistence.
  - Created `src/core/updater/fetchers.ts` with GitHub and Codeberg commit SHA resolution and ETag support.
  - Created `src/core/updater/scheduler.ts` with 20-24 hour jitter, unref timers, worker reload triggers, and tests in `tests/features/updater.test.ts`.
- Completed Phase 6 (Logging & Cloudflare Ingest):
  - Created `src/core/logging/cloudflareSink.ts` with circuit breaker and non-blocking background queue.
  - Created Cloudflare Ingest Worker (`cloudflare/ingest-worker/wrangler.toml`, `cloudflare/ingest-worker/src/index.ts`).
  - Created D1 migration `cloudflare/migrations/0001_init.sql` for indexed log events and metric aggregations.
  - Created CLI log query tool `scripts/logs-query.mjs`.
- Completed Phase 7 (Policy & Audit Verification):
  - Validated `config/providers.json` against `config/provider-audit.csv` with `scripts/check-provider-policy.mjs`.
- Completed Phase 8 (Build, Docker & CI/CD):
  - Created `src/supervisor.ts` and `src/index.ts` to coordinate gateway and internal workers in one unified process lifecycle.
  - Implemented `scripts/copy-fleet-assets.mjs` ensuring self-contained `dist/` compilation with pure Node.js execution.
  - Implemented automatic baseline and bundled snapshot resolution in supervisor for zero-network instant cold start.
  - Created multi-stage `Dockerfile` and `docker-entrypoint.sh` for non-root execution.
  - Created GitHub Actions workflows (`.github/workflows/ci.yml`, `deploy-cloudflare.yml`, `rollback.yml`).
  - Created `scripts/apply-env.mjs` for one-shot bulk env import.
  - Hardened HTTP gateway: disabled `x-powered-by`, added strict Content-Security-Policy and security headers to HTML pages, enforced 404 on `/subtitles` for all methods including OPTIONS.
  - Verified live runtime: gateway port 7000, SA7 port 7001 (19 providers), Nuvio port 7002 (30 providers), Vega port 7003 (40 providers) — 89 providers operational.
  - `npm run verify` passed cleanly: policy check, icon check, lint (0 warnings), strict typecheck, 33/33 Vitest tests, build.

- Completed Phase 9 (Staging Deployment & Cutover):
  - Created public GitHub repository `Ashishsri2018/unified-streams` and pushed the complete codebase to `main`.
  - Configured repository secrets on GitHub via CLI: `BEAMUP_REMOTE`, `BEAMUP_SSH_PRIVATE_KEY`, `PUBLIC_BASE_URL`, `TMDB_API_KEY`.
  - Created new Beamup application `unified-streams-docker` on `a.baby-beamup.club:a38b6dd4fcd1/unified-streams-docker`.
  - Successfully built, deployed, and validated container via `beamup-lint` and dual port-listening and uptime health checks.
  - Sourced and applied environment variables: `PUBLIC_BASE_URL=https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club` and `TMDB_API_KEY=5ef03c622bd413b220ad0b574f157e73`.
  - GitHub Actions CI/CD Release Pipeline run 43199499151 passed 100%:
    - `Verify (Policy, Icon, Lint, Typecheck, Test, Build)`: succeeded in 14s.
    - `Docker Build & Smoke Test`: succeeded in 31s.
    - `Deploy to Beamup`: pushed and deployed successfully in 2m1s.
  - Verified live deployment:
    - `GET https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club/manifest.json` returns valid Stremio manifest with dynamic `idPrefixes: ["tt", "tmdb:"]` and correct logo URL.
    - `GET https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club/health` returns HTTP 200 `status: "ok"` with 89 active providers (19 SA7, 30 Nuvio, 40 Vega).
    - `HEAD https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club/stream/movie/tt0111161.json` returns HTTP 200 without invoking upstream fan-out.
    - `GET https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club/configure` serves responsive dark configure interface with CSP.

- Enhanced Status Dashboard & Aggregated Provider Observability:
  - Upgraded `/status` to the sleek dark-mode dashboard from the previous addon with live `/health` client-side auto-refresh (15s), brand header, and summary cards.
  - Implemented modular `src/addon/statusHtml.ts` (<150 LOC per function) rendering:
    - 4 Top Metrics Cards: Fleets, Providers, Cache hits, Requests.
    - Fleets component cards: SA7, Nuvio, Vega with process uptime, latency, provider totals, and snapshot SHA.
    - Full interactive Providers table with: `Fleet | Provider | State | Calls | OK | Empty | Errors | Timeouts | Success | Avg ms | Last error`.
    - Instant provider search filter input (`#provider-search`) allowing quick filtering across all 89+ provider circuits.
  - Enhanced `src/addon/health.ts` and `src/core/telemetry.ts` with `aggregateFleetProviders()` returning `providers: { total, circuits, stats }` and `components` at the top level of `/health` and `/stats`.
  - Updated Nuvio worker (`src/fleets/nuvio/worker.ts`) and Vega worker (`src/fleets/vega/worker.ts`) to return per-provider stats in `/internal/health`.
  - Added test coverage in `tests/features/app.test.ts` for `/status` HTML and `/health` aggregated provider reporting; all 35 Vitest tests and `npm run verify` pass cleanly.

- Enforced Provider Policy & Duplicate Exclusions:
  - Synced `config/provider-audit.csv` with full audit decisions (`disable_redundant`, `keep_disabled`, `disable_requested`, `keep_primary`).
  - Injected fleet provider policy directly into `deriveFleetEnv()` in `src/core/env.ts`:
    - SA7: `PROVIDERS` set to the 13 non-duplicate allowed providers (`dahmermovies`, `dahmermovies-tv`, `desiflix`, `einthusan`, `kurage`, `movix-vf`, `multimovies`, `playimdb`, `puretoons`, `redflix`, `toonstream`, `topcartoons`, `vidrock`). Redundant duplicate scrapers disabled.
    - Nuvio: `DISABLED_SCRAPERS` set to the 18 redundant duplicates, regional BDIX, and Internet Archive scrapers. 31 unique/primary scrapers active.
    - Vega: `DISABLED_PROVIDERS` set to `torrentio,internetArchive,youtube,katmovies,multi`.
  - Updated `config/defaults.env` with canonical `SA7_PROVIDERS`, `NUVIO_DISABLED_SCRAPERS`, and `VEGA_DISABLED_PROVIDERS`.
  - Updated Vega worker (`src/fleets/vega/worker.ts`) to exclude `disabledProviders` from active registry list and health metrics.
  - Verified with `npm run verify` and live supervisor test: all policy and duplicate exclusions active.
  - Deployed to Beamup via GitHub Actions run 43205464748 (`main` commit `334ec2a`).
  - Live deployment verified on `https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club`:
    - `/health` reports `status: "ok"`, 79 active non-duplicate providers (SA7: 12, Nuvio: 31, Vega: 36).
    - `/status` serves the dark-mode dashboard with per-provider metrics table, dynamic search filter, fleet status cards, and 15s auto-refresh.
    - Cache verification: empty stream results increment `emptySkips` and are never cached (`streams: []` with 200 OK).

- Fixed Stream Resolution Pipeline & Upstream Provider Integration:
  - Diagnosed zero stream return on real movie requests (`tt1375666` Inception):
    1. In `src/fleets/sa7/worker.js`, `handleStream` called `collectStreams({ type, id, config })` passing a single object instead of positional parameters `(contentId, type, season, episode, config)`. Fixed by parsing content ID via `parseContentId(rawId)` and passing correct positional arguments. Local execution confirmed SA7 resolves 29 streams across providers (`castle`, `dahmermovies`, `multimovies`, `movix-vf`, `vegamovies`, `vidrock`, `moviebox`, `netmirror`).
    2. In `src/core/env.ts`, `deriveFleetEnv()` omitted `TMDB_API_KEY`, `CINEMETA_URL`, and `TMDB_URL` from the derived fleet environment. Added `TMDB_URL` to `EnvSchema` and forwarded all three upstream variables to workers so Vega and Nuvio can resolve TMDB metadata.
  - Committed and pushed commit `ee865fd` triggering GitHub Actions release run `43208383453`.

## Key Decisions & Conventions
- TypeScript with strict mode for all gateway and shared core code.
- Zero `any` usage.
- Standardized error handling: all stream requests return `{ "streams": [] }` on failure/empty.
- Strict HTTP compatibility: `GET`, `HEAD`, `OPTIONS` supported explicitly; `HEAD` never invokes upstream provider fan-out.
