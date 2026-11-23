# Unified Streams — Condensed Project History

Chronological summary of sessions and outcomes. Full technical detail lives in the code, `CHANGELOG.md`, and `architecture.md`; provider audit notes are kept local-only. Live domains, IDs, and secrets are intentionally redacted.

## Build-out (Phases 1–9)
- Scaffolded Node 22 / ESM / strict TypeScript package, Zod env schema, ESLint (zero `any`), Vitest, Docker, and CI/CD.
- Built shared core: logger + Cloudflare ingest, telemetry, 180s/30s non-empty-only gateway cache, content-ID/metadata resolution, policy, worker contracts, concurrency, URL/stream classification, quality/size/subtitle helpers.
- Built three loopback fleets (SA7 CJS, Nuvio/VEGA ESM) with `/internal/{health,stream,reload}` only, plus in-process updaters (GitHub/Codeberg head resolution, atomic swaps, 20–24h jittered schedule).
- Built gateway routes (manifest, stream, configure, health, stats, status dashboard, logo), HEAD/OPTIONS handling, fail-open `{ "streams": [] }`, and a single supervisor.
- Deployed to Beamup (Dokku) and Railway; CI runs policy → icon → lint → typecheck → tests → build → Docker smoke, then deploys both. Later added a one-shot legacy-env cleanup workflow.

## Observability & provider policy
- Added aggregated per-provider health/stats and a dark `/status` dashboard with WORKING/DEGRADED/OFFLINE badges, latency, updater banners, search, and 15s refresh.
- Migrated SA7 from allow-list to deny-list; consolidated provider policy into `config/providers.json` with `instances.<profile>` overrides and `config/instances/{beamup,railway}.env` timeouts; CI sets only `INSTANCE_PROFILE` + credentials. Added allow/wildcard support, hard-disabled classes, and Nuvio > Vega > SA7 duplicate priority in merge.
- Hard-disabled YouTube, torrentio, Internet Archive, live TV (`durbinLive`, `liveTgTv`); `mxplayer` denied on Railway, allowed on Beamup.
- Diagnosed 100%-empty status rows: mostly genre/catalog mismatch and silent `catch → []` on dead upstreams. Fixed observability with `src/core/networkClassifier.ts` (AsyncLocalStorage request tracking across all fleets), real `lastError`, and Vega/Nuvio call counters; SA7 `ok` now counts clean empties.

## Reliability, routing & classification fixes
- Timeouts settled at 13s global / 12s backend / 11s worker budget for Beamup's ~13–14s proxy cut-off; Railway uses 27s/29s. Workers derive deadlines from `BACKEND_TIMEOUT_MS`, abort in-flight work on disconnect, and return partial results before the deadline. Stream responses send `no-store`; caching stays internal to the gateway.
- Unified all URL/stream classification in `src/core/urlClassifier.ts`; extensionless CDN links stay in `url`, HTML/embed pages go to `externalUrl` with 🖥️, archives keep 🔲 + 🖥️.
- Fixed series Undici `ByteString` crash caused by Unicode en-dash year ranges (`"2019–"`) via `parseCanonicalYear` and hardened `WorkerClient.buildHeaders`; wired `x-meta-tmdb-id` to Vega for TMDB episode titles.
- Fixed Vega `parseRequest` XOR bug that rejected requests carrying both IMDb and forwarded TMDB IDs; bounded Nuvio TMDB/snapshot work by the deadline.
- Nuvio snapshot manager switched to stale-while-revalidate and now normalizes full-URL scraper filenames from the remote manifest; Codeberg head resolution fixed to use `/branches/:branch` (with `/commits?sha=` fallback), ending the 5-minute retry loop.
- Consolidated 8 duplicated subsystems into `src/core/` (`contentId`, `streamQuality`, `streamHeaders`, `subtitles`, metadata forwarding, etc.); documented in `docs/gateway-fleet-duplications.md`.
- Subtitle language filtering added to `/configure` and `filterStream` without ever dropping streams; inline subtitle tracks now pass through unchanged.
- Fixed CI lint/typecheck failures (`no-explicit-any` in tests, `updater` fallback typing in `health.ts`).

## Benchmarks, allocation & security
- Benchmarked 6 titles across Railway and Beamup (653 vs 407 streams). Railway wins where clean egress matters; Beamup wins for a few anime scrapers. Full tier tables are kept in local-only audit notes.
- Beamup runs its exclusive/duplicate scrapers; Railway is the primary instance. Configured FebBox cookie, GramCinema, and Kartoons credential pipelines, with CI secret sync.
- Redacted live domains, infra IDs, and hardcoded keys from all tracked files and workflows; rotated the TMDB key; purged Git history and force-pushed a clean repository.
- Added `paths-ignore: ['**.md']` to CI and the `[skip ci]` convention for doc commits.

## Recent sessions (Nov 15 2026)
- **Render deploy:** pushed `e8657fc` (classifier fixes); Render auto-deploy went live and `/`, `/manifest.json`, `/health` were probed successfully (all three fleets active). Local verify/build/lint skipped by request.
- **Provider mapping:** inspected Nuvio, Vega, and SA7 provider sources, deobfuscated their media hosts/APIs, and built a tri-fleet duplicate matrix in local-only audit notes.
- **Railway CLI logs:** `railway status` showed the service online; HTTP and error logs showed healthy Nuvio/Vega extraction. Expected warnings: Turnstile requirement for Vega `everything` (no headless solver) and high log throughput during scraper bursts.
- **Live series checks:** *Breaking Bad* S01E01 returned 234 streams on Railway vs 6 on Beamup; *Stranger Things* S01E01 returned 114 on Railway. Gateway cache hits returned in <7s.

## Recent sessions (Nov 16 2026)
- **Final todo sweep:** removed the three operational entries from `todo.md`; verified configure prefill and SA7 `server.js`/`run.js` removal were already resolved. Switched the Docker healthcheck to a `HEAD /health` liveness probe, made `/status` render 503 health payloads, nonced inline `<style>` and dropped `'unsafe-inline'` from `style-src`, and normalized SA7 object-shaped `lastError` values in gateway health aggregation. Local lint/typecheck/feature tests only; no deploy.
- **Rate-limit cleanup:** removed the dead Vega token-bucket `RateLimiter` (`src/fleets/vega/addon/rateLimit.ts`) and its six unused `STREAM_*`/`PROXY_*` config fields from `src/fleets/vega/config.ts`; closed the matching `todo.md` item. It was never wired into any handler, so no live behavior changed. Local lint/typecheck/feature tests only; build/verify skipped by request.

## Recent sessions (Nov 19 2026)
- **Header/notWebReady parity:** Confirmed Nuvio and Vega were advertising provider `Referer`/`Origin`/`User-Agent`/`Cookie` via `behaviorHints.proxyHeaders.request` but omitted `notWebReady`. Added `behaviorHints.notWebReady: true` wherever headers are emitted, matching SA7's existing rule; verified a header-gated stream returned 403 without advertised headers and 206 with them.
- **Streamtape classification:** A Katmovie `/get_video` link was routed to `externalUrl` because `streamtape.com` is in `KNOWN_EMBED_DOMAINS`. Added a host-scoped direct-endpoint rule for Streamtape `/get_video`, with a regression test. Live check: 302 to `*.tapecontent.net` returning `Content-Type: video/mp4`, `Accept-Ranges: bytes`.

## Recent sessions (Nov 20 2026)
- **Gateway dedupe/filter ordering:** Fixed `mergeAndFilterStreams` adding a stream key to `seenKeys` before `filterStream`, which let a filtered-out higher-ranked duplicate suppress a valid lower-ranked copy of the same URL (e.g. a Nuvio 2160p copy dropped by `maxRes=1080` also hid the Vega 1080p duplicate). The key is now recorded only after the stream survives filtering, with a regression test. Local lint/typecheck/feature tests (204) pass; no deploy.
- **VPS memory (ops):** Set THP to `madvise`, fixed the systemd `NODE_OPTIONS` quoting so `--max-semi-space-size=8` applies, and added an `LD_PRELOAD` `malloc_trim` helper that only trims after a CPU-idle burst (`MALLOC_TRIM_POLL_SEC=60`, 2 idle samples). Idle RSS returns to ~110–125 MB after load.

## Recent sessions (Nov 21 2026)
- **Provider call count analysis (`/health`):** Investigated live `/health` telemetry showing 1 call for `dahmermovies` and `einthusan` (SA7) and `jhaeros` and `kryxalia` (Nuvio) out of 4 total requests. Confirmed this is expected behavior driven by content-type filtering (`supportedTypes` restricted to `movie` only), TMDB ID resolution requirements, and circuit breaker / deadline skips.
- **Live stream request verification:** Dispatched live movie (*Inception*, tt1375666 &rarr; 21 streams) and series (*Breaking Bad* S01E01, tt0903747:1:1 &rarr; 156 streams) requests. Verified that movie-only providers incremented during the movie request (+1) and remained unchanged during the series request (+0), while TV-only providers incremented during the series request (+1) and remained unchanged during the movie request (+0).
- **AniChan (xandril) investigation & documentation:** Analyzed why AniChan returns incorrect streams (no anime-only gating, loose 60-pt substring scoring in `scoreCandidate`, multi-season arc mapping mismatches, and absolute episode fallback bugs). Documented the issue in `known-issues.md` without modifying provider code, and mapped out non-provider mitigations (policy deny, fleet wrapper gating, or gateway merge filtering).
- **Provider policy updates (mxplayer & vixsrc):** Added `mxplayer` to `HARD_DISABLED_PROVIDERS` in `src/core/env.ts` and `scripts/check-provider-policy.mjs`. Disabled `vixsrc` (`kethrax`) in `config/providers.json` across base and Railway instance policies. Updated `config/provider-audit.csv` with `vega:policy_hard_disabled` for `mxplayer.in` and `nuvio:policy_denied` for `vixsrc.to`. Added regression assertions in `tests/features/disabledProviders.test.ts`. All 39 feature test files (224 tests), lint, typecheck, and policy checks pass.
- **Root-cause investigation for 100% 0-result / 0-error providers (`/health`):** Investigated live `/health` on `http://203.188.173.134:7000` where multiple providers show 100% empty results (`calls == empty`, `lastSuccessAt == null`) and 0 errors. Identified the dual causes: (1) Telemetry design: `outcome: 'empty'` increments `ok` and resets `lastError`, calculating 100% success rate while masking failures caught in internal `try/catch -> []`; (2) Upstream root causes: `topcartoons` has an expired TLS cert (`CERT_HAS_EXPIRED`); `kurage` and `lyrin` (BanglaPlex) suffer dead DNS/timeouts; `puretoons` & `toonstream` are cartoons-only and were queried for standard movies; `dahmermovies` & `netmirror` suffer datacenter IP Cloudflare challenges and 12s timeout budget exhaustion.

## Recent sessions (Nov 22 2026)
- **Kitsu + TVDB ID support:** Added `kitsu:` and `tvdb:` parsing and manifest prefixes. Kitsu maps to MAL via Kitsu mappings, then reuses the MAL pipeline; TVDB series resolve via TVMaze to IMDb, and TVDB movies (or TVMaze misses) use TMDB `external_source=tvdb_id` when `TMDB_API_KEY` is set. Both rewrite to `tt...`/`tmdb:...` with suffixes preserved before fleet fan-out, and return empty without fan-out when unresolved. Added `KITSU_URL` and `TVMAZE_URL`, tests, and docs.
- **Bidirectional ID mapping + canonical cache:** `resolveImdb` now falls back to TMDB `/find?external_source=imdb_id` when Cinemeta lacks `moviedb_id` (and fills title/year from the TMDB detail), so `tt…` requests forward both `imdbId` and `tmdbId`. The gateway resolves metadata before the cache lookup and keys the gateway cache on the canonical identity (IMDb first, then TMDB, suffix preserved), so `tt…` and `tmdb:…` requests for the same content share one cache entry. Added regression tests for the TMDB fallback and cross-family cache sharing. Local lint/typecheck/feature tests (232) pass.
- **Anime id completion:** `resolveMal` now fills the missing id when AnimeAPI returns only one: TMDB detail supplies `imdbId` for a TMDB-only mapping, and TMDB `/find?external_source=imdb_id` supplies `tmdbId` for an IMDb-only mapping (Kitsu inherits this through its MAL mapping). Added MAL regression tests. Local lint/typecheck/feature tests (234) pass.
- **Provider health rates:** Renamed provider `successRate` to `responseRate` (availability: `ok / calls`) and added `yieldRate` (`responded / calls`) across SA7, Nuvio, Vega, the gateway aggregate, and `/status`. Providers that respond with zero streams now show a low yield instead of 100% success. Added regression coverage; local lint/typecheck/feature tests (237) pass.

- **Railway provider reachability probe:** Added `scripts/check-provider-reachability.mjs` (CSV-driven HTTP probe, browser headers, concurrency/timeout/fallback flags) and ran it from the live Railway container via `railway ssh` (egress `152.55.181.225`). Homepage results: 61/75 fleet slots reachable, 45/75 yielding per `/health`. The 30 non-yielding slots split into 22 reachable-but-empty and 8 unreachable-and-empty; 6 unreachable homepages still yielded streams, confirming homepage reachability is not a proxy for provider yield. Registered `opencode-probe` SSH key for access.
- **Zero-yield provider policy (Railway/Beamup):** Live `/health` showed 13 providers with `responded=0`, `errors=0`, `timeouts=0`: SA7 `anizone`, `kurage`, `puretoons`, `toonstream`; Nuvio `lyrin`, `novus`, `vyranel`, `zevran`; Vega `gokuHD`, `dramacool`, `eonMovies`, `kickAssAnime`, `rareanimes`. AniZone has a same-site Nuvio duplicate (`lenyr`), so Railway SA7 now denies `anizone` and Railway Nuvio enables `lenyr`. The other 12 are denied on Railway and enabled on Beamup. `castle`, `hdhub4u`, and `netmirror` are denied on Beamup (they work on Railway). Updated `config/providers.json` instance deny lists and `config/provider-audit.csv` flags/reasons. `solunix` and `rynara` were left alone because they had timeouts. Simplified `disabledProviders.test.ts` to table-driven `expectFleetPolicy` assertions. Lint, typecheck, policy check, and 237 feature tests pass.

## Episode matching fixes (Nov 22 2026)
- **Vega matcher:** `parseEpisodeRanges` now keeps the season in `Season N • EP N` titles, accepts `S01 EP05`, and parses episode lists (`Episode 5 & 6`, `Episodes 1, 2 and 3`). `extractSeasons` expands `Season 1-3`/`S01-S02`. Episode regexes now accept four-digit numbers so long-running anime (One Piece 1100+) match. `resolveSeriesLinks` rejects a post whose search title names a different season, and only falls back to verified season packs for episode requests (untitled entries are no longer treated as packs).
- **SA7 post-filter:** Added `src/fleets/sa7/lib/episode-match.js` and wired it into `streams.js`; it drops provider streams whose filename/URL/title explicitly names a different season or episode, while keeping packs and unlabelled links. Provider code is untouched.
- **Caveat:** absolute-numbered providers that use a fixed `Season 1` label are filtered for later-season requests (documented in `known-issues.md`).
- **Verification:** `npm run lint`, `npm run typecheck`, and `npm run test:feature` (42 files / 252 tests) pass. No deploy or push.

## Key Decisions & Conventions
- TypeScript strict mode, zero `any`; all stream failures return `{ "streams": [] }` with HTTP 200.
- Explicit `GET`/`HEAD`/`OPTIONS`; `HEAD` never triggers provider fan-out; `/subtitles*` is always 404.
- Cache only non-empty gateway results; workers never cache streams.
- Documentation commits must include `[skip ci]`.
- Do not deploy or push unless explicitly asked (see `AGENTS.md`).

## Review fixes (Nov 22 2026)
- **Code-review hardening:** Verified the findings in the external review and fixed the real ones: removed the entrypoint `defaults.env` export loop, gated Vega's global fetch shim on its AsyncLocalStorage context (non-Vega calls delegate to the prior fetch), validated/escaped forwarded base URLs, made `LogQueue.close` await in-flight flushes and drop post-close events, wrapped Express async routes with an error middleware, hardened Cloudflare ingest auth/query limits, propagated Vega meta/link/stream failures and deadline classification, restricted Cinemeta priming to movies, removed double decompression on native Vega responses, verified snapshot SHA/lastError after every fleet reload, made Jikan slot waits abortable, cached ID-less metadata with the transient TTL, fixed URL classifier extension/segment ambiguity and embed-domain boundary matching, threaded abort signals through Nuvio/SA7 provider execution, enforced SA7 proxy-header sanitization, and added Secure/host-only cookie handling plus TLS verification in Vega.
- **Partial-result plumbing:** SA7, Nuvio, and Vega workers now return `{ streams, partial }`; gateway cache TTLs use the flag. Vega/Nuvio `handleResult` preserves the flag through in-flight coalescing and stream caches. SA7 stream-cache coalescing now refcounts waiters so aborting one caller does not cancel shared work for others.
- **Ops/CI:** `apply-env.mjs` no longer imports TypeScript, deploy workflows rely on `ssh-keyscan` without disabling host-key checks and shell-escape Dokku config values, removed the committed `providers.backup.json`, and documented the provider sandbox/cookie/rollback/log-drop caveats in `known-issues.md`.
- **Verification:** `npm run lint`, `npm run typecheck`, and `npm run test:feature` (40 files / 237 tests) pass. Build/verify left to GitHub Actions per `AGENTS.md`; no deploy or push.

## Duplicate-copy instance split (Nov 22 2026)
- **Railway one copy, Beamup backup:** Rebalanced `config/providers.json` `instances.beamup` so Railway runs at most one fleet copy of each duplicated provider and Beamup runs a different copy as backup. For three-copy providers the Beamup backup is chosen by priority `nuvio > vega > sa7`.
- **Beamup backups enabled:** `sa7` `anikage`, `anizone`, `moviesmod`, `reanime`, `vegamovies`, `vidrock`; `nuvio` `zyrvael`, `karnis`, `qyrvaen`, `fyron`, `fastrion`, `soryn`, `mavonyx`, `pynvix`, `gravix`; `vega` `4khdhub`, `animesalt`, `drive`, `katmovies`, `movielinkdb`. The matching Railway-active copies remain denied on Beamup.
- **Docs/tests:** Updated the Railway/Beamup routing sections in `architecture.md` and the Beamup expectations in `tests/features/disabledProviders.test.ts`. `npm run policy:check` and the targeted feature test pass; no deploy or push.
- **PlayIMDb on Railway (Nov 22 2026):** Re-enabled the SA7 `playimdb` copy on Railway (its vendored manifest entry is `enabled: true`), leaving Nuvio `zevran` denied there and active on Beamup as the backup copy. Updated `config/provider-audit.csv` (`sa7_active=1`, dropped the stale `sa7:upstream_disabled` reason) and the Railway SA7 test expectations.

## Vega snapshot refresh (Nov 22 2026)
- **Stale vendored baseline:** Diagnosed why new upstream providers were missing from the committed snapshot. Runtime updates only write `DATA_DIR/vega/providers/Zenda-Cross`; the committed `src/fleets/vega/providers-baseline` is a static seed and had not been re-vendored since `fc747cd`.
- **Re-vendored to upstream `a52ea5d`:** 68 manifest entries, 41 enabled provider dirs, 53 URL entries. Adds `extraflix`, `aniDream`, `durbinLive`, `liveTgTv`; drops now-disabled `kmMovies`, `movielinkdb`, `world4u` (still listed as `disabled: true` in the manifest). Updated `state.json` to the new `activeSha` and provider versions.
- **Worker updater auth:** `deriveFleetEnv` now forwards `GITHUB_TOKEN` to fleet workers. Without it Vega's in-worker updater falls back to a content-hash SHA that never matches the scheduler's git SHA, causing repeated failed-update accounting. Added a regression test.
- **Docs:** Documented the static-seed caveat in `known-issues.md`.

## Beamup Backup Instance Activation & 3-Copy Allocation (Nov 22 2026)
- **3-copy provider allocation (1 on Railway, 2 on Beamup):** Updated `config/providers.json` `instances.beamup` so that for all 9 providers with 3 copies, Railway runs 1 active copy and Beamup runs the remaining 2 copies as backup.
  - `4khdhub`: Railway active `nuvio:hexion`; Beamup active `vega:4khdhub` + `sa7:4khdhub` (removed `4khdhub` from Beamup SA7 deny list).
  - `hdhub4u`: Railway active `sa7:hdhub4u`; Beamup active `nuvio:qyrvaen` + `vega:hdhub4u` (removed `hdhub4u` from Beamup Vega deny list).
  - `netmirror`: Railway active `sa7:netmirror`; Beamup active `vega:netflixMirror` + `nuvio:soryn` (removed `soryn` from Beamup Nuvio deny list).
  - The other 6 three-copy providers (`anikoto`, `castle`, `moviesdrive`, `multimovies`, `moviebox`, `animeworld`) were already running both remaining copies on Beamup.
- **Railway deactivated providers activated on Beamup:** All deactivated providers on Railway (dual-fleet backup copies and zero-yield providers `kurage`, `puretoons`, `toonstream`, `lyrin`, `novus`, `vyranel`, `kethrax`, `dramacool`, `eonMovies`, `gokuHD`, `kickAssAnime`, `rareanimes`) are active on Beamup as backup.
- **Docs & audit:** Updated `architecture.md`, `config/provider-audit.csv` notes for 4KHDHub, HDHub4u, and NetMirror, and created `scratchpad.md` tracking the full allocation matrix.
- **Verification:** Updated `tests/features/disabledProviders.test.ts` to assert `4khdhub` on SA7, `soryn` on Nuvio, and `hdhub4u` on Vega are enabled on Beamup.

## SA7 HDHub4u memory guard (Nov 23 2026)
- **Railway crash:** `GET /stream/movie/tt14413964.json` ("Steps", 2026) returned 502 after ~15s and restarted the container. Fleet isolation put the fault in SA7; provider sweep isolated `hdhub4u`.
- **Root cause:** The HDHub4u extractor follows hubcloud `/drive/t3dl.php?id=...` redirects to signed R2 `.mkv` files and calls `fetch(...).text()`. Observed bodies of 2,427,569,820 bytes (plus ~847 MB and ~1.08 GB variants); buffering killed the worker. Railway runs `sa7:hdhub4u`, while Beamup does not, explaining the instance difference.
- **Fix:** Added a response guard to `src/fleets/sa7/lib/tracker.js` that rejects binary/archive content types, media/archive redirect paths, and payloads over 16 MiB before the body is read; axios requests get a matching `maxContentLength`. Blocked links are recorded as failed attempts.
- **Verification:** Reproduced the 2.4 GB response inside the Railway container. Running the patched tracker against the live `hdhub4u` path returned 14 streams in 6.5s with no restart (main `startedAt` unchanged). Added `tests/features/sa7NetworkGuard.test.ts` (6 tests); full feature suite 259 tests pass. No deploy or push.

## Updater head retry and status logging (Nov 23 2026)
- **Transient SA7 alert:** The initial SA7 updater head check after the `4bcb165` deploy returned null and surfaced `Remote head fetch failed`; the 5-minute retry recovered with upstream SHA `5c001511...`. GitHub was reachable and unauthenticated rate limit was healthy, so the failure was a transient fetch/response error rather than a code regression.
- **Fetcher hardening:** `src/core/updater/fetchers.ts` now retries head requests up to 3 attempts with 250/750 ms backoff for network errors, 429, and 5xx. Permanent 4xx responses are not retried. Each failed/retried attempt logs `repo`, `endpoint`, HTTP `status`, `attempt`, and GitHub `rateLimitRemaining` via new `updater.head.retry` / `updater.head.failed` events. Codeberg's expected branch fallback stays at debug level.
- **Tests:** Added GitHub retry, retry-exhaustion, and non-retryable-404 coverage in `tests/features/fetchers.test.ts`; full suite 261 tests pass, plus lint/typecheck. Not committed or deployed.

## Nuvio provider response guard (Nov 23 2026)
- **Risk:** Nuvio's provider `fetch` wrapper (`src/fleets/nuvio/nuvio/loader.ts`) had no response-size or content-type limit, so a provider following a hubcloud/R2 download redirect could buffer multi-GB media with `.text()` and kill the worker. The Beamup `nuvio:qyrvaen` HDHub4u copy was the most exposed path; its `skipSizeCheck: true` option is not implemented by this loader.
- **Fix:** Exported `guardProviderResponse` and `createProviderFetch` from the Nuvio loader with the same 16 MiB / binary / media-path rules as SA7. Known oversized/binary responses are rejected before reading; chunked bodies are capped with a wrapping `TransformStream` and overflow is recorded as a failed network attempt. Normal HTML/JSON responses and response URL metadata are preserved.
- **Tests:** Added `tests/features/nuvioResponseGuard.test.ts` (9 tests) covering oversized headers, binary types, media redirects, chunked/under-reported bodies, pass-through, and tracker integration. Recorded the latent Vega cURL buffering caveat in `known-issues.md`. Not committed or deployed.

## Nuvio missing-provider warning (Nov 23 2026)
- **Problem:** A configured provider ID that upstream renames (e.g. `sylphera`) silently stops matching, so the renamed provider becomes enabled while the stale deny entry in `config/providers.json` is treated as inert.
- **Fix:** Added `findDepartedProviderIds` to `src/core/policy.ts`, comparing the previous manifest's IDs with the new manifest and returning configured IDs that vanished. `NuvioSnapshot` now carries `providerIds` (all manifest IDs, including policy-filtered ones), and `SnapshotManager.activate` logs `nuvio_providers_missing` with the departed IDs, previous/new SHA, and snapshot source.
- **Behavior:** Only configured IDs that actually existed in the previous manifest warn, so cross-fleet hard-disabled IDs absent from Nuvio (torrentio, youtube, mxplayer, etc.) do not produce persistent noise.
- **Tests:** Added policy-helper cases in `tests/features/core.test.ts` and a `SnapshotManager.activate` warn regression in `tests/features/fleetHealthAndStatus.test.ts`. Lint, typecheck, and the three touched test files pass.
- **Docs:** Recorded the cold-start/scope caveat in `known-issues.md`. SA7/Vega not covered yet.

## Missing-provider warnings for SA7 and Vega (Nov 23 2026)
- **SA7:** `src/fleets/sa7/providers.js` now tracks the previous manifest's provider IDs across `buildRegistry`/`reloadProviders` and logs `[providers] configured provider(s) missing from manifest: ...` for configured IDs that vanished. Uses `corePolicy.findDepartedProviderIds` when available, with a plain-JS fallback.
- **Vega:** `src/fleets/vega/providers/updater.ts` reads the previous active snapshot's `manifest.json` IDs (falling back to `state.providers` keys) and logs `provider_missing` with the departed configured IDs, previous/new SHA during `handleFullUpdate`.
- **Tests:** Added `tests/features/sa7MissingProviders.test.ts`; full suite 274 tests pass, lint/typecheck clean.
- **Docs:** Updated the missing-provider caveat in `known-issues.md` to cover all three fleets and their cold-start limitations.

## Admin deployment fix (Nov 23 2026)
- **Beamup APP name:** `BEAMUP_REMOTE` uses `<deployment>/<app>` for git pushes, but Dokku `config:set` needs the deployed app name with a dash. Derive `APP` by replacing `/` with `-` in `ci.yml` and `cleanup-env.yml`; otherwise env sync reports success but does not affect the running app, leaving `/admin` at 404.
- **Proxy-safe admin origin check:** Accept `Sec-Fetch-Site: same-origin/none` and compare against `x-forwarded-host` as well as `Host`; log rejected origins. Verified Railway and Beamup admin login end-to-end.

## Runtime provider admin (Nov 23 2026)
- **Core:** Added `src/core/providerOverrides.ts` (Zod file schema, atomic store, versioning) and extended `src/core/policy.ts` with hard-disable/override precedence. `src/core/env.ts` exports `HARD_DISABLED_PROVIDERS`, accepts `ADMIN_TOKEN`, and derives `RUNTIME_OVERRIDES_JSON`, `HARD_DISABLED_PROVIDERS`, and `SELECTION_VERSION` per worker. Gateway cache key now uses the live policy version.
- **Internal contract:** Added `GET /internal/providers` and `POST /internal/providers/selection` to `internalServer`, `WorkerClient`, and each fleet. SA7 retains its direct-worker route table too.
- **Fleets:** SA7/Nuvio/Vega expose provider catalogs and apply full override maps in place. SA7 reloads its registry; Nuvio loads/unloads scrapers; Vega retains all manifest entries and lazily loads/unloads bundles. Snapshot updates now carry manifest entries so later toggles do not need a re-download.
- **Admin:** Added `/admin`, `/admin/login`, `/admin/logout`, `/admin/api/catalog`, and `/admin/api/providers/toggle` in `src/addon/admin*.ts`, gated by `ADMIN_TOKEN`; successful toggles persist, clear the gateway cache, and apply without a restart.
- **Docs/config:** Added `ADMIN_TOKEN` to `config/defaults.env` and `.env.example`; updated `architecture.md` and `known-issues.md`.
- **Verification:** `npm run lint`, `npm run typecheck`, and `npm run test:feature` pass (281 tests). Added provider policy/persistence and admin gateway coverage. Not committed or deployed.
