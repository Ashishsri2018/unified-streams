# Unified Streams Memory Log

- Completed Provider Allocation & Deployment Separation (Session Nov 14 2026):
  - Added `SA7_DISABLED_PROVIDERS` support in SA7 worker runtime with instant env override (`process.env.SA7_DISABLED_PROVIDERS`).
  - Added bidirectional alias support for Vega's `rogmovie` / `rogmovies` to `luxMovies` in `src/core/env.ts`.
  - Configured baseline provider policy in `config/providers.json` targeting Railway with 69 active scrapers (disabling `sylphera`, `animeworld`, `movies4u`, `luxMovies`, plus duplicates, torrents, IA, and YouTube).
  - Configured Beamup deployment in `.github/workflows/ci.yml` with Dokku environment sync targeting strictly 4 active scrapers: Vega `animeworld`, `movies4u`, `luxMovies` (`RogMovies`) and Nuvio `sylphera` (SA7 all 28 disabled).
  - All test suites passing (53/53 Vitest tests). CI run `43550994196` succeeded across all verification, Docker, and deployment stages.
  - Verified Railway live endpoint: 69 active providers operational (SA7: 14, Nuvio: 30, Vega: 25).
  - Stopped further execution per user request.

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

- Timeout Restoration (13s Global, 12s Backend, 11s Worker Budget) & External URL Emoji:
  - Reverted `GLOBAL_DEADLINE_MS` to `13000` (13s) and `BACKEND_TIMEOUT_MS` to `12000` (12s), giving workers an 11s deadline (`BACKEND_TIMEOUT_MS - 1000`). Live metrics revealed Beamup's Cloudflare edge cuts connections around ~13.2s on slow requests; the 12s/11s budget ensures responses are returned and serialized before that cutoff.
  - Added `🖥️` emoji prefix to the title of all `externalUrl` streams in `src/addon/merge.ts` (`normalizeStreamItem`), clearly distinguishing external link streams from direct streaming URLs.
  - Added unit test in `tests/features/merge.test.ts` to verify `🖥️` emoji tagging for external streams.
  - Live deployment verified on Beamup (`https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club`):
    1. Movie (*Interstellar* - `tt0816692`): 49 streams returned (24 direct, 25 external). Direct streams have standard titles; 100% of external streams prefixed with `🖥️`. Completed in 12.45s on cold miss.
    2. Series (*Breaking Bad* S01E01 - `tt0903747:1:1`): 54 streams returned (22 direct, 32 external). 100% of external streams prefixed with `🖥️`. Completed in 13.77s.
    3. Anime (*Attack on Titan* S01E01 - `tt2560140:1:1`): 40 streams returned (11 direct, 29 external). 100% of external streams prefixed with `🖥️`. Completed in 12.52s.

- HTML-Only External URL Classification & Zip Emoji Tagging:
  - Enforced strict classification across gateway (`src/addon/classifier.ts`, `src/addon/merge.ts`) and all three fleets (`sa7`, `nuvio`, `vega`):
    1. Only HTML pages (`.html`, `.htm`, `.php`, `.asp`, `.aspx`, `.jsp`, `.cgi`, embed path patterns, known embed domains) are mapped to `externalUrl` and tagged with `🖥️` in `title`.
    2. Extensionless URLs (such as `dash-hls-bridge` or direct CDN/API video streams) are NOT `externalUrl`: they remain direct playable streams (`url`).
    3. Compressed archive files (`.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.bz2`, `.iso`, `.xz`) are NOT `externalUrl`: they remain in `url` and have their `name` property prefixed with the `🔲 ` emoji.
  - Updated all unit tests in `tests/features/merge.test.ts` to cover extensionless bridge URLs, compressed files with `🔲` emoji in `name`, and HTML embed pages with `🖥️` in `title`. All 47 tests, ESLint, and TypeScript checks pass.

- Codebase Logic & Protocol Issues Audit:
  - Conducted full audit of all subsystems across gateway, workers (SA7, Nuvio, Vega), config, updaters, and health endpoints.
  - Documented findings in `docs/audit-findings.md` covering:
    1. Critical bug: SA7 drops streams with unknown resolution when user config string is passed.
    2. Critical bug: SA7 content ID parser regex fails on single-suffix season pack IDs (`tt...:season`).
    3. Bug: Nuvio and Vega internal parsers reject season 0 specials (`season < 1`).
    4. Bug: Configure UI ignores prefilled configuration string (`prefillJson`), resetting form on edit.
    5. Gap: `/health` reports empty updater state and zeroed metadata cache because instances are not wired into `StreamHandlerContext`.
    6. Flaw: `healthcheck.mjs` exits 1 on transient single-worker degradation, killing container unnecessarily.
    7. Bug: Status dashboard crashes on HTTP 503 instead of rendering failure diagnostics.
    8. Edge cases: Jikan concurrent rate limiting race condition, CSP `'unsafe-inline'`, container rank regex on `#hash`, and legacy SA7 dead code (`server.js`, `run.js`).

## Key Decisions & Conventions
- TypeScript with strict mode for all gateway and shared core code.
- Zero `any` usage.
- Standardized error handling: all stream requests return `{ "streams": [] }` on failure/empty.
- Strict HTTP compatibility: `GET`, `HEAD`, `OPTIONS` supported explicitly; `HEAD` never invokes upstream provider fan-out.
- Documentation commits must always contain `[skip ci]` to prevent redundant CI/CD builds.

- Live Instance Cross-Comparison (Railway Production vs Docker Beamup):
  - Queried identical movie requests across both live deployments:
    - Railway: `https://unified-streams-production.up.railway.app/`
    - Beamup: `https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club/`
  - Compared responses for *Fight Club* (`tt0137523`) and *The Shawshank Redemption* (`tt0111161`):
    1. Stream Counts:
       - *Fight Club*: Railway returned 115 streams (97 direct, 18 externalUrl); Beamup returned 71 streams (53 direct, 18 externalUrl). 50 URLs were identical.
       - *The Shawshank Redemption*: Railway returned 85 streams (71 direct, 14 externalUrl); Beamup returned 60 streams (46 direct, 14 externalUrl). 41 URLs were identical.
    2. Fleet & Provider Breakdown:
       - SA7 Fleet: 100% parity across all SA7 providers (DesiFlix, Movix VF, MultiMovies, NetMirror, RedFlix, VidRock).
       - Vega & Nuvio Fleets: Discrepancies driven by network egress IP blocks, Cloudflare protection, and timeout differences on Beamup for aggressive scrapers (`4khdHub`, `MoviesMod`, `HdHub4u`, `Maelith`, `Quinox`).
       - Beamup exclusive provider: `Sylphera.` returned 2 streams on Beamup while returning 0 on Railway.
    3. Protocol & Specification Verification:
       - Direct-before-externalUrl sorting: Confirmed compliant on both instances.
       - External URL emoji prefix: 100% of external links tagged with `🖥️` prefix in `title` on both instances.
       - Compressed archive emoji prefix: Tagged with `🔲 ` in `name` on both instances (e.g., `🔲 MoviesMod`).
       - Cache headers: Both instances send `cache-control: no-store` on `/stream` endpoints with internal 30s partial / 180s full cache TTLs.
       - Manifest differences: Beamup includes `"tmdb:"` in `idPrefixes` (`["tt", "tmdb:"]`), whereas Railway exposes `["tt"]`.
    4. Report Artifact:
       - Generated and saved full comparison report to `docs/instance-comparison-report.md`.

- Environment & Tooling:
  - Installed official Railway CLI (`@railway/cli` v5.74.0) into the environment. Verified binary location (`/root/node-v22.14.0-linux-arm64/bin/railway`) and confirmed operational readiness via `railway --version` and `railway --help`.
  - Configured Dual-Target CI/CD in `.github/workflows/ci.yml`:
    - Updated pipeline to run `deploy-beamup` and `deploy-railway` in parallel upon successful completion of `verify` and `docker` smoke test.
    - `deploy-railway` installs Railway CLI, syncs environment secrets (`TMDB_API_KEY`, `FEBBOX_UI_COOKIE`, `GRAMCINEMA_TOKEN`), and initiates deployment via `railway up --service unified-streams --detach`.
    - Disconnected direct GitHub webhook trigger on Railway so that GitHub Actions CI/CD serves as the single source of truth for deployments.
    - Added GitHub Actions repository secret `RAILWAY_TOKEN` and refreshed `TMDB_API_KEY`, `GRAMCINEMA_TOKEN`, and `FEBBOX_UI_COOKIE`.
    - Synced credentials directly to Railway service `unified-streams` and Dokku on Beamup.
    - Pushed commit `5247b9f` to `main` and verified end-to-end GitHub Actions workflow execution (run `43538995079`): `Verify` (17s), `Docker Build & Smoke Test` (30s), `Deploy to Railway` (15s), and `Deploy to Beamup` (3m2s) all passed successfully.
    - Verified live HTTP 200 responses on both Railway (`https://unified-streams-production.up.railway.app/manifest.json`) and Beamup (`https://a38b6dd4fcd1-unified-streams-docker.baby-beamup.club/manifest.json`).
  - Configured Platform-Differentiated Timeouts:
    - Preserved default 12s backend timeout and 13s global deadline (`config/defaults.env`) for Beamup deployment.
    - Set `BACKEND_TIMEOUT_MS=27000` (27s) and `GLOBAL_DEADLINE_MS=29000` (29s) on Railway service `unified-streams` via Railway CLI.
    - Updated `.github/workflows/ci.yml` `deploy-railway` job to sync `BACKEND_TIMEOUT_MS=27000` and `GLOBAL_DEADLINE_MS=29000` on every deployment.
    - Hardened Dokku environment sync in `.github/workflows/ci.yml` to treat non-fatal Dokku cluster sync hook errors as warnings, preventing false CI failures when Beamup internal post-deploy triggers time out.
    - Verified all 47 unit/feature tests pass locally without modifying defaults.

- Targeted Multi-Media Provider Benchmark & Platform Categorization:
  - Ran a targeted 6-title benchmark across both live deployments (Railway vs Docker Beamup):
    - 2 Movies: *Fight Club* (`tt0137523`), *Interstellar* (`tt0816692`)
    - 2 Series: *Breaking Bad* S01E01 (`tt0903747:1:1`), *Stranger Things* S01E01 (`tt4574334:1:1`)
    - 2 Anime: *Attack on Titan* S01E01 (`tt2560140:1:1`), *Death Note* S01E01 (`tt0877057:1:1`)
  - Overall Stream Yield: Railway returned 653 total streams vs Beamup's 407 total streams (+60.4% on Railway).
  - Categorized all 39 active providers into platform-compatibility tiers:
    1. Tier 1 (Cross-Platform Champions - 18 providers): 100% parity across SA7 (`RedFlix`, `MultiMovies`, `ToonStream`, `DesiFlix`, `VidRock`, `NetMirror`, `Movix VF`, `TopCartoons`), Vega (`MovieBox Web`, `Castle TV`, `1Flex`, `MoviezWap`, `AnimeSalt`), and Nuvio (`Tyvrel.`, `Esvyl.`, `Quinox.`, `Haylox.`, `Fendrix.`).
    2. Tier 2 (Railway-Advantaged / Railway-Only - 17 providers): Vega scrapers (`4khdHub` +123, `MultiStream` +28, `ShowBox` +23, `HdHub4u` +20, `VMovies` +9) and Nuvio scrapers (`Fjoral.` +32, `Xylos.` +18, `Maelith.` +10, `Xandril.` +14, `Vitrix.` +8, `Ozeris.` +7, `Ilvyrel.` +6, `Solunix.` +5, `Qorva.` +3, `Lenyr.` +2, `Phraxis.` +2, `Praxiel.` +2) which are challenged by Cloudflare/IP bans or 11s deadline on Beamup.
    3. Tier 3 (Beamup-Advantaged - 4 providers): Providers that resolved more or exclusively on Beamup (`AnimeWorld` +35, `Movies4U` +10, `Sylphera.` +8, `RogMovies` +7).
    4. Tier 4 (Inactive / 0 Streams across both): Documented 34 enabled providers that yielded 0 streams across these 6 targets.
  - Documented findings in `docs/instance-comparison-report.md` and `docs/provider-compatibility.md`.
  - Disabled the 17 Railway-only scrapers exclusively on Beamup:
    - Nuvio scrapers (12): `fjoral,xylos,maelith,xandril,vitrix,ozeris,ilvyrel,solunix,qorva,lenyr,phraxis,praxiel`.
    - Vega providers (5): `4khdhub,autoEmbed,showbox,hdhub4u,vega`.
    - Hardened `src/core/env.ts` to sanitize single/double quotes around env lists and merge with base policy.
    - Updated `.github/workflows/ci.yml` Dokku env sync to maintain disabled lists on Beamup deployments.
    - Added unit test `tests/features/disabledProviders.test.ts` testing quote stripping and list merging for both fleets.
    - Verified all 49 Vitest feature tests and full verification pipeline (`npm run verify`) pass.

- Unified Fleet Disabled Providers System & SA7 Deny-List Migration:
  - Migrated SA7 fleet from an allow-list (`SA7_PROVIDERS` / `PROVIDERS`) to a deny-list (`SA7_DISABLED_PROVIDERS` / `DISABLED_PROVIDERS`), aligning with Nuvio and Vega conventions.
  - Updated `config/providers.json` so SA7 operates in `mode: "deny"` with the 14 duplicate scrapers (`moviesdrive, 4khdhub, hdhub4u, vegamovies, castle, anizone, moviebox, moviesmod, torrentio, reanime, animeworld, animesalt, anizen, anikage`) disabled, leaving the exact same 14 active scrapers (`dahmermovies, dahmermovies-tv, desiflix, einthusan, kurage, movix-vf, multimovies, netmirror, playimdb, puretoons, redflix, toonstream, topcartoons, vidrock`).
  - Updated `scripts/check-provider-policy.mjs` to validate `policy.sa7.mode === 'deny'` and ensure `torrentio` is explicitly in `policy.sa7.ids`.
  - Updated SA7 runtime (`src/fleets/sa7/config.js`, `src/fleets/sa7/providers.js`) to read `process.env.DISABLED_PROVIDERS || process.env.SA7_DISABLED_PROVIDERS || ''` and filter scrapers with `!disabled.has(p.id.toLowerCase())`.
  - Enhanced `src/core/env.ts` with `SA7_DISABLED_PROVIDERS` schema definition, and refactored `deriveFleetEnv()` into modular helper functions (`cleanEnvList`, `deriveSa7Env`, `deriveNuvioEnv`, `deriveVegaEnv`) complying with the <150 LOC rule.
  - Added quote-stripping and instance override merging for `SA7_DISABLED_PROVIDERS`, `NUVIO_DISABLED_SCRAPERS`, and `VEGA_DISABLED_PROVIDERS` allowing per-instance provider customization purely via environment variables.
  - Added unit test coverage in `tests/features/disabledProviders.test.ts` and `tests/features/core.test.ts`; all 51 Vitest feature tests and `npm run verify` pass 100%.

- Platform-Differentiated Provider Allocation (4-Active on Beamup vs Primary on Railway):
  - Beamup: Configured strictly 4 active providers across the entire addon to avoid ~14s proxy cut-offs and datacenter IP blocks while preserving high-yield Beamup-exclusive scrapers:
    - `nuvio`: `sylphera` (1 active).
    - `vega`: `animeworld`, `movies4u`, `luxMovies` (RogMovies) (3 active).
    - `sa7`: All 28 providers disabled (0 active).
    - Total active on Beamup = 4 providers.
  - Railway: Configured as the primary workhorse instance:
    - Disabled the 4 Beamup-dedicated scrapers (`sylphera` in Nuvio; `animeworld`, `movies4u`, `luxMovies`/`rogmovies` in Vega).
    - Preserved disabled status for duplicates, Internet Archive, YouTube, and torrent scrapers.
    - All other scrapers stay active: SA7 has 14 active, Nuvio has 30 active, Vega has 25 active (69 active providers total).
  - Aliasing in `src/core/env.ts`: `deriveVegaEnv()` automatically maps `rogmovies` and `rogmovie` to `luxMovies` (and vice-versa).
  - Updated `config/providers.json`, `config/defaults.env`, `.env.example`, `.github/workflows/ci.yml`.
  - Added unit tests in `tests/features/disabledProviders.test.ts`; all 53 Vitest feature tests and `npm run verify` pass 100%.

- Instance Profile Configuration & Runtime-Overridable Policy:
  - Replaced per-platform CI hardcoding with `INSTANCE_PROFILE`. Loading order is `config/defaults.env` → `config/instances/<profile>.env` → platform env, so an operator can change timeouts or providers later without a code change while CI only sets the profile and credentials.
  - Added `config/instances/beamup.env` (12s/13s, 40-way concurrency) and `config/instances/railway.env` (27s/29s, 40-way concurrency).
  - Moved Beamup's 4-provider selection into `config/providers.json` under `instances.beamup` (SA7 `*` deny; Nuvio `sylphera` allow; Vega `animeworld`/`movies4u`/`luxMovies` allow). Top-level deny lists remain the Railway/default policy.
  - Added allow-list support and `*` wildcard to SA7, Nuvio, and Vega workers, plus `SA7_CONCURRENCY` bounded provider fan-out. Hard-disabled classes (`youtube`, `torrentio`, `internetArchive`, `brellor`) cannot be re-enabled.
  - Added Vega > Nuvio > SA7 duplicate priority in `src/addon/merge.ts` so duplicate URLs keep the Vega copy.
  - CI now sets only `INSTANCE_PROFILE` and secrets for each platform; `scripts/check-provider-policy.mjs` validates default and per-instance blocks.
  - Added profile, override, wildcard, hard-disable, and merge-priority tests; all 58 Vitest tests and `npm run verify` pass 100%.

- One-Time Legacy Env Cleanup:
  - Added `.github/workflows/cleanup-env.yml` (`workflow_dispatch`, requires typing `CLEAN`). Beamup's deploy key permits only `config:set` (both `config:unset` and `config:show`/`config:keys` return `001cERR unsupported command`), so the workflow sets all six legacy provider vars to empty values. `src/core/env.ts` treats empty values as no override, which neutralizes the old lists and restarts the app onto the profile.
  - Run it once after the instance-profile Beamup deploy finishes. Normal pushes still sync only `INSTANCE_PROFILE` and credentials, so later runtime overrides are preserved.

- Comprehensive Code Review & Logic Bug Inspection (Session Nov 14 2026):
  - Completed deep inspection of gateway, workers (`sa7`, `nuvio`, `vega`), environment & profile logic, updaters, telemetry, and CI/CD pipelines.
  - Identified and documented 15 findings across the codebase in artifact `code-review.md`:
    1. Critical bug: SA7 drops streams with unknown resolution when query config is passed (`sa7/worker.js`, `streams.js`, `filters.js`).
    2. High bug: SA7 content ID parser regex fails on single-suffix season pack IDs (`tt...:season`, `tmdb:...:season`) in `sa7/content-id.js`.
    3. High bug: Nuvio and Vega internal parsers reject season 0 specials (`season < 1`) in `parseId.ts`.
    4. Medium bug: Configure UI ignores prefilled configuration string (`prefillJson`), resetting form on edit (`configureHtml.ts`).
    5. Medium flaw: `healthcheck.mjs` exits 1 on transient single-worker degradation, killing container unnecessarily.
    6. Medium bug: Status dashboard crashes on HTTP 503 instead of rendering failure diagnostics (`statusHtml.ts`).
    7. Medium bug: Telemetry type mismatch for SA7 `lastError` object assigned to string field (`breaker.js`, `health.ts`).
    8. Medium race condition: `JikanClient` concurrent rate limiter race condition causing upstream HTTP 429 (`jikan.ts`).
    9. Low gap: `/health` reports empty updater state because `UpdaterScheduler` is not wired into `StreamHandlerContext`.
    10. Low edge case: Nuvio worker health reports 30 scrapers when 0 are active due to falsy `allIds.length || 30`.
    11. Low security: Content-Security-Policy uses `'unsafe-inline'` on `/configure` and `/status`.
    12. Low bug: Container rank regex misses URLs with `#` hash fragments (`merge.ts`).
    13. Low hygiene: Dead legacy SA7 standalone server files (`server.js`, `run.js`).
    14. Low contract: Internal token header `x-internal-token` never verified by workers.
    15. Low gap: `Logger` never configures or instantiates `CloudflareSink` when `LOG_SINK=cloudflare`.
  - All findings verified against runtime code and documented with exact root causes and proposed remedies.
  - Saved full bug report to `docs/bugs.md` and added `docs/bugs.md` to `.gitignore`.

- Enable Duplicate Scrapers on Beamup Instance (Nov 14 2026):
  - Enabled all 13 duplicate scrapers disabled in Railway (`moviesdrive, 4khdhub, hdhub4u, vegamovies, castle, anizone, moviebox, moviesmod, reanime, animeworld, animesalt, anizen, anikage`) on Beamup via `instances.beamup.sa7` in `config/providers.json`.
  - Switched `instances.beamup.sa7` from `"mode": "deny", "ids": ["*"]` to `"mode": "allow"` with the 13 duplicate IDs.
  - Updated Vitest unit test in `tests/features/disabledProviders.test.ts` to assert that SA7 runs these 13 providers in allowlist mode on Beamup without the wildcard denial.
  - Validated with `npm run policy:check`, `npm run test:feature`, and `npm run verify` (all passed 100%).
  - Kept changes local without deploying or pushing, per user instruction.
