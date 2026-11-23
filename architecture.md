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
| Single Node process (src/index.ts)                                                 |
|                                                                                    |
|  +------------------------------------------------------------------------------+  |
|  | Gateway (src/addon/app.ts)                                                   |  |
|  |  - Public routes, gateway cache, metadata resolution, stream merge/filter     |  |
|  |  - Updater scheduler (20-24h jittered jobs)                                   |  |
|  +------------------------------------------------------------------------------+  |
|                                                                                    |
|  +------------------------------------------------------------------------------+  |
|  | In-process fleets (create*Handlers factories + core/internalServer.ts)       |  |
|  |                                                                              |  |
|  |  +-------------------+  +-------------------+  +-------------------+          |  |
|  |  | SA7 127.0.0.1:7001|  | Nuvio 127.0.0.1:7002|  | Vega 127.0.0.1:7003|        |  |
|  |  | /internal/*       |  | /internal/*       |  | /internal/*       |          |  |
|  |  +-------------------+  +-------------------+  +-------------------+          |  |
|  +------------------------------------------------------------------------------+  |
|                                                                                    |
|  Shared: env/policy derivation (core/env.ts, core/policy.ts), logger, telemetry     |
+------------------------------------------------------------------------------------+
```

All three fleet runtimes and the gateway share one Node heap. The loopback HTTP
contract on ports 7001-7003 is unchanged, so `WorkerClient` and the gateway code
are unaware of the in-process consolidation. Heap caps are applied at process
start via `NODE_OPTIONS` (see `docker-entrypoint.sh`).

## 2. Directory Layout
- `config/`: Default settings (`defaults.env`), per-instance profiles (`instances/beamup.env`, `instances/railway.env`), and canonical provider policy (`providers.json`). Loading order is defaults → selected profile → platform environment.
- `assets/`: Static branding assets (`logo.png` 512x512, `logo.svg`, `favicon.ico`).
- `src/core/`: Shared runtime utilities:
  - `env.ts`: Unified environment schema and fleet derivation.
  - `logger.ts` & `logging/`: Structured event logging, sinks, redaction.
  - `telemetry.ts`: Canonical health and stats metrics aggregation.
  - `cache.ts`: Gateway response cache with coalescing and TTL policies.
  - `contentId.ts` & `metadata.ts` & `jikan.ts` & `animeapi.ts` & `kitsu.ts` & `tvmaze.ts`: ID parsing and upstream metadata resolution. `mal:` IDs are mapped to a canonical IMDb/TMDB ID via AnimeAPI (`ANIMEAPI_URL`), with Jikan + TMDB title search fallback. `kitsu:` IDs are first mapped to MAL through Kitsu (`KITSU_URL`), then follow the same path (with a Kitsu title/year → TMDB search fallback when no MAL mapping exists). `tvdb:` series resolve through TVMaze (`TVMAZE_URL`); TVDB movies and TVMaze misses use TMDB's `external_source=tvdb_id` lookup when `TMDB_API_KEY` is set. When AnimeAPI exposes only one of IMDb/TMDB for a MAL/Kitsu title, the resolver fills the missing id from TMDB (detail `external_ids` or `external_source=imdb_id` find). IMDb→TMDB resolution falls back to TMDB's `external_source=imdb_id` lookup when Cinemeta has no `moviedb_id`, so the gateway forwards both `imdbId` and `tmdbId` to every fleet whenever either can be derived. The gateway rewrites anime/TVDB IDs (preserving season/episode suffixes) before fleet fan-out, and the gateway cache key is the canonical resolved identity (IMDb first, then TMDB) so `tt…` and `tmdb:…` requests for the same content share one cache entry. Canonical year parser (`parseCanonicalYear`) sanitizes Cinemeta year ranges (such as `"2019–"` with unicode en-dash `\u2013`) into pure 4-digit integers to enforce RFC ByteString compliance for HTTP headers.
  - `policy.ts`: Provider policy enforcement and verification.
  - `urlClassifier.ts`: Single source of truth for URL & stream classification:
    * Direct playable media recognition across standard extensions (`mp4`, `mkv`, `m4v`, `webm`, `avi`, `mov`, `flv`, `m3u8`, `mpd`, `ts`, `3gp`, `3g2`, `ogv`, `ogg`, `mpg`, `mpeg`, `wmv`, `asf`, `vob`, `m2ts`, `mp3`, `aac`, `flac`, `wav`, `m4a`, `opus`) and streaming API endpoints like `/api/watch/m3u8`.
    * Extensionless links on media CDNs (e.g. `media.satella.buzz/e/...`, `/v/...`, `/stream/...`, `/play/...`) default to `url` for native in-app Stremio playback.
    * Proxy hosts (`proxy.*` such as `proxy.vidbolt.xyz/f/...`) are direct stream endpoints, so extensionless proxy URLs stay in `url` even when the parent domain is in `KNOWN_EMBED_DOMAINS`.
    * Host-specific download endpoints (e.g. Streamtape `/get_video`) are direct media even when the host is in `KNOWN_EMBED_DOMAINS`; they stay in `url` and are expected to redirect to a playable file.
    * Web embed and player page detection (HTML extensions `.html`/`.php`/etc., `/embed/`, `/player/`, `/watch/`, `/iframe/`, Telegram links, and `KNOWN_EMBED_DOMAINS` like Streamtape, Doodstream, Mixdrop, FileLions) route to `externalUrl` with `🖥️` prefix.
    * Compressed archive detection (`.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.tgz`, `.bz2`, `.tbz2`, `.iso`, `.xz`, `.zst`) routes to `externalUrl` with `🔲` name and `🖥️` title markers.
    * Blocker and anti-bot URL filtering (`/slowdown`, `/ratelimit`, `/antibot`).
    * Stream key canonicalization and normalization for cross-fleet deduplication.
  - `streamQuality.ts`: Single canonical implementation of resolution inference (8K down to 240p), quality sorting rank, container format ranking (`mp4`/`mkv` > other > `m3u8`/`mpd`), and file size parsing (`parseSizeBytes`, `inferSizeBytes`).
  - `drm.ts`: DRM metadata passthrough. Validates that a provider's `drm` value is a recognizable object (ClearKey, Widevine, PlayReady, or a `clearKeys` map) and returns a shallow copy preserving every field, so DRM-capable clients receive information the gateway itself does not interpret.
  - `streamHeaders.ts`: Upstream proxy header sanitization (stripping hop-by-hop and `Proxy-*` headers, CRLF injection protection), placeholder host identification (`example.com`, `localhost`, etc.), and safe HTTP URL parsing. Fleets advertise provider playback headers via `behaviorHints.proxyHeaders.request` and set `behaviorHints.notWebReady: true` whenever headers are required (SA7, Nuvio, and Vega all follow this contract).
  - `subtitles.ts`: Centralized subtitle track formatting, ISO base code mapping for global and Indic languages, and user preference filtering.
  - `networkClassifier.ts`: Single source of truth for transport attempt tracking and silent error classification heuristics across all three fleets (SA7, Nuvio, Vega), accurately distinguishing genuine catalog misses (`empty`) from swallowed upstream network/API failures (`error` / `timeout`) without touching vendor provider files.
  - `contract.ts` & `workerClient.ts`: Loopback HTTP worker contracts and metadata forwarding (`x-meta-title`, `x-meta-year`, `x-meta-tmdb-id`) eliminating redundant upstream Cinemeta/TMDB requests. Enforces strict ByteString sanitization on all forward headers, eliminating Undici character code > 255 TypeError crashes. Vega worker consumes `x-meta-tmdb-id` to fetch TMDB episode metadata (episode titles) for series matching.
  - `updater/`: In-process snapshot downloaders, fetchers, and installers. Remote head SHA resolution supports GitHub (`/repos/:owner/:repo/commits/:branch`) and Codeberg/Forgejo (`/repos/:owner/:repo/branches/:branch` with `/commits?sha=:branch` fallback). SA7 provider files live under `DATA_DIR/sa7/cb-providers` and are swapped atomically; the scheduler waits for worker readiness, verifies the reload, schedules successful runs on a 20-24h jittered interval, and retries failed checks after 5 minutes.
- `src/addon/`: Gateway application layer:
  - `app.ts`: Express application with explicit HTTP method handlers.
  - `manifest.ts`: Stremio manifest generator.
  - `configure.ts`: Accessible, responsive configuration UI.
  - `stream.ts`: Stream resolution orchestrator.
  - `filters.ts`: Canonical stream filtering (resolution, size); inline `stream.subtitles` and `stream.drm` pass through unchanged.
  - `merge.ts`: URL classification, deduplication, and sorting. Every stream keeps its full `drm` object, and a DRM-bearing copy wins when the same URL is duplicated.
  - `health.ts` & `stats.ts`: Observability endpoints with aggregated provider metrics across fleets, real worker roundtrip latency measurements, updater error propagation, and accurate fleet working state (`ok`, `degraded`, `error`).
  - `status.ts` & `statusHtml.ts`: Dark-mode real-time status dashboard with per-provider metrics table, filter search, prominent fleet working badges (`WORKING`, `DEGRADED`, `OFFLINE`), updater failure banners, and 15s auto-refresh.
- `src/fleets/`: Worker implementations:
  - `sa7/`: SA7 scraper engine running in isolated CommonJS context.
  - `nuvio/`: Nuvio scraper engine running in ES context. Non-blocking snapshot manager serves active in-memory snapshots immediately on incoming requests (stale-while-revalidate), triggering remote updates asynchronously in the background. Scraper manifest parser normalizes both relative `providers/*.js` paths and full remote `https://*.codeberg.page/...` URLs.
  - `vega/`: Vega scraper engine running in ES context. Preloads baseline providers and state store on startup; all updates execute out-of-band via `/internal/reload`.
- `cloudflare/`: Optional remote log ingestion Worker and D1 schema.
- `scripts/`: Dev, policy check, icon verification, and deployment scripts.

## 3. Strict Rules & Boundaries
- Gateway is the only public interface.
- Workers bind exclusively to `127.0.0.1` and expose only `/internal/health`, `/internal/stream`, `/internal/reload`, `/internal/providers` (catalog), and `/internal/providers/selection` (runtime selection).
- No stream response caching in workers; gateway cache alone handles response caching (180s full, 30s partial, never empty).
- `HEAD` requests on all public routes return identical status/headers without executing provider fan-out or streaming full bodies.
- All errors fail open to `{ "streams": [] }` with HTTP 200, never HTTP 5xx.
- No `any` type in TypeScript; strict typing enforced throughout.
- Single responsibility rule: any function or component exceeding 150 lines is refactored into smaller helper functions.

## 4. Deployment Strategy & Profiles
- **Repository**: `https://github.com/Ashishsri2018/unified-streams`
- **Beamup Deployment**:
  - Managed via Dokku over SSH (host and app identifier dynamically derived from `BEAMUP_REMOTE` secret).
  - Public Base URL: Configured dynamically via `PUBLIC_BASE_URL` secret / Dokku custom domain.
  - Endpoints served: `/manifest.json`, `/configure`, `/health`, `/status`.
- **Railway Deployment**:
  - Managed via Railway CLI with service-level configuration.
  - Public Base URL: Configured via Railway service domain or custom domain.
  - Service: Configured via `RAILWAY_SERVICE` secret / environment.
- **Platform-Differentiated Timeout Strategy**:
  - `INSTANCE_PROFILE` selects `config/instances/<profile>.env`; values are overlaid on `config/defaults.env` and then platform env wins. CI sets only `INSTANCE_PROFILE` plus credentials, so later runtime overrides persist across deploys.
  - **Beamup Deployment**: `config/instances/beamup.env` sets `BACKEND_TIMEOUT_MS=12000` (12s), `GLOBAL_DEADLINE_MS=13000` (13s), and derived worker deadline `11000` (11s) to fit strictly within Beamup's ~14s reverse proxy cut-off.
  - **Railway Deployment**: `config/instances/railway.env` sets `BACKEND_TIMEOUT_MS=34000` (34s), `GLOBAL_DEADLINE_MS=38000` (38s), and derived worker deadline `33000` (33s), taking advantage of Railway's support for extended connection durations to yield streams from slower scrapers (e.g. `4khdHub`, `Maelith`).
  - Both profiles set 40-way concurrency (`SEARCH_CONCURRENCY`, `SCRAPER_CONCURRENCY`, `SA7_CONCURRENCY`).
  - Metadata resolution is bounded by `GLOBAL_DEADLINE_MS - BACKEND_TIMEOUT_MS` (anime clamped to 500–2000ms: 1s Beamup, 2s Railway; other lookups 250–5000ms). This uses only the existing gap before the worker fetch, so the worker budget is untouched. For Kitsu, the mapping lookup uses the first 35% of the anime budget; the remaining time runs the MAL pipeline, where AnimeAPI is capped at 40% and the Jikan/TMDB fallback consumes the remainder, with `themoviedb_type` choosing the TMDB endpoint. TVDB uses the general metadata budget: TVMaze first for series, then TMDB find/detail when needed. Budget expiries and transient failures are not negatively cached; only 404s keep the 60s TTL. On failure the gateway returns `{ "streams": [] }` without fan-out.
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
  - All profiles use `deny` mode so new providers are enabled automatically as upstream fleets add them. The default policy and both instance profiles therefore list only what to disable, not a frozen allowlist.
  - Hard-disabled classes (`youtube`, `torrentio`, `internetArchive`, `brellor`, `durbinlive`, `livetgtv`, `bdix-cf`, `bdix-df`, `bdix-fh`, `jyniq`/Wikimedia) are enforced in the gateway derivation and cannot be re-enabled by a profile or environment allow list.
  - **Runtime provider admin (`/admin`)**: Setting `ADMIN_TOKEN` enables an authenticated panel that reads each worker's `/internal/providers` catalog and pushes full override maps to `/internal/providers/selection`. Overrides persist to `DATA_DIR/provider-overrides.json`, are layered as `hard-disabled > runtime override > env override > instance config > default config`, and are applied lazily: enabling loads the provider bundle in place, disabling unloads it. Every successful toggle increments the policy version used by the gateway cache key. Without `ADMIN_TOKEN`, `/admin*` returns 404. Configured timeouts remain deploy-time settings and are displayed read-only.
  - **Railway Instance Routing (Nuvio Primary, One Copy Per Provider)**:
    - Railway runs at most one fleet copy of every duplicated provider; the remaining copies are reserved for Beamup. Nuvio is the primary fleet, denying only the hard-disabled `brellor`/BDIX scrapers, the nuvio copies whose working copy lives in another fleet (`fastrion`, `fyron`, `gravix`, `karnis`, `mavonyx`, `pynvix`, `qyrvaen`, `soryn`, `zyrvael`), and the zero-yield/policy-denied `kethrax`, `lyrin`, `novus`, `vyranel`, `zevran`.
    - SA7 disables the duplicate copies owned by Nuvio/Vega plus the zero-yield `kurage`, `puretoons`, `toonstream` and hard-disabled `torrentio` (`4khdhub`, `anikage`, `animeworld`, `anizone`, `moviebox`, `moviesdrive`, `moviesmod`, `reanime`, `vegamovies`, `vidrock`). SA7 is the sole Railway source for `netmirror`, `multimovies`, `animesalt`, `anizen`, `castle`, and `playimdb` (re-enabled on Railway after its manifest entry was restored; Beamup keeps the Nuvio `zevran` copy as the backup).
    - Vega disables the duplicate copies owned by Nuvio/SA7 (`4khdhub`, `anikoto`, `animesalt`, `castle`, `drive`, `hdhub4u`, `katmovies`, `movielinkdb`), the failing NetMirror/MultiMovies family replaced by SA7 (`disneyMirror`, `netflixMirror`, `primeMirror`, `multi`), the zero-yield `dramacool`, `eonMovies`, `gokuHD`, `kickAssAnime`, `rareanimes`, and hard-disabled `internetArchive`. All other Vega providers are enabled.
  - **Beamup Instance Routing (Duplicate Backup Copies)**:
    - Beamup runs as a backup instance. For providers with three copies, 1 copy is active on Railway and the remaining 2 copies are active on Beamup as backup. For providers with two copies, Railway runs 1 copy and Beamup runs the second copy as backup.
    - Duplicate backups enabled on Beamup:
      - `sa7`: `4khdhub` (4KHDHub), `anikage` (AniKage), `animeworld` (AnimeWorld), `anizone` (AniZone), `moviebox` (MovieBox), `moviesdrive` (MoviesDrive), `moviesmod` (MoviesMod), `reanime` (Reanime), `vegamovies` (VegaMovies), `vidrock` (VidRock).
      - `nuvio`: `fastrion` (MultiMovies), `fyron` (KissKh), `gravix` (AnimeWorld), `karnis` (Castle), `kethrax` (vixsrc), `mavonyx` (MovieBox), `pynvix` (ShowBox), `qyrvaen` (HDHub4u), `soryn` (NetMirror), `zyrvael` (Anikoto).
      - `vega`: `4khdhub` (4KHDHub), `anikoto` (Anikoto), `animesalt` (AnimeSalt), `castle` (Castle), `drive` (MoviesDrive), `hdhub4u` (HDHub4u), `katmovies` (KatMoviesHd), `movielinkdb` (MovieLinkBD), `multi` (MultiMovies), `netflixMirror` (NetMirror).
    - The Railway-active copies stay denied on Beamup (for example `hexion`, `xylos`, `qorva`, `jhaeros`, `vornix`, `praxiel`, `evyrith`, and the `vega`/`sa7` copies used on Railway). Beamup keeps deny-mode lists so newly added upstream providers are enabled automatically; runtime `*_ENABLED_*` and `*_DISABLED_*` env vars can still override this per instance.
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
