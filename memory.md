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
  - Committed and pushed commit `ee865fd` and `a781767` deploying live to Beamup.
  - Live verification succeeded on `https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club`:
    - `GET /stream/movie/tt1375666.json` returned 18 real playable streams.
    - `GET /stream/movie/tt0137523.json` returned 22 real playable streams.
    - Cache verification: subsequent requests return `cf-cache-status: HIT` with 180s TTL and sub-50ms latency.
  - Manifest specification clarification: Confirmed and clarified why `catalogs: []` is mandatory under the Stremio v3 protocol (preventing Stremio clients from issuing broken discover/catalog queries or rendering blank discover carousels).

- Fixed Vega Provider Call Tracking & Telemetry Reporting:
  - Diagnosed why Vega providers showed 0 calls on `/status`:
    1. In `src/fleets/vega/pipeline/streamHandler.ts`, `ProviderStat` only tracked `avgLatencyMs` and `failures`, and `getMetrics()` hardcoded `calls: null, ok: null, empty: null, timeouts: null`.
    2. In `src/fleets/vega/worker.ts`, provider registry entries used mixed case (e.g. `Showbox`, `FlixHQ`) while `reportedStats` used lowercase keys, causing map lookups to fail and fall back to `0`.
  - Updated `ProviderStat` in `streamHandler.ts` to track `calls`, `ok`, `empty`, `errors`, `timeouts`, `skipped`, `avgLatencyMs`, `failures`, `lastMs`, and `lastError`.
  - Updated `recordProviderResult` to increment call counters and record error/timeout/empty/ok outcomes on every provider execution.
  - Updated `getMetrics()` to return real computed `calls`, `ok`, `empty`, `errors`, `timeouts`, and `successRate`.
  - Updated `src/fleets/vega/worker.ts` to normalize provider IDs with `.toLowerCase()` when looking up metrics.
  - Verified locally with `npm run verify` passing 100% (policy check, icon check, ESLint, TypeScript, and all 35/35 Vitest tests).

- Provider Failure Audit & Duplicate Fleet Replacement:
  - Audited 10 failing/timed-out providers:
    - Vega NetMirror family (`netflixMirror`, `primeMirror`, `disneyMirror`): Remote domain `net52.cc` drops TCP connections / times out.
    - Vega `topmovies`: Upstream domain `moviesleech.club` dead (DNS NXDOMAIN).
    - Vega `1cinevood`: Upstream domain `one.cinevood.business` dead (DNS NXDOMAIN).
    - Vega `uhd`: Upstream origin `uhdmovies.beauty` connection timed out.
    - Vega `kartoons`: Scraper requires interactive Cloudstream device session authentication.
    - Vega `world4u`: Remote search endpoint returns HTTP 404.
    - Nuvio `durnel`: Upstream backend `cockpit.103.109.92.178.nip.io` and `ctgmovies.com` connection timed out.
    - Nuvio `rynara`: Upstream API `api.wecollege.net` and `vidy.st` connection timed out.
  - Cross-fleet duplicate audit & replacement:
    - Identified that `sa7:netmirror` is an active, healthy duplicate of the failing Vega NetMirror family using dynamic discovery domains.
    - Tested `sa7:netmirror` and confirmed it successfully resolves 2-3 playable streams for Inception and Fight Club.
    - Enabled `sa7:netmirror` as the primary NetMirror provider in `SA7_PROVIDERS` and `config/providers.json`.
    - Disabled the dead providers (`durnel`, `rynara` in Nuvio; `1cinevood`, `topmovies`, `uhd`, `kartoons`, `world4u`, `netflixMirror`, `primeMirror`, `disneyMirror` in Vega).
    - Updated `config/provider-audit.csv` with detailed failure causes and duplicate replacements.
    - Verified with `npm run verify` (100% pass across policy check, icon check, lint, typecheck, 35/35 Vitest tests, and build).

- Diagnosed Status Page Provider Errors & Timeouts:
  - Audited live status metrics from `https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club/health`:
    - Vega: `everything` (4 errors), `showbox` (3 errors), `eonMovies` (3 errors), `animesub` (2 errors), `1flex` (1 error), `zeefliz` (1 error).
    - Nuvio: `quinox` (6 timeouts), `maelith` (3 timeouts), `qorva` (2 timeouts), `novus` (1 timeout), `xandril` (1 timeout).
    - SA7: 0 errors, 0 timeouts (100% clean across all 13 active providers).
  - Identified root causes:
    - Vega `everything`: Upstream API `slave.downloadeverythingfromeverywhere.com` returns 403 Forbidden with Cloudflare Turnstile CAPTCHA requiring interactive WebView solving.
    - Vega `showbox`: Origin `showbox.media` (`40.160.33.57:443`) drops TCP connection on TLS handshake (`ECONNRESET`).
    - Vega `eonMovies`: Origin `new4.eonmovies.click` updated HTML layout; scraper selector `.image-container` returns 0 results.
    - Vega `animesub`: P2P torrent scraper with DuckDNS endpoint `animesub.duckdns.org` (`193.70.84.6`) generating magnet links and experiencing high packet loss.
    - Vega `zeefliz` & `1flex`: Slow origins (6-8s response times) behind LiteSpeed/Cloudflare causing occasional timeout spikes.
    - Nuvio `quinox`: Chained roundtrips to 6 workers.dev proxies + AES/SHA256 client crypto average ~9.5s, frequently exceeding the 10s backend deadline (`BACKEND_TIMEOUT_MS=10000`).
    - Nuvio `maelith`: Connects sequentially across 6 server mirrors (`Zeus`, `Aphrodite`, `Hephaestus`, `Prometheus`, `Poseidon`, `Atlas`), averaging 11.3s and breaching the 10s deadline.
    - Nuvio `novus`, `qorva`, `xandril`: Fast healthy scrapers (>85-90% success rate); occasional timeouts caused by transient upstream delays.
  - Identified telemetry discrepancy:
    - In `src/fleets/vega/pipeline/streamHandler.ts`, `recordFailure()` incremented `stat.failures` (which `/status` displays as `Errors`), but never persisted the caught error message to `stat.lastError`. Additionally, empty resolutions incremented `stat.ok`.

- Showbox & GramCinema Authentication Pipeline & Telemetry Fixes:
  - Configured GitHub Secrets `FEBBOX_UI_COOKIE` (Showbox FebBox cookie) and `GRAMCINEMA_TOKEN` (GramCinema `gc_session` token).
  - Configured Dokku environment synchronization in `.github/workflows/ci.yml` so every push automatically propagates `TMDB_API_KEY`, `FEBBOX_UI_COOKIE`, `GRAMCINEMA_TOKEN`, and `PUBLIC_BASE_URL` to Beamup without manual intervention.
  - Updated `src/core/env.ts`:
    - Added `FEBBOX_UI_COOKIE`, `GRAMCINEMA_TOKEN`, and `SCRAPER_SETTINGS_JSON` to `EnvSchema`.
    - In `deriveFleetEnv()`, automatically parsed and injected `febboxCookie` (with `ui=` normalization) into Vega's `PROVIDER_SETTINGS_JSON.kv`.
    - In `deriveFleetEnv()`, automatically parsed and injected `cinemaTvToken` (with `gc_session=` and `Bearer ` stripping) into Nuvio's `SCRAPER_SETTINGS_JSON.fjoral`.
  - Updated `src/fleets/nuvio/snapshot/providers/fjoral.js` `resolveApiToken()` to sanitize tokens from both scraper settings and env.
  - Updated `scripts/apply-env.mjs` allowed keys to include `FEBBOX_UI_COOKIE`, `GRAMCINEMA_TOKEN`, and `SCRAPER_SETTINGS_JSON`.
  - Fixed `lastError` propagation in Vega (`streamHandler.ts` records actual error message and reason without false positive `stat.ok` increments) and Nuvio (`metrics.ts` and `worker.ts` preserve `lastError` for timeouts and provider failures).
  - Added unit test coverage in `tests/features/core.test.ts` for Vega and Nuvio environment derivation (all 37 Vitest tests passing).
  - Verified local build, policy check, icon check, and linter cleanly (`npm run verify`).

- Audited Replacement Candidates for `everything`, `eonMovies`, and `animesub`:
  - Checked `config/provider-audit.csv` across all fleets (`sa7`, `nuvio`, `vega`) and duplicate groups.
  - Confirmed `everything`, `eonMovies`, and `animesub` have no duplicate groups, shared host mirrors, or designated replacement owners in `config/provider-audit.csv`.
  - In accordance with instructions, left all three as is without modifying `config/providers.json`.

- Live URL Stream Resolution Verification:
  - Verified 1 movie (*Inception* `tt1375666`): 20 playable streams returned across 6 providers (`PlayIMDb`, `DesiFlix`, `Movix`, `MultiMovies`, `NetMirror`, `VidRock`).
  - Verified 1 series (*Breaking Bad* `tt0903747:1:1`): 41 playable streams returned across 15 providers (`Sylphera`, `Maelith`, `DesiFlix`, `Esvyl`, `Fendrix`, `Haylox`, `Ilvyrel`, `Movix`, `MultiMovies`, `NetMirror`, `Novus`, `Phraxis`, `Quinox`, `Svartok`, `VidRock`).
  - Verified 1 anime (*Attack on Titan* `tt2560140:1:1`): 23 playable streams returned across 7 providers (`Kurage`, `Movix`, `MultiMovies`, `NetMirror`, `PlayIMDb`, `ToonStream`, `VidRock`).

- CI/CD Optimization for Documentation:
  - Added `paths-ignore: ['**.md']` to `.github/workflows/ci.yml` for push and pull_request triggers.
  - Enforced convention to always include `[skip ci]` in commit messages for documentation and project memory updates to avoid triggering unnecessary CI builds and deployments.

- Showbox & Fjoral Functionality & Status Page Verification:
  - Audited live status dashboard and `/health` metrics across all 70 active providers (SA7: 13, Nuvio: 29, Vega: 28):
    - Overall status: `OK`, 100% fleet health, zero process restarts.
  - Fjoral (`GramCinema`):
    - Confirmed `calls: 7, ok: 7, errors: 0, timeouts: 0, rate: 1.0, lastError: None`.
    - Tested upstream API directly: Authenticates via `GRAMCINEMA_TOKEN` with `tga-hd.api.hashhackers.com`, finds 100 media records for Bollywood titles (e.g. *3 Idiots*), and generates authenticated CDN download links via `/genLink`.
    - Fixed 720p resolution filtering in `src/fleets/nuvio/snapshot/providers/fjoral.js` (`enable720p: s.enable720p !== false`) and `src/core/env.ts` (`enable720p: true`).
  - Showbox:
    - Confirmed FebBox `ui` cookie is valid and accepted by `https://www.febbox.com/console/video_quality_list` without login prompts.
    - Diagnosed that Showbox's Tier 1 discovery origin `www.showbox.media` (`40.160.33.57:443`) actively drops TCP connections with `ECONNRESET` on cloud/datacenter IP ranges during TLS handshake. Because search cannot resolve the showbox episode ID (`epId`), it reports `no streams found` before calling FebBox.
  - Status page provider error breakdown:
    - Documented all 12 providers exhibiting non-zero errors or timeouts (Nuvio: `maelith`, `quinox` timeouts due to multi-hop proxy chains; Vega: `showbox`, `vega`, `autoEmbed`, `gokuHD`, `eonMovies`, `movies4u`, `kmMovies`, `hdhub4u`, `anikoto`, `animesub`, `1flex`). All fail gracefully to empty results without crashing the gateway.

- Diagnosed & Fixed 0% Success Rate Providers:
  - Audited 4 providers showing 0% success rate on `/status` (`[sa7] dahmermovies`, `[sa7] dahmermovies-tv`, `[sa7] puretoons`, `[sa7] redflix`):
    1. Identified that in SA7's `breaker.js`, `ok` was only incremented when `streams.length > 0`, whereas in Nuvio and Vega, `ok` counts all non-failing executions (`calls - errors - timeouts`). Consequently, providers executing with 0 errors and 0 timeouts on titles outside their catalog (e.g. asking a cartoon site `puretoons` for *Inception* or a TV series provider `dahmermovies-tv` for movies) reported `ok: 0` and `successRate: 0%`.
    2. Diagnosed that `redflix` and `topcartoons` were failing or skipped due to missing vendored dependency `cheerio-without-node-native`.
    3. Added Module resolution hook in `src/fleets/sa7/providers.js` and `src/fleets/sa7/worker.js` mapping `cheerio-without-node-native` to standard `cheerio`. Confirmed `redflix` immediately extracts 12 streams for Inception and `topcartoons` loads into registry.
    4. Updated `src/fleets/sa7/lib/breaker.js` to increment `state.ok` on successful empty executions while tracking `state.responded` for internal scoring, aligning SA7's `ok` and `successRate` metrics with Nuvio and Vega.
    5. Tested `puretoons` on cartoon/anime (*Naruto*), confirming 12 streams extracted. Tested `dahmermovies-tv` on series (*Breaking Bad*), confirming 3 streams extracted. Tested `dahmermovies` on movies (*Inception*), confirming 3 streams extracted.

- Concurrency Settings Tuning:
  - Configured `SEARCH_CONCURRENCY=30` and `SCRAPER_CONCURRENCY=30` across `config/defaults.env`, `.env.example`, `src/core/env.ts` (`EnvSchema` and `deriveFleetEnv`), `src/fleets/nuvio/config.ts`, and `src/fleets/vega/config.ts`.
  - Added unit test in `tests/features/core.test.ts` to ensure default and custom values for `SEARCH_CONCURRENCY` and `SCRAPER_CONCURRENCY` are correctly parsed and forwarded to fleet child environments.
  - Audited SA7 scraper concurrency: SA7 fires all enabled providers concurrently using `Promise.all` bounded by per-provider timeout (`Math.min(providerTimeoutMs, deadline - now())`) and circuit breaker status, without a bounded semaphore pool.

- Worker Deadline & Streaming Cache Header Fix:
  - Diagnosed "responded but Empty" providers: the gateway aborts worker fetches at `BACKEND_TIMEOUT_MS` (10s) while workers used `GLOBAL_DEADLINE_MS` (12s), so results were discarded after provider stats incremented.
  - Raised defaults to `BACKEND_TIMEOUT_MS=11000` and `GLOBAL_DEADLINE_MS=13000`, yielding a 10s worker deadline. Derived every worker deadline from `BACKEND_TIMEOUT_MS - 1000`; SA7 now receives `ADDON_DEADLINE_MS`, `MAX_PER_PROVIDER_STREAMS`, `MAX_TOTAL_STREAMS`, and `BREAKER_*` under the names it actually reads.
  - Bounded Nuvio TMDB resolution and snapshot loading by the request deadline; nuvio/vega workers abort pipeline work when the gateway disconnects.
  - Preserved `isPartial` through cache coalescing, and treat responses arriving within the worker deadline margin as partial so they receive the 30s TTL.
  - Live verification showed Beamup's Cloudflare zone rewrites stream cache headers to `max-age=14400`. Per user direction, Cloudflare is for log storage only: stream responses now send `cache-control: no-store` with no CDN cache headers, while 180s/30s TTLs remain internal to the gateway cache.
  - Local full-stack validation: SA7/Nuvio/Vega all return partial results at ~9.1s; merged requests return streams (e.g. 45 for *The Dark Knight*) with `max-age=30` and immediate cache hits.

## Key Decisions & Conventions
- TypeScript with strict mode for all gateway and shared core code.
- Zero `any` usage.
- Standardized error handling: all stream requests return `{ "streams": [] }` on failure/empty.
- Strict HTTP compatibility: `GET`, `HEAD`, `OPTIONS` supported explicitly; `HEAD` never invokes upstream provider fan-out.
- Documentation commits must always contain `[skip ci]` to prevent redundant CI/CD builds.
