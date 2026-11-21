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

## Key Decisions & Conventions
- TypeScript strict mode, zero `any`; all stream failures return `{ "streams": [] }` with HTTP 200.
- Explicit `GET`/`HEAD`/`OPTIONS`; `HEAD` never triggers provider fan-out; `/subtitles*` is always 404.
- Cache only non-empty gateway results; workers never cache streams.
- Documentation commits must include `[skip ci]`.
- Do not deploy or push unless explicitly asked (see `AGENTS.md`).
