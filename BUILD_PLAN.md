# Unified Streams — Clean Build Plan

Status: planned  
Target project: `/root/iptv/unified-streams`  
Current project: `/root/iptv/unified-stremio-addon` (stays live until cutover)

## 1. Goal

Build one clean Stremio addon from scratch with:

- One addon surface
- One container
- One gateway
- One health implementation
- One stats implementation
- One configuration system
- One configure page with resolution, file-size, unknown-value, and separate-subtitle filters
- One reliable PNG addon icon with CI validation
- One HTTP surface that correctly supports `GET`, `HEAD`, and `OPTIONS`
- One stream cache with a 180 second TTL
- One global settings env
- One project top directory
- Three internal Node services: SA7, Nuvio, Vega
- Three provider update jobs for the three upstreams, scheduled every 20–24 hours
- Three effective provider exclusion lists generated from one policy source
- Structured logging for every request, timeout, error, success/failure rate, provider outcome, cache event, and updater event
- Optional Cloudflare D1 + R2 log storage through an HTTP API
- One GitHub Actions CI/CD pipeline for verification, Docker builds, staging, production, and rollback
- One-shot merged env apply per deployment instead of per-key updates

The three services, three updaters, and three provider lists remain. They become internal workers and jobs, not independent addons or independent projects.

## 2. Why the current project is messy

The current project wraps three complete addons instead of running one addon with three provider engines:

- Gateway plus SA7, Nuvio, and Vega each expose their own manifest and configure page.
- Each fleet has its own config parser, health schema, cache, status code, tests, lockfile, and docs.
- Runtime defaults conflict across `src/config.ts`, `deploy/beamup.env`, and `services/vega/deploy/beamup.env`.
- Worker stream caches are forced to 120 seconds, while the requirement is one 180 second cache. The gateway has no response cache.
- Nuvio refreshes providers on request; Vega and SA7 use timers.
- Provider policy is duplicated across env files, docs, and code defaults.
- The build uses four dependency installs, three lockfiles, three TypeScript configs, three test runners, and four Docker build stages.

The clean build fixes this by keeping only the provider runtimes from the current project and rebuilding the shell as one project.

## 3. Locked decisions

- Create a new repository/project. Keep the old app deployed until the new one passes staging and smoke tests.
- Use a single root package and one lockfile. Fleets are source directories, not independent packages.
- Put the only stream cache in the gateway. Workers have no stream response cache.
- Put the updater scheduler in the gateway. It runs three update jobs.
- Keep three worker processes.
- Keep three provider lists, but generate them from one policy file.
- Use one env schema for the entire application.
- Use one canonical telemetry schema for health and stats.
- Keep `/subtitles` unrouted.
- Keep upstream provider code and licenses intact; only remove its addon/server/config glue.
- Run all release verification, lint, typecheck, the full Vitest suite, and the Docker build in GitHub Actions.
- Local development runs only targeted logic/feature tests. Local results are not release approval.
- Use a real 512x512 PNG addon icon and validate it through the public manifest in CI.
- Support `HEAD` on every public route with no body and no provider fan-out.
- Treat `AGENTS.md` as the coding-agent contract for Stremio compatibility, HTTP behavior, code efficiency, and industry-standard coding.
- Apply the merged environment in one bulk import per deployment.
- Deploy staging first, require approval for production, and keep a tested rollback path.

## 4. Target directory layout

```text
unified-streams/
  package.json
  package-lock.json
  tsconfig.json
  eslint.config.js
  vitest.config.ts
  .nvmrc
  Dockerfile
  docker-entrypoint.sh
  .env.example
  .gitignore
  .dockerignore
  README.md
  BUILD_PLAN.md
  AGENTS.md
  CHANGELOG.md
  NOTICE.md
  .github/
    workflows/ci.yml
    workflows/deploy-cloudflare.yml
    workflows/release.yml
    workflows/rollback.yml
    dependabot.yml
    pull_request_template.md
  cloudflare/
    ingest-worker/
      wrangler.toml
      src/index.ts
      test/index.test.ts
    migrations/
      0001_init.sql
  assets/
    logo.png
    logo.svg
    favicon.ico
    touch-icon.png
  config/
    defaults.env
    providers.json
  docs/
    architecture.md
    runbook.md
    decisions.md
  scripts/
    dev.mjs
    check-provider-policy.mjs
    check-icon.mjs
    apply-env.mjs
    healthcheck.mjs
    logs-query.mjs
    migrate-d1.mjs
  src/
    index.ts
    supervisor.ts
    addon/
      app.ts
      manifest.ts
      configure.ts
      stream.ts
      health.ts
      stats.ts
      status.ts
      userConfig.ts
      contentId.ts
      filters.ts
      subtitles.ts
      merge.ts
      logo.ts
    core/
      env.ts
      metadata.ts
      jikan.ts
      cache.ts
      telemetry.ts
      policy.ts
      contract.ts
      workerClient.ts
      http.ts
      fs.ts
      concurrency.ts
      logger.ts
      redact.ts
      logging/
        events.ts
        sink.ts
        stdoutSink.ts
        cloudflareSink.ts
        queue.ts
      updater/
        scheduler.ts
        github.ts
        codeberg.ts
        install.ts
        state.ts
    fleets/
      sa7/
        worker.ts
        upstream provider runtime files
      nuvio/
        worker.ts
        upstream provider runtime files
      vega/
        worker.ts
        upstream provider runtime files
  tests/
    unit/
    features/
    contract/
    integration/
    fixtures/
    smoke/
```

A minimal `fleets/sa7/package.json` may contain only `{"type":"commonjs"}` as a module-format marker. It must not contain dependencies, scripts, a lockfile, docs, or env defaults.

### 4.1 Code reuse matrix

Build by copying and consolidating proven code, not by rewriting everything. The existing unified project is the closest scaffold because it already vendors all three fleets, but it still runs each fleet as a complete addon. Copy its gateway shell and remove the child-addon wrappers.

| Source | Copy | Do not copy |
|---|---|---|
| `/root/iptv/unified-stremio-addon` | `src/gateway/{app,manifest,configure,statusPage,health,merge,userConfig,logo}.ts`, `src/supervisor.ts`, `src/telemetry.ts`, `src/config.ts`, `src/types.ts`, Dockerfile, entrypoint, CI and env-apply scripts as reference | `src/gateway/backends.ts` child-addon adapter, per-service addon shells, duplicate env/config, per-service caches, `node_modules`, `dist`, stale lockfiles |
| `/root/iptv/sa7/stremio-cb-addon` | Provider runtime under `vendor/cb-providers`, provider registry, stream fan-out logic, `lib/url-classifier.js`, `lib/breaker.js`, `lib/timeout.js`, `lib/lru.js`, relevant tests | `server.js`, `configure.html`, `config.js`, `telemetry.js`, addon routes, lockfile, `node_modules` |
| `/root/iptv/nuvio-stremio-addon` | Nuvio scraper runtime, source/snapshot logic, bake and refresh scripts, ID parsing, URL classification, stream mapping, user-config language matching, TMDB/Cinemeta logic, relevant tests | Vercel config, addon routes/config, `/subtitles` route or resource, per-service lockfile, `node_modules` |
| `/root/iptv/vega-stremio-addon` | Pipeline and deadline logic, provider SDK/updater, TMDB client, util modules, URL classification, stream mapping, ID parsing, user-config logic, relevant tests | Addon shell, `src/proxy`, media proxy routes, deploy env, config, per-service lockfile, `node_modules` |

Do not copy:

- Addon manifests, configure pages, status pages, logo routes, or public stream routes from any fleet.
- Per-service env files, config loaders, updater schedulers, caches, loggers, telemetry schemas, or provider lists.
- Per-service `package.json`, lockfiles, tsconfigs, test runners, Dockerfiles, or CI workflows.
- The old unified backend cutoff or duplicate provider policy. Use the new env schema and `config/providers.json`.
- The `/subtitles` resource or route and the Vega media proxy.
- Upstream embedded secrets or any local deployment secrets.

Copy order:

1. Copy the unified project structure and gateway shell.
2. Delete the child-addon adapter, addon shells, duplicate infrastructure, and per-service package files.
3. Copy only provider runtimes into `src/fleets/{sa7,nuvio,vega}`.
4. Move shared utilities into `src/core` and add focused tests.
5. Replace child-addon HTTP calls with the internal worker contract.
6. Adopt the proven classifier, cache semantics, stream limits, snapshot retry, and timeout clamp behavior.
7. Run local feature tests, then full GitHub Actions verification.

Guardrails:

- Preserve upstream `LICENSE` and `UPSTREAM_COMMIT` files.
- Keep SA7 CommonJS isolated behind its module-format boundary.
- Keep upstream provider logic intact; remove only addon/server/config glue.
- Do not copy `node_modules`, `dist`, build output, or secrets.
- Keep one root package, lockfile, tsconfig, lint config, and test runner.
- Do not copy the `/subtitles` resource or any media proxy code.

## 5. Requirement mapping

| Requirement | Implementation |
|---|---|
| One addon | Only the gateway exposes Stremio routes |
| One container | One Dockerfile and one entrypoint |
| One gateway | Gateway owns the single public port |
| One health | One canonical schema and one gateway aggregation |
| One stats | One canonical schema and one gateway aggregation |
| One config | One env schema plus one provider policy file |
| One cache | Gateway-only cache with a 180s full TTL and 30s partial TTL |
| One global settings env | `config/defaults.env` plus deployment secrets |
| One project dir | Single root package and one lockfile |
| Three Node services | Three loopback workers |
| Three updater jobs | One scheduler in the gateway |
| Three provider lists | Generated from `config/providers.json` |
| Detailed logging | One structured event pipeline with optional Cloudflare D1/R2 sink |
| Addon icon | One 512x512 PNG, absolute manifest URL, CI fetch validation |
| HTTP methods | `GET`, `HEAD`, and `OPTIONS` on all public routes; `HEAD` never triggers provider fan-out |
| Content IDs | IMDb `tt`, TMDB `tmdb:`, and optional MAL `mal:` IDs for movies, series, and episodes |
| Agent instructions | Root `AGENTS.md` documents Stremio compatibility, HTTP, code efficiency, and industry-standard coding |
| Release verification | GitHub Actions runs verify, lint, typecheck, Vitest, build, Docker build, and smoke tests |
| Environment apply | One merged env import per deploy, one restart |
| Deployment | Staging then approved production, same commit SHA, rollback job |
| Local development | Targeted logic/feature tests only |

## 6. Worker contract

Each fleet worker exposes only internal endpoints:

```text
GET  /internal/health
GET  /internal/stream/:type/:id.json?config=<base64url>
POST /internal/reload
```

Rules:

- Bind to `127.0.0.1` only.
- Do not expose `/manifest.json`.
- Do not expose `/configure`.
- Do not expose `/status`.
- Do not expose a public `/stream` route.
- Do not expose a root route or logo route.
- Do not run a stream response cache.
- Enforce a per-provider stream cap of `100` before returning results.
- Clamp each provider timeout to the remaining global deadline.
- Derive each worker's `GLOBAL_DEADLINE_MS` from the gateway's `BACKEND_TIMEOUT_MS` minus a 1s margin so partial results are returned before the gateway aborts the worker request.
- Treat a worker response that arrives within that 1s margin as a partial result, so it uses the 30s TTL even when the worker returned HTTP 200.
- Clamp worker-level `SEARCH_TIMEOUT_MS`, `SETTLE_MS`, `META_TIMEOUT_MS`, `STREAM_TIMEOUT_MS`, and `SCRAPER_TIMEOUT_MS` to the derived deadline.
- Add a small timer guard so the global deadline records `skipped` instead of being masked by a provider timeout race.
- Treat provider outcomes as `ok`, `empty`, `timeout`, `error`, or `skipped`.
- `skipped` never counts as a provider failure.
- Open a per-provider circuit after `3` consecutive `timeout`/`error` outcomes.
- Keep the circuit open for `5` minutes, then allow one half-open probe.
- `empty` resets the failure streak and never opens a circuit.
- Accept a request id through `x-request-id` and return it on responses.
- Support `HEAD` on internal routes with the same status and headers as `GET`, but no body.
- Support loopback-only `OPTIONS` for internal routes.
- `HEAD /internal/stream/...` must not run provider requests.
- Report provider stats, circuits, updater snapshot state, and request metrics.
- Keep provider metadata and TMDB caches only if required internally.

### Internal health shape

```json
{
  "fleet": "sa7",
  "ok": true,
  "status": "ok",
  "startedAt": "2026-11-12T00:00:00.000Z",
  "uptimeSec": 120,
  "snapshot": {
    "sha": "abc123",
    "fetchedAt": "2026-11-12T00:00:00.000Z",
    "ageMs": 1000,
    "refreshing": false,
    "lastError": null
  },
  "providers": {
    "total": 13,
    "circuits": { "open": 0, "halfOpen": 0 },
    "stats": []
  },
  "metrics": {
    "requests": 0,
    "successes": 0,
    "empties": 0,
    "timeouts": 0,
    "errors": 0,
    "skipped": 0,
    "successRate": 0,
    "failureRate": 0
  }
}
```

## 7. Gateway responsibilities

The gateway is the only addon.

### Public routes

Every public route supports `GET` and `HEAD`. Every public path supports `OPTIONS`.

```text
GET|HEAD /manifest.json
GET|HEAD /:config/manifest.json
GET|HEAD /configure
GET|HEAD /:config/configure
GET|HEAD /stream/:type/:id.json
GET|HEAD /:config/stream/:type/:id.json
GET|HEAD /health
GET|HEAD /stats
GET|HEAD /status
GET|HEAD /logo.png
GET|HEAD /logo.svg
GET|HEAD /favicon.ico
GET|HEAD /
OPTIONS    <all public paths>
```

`/subtitles` must remain unrouted for every method.

### Stream flow

1. Decode the configuration.
2. Intersect requested fleets with enabled fleets.
3. Translate the unified config for each worker.
4. Fan out to all selected workers in parallel.
5. Merge streams.
6. Classify each stream URL as direct playable media or an external web/embed/archive link.
7. Map external links to `externalUrl` and drop known blocker links.
8. Prefix `behaviorHints.bingeGroup`.
9. Sort direct playable streams before external links.
10. Sort by quality and container.
11. Deduplicate by canonical same-file key or info hash.
12. Enforce the gateway global cap of `MAX_STREAMS=1000`.
13. Cache the final response using the complete/partial cache policy.
14. Return `{ "streams": [] }` on failure, timeout, empty result, or invalid request.

### Stream classification and normalization

Adopt the URL classifier behavior proven in all three independent addons.

Classify as external when the URL is:

- A web page
- An HTML embed
- A Telegram bot redirect
- A `.zip`, `.rar`, or `.7z` archive

Rules:

- Direct playable media keeps `url`: `.m3u8`, `.mpd`, `.mp4`, `.mkv`, Cloudflare R2, Google UserContent, and comparable direct video links.
- External links map to Stremio `externalUrl`.
- External links must omit `url`, `proxyHeaders`, and `subtitles`.
- Drop known anti-bot/rate-limit blocker links such as `/slowdown`.
- Sort direct playable streams before external links.
- Keep external links after direct streams, sorted by quality and container.
- Canonicalize same-file URLs by lowercasing the host, removing fragments, and trimming trailing slashes.
- Do not strip meaningful query strings or signed tokens.
- Deduplicate across `url` and `externalUrl`.
- Do not confuse archive-file links (`.zip`, `.rar`, `.7z`) with the default-disabled Internet Archive provider class.
- Preserve `behaviorHints` unless explicitly adding the fleet prefix.
- Apply a per-provider cap of `100` inside each worker before returning streams.
- Apply the global `MAX_STREAMS=1000` cap only in the gateway after merge, filter, dedupe, and sort.

Never add a media proxy route. Playback URLs must stay direct or use `externalUrl`.

### Cache

- One cache only, in the gateway.
- Complete TTL: `180000` ms.
- Partial TTL: `30000` ms.
- Key: encoded config + type + id + provider policy version + addon version.
- Coalesce concurrent identical requests.
- Never cache empty stream results. Always retry the fan-out on the next request.
- Never cache failures, aborted requests, or invalid requests.
- Cache deadline-truncated and per-worker-timeout partial results only when they contain at least one stream, using the partial TTL.
- Cache complete non-empty results using the full TTL.
- Exclude `HEAD` requests from the cache and from cache statistics.
- Cache `GET` empty results as a miss, not a stored empty entry.
- Report hits, misses, coalesced, sets, evictions, expired, partial sets, empty skips, size, max entries, and TTL.
- Stream response headers: `cache-control: no-store` for complete and partial results.
- Do not send `Cloudflare-CDN-Cache-Control` or other CDN cache headers. Cloudflare is used for log delivery only, not caching.
- Keep the 180s/30s TTLs in the gateway cache; they are internal and are not exposed to Cloudflare or browsers.
- Worker stream caches must be disabled with `STREAM_CACHE_TTL_MS=0`.

### HTTP methods and `HEAD`

`HEAD` is required for compatibility with clients, reverse proxies, uptime checks, link previews, and deployment smoke tests. It must be implemented explicitly, not left to a full GET handler that performs expensive work.

Rules:

- Register `app.head(...)` for every public `GET` route.
- Reuse response-header helpers so `GET` and `HEAD` cannot drift.
- Never send a response body for `HEAD`.
- Never call workers or upstream providers for `HEAD /stream/...`.
- Return `200` with `content-type: application/json` and `cache-control: no-store` for valid stream `HEAD` requests.
- Use `x-cache: bypass` on stream `HEAD` responses to make the no-cache-lookup behavior explicit.
- Return `200` for a stream `HEAD` request even when the equivalent GET could return empty streams. `HEAD` is an endpoint capability check, not a content check.
- Return `404` for unknown `HEAD` routes with no body.
- Return `404` for `/subtitles` and `/:config/subtitles` on every method.
- `HEAD /manifest.json` returns the same status, `content-type`, cache headers, and CORS headers as GET.
- `HEAD /configure` returns the same status, `content-type`, security headers, and CORS headers as GET.
- `HEAD /health` and `HEAD /stats` may use the last cached health snapshot but must not perform deep aggregation.
- `HEAD /logo.png` must report the same `content-type` and `content-length` as GET.
- `HEAD` asset responses must not read or stream the full file into the response.
- `OPTIONS` returns `204` with `allow: GET, HEAD, OPTIONS` and CORS headers, and no body.
- Unsupported methods return `405` with an `allow` header.
- Do not add `POST`, `PUT`, `PATCH`, or `DELETE` to public routes.

Tests:

- `HEAD` every public route and assert no body.
- Assert `HEAD /stream/...` does not call the worker client.
- Assert `HEAD` status, content type, cache-control, CORS, and security headers match GET.
- Assert `OPTIONS` returns 204 and the correct `allow` header.
- Assert `TRACE`, `POST`, and `DELETE` are rejected or not routed.
- Include `curl -I` checks in the CI live smoke test.

### Root endpoint

`GET /` is an uptime and discovery endpoint, not the addon manifest.

Return JSON with relative links:

```json
{
  "ok": true,
  "name": "Unified Streams",
  "version": "<ADDON_VERSION>",
  "manifest": "/manifest.json",
  "configure": "/configure",
  "health": "/health"
}
```

Rules:

- Set `content-type: application/json; charset=utf-8`.
- Set `cache-control: no-store`.
- Support `HEAD /` with the same status and headers, no body.
- Support `OPTIONS /` with `204` and CORS headers.
- Do not expose internal worker URLs, provider secrets, or config paths.
- Add tests for `GET`, `HEAD`, and `OPTIONS /`.

### Manifest and content ID support

The unified addon must support IMDb `tt` IDs and TMDB IDs for movies and series, plus optional MAL `mal:` IDs for anime.

Manifest:

```json
{
  "id": "org.unifiedstreams.addon",
  "version": "<ADDON_VERSION>",
  "name": "Unified Streams",
  "description": "Unified streams from SA7, Nuvio, and Vega",
  "logo": "<PUBLIC_BASE_URL>/logo.png?v=<ADDON_VERSION>",
  "types": ["movie", "series"],
  "resources": ["stream"],
  "idPrefixes": ["tt", "tmdb:", "mal:"],
  "catalogs": [],
  "behaviorHints": {
    "configurable": true
  }
}
```

The example shows all ID families enabled. The actual `idPrefixes` depends on `TMDB_API_KEY` and `MAL_ENABLED`.

Rules:

- Keep the manifest `id` stable across releases.
- Set `version` from `ADDON_VERSION`.
- Always advertise `tt`.
- Advertise `tmdb:` only when TMDB metadata is configured.
- Advertise `mal:` only when MAL/Jikan metadata is enabled.
- Require `TMDB_API_KEY` in staging and production so `tmdb:` is available there.
- Enable `MAL_ENABLED` in staging and production when `mal:` support is required.
- Do not advertise a subtitles resource.
- Do not advertise catalogs, meta, player, or library resources.
- Set `cache-control: public, max-age=300`.
- Serve CORS headers on the manifest route.

Supported stream IDs:

```text
tt1234567
tt1234567:1
tt1234567:1:2
tmdb:550
tmdb:1399:1
tmdb:1399:1:2
mal:20
mal:20:5
mal:20:2:5
```

Parsing rules:

- URL-decode the ID exactly once before parsing.
- Cap the decoded ID at 256 characters.
- Reject IDs containing `/`, `?`, `#`, or `..`.
- IMDb form: `tt` followed by 7–12 digits.
- TMDB form: `tmdb:` followed by 1–10 digits.
- MAL form: `mal:` followed by 1–10 digits.
- For `tt` and `tmdb`, optional season is `:0` through `:9999`, where season `0` means specials.
- For `tt` and `tmdb`, optional episode is `:0` through `:9999`.
- For `tt` and `tmdb`, `:season` without an episode is a valid season-pack request.
- For MAL, one numeric suffix is an episode and uses season `1` semantics: `mal:20:5` means episode 5.
- For MAL, two numeric suffixes are season and episode: `mal:20:2:5`.
- MAL season packs are not supported because a single suffix means an episode.
- A `movie` request with any season or episode suffix returns `{ "streams": [] }`.
- A `tt` or `tmdb:` series request without a season returns `{ "streams": [] }`.
- A `mal:` series request without an episode returns `{ "streams": [] }`.
- Malformed IDs return `200` with `{ "streams": [] }` and never `5xx`.
- Log the parsed content ID, type, season, and episode; never log the raw user URL.

Resolution rules:

- `tt` movie: resolve the TMDB ID from Cinemeta `meta.moviedb_id`.
- `tt` series: resolve Cinemeta metadata, title, year, episode list, and TMDB ID.
- `tmdb:` requests go directly to TMDB and never through Cinemeta ID lookup.
- When `TMDB_API_KEY` is present, race Cinemeta and TMDB for `tt` resolution; use the first non-null result.
- `mal:` requests resolve through Jikan v4 at `JIKAN_URL`.
- Map Jikan `title`, `title_english`, `year`, `type`, `episodes`, and air dates into the shared metadata shape.
- When `TMDB_API_KEY` is present, optionally search TMDB by canonical title/year to find a TMDB ID for workers that require one.
- MAL metadata is anime-only; `type` still comes from the Stremio request (`movie` or `series`).
- Map TMDB movie/series responses to a Cinemeta-shaped metadata object.
- Use the IMDb ID from TMDB when present; otherwise match on title, year, and type.
- If TMDB is not configured, `tmdb:` requests return empty and `tmdb:` is omitted from the manifest.
- If MAL is disabled, `mal:` requests return empty and `mal:` is omitted from the manifest.
- If resolution fails, return `{ "streams": [] }`, never `5xx`.
- Cache successful metadata for 24 hours and negative lookups for 60 seconds.
- Bound the metadata cache by entry count.
- Cache stream results by canonical content ID, not by raw request path.

Jikan rules:

- Jikan is unauthenticated and read-only.
- Respect its limits: at most `3` requests per second and `60` requests per minute.
- Use a shared rate-limit queue and metadata cache.
- On `429`, back off and return empty rather than retrying until the client deadline expires.
- Do not log Jikan request URLs, only the MAL ID and outcome.
- Do not expose Jikan or TMDB keys to workers.

Worker translation:

- The gateway resolves metadata and passes each worker the ID or metadata shape its runtime expects.
- Workers must not parse user configuration or raw `tmdb:`/`mal:` IDs unless their runtime explicitly supports it.
- SA7 receives a resolved TMDB ID where its providers require one.
- Nuvio and Vega receive resolved metadata or their native ID form.
- If MAL metadata resolves without a TMDB ID, providers that require TMDB are skipped for that request.
- Never expose the TMDB key to a worker or log it.

Tests:

- `tt` movie, `tt` series, `tt` season pack, and `tt` episode.
- `tmdb:` movie, `tmdb:` series, `tmdb:` season pack, and `tmdb:` episode.
- `mal:` movie, `mal:` episode, and `mal:` season+episode.
- `mal:` season-pack form is rejected or returns empty.
- Season `0` and episode `0`.
- URL-encoded IDs.
- Invalid prefix, empty ID, overlong ID, path traversal, and non-numeric TMDB/MAL IDs.
- Movie with episode suffix, series without required episode.
- Cinemeta success, TMDB fallback, TMDB-only, Jikan success, Jikan `404`, Jikan `429`, Jikan timeout, and all failing.
- Manifest `idPrefixes` with and without `TMDB_API_KEY` and `MAL_ENABLED`.

## 8. `/configure` page

The configure page is the only user-facing configuration UI. It generates the encoded manifest URL and keeps all filtering logic in the gateway.

### 8.1 Configuration model

Bump the URL configuration to version 2:

```json
{
  "v": 2,
  "minRes": null,
  "maxRes": 720,
  "includeUnknownRes": true,
  "maxSizeGB": 5,
  "includeUnknownSize": false,
  "subtitleMode": "languages",
  "subtitleLangs": ["en", "hi"],
  "includeUnknownSubtitleLang": false,
  "backends": ["sa7", "nuvio", "vega"]
}
```

Rules:

- `minRes` and `maxRes` are nullable resolution heights.
- `maxRes: 720` means include 720p and lower. It excludes 1080p, 1440p, 2160p, and 4320p.
- Setting both `minRes` and `maxRes` to the same value means exact resolution only.
- Leaving both null disables resolution filtering.
- `maxSizeGB` is nullable. Null means no size limit.
- `subtitleMode` is `all`, `none`, or `languages`.
- Decode v1 configurations and map them into v2 defaults for backward compatibility.
- Enforce a maximum encoded config length of 4096 bytes.
- Validate the decoded config with Zod and fall back to defaults on invalid input.

### 8.2 UI layout

Sections, in order:

1. **Stream quality**
   - Minimum resolution: Any, 240p, 360p, 480p, 576p, 720p, 1080p, 1440p, 2160p / 4K, 4320p / 8K.
   - Maximum resolution: same options, default Any.
   - Hint: "720p includes 720p and lower; it excludes 1080p and above."
   - Checkbox: "Include streams with unknown resolution."
   - Disable the unknown-resolution checkbox when no resolution bound is set, because the filter is inactive.

2. **File size**
   - Maximum file size in GB, optional.
   - Decimal input, step `0.1`, minimum `0.1`, maximum `1024`.
   - Checkbox: "Include streams with unknown file size."
   - Disable the unknown-size checkbox when no size limit is set.

3. **Subtitles**
   - Radio group:
     - "Keep all separate subtitles" (`all`)
     - "Remove separate subtitles" (`none`)
     - "Only selected languages" (`languages`)
   - Language selector when `languages` is selected:
     - Common languages as checkboxes or chips: English, Hindi, Tamil, Telugu, Malayalam, Kannada, Japanese, Korean, Spanish, French, German, Arabic, Portuguese, Russian, Chinese, Multi.
     - Free-form comma-separated language input for other ISO codes.
   - Checkbox: "Include subtitle tracks with unknown language."
   - Explicit hint: "This filters separate subtitle tracks returned with streams. Embedded/inline subtitles are never modified. This addon does not advertise a subtitles resource."

4. **Provider fleets**
   - SA7, Nuvio, Vega checkboxes.
   - Server-disabled fleets stay visible but disabled.
   - Require at least one fleet.

5. **Install**
   - Manifest URL preview.
   - Copy button.
   - Open manifest button.
   - Human-readable summary of active filters.
   - Reset-to-defaults button.

### 8.3 Filter semantics

The gateway applies the canonical filter after merging and before caching the response.

Order:

1. Validate decoded config.
2. Fan out to selected fleets.
3. Merge streams.
4. Filter by resolution.
5. Filter by file size.
6. Filter separate subtitle tracks.
7. Deduplicate and sort.
8. Cap at `MAX_STREAMS`.
9. Cache the final response.

Resolution filtering:

- Infer resolution from `quality`, `name`, `title`, `description`, `bingeGroup`, `url`, and `externalUrl`.
- Accept labels such as `8K`, `4K`, `UHD`, `2160p`, `1440p`, `1080p`, `720p`, `576p`, `480p`, `360p`, `240p`.
- If resolution is known:
  - reject below `minRes` when set
  - reject above `maxRes` when set
- If resolution is unknown:
  - keep only when `includeUnknownRes` is true and a bound is active
  - always keep when no resolution bound is active

File-size filtering:

- Infer bytes from `stream.size` and size labels in `title`/`description`.
- Support B, KB, MB, GB, and TB labels.
- If size is known, reject values above `maxSizeGB`.
- If size is unknown:
  - keep only when `includeUnknownSize` is true and a size limit is active
  - always keep when no size limit is active

Subtitle filtering:

- Apply only to the separate `stream.subtitles` array.
- `all`: keep every separate track.
- `none`: remove the separate `subtitles` array from returned streams.
- `languages`: keep tracks whose language matches the selected codes; normalize display names to ISO/base codes so `English`, `en`, `en-US`, and `eng` are compatible.
- Treat `E-Sub`, `E.Sub`, `E Sub`, and `ESub` as English subtitle hints.
- Normalize `Brazilian Portuguese` and `pt-BR` to `pt`.
- Unknown language tracks are kept only when `includeUnknownSubtitleLang` is true.
- Subtitle preferences never remove video streams.
- Never modify `stream.url`, `externalUrl`, `infoHash`, or embedded/inline subtitle tracks.
- Never add a `/subtitles` route or advertise a subtitles resource.

### 8.4 Fleet translation

All user filters are canonical gateway filters. Workers must receive permissive configs so a fleet's own inference cannot drop a stream the gateway would keep.

- Apply resolution, size, and subtitle filtering only at the gateway.
- Do not rely on SA7, Nuvio, or Vega user-filter defaults.
- If a worker still accepts a native config, send the permissive shape and keep the gateway as the source of truth.
- Cache keys include the full encoded config, so different filter sets do not collide.

### 8.5 Validation and error handling

- Invalid resolution values fall back to `null`.
- `minRes > maxRes` is invalid and resets both to defaults.
- Size values outside `0.1–1024` GB are clamped or rejected.
- Subtitle languages are normalized to lowercase and limited to 20 entries.
- Invalid subtitle modes fall back to `all`.
- Invalid or oversized encoded segments fall back to all fleets and default filters.
- The configure page must never throw on malformed prefill data.

### 8.6 Logging and stats

Log a filter summary with every stream request:

- `minRes`, `maxRes`, unknown-resolution flag
- `maxSizeGB`, unknown-size flag
- subtitle mode, selected language count, unknown-language flag
- selected fleets
- streams before filtering, after resolution, after size, after subtitle filtering, and after dedupe

Never log full subtitle URLs or any stream URL query tokens.

Expose filter counts in `/stats`:

- resolved-by-resolution
- resolved-by-size
- subtitles-removed
- unknown-resolution kept/dropped
- unknown-size kept/dropped
- unknown-subtitle-language kept/dropped
- total filtered out

### 8.7 Tests

Add feature tests for:

- 720p max keeps 720p, 576p, 480p, 360p, and 240p.
- 720p max excludes 1080p and above.
- Exact resolution via `minRes === maxRes`.
- Unknown resolution kept and dropped when the resolution filter is active.
- Unknown resolution always kept when no resolution filter is active.
- 5 GB max rejects known sizes above 5 GB and keeps known sizes below it.
- Unknown size kept and dropped when the size filter is active.
- Unknown size always kept when no size filter is active.
- `subtitleMode: none` removes separate subtitles but leaves the stream playable.
- `subtitleMode: languages` keeps matching and base-language matches.
- Unknown subtitle language kept and dropped.
- Inline/embedded subtitles and stream URLs are unchanged.
- v1 config decoding maps to v2 defaults.
- Invalid config falls back safely.
- Encoded config length limit is enforced.
- Cache keys differ for different filter configs.

### 8.8 `/configure` acceptance criteria

- [ ] Resolution filter supports "720p and lower only" and exact/range selection
- [ ] File-size filter skips streams above the configured GB limit
- [ ] Unknown resolution and unknown size are independently configurable
- [ ] Subtitle filter affects only separate subtitle tracks
- [ ] Inline/embedded subtitles are never modified
- [ ] No `/subtitles` resource is advertised
- [ ] Configuration is encoded in the manifest URL and validated on decode
- [ ] v1 manifest URLs still work
- [ ] The page is usable on mobile and keyboard-only
- [ ] The manifest URL updates live and can be copied
- [ ] Filter behavior is logged and counted without leaking stream or subtitle URLs

## 9. Addon icon and branding

The previous unified addon icon did not reliably render in Stremio. Treat the icon as a first-class asset with an explicit URL and CI validation.

### 9.1 Primary icon

- Commit a real PNG icon at `assets/logo.png`.
- Required properties:
  - 512 x 512 pixels
  - square
  - sRGB
  - under 512 KB
  - safe padding for rounded/circular client masks
- Keep `assets/logo.svg` as the editable source and fallback.
- Use PNG as the manifest icon. Some Stremio clients do not render SVG logos.
- Add `assets/favicon.ico` and a 180 x 180 PNG for touch icons.
- The configure and status pages use the same PNG and include a favicon link.

### 9.2 Manifest icon URL

- Manifest `logo` must be an absolute URL:

```text
${PUBLIC_BASE_URL}/logo.png?v=<addonVersion>
```

- `PUBLIC_BASE_URL` is the canonical public origin, for example `https://addon.example.com`.
- If `PUBLIC_BASE_URL` is unset, derive the origin from trusted forwarded headers.
- Never emit a relative URL.
- Never emit `localhost`, `127.0.0.1`, or an internal worker address.
- Validate the forwarded host or use the configured canonical URL.
- Keep the manifest `id` stable and independent of the icon URL.

### 9.3 Serving the icon

```text
GET /logo.png
GET /logo.svg
GET /favicon.ico
```

Requirements:

- `/logo.png` returns `content-type: image/png`.
- `/logo.svg` returns `content-type: image/svg+xml; charset=utf-8`.
- `/favicon.ico` returns `content-type: image/x-icon`.
- Set `access-control-allow-origin: *`.
- Set `cross-origin-resource-policy: cross-origin`.
- Set `cache-control: public, max-age=31536000, immutable` for versioned URLs.
- Serve the icon through the same gateway as the manifest. Do not depend on a worker or external host.

### 9.4 Why the previous icon failed

Likely causes to eliminate:

- SVG-only manifest icon.
- Relative or wrong-host logo URL behind Beamup.
- Missing or incorrect content type.
- CORS or cross-origin policy issues.
- No test that fetched the icon through the public URL.

### 9.5 Icon validation

Add `scripts/check-icon.mjs`:

- Verify the PNG signature.
- Verify the IHDR dimensions are 512 x 512.
- Verify the file size is below the limit.
- Verify the manifest logo URL is absolute and uses the canonical public origin.
- Verify the icon is reachable and returns HTTP 200 with `image/png`.
- Verify the SVG fallback is also reachable.

CI smoke tests:

- Fetch `/manifest.json`.
- Extract `logo`.
- Assert it is an absolute HTTPS URL.
- Fetch it and assert `content-type` starts with `image/png`.
- Fetch `/logo.svg` and `/favicon.ico`.
- Run the icon check with and without proxy headers.

### 9.6 Icon acceptance criteria

- [ ] Manifest `logo` is an absolute PNG URL
- [ ] Icon is 512 x 512 and under 512 KB
- [ ] `/logo.png`, `/logo.svg`, and `/favicon.ico` are served correctly
- [ ] Icon works with `PUBLIC_BASE_URL` set and with forwarded headers
- [ ] CI verifies the icon URL and content type
- [ ] Configure and status pages use the same branding asset

## 10. Configuration and global settings

Use one Zod schema in `src/core/env.ts`.

### Non-secret defaults

`config/defaults.env`:

```text
PORT=7000
DATA_DIR=/data
LOG_LEVEL=info
LOG_FORMAT=json
LOG_SINK=stdout
LOG_SAMPLE_RATE=0.1
LOG_SLOW_MS=2000
LOG_BATCH_SIZE=200
LOG_FLUSH_MS=5000
LOG_QUEUE_MAX=10000
CACHE_TTL_MS=180000
CACHE_PARTIAL_TTL_MS=30000
BACKEND_TIMEOUT_MS=10000
GLOBAL_DEADLINE_MS=12000
MAX_STREAMS_PER_PROVIDER=100
MAX_STREAMS=1000
CIRCUIT_FAILURE_THRESHOLD=3
CIRCUIT_COOLDOWN_MS=300000
UPDATE_ON_START=true
UPDATE_INTERVAL_MIN_HOURS=20
UPDATE_INTERVAL_MAX_HOURS=24
CINEMETA_URL=https://v3-cinemeta.strem.io
MAL_ENABLED=false
JIKAN_URL=https://api.jikan.moe/v4
JIKAN_MAX_RPS=3
JIKAN_MAX_RPM=60
SA7_INTERNAL_URL=http://127.0.0.1:7001
NUVIO_INTERNAL_URL=http://127.0.0.1:7002
VEGA_INTERNAL_URL=http://127.0.0.1:7003
```

### Secrets and overrides

Set through the deployment environment only:

```text
TMDB_API_KEY=
PROVIDER_SETTINGS_JSON=
COOKIES_FILE=
GITHUB_TOKEN=
INTERNAL_TOKEN=
CLOUDFLARE_LOG_ENDPOINT=
CLOUDFLARE_LOG_TOKEN=
```

`deriveFleetEnv()` maps the global settings to each worker. No worker should read an unrelated global variable directly. No per-service env file should exist.

`TMDB_API_KEY` is required in staging and production so `tmdb:` IDs can be advertised and resolved.

Provider settings:

- `PROVIDER_SETTINGS_JSON` is one validated JSON object.
- It may contain a per-fleet subtree, such as `{"sa7":{},"nuvio":{},"vega":{}}`.
- `deriveFleetEnv()` passes only the matching fleet subtree to each worker.
- Unknown keys are ignored with a warning; malformed JSON falls back to the last known good value or an empty object.
- Never log provider settings values, tokens, cookies, or credentials.
- Include only key names and validation status in health and logs.
- Test pass-through, malformed JSON, unknown keys, and redaction.

## 11. Provider policy

`config/providers.json` is the only provider policy source:

```json
{
  "sa7": {
    "mode": "allow",
    "ids": []
  },
  "nuvio": {
    "mode": "deny",
    "ids": []
  },
  "vega": {
    "mode": "deny",
    "ids": []
  }
}
```

Rules:

- Keep the three effective lists.
- Generate them from this one file at startup.
- Validate duplicate groups and ownership against `provider-audit.csv`.
- Fail CI or startup when policy and audit drift.
- Disable YouTube, torrent scraper, and Internet Archive providers by default.
- Treat only those scraper classes as disabled by default; other disabled duplicate providers are a reserve pool.
- Do not re-enable a default-disabled scraper as part of provider replacement.
- Keep the existing duplicate ownership decisions unless live testing changes them.

`scripts/check-provider-policy.mjs` must verify:

- Every disabled provider exists in the relevant fleet.
- Every allowlisted provider exists in the relevant fleet.
- No provider is owned by multiple fleets.
- The generated lists match the audit decisions.
- YouTube, torrent scraper, and Internet Archive providers remain disabled by default.

### 11.1 Provider replacement workflow

Disabled duplicate providers are a reserve pool. Do not delete them. Replace a failing active provider only through an evidence-based, reversible policy change.

Evaluation windows:

- 24 hours for acute failures.
- 7 days for the replacement decision.
- Use both `ok` and `empty` outcomes; exclude `skipped` from failure rates.
- Require at least 50 provider attempts before acting on a rate.

Candidate active provider is eligible for replacement when any condition holds:

- Success rate below 50% over 7 days.
- Timeout rate above 30% over 7 days.
- Circuit opened at least 3 times in 24 hours.
- Provider repeatedly returns malformed or unusable streams.

Replacement rules:

- The reserve provider must belong to the same audit duplicate group.
- The reserve provider must not be a YouTube, torrent scraper, Internet Archive, or another default-disabled scraper class.
- Default-disabled scrapers are never replacement candidates; other disabled duplicate providers are.
- Never replace a high-volume healthy provider solely because it is slower.
- Replace at most one provider per fleet per policy change.
- Validate the candidate in staging with a fixed sample of movies and series episodes.
- Compare non-empty rate, stream count, timeout rate, latency, and playback-link quality against the active provider.
- Update `config/providers.json` and `provider-audit.csv` in the same change.
- Run `npm run policy:check` and the live staging smoke test.
- Require production approval.
- Roll back by reverting the policy change; do not require a code rollback.
- Record before/after metrics and the policy decision in `docs/runbook.md`.
- Do not automate re-enablement from raw failure rates alone.

## 12. Updater design

One scheduler lives in the gateway process. It runs three jobs.

```text
UpdaterScheduler
  ├── sa7 job   -> GitHub SA7ANI/cb-providers
  ├── nuvio job -> Codeberg eclipsia/nuvio-plugin
  └── vega job  -> GitHub Zenda-Cross/vega-providers
```

Shared responsibilities:

- Resolve the upstream head with `HEAD`/ETag and pin the resolved commit SHA.
- Compare with the installed SHA and skip download when unchanged.
- Download changed files with retry, timeout, and size limits.
- Retry transient timeouts, network errors, `429`, `5xx`, and tar extraction failures three times with `2s`/`4s` backoff.
- Do not retry permanent errors such as `404`.
- Clear partial staging output before each retry.
- Use bounded concurrency.
- Write to a staging directory on the same filesystem as the active snapshot.
- Validate the manifest, provider count, and expected files before activation.
- Atomically swap the active directory and `fsync` the parent where supported.
- Keep the previous good snapshot until the new snapshot passes health checks.
- Keep a per-fleet update lock to prevent concurrent updates.
- Persist pending retries and state across restarts.
- Clean stale temporary directories on startup.
- Run on start when configured or when the snapshot is older than the schedule.
- Schedule the next run with jitter between 20 and 24 hours in UTC.
- Expose SHA, fetched time, age, refreshing, last error, last success, pending retries, and next run.
- Serve the bundled snapshot immediately on cold start and refresh in the background.
- Fail the Docker/CI build when no baseline snapshot can be produced.
- Call `/internal/reload` on the worker after a successful install.
- Log every attempt, retry, failure, install, reload, and schedule.

Nuvio must not refresh on a stream request. All three fleets use the same scheduler semantics.

## 13. Logging and observability

### 13.1 Goals

- Log every timeout.
- Log every error.
- Log every success and failure at the request level.
- Track success and failure rates per fleet and per provider.
- Capture detailed provider outcomes, deadlines, cache behavior, and updater behavior.
- Keep request-path logging non-blocking.
- Optionally ship logs and metrics to Cloudflare D1 and R2 through an API.
- Never log secrets, cookies, authorization headers, API keys, or tokenized URLs.

Note: Cloudflare's products are D1 (SQL database) and R2 (object storage). There is no D2 or R1 service. This plan assumes "d2/r1" means D1/R2.

### 13.2 One structured logger

All gateway and worker logs use `src/core/logger.ts` and write JSON lines to stdout.

```json
{
  "ts": "2026-11-12T00:00:00.000Z",
  "level": "info",
  "service": "gateway",
  "fleet": "sa7",
  "event": "provider.completed",
  "requestId": "01J...",
  "route": "stream",
  "type": "movie",
  "contentId": "tt0111161",
  "provider": "vidrock",
  "outcome": "ok",
  "durationMs": 812,
  "streams": 4,
  "meta": {}
}
```

Rules:

- Use one event vocabulary.
- Use one redaction function for every sink.
- Truncate error messages and stacks.
- Include `requestId` in every request-scoped event.
- Propagate `x-request-id` from gateway to worker and back.
- Never log full cookie values, authorization headers, API keys, or query tokens.

### 13.3 Event families

#### Request events

- `stream.request.started`
- `stream.request.completed`
- `stream.request.failed`
- `stream.request.slow`
- `health.request.completed`
- `configure.request.completed`
- `manifest.request.completed`

#### Backend events

- `backend.request.started`
- `backend.request.completed`
- `backend.request.timeout`
- `backend.request.error`
- `backend.request.aborted`

#### Provider events

- `provider.started`
- `provider.completed`
- `provider.empty`
- `provider.timeout`
- `provider.error`
- `provider.skipped`
- `provider.circuit.open`
- `provider.circuit.closed`

#### Metadata events

- `metadata.cache.hit`
- `metadata.cache.miss`
- `metadata.resolve.completed`
- `metadata.resolve.failed`
- `jikan.rate_limited`

#### Cache events

- `cache.hit`
- `cache.miss`
- `cache.coalesced`
- `cache.set`
- `cache.expired`
- `cache.evicted`

#### Updater events

- `updater.started`
- `updater.head.resolved`
- `updater.download.completed`
- `updater.retry`
- `updater.failed`
- `updater.installed`
- `updater.reload.completed`
- `updater.scheduled`

#### Log sink events

- `log.batch.sent`
- `log.batch.failed`
- `log.queue.dropped`
- `log.sink.disabled`

### 13.4 Metrics

Maintain counters in memory for each fleet, provider, and window.

Windows:

- 1 minute
- 15 minutes
- 1 hour
- 24 hours

Metrics per provider:

- requests
- successes
- empties
- timeouts
- errors
- skipped
- successRate
- failureRate
- average latency
- p50 latency
- p95 latency
- p99 latency
- last error
- last success time
- circuit state
- consecutive failures

Metrics per fleet:

- requests
- cache hits and misses
- merged streams returned
- empty results
- deadline hits
- provider failures
- timeouts
- errors
- skipped
- updater state

Metadata metrics:

- Cinemeta, TMDB, and Jikan requests
- metadata cache hits and misses
- MAL-to-TMDB mapping success/failure
- Jikan `429` responses
- metadata resolution latency

Expose these in `/health` and `/stats`. Ship aggregated metric snapshots to Cloudflare on the same batch schedule as logs.

### 13.5 Log policy

- `ERROR`: always log and always ship.
- `WARN`: always log and always ship.
- `INFO`: log request completion and updater results; ship all INFO request summaries or sample at `LOG_SAMPLE_RATE`.
- `DEBUG`: local only unless explicitly enabled.
- Timeouts, errors, circuit openings, updater failures, and slow requests are never sampled.
- Successful provider details may be sampled, but their counters are always updated.
- Detailed provider logs are stored in R2; queryable summaries are stored in D1.

### 13.6 Internal log pipeline

```text
Logger
  -> event builder
  -> redaction
  -> bounded queue
  -> stdout sink
  -> optional Cloudflare sink
       -> batched HTTP POST
       -> retry with backoff
       -> drop-oldest when full
       -> metrics for dropped/sent/failed
```

Requirements:

- The request path never waits for Cloudflare.
- Flush on shutdown.
- Retry transient failures.
- Use a circuit breaker for the sink.
- Deduplicate events with an event id.
- Use gzip for batches.
- Bound memory with `LOG_QUEUE_MAX`.
- Report sink health in `/health`.
- Keep local stdout logging always available as a fallback.

### 13.7 Cloudflare ingestion options

#### Recommended: Cloudflare Worker ingest API

Add a small Cloudflare Worker outside the container:

```text
POST /v1/logs
POST /v1/metrics
GET  /v1/query
```

The Worker:

- Authenticates a bearer token.
- Accepts a batch of JSON events.
- Writes indexed event summaries to D1.
- Writes raw JSONL batches to R2.
- Writes metric snapshots to D1.
- Serves filtered queries for debugging.
- Keeps Cloudflare credentials out of the application container.

Application settings:

```text
LOG_SINK=cloudflare
CLOUDFLARE_LOG_ENDPOINT=https://logs.example.workers.dev
CLOUDFLARE_LOG_TOKEN=<secret>
```

This is the preferred design because it centralizes schema validation, retention, and querying, and limits the blast radius of the application credential.

#### Alternative: direct Cloudflare API

If a separate Worker is not allowed:

- Use the Cloudflare D1 HTTP API for batched inserts.
- Use the R2 S3-compatible API for raw JSONL archives.
- Store `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, `CF_D1_API_TOKEN`, `CF_R2_ACCESS_KEY_ID`, and `CF_R2_SECRET_ACCESS_KEY` as deployment secrets.
- Batch aggressively because per-event API calls are slow and expensive.

Direct D1 inserts should be batched SQL, not one request per event.

### 13.8 D1 schema

```sql
CREATE TABLE log_events (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  level TEXT NOT NULL,
  service TEXT NOT NULL,
  fleet TEXT,
  event TEXT NOT NULL,
  request_id TEXT,
  route TEXT,
  type TEXT,
  content_id TEXT,
  provider TEXT,
  outcome TEXT,
  status INTEGER,
  duration_ms INTEGER,
  streams INTEGER,
  error_name TEXT,
  error_message TEXT,
  meta_json TEXT
);

CREATE INDEX idx_log_events_ts ON log_events(ts);
CREATE INDEX idx_log_events_request ON log_events(request_id);
CREATE INDEX idx_log_events_fleet_event ON log_events(fleet, event);
CREATE INDEX idx_log_events_level_ts ON log_events(level, ts);

CREATE TABLE provider_metrics_1m (
  bucket_ts TEXT NOT NULL,
  fleet TEXT NOT NULL,
  provider TEXT NOT NULL,
  requests INTEGER NOT NULL,
  successes INTEGER NOT NULL,
  empties INTEGER NOT NULL,
  timeouts INTEGER NOT NULL,
  errors INTEGER NOT NULL,
  skipped INTEGER NOT NULL,
  avg_ms REAL,
  p95_ms REAL,
  PRIMARY KEY (bucket_ts, fleet, provider)
);

CREATE TABLE fleet_metrics_1m (
  bucket_ts TEXT NOT NULL,
  fleet TEXT NOT NULL,
  requests INTEGER NOT NULL,
  successes INTEGER NOT NULL,
  failures INTEGER NOT NULL,
  timeouts INTEGER NOT NULL,
  cache_hits INTEGER NOT NULL,
  cache_misses INTEGER NOT NULL,
  streams INTEGER NOT NULL,
  PRIMARY KEY (bucket_ts, fleet)
);
```

### 13.9 R2 layout

```text
logs/YYYY/MM/DD/YYYY-MM-DDTHH-mm-ssZ-<batch-id>.jsonl.gz
metrics/YYYY/MM/DD/YYYY-MM-DDTHH-mm-ssZ-<batch-id>.json.gz
```

Retention is configurable. Suggested defaults:

- Raw logs in R2: 30 days
- Event summaries in D1: 30 days
- Aggregated metrics in D1: 90 days

### 13.10 Query and debugging

- `scripts/logs-query.mjs` queries the Cloudflare Worker or direct API.
- Support filters by time, fleet, provider, level, event, request id, type, and content id.
- Provide summary views for:
  - top failing providers
  - timeout rate by fleet
  - success rate by provider
  - slowest providers
  - updater failures
  - cache hit rate
  - recent errors
- Do not expose a public log query endpoint on the addon.

### 13.11 Logging acceptance criteria

- Every stream request produces exactly one completion event with outcome and duration.
- Every timeout is logged and counted, regardless of sampling.
- Every error is logged and counted, regardless of sampling.
- Every provider attempt updates counters.
- Success and failure rates are available per fleet and per provider.
- Detailed failures include request id, fleet, provider, type, content id, deadline, timeout budget, and error name.
- Secrets and cookies are redacted.
- Cloudflare sink failures do not affect stream responses.
- `/health` reports sink queue depth, dropped events, sent batches, failed batches, and last error.
- Local stdout logging works without Cloudflare configuration.

## 14. Build, verification, CI/CD, and env apply

### Authoritative verification lives in GitHub Actions

All release verification runs in GitHub Actions. Local development is limited to logic/feature tests. A local test run is not release approval.

| Check | Local | GitHub Actions |
|---|---|---|
| `npm run verify` | Not required | Required |
| ESLint | Not required | Required |
| TypeScript typecheck | Not required | Required |
| Full Vitest suite | Not required | Required |
| Targeted logic/feature tests | Allowed | Included in full suite |
| Policy drift check | Not required | Required |
| TypeScript build | Not required | Required |
| Docker build | Not required | Required |
| Container smoke test | Not required | Required |
| Staging deploy | Not allowed | Required after verify and Docker |
| Production deploy | Not allowed | Required after staging |

### Required npm scripts

```json
{
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:feature": "vitest run tests/features",
    "policy:check": "node scripts/check-provider-policy.mjs",
    "check:icon": "node scripts/check-icon.mjs",
    "build": "tsc -p tsconfig.json",
    "verify": "npm run policy:check && npm run check:icon && npm run lint && npm run typecheck && npm run test && npm run build"
  }
}
```

- `test:feature` is the only intended local test command.
- `lint`, `typecheck`, `test`, `verify`, and `build` are CI-authoritative.
- Do not add a local pre-push hook that requires the full verification suite.
- Do not require Docker to be installed locally for normal feature work.

### GitHub Actions workflow

```text
.github/workflows/ci.yml

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

jobs:
  verify:
    - checkout
    - setup Node 22
    - restore npm cache
    - npm ci
    - npm run verify
    - npm run check:icon
    - upload coverage, test reports, and build metadata

  docker:
    needs: [verify]
    - checkout
    - setup Docker Buildx
    - docker build
    - start the container with test settings
    - run the container smoke test
    - upload container logs on failure

  deploy-staging:
    needs: [verify, docker]
    if: main branch or manual dispatch
    environment: staging
    - configure SSH
    - push the verified commit to the staging Beamup app
    - apply the merged staging env in one shot
    - wait for `/health` to report three fleets
    - run the live smoke test

  deploy-production:
    needs: [deploy-staging]
    if: main branch or manual dispatch
    environment: production
    - require environment approval
    - configure SSH
    - push the same verified commit to the production Beamup app
    - apply the merged production env in one shot
    - wait for `/health` to report three fleets
    - run the live smoke test
    - record the deployed commit and version

  rollback-production:
    needs: [deploy-production]
    if: manual dispatch with rollback input
    - deploy the last known-good commit
    - apply the last known-good env
    - run the live smoke test

  (all jobs after `verify` must not run when verification fails)
```

Workflow requirements:

- Use one Node version file or one workflow constant.
- Cache npm dependencies using the root `package-lock.json`.
- Cache Docker layers with GitHub Actions cache.
- Upload Vitest coverage, test reports, icon validation, and build metadata as artifacts.
- Keep container logs as artifacts when smoke tests fail.
- Mark `verify` and `docker` as required checks in branch protection.
- Never deploy from a local machine as part of the normal workflow.
- Deploy only from GitHub Actions after `verify` and `docker` pass.
- Use separate GitHub Environment secrets for `staging` and `production`.
- Require manual approval for the `production` environment.
- Use one concurrency group per environment so deploys cannot overlap.
- Deploy the same commit SHA to staging and production.
- Store the deployed SHA and app URL in the workflow summary.

### One-shot environment apply

Replace per-key `config:set` calls with one bulk import per deploy.

Add `scripts/apply-env.mjs` with these modes:

```text
node scripts/apply-env.mjs --check       # validate and show key names only
node scripts/apply-env.mjs --dry-run     # print planned changes, no values
node scripts/apply-env.mjs --apply       # import the merged env file once
```

Inputs:

- `config/defaults.env` for non-secret defaults.
- Deployment environment for secrets and overrides.
- `BEAMUP_REMOTE` and `BEAMUP_SSH_KEY`.

Merge rules:

- Defaults first, deployment environment second.
- Reject unknown keys unless explicitly allowed.
- Reject invalid keys and newline-containing keys.
- Never apply `PORT`; Beamup owns it.
- Allow empty values only for explicitly optional keys.
- Never print secret values.
- Write the merged env file to a `0600` temp file and remove it in a trap.

Transport:

1. Preferred: one SSH call using `config:import` with the env file on stdin.
2. Fallback: one SSH call with a single multi-key `config:set`.
3. Last resort: per-key `config:set` only when the remote rejects both bulk forms.

Behavior:

- Fetch the current remote env once.
- Compare key/value pairs.
- If nothing changed, skip the import and report `unchanged`.
- If anything changed, perform exactly one import and one restart.
- Mask all secret values in logs.
- Log only key names and counts.
- Use a fake SSH harness in tests to verify batching, quoting, and redaction.
- Keep the script idempotent and safe to rerun after a failed deploy.

### Deployment sequence and rollback

Production deploy sequence:

1. `verify` passes.
2. Docker build and container smoke test pass.
3. Deploy the verified commit to staging.
4. Apply the staging env in one shot.
5. Wait for all three fleets to be healthy.
6. Run the live staging smoke test.
7. Require production approval.
8. Deploy the same commit to production.
9. Apply the production env in one shot.
10. Wait for all three fleets to be healthy.
11. Run the live production smoke test.
12. Record the deployed commit, version, and app URL.

Rollback:

- Manual dispatch with a previous known-good commit.
- Reapply the last known-good env file.
- Run the same health and smoke checks.
- Never roll back by editing secrets manually.
- Keep the previous two environment snapshots available as GitHub Actions artifacts or encrypted repository storage.

### Release metadata

- Set `ADDON_VERSION` from the git tag or short commit SHA.
- Include `ADDON_VERSION` and commit SHA in `/health` and `/stats`.
- Include the version in the manifest and icon cache key.
- Add image labels:
  - `org.opencontainers.image.source`
  - `org.opencontainers.image.revision`
  - `org.opencontainers.image.version`
- Publish a release note for provider-policy changes and filtering changes.

### One Dockerfile

Stages:

1. `deps`: install root dependencies.
2. `build`: compile gateway, Nuvio, and Vega; prepare SA7 source.
3. `runtime`: production dependencies, gateway dist, fleet runtimes, snapshots, baselines, entrypoint.

No per-service `npm ci` and no per-service build stage.

### CI smoke tests

- Three workers healthy.
- One manifest.
- One configure page.
- `GET /` returns info JSON with relative links and `no-store`.
- `HEAD /` and `OPTIONS /` behave correctly.
- No worker port is publicly reachable.
- A baseline snapshot exists and each fleet reports a non-zero provider count.
- The container starts with bundled snapshots when `/data` is empty.
- `/health` reports cache TTL 180000 and partial TTL 30000.
- `/health` reports three updater states.
- `/health` reports all three providers and no policy drift.
- Stream endpoint returns `{ "streams": [...] }`.
- Web/embed/archive streams map to `externalUrl`; blocker links are dropped.
- Log sink health is present.
- Forced error and timeout events appear in the log queue or stdout.
- Manifest `logo` is an absolute URL.
- `/logo.png` returns HTTP 200 with `image/png`.
- `/logo.png` `HEAD` returns the same content type and content length as GET.
- `/logo.svg` and `/favicon.ico` are reachable.
- `HEAD /manifest.json`, `HEAD /health`, and `HEAD /stream/...` return 200 with no body.
- `HEAD /stream/...` does not fan out to workers.
- `OPTIONS /stream/...` returns 204 with `allow: GET, HEAD, OPTIONS`.
- `/subtitles` returns 404 for `GET`, `HEAD`, and `OPTIONS`.
- `/health` includes `ADDON_VERSION` and commit SHA.
- `/health` reports the deployed env version or env apply marker.
- One-shot env apply reports `unchanged` on a second run.

## 15. Migration phases

### Phase 0 — Baseline and safety

- Tag the current repo.
- Record provider counts and warm/cold stream counts for a movie and a series.
- Save sample `/health`, `/stats`, `/manifest`, and `/configure` responses.
- Add contract tests based on those samples.
- Keep the current app deployed.

### Phase 1 — Scaffold

- Create the new project with one package, lockfile, tsconfig, lint config, and test config.
- Add `config/defaults.env`, `.env.example`, and `config/providers.json`.
- Add `AGENTS.md`, `README.md`, `NOTICE.md`, and `docs/runbook.md` skeletons.
- Add the logging event schema and stdout sink first.

### Phase 2 — Shared core

- Implement env parsing and `deriveFleetEnv()`.
- Implement the 180s full cache and 30s partial cache.
- Implement non-empty-only caching and empty-result retry behavior.
- Implement canonical telemetry schema.
- Implement structured logger, redaction, queue, and sinks.
- Move identical Nuvio/Vega utilities into core.
- Implement URL classification, same-file canonicalization, dedupe, and stream caps.
- Implement content ID parsing for `tt`, `tmdb:`, and optional `mal:` requests.
- Implement Cinemeta, TMDB, and Jikan metadata resolution with bounded positive/negative caches.
- Implement the Jikan rate-limit queue and MAL-to-TMDB title search.
- Implement circuit breaker, timeout clamp, and language alias normalization.
- Implement provider settings validation and redaction.
- Implement provider policy loading and validation.

### Phase 3 — Workers

- Copy only the provider runtime from SA7, Nuvio, and Vega.
- Remove their addon routes and config defaults.
- Add worker entries with `/internal/health`, `/internal/stream`, and `/internal/reload`.
- Disable worker stream caches.
- Enforce 100 streams per provider inside each worker.
- Clamp provider timeouts to the remaining global deadline.
- Implement `ok`, `empty`, `timeout`, `error`, and `skipped` outcomes.
- Propagate request ids.
- Verify each worker independently.

### Phase 4 — Gateway and configure page

- Implement the single manifest, configure page, stream route, health, stats, status, logo, and root info endpoint.
- Implement explicit `GET`, `HEAD`, and `OPTIONS` handlers for every public route.
- Add `HEAD` tests that assert no body and no worker fan-out.
- Add the gateway full/partial cache with non-empty-only semantics.
- Add fan-out, merge, URL classification, dedupe, sorting, and deadline behavior.
- Map web/embed/archive links to `externalUrl` and drop blocker links.
- Apply the global `1000` stream cap after merge and filter.
- Implement the v2 configuration model and v1 compatibility decoding.
- Implement `tt`, `tmdb:`, and optional `mal:` parsing for movies, series, and episodes.
- Add manifest `idPrefixes` tests with and without `TMDB_API_KEY` and `MAL_ENABLED`.
- Implement resolution, file-size, and separate-subtitle filters at the gateway.
- Add the configure UI sections, live URL preview, copy, reset, and accessible controls.
- Add filter tests for resolution ranges, size limits, unknown values, and separate subtitles.
- Add the PNG icon, absolute manifest logo URL, favicon, and icon checks.
- Add health aggregation and log sink health.
- Verify one public addon surface.

### Phase 5 — Updater

- Implement the shared scheduler and three jobs.
- Move provider installs into the gateway.
- Add ETag/head resolution, pinned SHA, retries, per-fleet locks, pending retries, and atomic swap.
- Add worker reload calls.
- Add update state to health.
- Fail the build when a baseline snapshot cannot be produced.
- Verify 20–24 hour jitter scheduling with an injected clock.
- Test failure, retry, unchanged SHA, and rollback.

### Phase 6 — Logging and Cloudflare

- Implement the event vocabulary.
- Add per-request and per-provider counters with sliding windows.
- Add batching, retries, queue limits, and gzip.
- Add the Cloudflare Worker ingest API or direct D1/R2 API.
- Add the D1 schema and R2 archive layout.
- Add the log query script.
- Add sink failure tests and redaction tests.

### Phase 7 — Policy and env cleanup

- Generate all three provider lists from `config/providers.json`.
- Validate against `provider-audit.csv`.
- Remove all per-service env files and conflicting defaults.
- Forward global settings explicitly.

### Phase 8 — Build, CI, and Docker

- Collapse to one dependency install and one build.
- Add the three-stage Dockerfile.
- Add the full GitHub Actions pipeline and smoke tests.
- Make GitHub Actions the only authority for `verify`, lint, typecheck, the full Vitest suite, build, and Docker build.
- Keep local usage limited to targeted logic/feature tests through `npm run test:feature`.
- Do not require local Docker builds or local full verification for feature work.
- Require the `verify` and `docker` jobs to pass before any deploy job.
- Enable branch protection for the required checks.
- Add the one-shot `scripts/apply-env.mjs` and its fake-SSH tests.
- Add staging and production environments, approval gates, and rollback job.
- Add workflow linting, dependency/image scanning, and SBOM artifacts.
- Add the icon, manifest, `HEAD`, and `OPTIONS` checks to the container smoke test.
- Verify the image starts with no Cloudflare configuration.

### Phase 9 — Staging and cutover

- Deploy to a staging Beamup app.
- Apply the staging env in one shot and verify a second run reports `unchanged`.
- Compare provider counts and stream results with the baseline.
- Verify the manifest icon, configure filters, logs locally, and logs in Cloudflare.
- Require production approval and deploy the same commit.
- Apply the production env in one shot.
- Run the live production smoke test and record the deployed SHA.
- Test rollback to the previous known-good commit.
- Archive the old app and repository after stability.

### Phase 10 — Post-launch provider tuning

- Collect at least 7 days of per-provider outcomes.
- Review success, empty, timeout, error, skipped, latency, and stream contribution.
- Identify active providers that meet the replacement thresholds.
- Map each failing provider to a disabled reserve in the same audit group.
- Test one candidate replacement per fleet in staging.
- Apply the policy and audit change together with approval.
- Record before/after metrics in the runbook.
- Revert the policy if coverage or latency regresses.

## 16. Acceptance checklist

- [ ] One public addon surface
- [ ] One container and one public port
- [ ] One gateway
- [ ] One health implementation
- [ ] One stats implementation
- [ ] One env schema
- [ ] One gateway cache: 180s full and 30s partial, non-empty only
- [ ] Empty stream results are never cached and always retry the fan-out
- [ ] Web/embed/archive links map to `externalUrl`; blocker links are dropped
- [ ] Same-file URLs are canonically deduplicated without stripping signed query tokens
- [ ] Per-provider cap is 100 and the gateway global cap is 1000
- [ ] `GET /` returns info JSON with relative links and `no-store`
- [ ] Provider timeouts are clamped to the remaining global deadline
- [ ] Circuit breaker opens after 3 failures, cools down for 5 minutes, then probes half-open
- [ ] Subtitle language aliases, including `E-Sub`, normalize to ISO/base codes
- [ ] Provider settings are validated, fleet-scoped, and redacted
- [ ] Snapshot downloads retry and the build fails when no baseline snapshot exists
- [ ] `/configure` supports resolution range, file-size limit, unknown values, and separate-subtitle filtering
- [ ] Inline/embedded subtitles are never modified
- [ ] v1 configuration URLs remain compatible
- [ ] IMDb `tt` movie, series, season-pack, and episode IDs resolve correctly
- [ ] TMDB `tmdb:` movie, series, season-pack, and episode IDs resolve correctly
- [ ] `tmdb:` is advertised only when TMDB metadata is configured
- [ ] MAL `mal:` movie, episode, and season+episode IDs resolve correctly
- [ ] `mal:` is advertised only when MAL/Jikan support is enabled
- [ ] Jikan rate limits and failures return empty streams without `5xx`
- [ ] Manifest icon is an absolute PNG URL and is fetched by CI
- [ ] `/logo.png`, `/logo.svg`, and `/favicon.ico` work through the public origin
- [ ] Every public route supports `GET`, `HEAD`, and `OPTIONS` with correct headers
- [ ] `HEAD` responses have no body and `HEAD /stream/...` does not fan out to workers
- [ ] `AGENTS.md` documents Stremio compatibility, HTTP, code efficiency, and industry-standard coding
- [ ] One-shot env apply imports the merged env once and is idempotent
- [ ] Three internal worker processes
- [ ] Three updater jobs on a 20–24 hour jittered schedule
- [ ] Three provider lists generated from one policy
- [ ] Disabled duplicate providers remain available as a reserve pool, excluding default-disabled YouTube, torrent scraper, and Internet Archive providers
- [ ] Failing providers can be replaced through a staging-tested, reversible policy change
- [ ] One lockfile, one tsconfig, one test runner
- [ ] No per-service lockfiles, deploy envs, READMEs, or independent CI
- [ ] Provider runtimes and licenses preserved
- [ ] GitHub Actions runs policy check, lint, typecheck, full Vitest, build, Docker build, and smoke tests
- [ ] Local development uses only targeted logic/feature tests
- [ ] Deploy jobs require successful `verify` and `docker` jobs
- [ ] Staging deploy and smoke pass before approved production deploy
- [ ] The same commit SHA is deployed to staging and production
- [ ] Rollback workflow is tested
- [ ] Branch protection requires the CI verification checks
- [ ] Every request logged with outcome and duration
- [ ] Every timeout and error logged and counted
- [ ] Success and failure rates available per fleet and provider
- [ ] Detailed provider logs stored locally and optionally in R2
- [ ] D1 stores queryable event summaries and metrics
- [ ] Cloudflare sink failures never affect stream responses
- [ ] Secrets and cookies redacted from all logs
- [ ] `/health` reports cache, updater, provider, log sink, version, and commit state
- [ ] Empty `DATA_DIR` cold start, optional volume restore, startup readiness, and graceful shutdown are tested
- [ ] `NOTICE.md`, upstream licenses, and `docs/runbook.md` are present
- [ ] Dependency/image scans, SBOM, and workflow lint run in CI

## 17. Additional items to include

These are easy to miss and should be part of the initial build, not follow-up fixes.

### 17.1 Public base URL and proxy correctness

- Require `PUBLIC_BASE_URL` in staging and production.
- Validate it is an HTTPS origin with no path, query, or fragment.
- Use it for manifest URLs, icon URLs, configure links, and install links.
- If it is unset locally, derive from `x-forwarded-proto`, `x-forwarded-host`, and `host`.
- Sanitize forwarded headers and reject invalid hosts.
- Add `app.set("trust proxy", ...)` with an explicit proxy count or trusted ranges.
- Test manifest and icon URLs behind simulated Beamup proxy headers.
- Never let a worker URL or internal hostname reach the public manifest.

### 17.2 Stremio install link

Add an "Install in Stremio" action on `/configure`:

```text
stremio://<public-host>/<config>/manifest.json
```

Also keep the HTTPS manifest URL and copy button. The install link must update live with the configuration.

### 17.3 Security headers and input safety

- Add security headers to HTML pages:
  - `content-security-policy`
  - `x-content-type-options: nosniff`
  - `referrer-policy: no-referrer`
  - `x-frame-options: DENY`
- Use nonces or hashes for inline styles/scripts in the configure and status pages.
- Validate every route parameter and config segment.
- Cap request URL length and config segment length.
- Do not expose stack traces or secrets in HTTP responses.
- Do not add an open proxy.
- Keep admin/log query endpoints off the public addon surface.

### 17.4 Rate limits and abuse protection

- Add a small in-memory rate limiter for the public stream route.
- Add global and per-IP request limits.
- Add a global concurrency cap.
- Return `429` only on non-Stremio endpoints; keep stream failures as `{ "streams": [] }`.
- Log rate-limit events with request id and client key hash.
- Do not trust arbitrary `x-forwarded-for` values without a configured trusted proxy.

### 17.5 Persistence, backup, and restore

- Treat `DATA_DIR` as ephemeral on Beamup. Do not require a persistent volume for correctness.
- If the deployment platform supports a volume, mount it as an optional cache, not the source of truth.
- The bundled provider snapshot in the image is the cold-start source of truth.
- A last-good snapshot in `DATA_DIR` only improves the current process lifetime; it must not be required after restart.
- Keep cookies, provider settings, and secrets in the deployment environment, not in `DATA_DIR`.
- Document what is safe to lose and what must be backed up.
- Provide a restore test that starts from an empty `DATA_DIR` and recovers from bundled snapshots.
- Ensure `DATA_DIR` permissions are correct for the non-root runtime user.

### 17.6 Startup, readiness, and shutdown

- Distinguish `starting`, `degraded`, and `ok` in `/health`.
- Do not report healthy until workers have loaded providers or clearly report a fallback state.
- Add a startup timeout and a readable error when a worker cannot start.
- Handle `SIGTERM` by stopping HTTP intake, stopping workers, flushing logs, and exiting.
- Keep the Docker healthcheck aligned with `/health`.
- Test cold start with no network access and with bundled fallbacks.

### 17.7 Updater resilience

- Keep the last good provider snapshot if an update fails.
- Fall back to the bundled snapshot if the data directory is empty or corrupt.
- Serve the bundled snapshot immediately on cold start and refresh in the background.
- Never replace a working snapshot with a partial download.
- Retry transient snapshot downloads three times with `2s`/`4s` backoff.
- Fail the Docker/CI build if no baseline snapshot can be produced.
- Keep a per-fleet lock to prevent concurrent updates.
- Persist pending retries across restarts.
- Clean stale temp directories on startup.
- Report `lastError`, `lastSuccess`, `nextRun`, pending retries, and snapshot age in `/health`.
- Test update failure, retry, unchanged SHA, and rollback to the previous snapshot.

### 17.8 Cache correctness

- Cache only successful non-empty merged responses.
- Cache complete results for `180000` ms.
- Cache deadline-truncated or per-worker-timeout partial results for `30000` ms only when at least one stream is present.
- Never cache empty results. Retry the fan-out on the next request.
- Do not cache errors, aborted requests, invalid requests, or partial failed merges with no streams.
- Do not cache `HEAD` requests or include them in cache-hit statistics.
- Include config, type, id, provider policy version, addon version, and relevant server flags in the cache key.
- Add request coalescing so cold misses do not stampede all three fleets.
- Expose `x-cache: hit|miss|coalesced|bypass` for debugging.
- Report full sets, partial sets, empty skips, hits, misses, coalesced, evictions, expired, size, memory bound, and TTL.
- Bound the cache by entry count and estimated memory.
- Optionally support ETag/If-None-Match on manifest and configure responses.
- Clear or version the cache on deployment when behavior changes.

### 17.9 Dependency and container security

- Run the container as a non-root user.
- Keep the runtime image slim and free of build toolchains.
- Pin GitHub Actions by major version and review Dependabot updates.
- Run `npm audit` or an equivalent dependency scan in CI, with an explicit allowlist for known false positives.
- Generate an SBOM as a CI artifact.
- Scan the image with Trivy or an equivalent scanner.
- Keep `dumb-init` and a proper entrypoint.
- Avoid adding native build dependencies unless required; keep Vega's optional native dependency optional.
- Consider multi-arch builds only if the deployment target requires them.

### 17.10 Licensing and notices

- Preserve all upstream `LICENSE`, `UPSTREAM_COMMIT`, and baseline files.
- Add `NOTICE.md` listing SA7, Nuvio, and Vega sources and licenses.
- Keep the repository public if required by the upstream GPL license.
- Do not remove provider attribution or embedded upstream notices.
- Document how to update each upstream source safely.

### 17.11 Documentation and runbook

Add `docs/runbook.md` covering:

- deploy and rollback
- one-shot env apply
- staging vs production
- health checks and status page
- provider update failures
- policy changes
- enabling/disabling MAL/Jikan support
- Cloudflare log sink failures
- rotating TMDB, GitHub, and Cloudflare credentials
- restoring `/data`
- reading logs in D1/R2
- emergency disablement of a fleet or provider

### 17.12 Observability and alerts

- Emit metrics for fleet health, provider failure rate, timeout rate, cache hit rate, update age, and log sink queue depth.
- Add alert thresholds:
  - all fleets down
  - one fleet down for more than 10 minutes
  - provider failure rate above a configured threshold
  - updater older than 30 hours
  - log sink queue near capacity
- Include request id and deployed version in every alert payload.
- Do not send secrets or stream URLs to alerting services.

### 17.13 Configuration compatibility and migration

- Keep a stable manifest `id`.
- Keep v1 configure links working.
- Document the v2 config schema.
- Add tests that decode old links and produce the correct defaults.
- Add a config migration table in `docs/runbook.md`.
- Never silently change the meaning of an existing filter field.

### 17.14 CI workflow hygiene

- Lint the GitHub Actions workflow with `actionlint`.
- Use `permissions: contents: read` by default.
- Grant write permissions only where required.
- Pin third-party actions and review upgrades.
- Add a timeout to every job.
- Use concurrency groups for verification and per-environment deploys.
- Keep secrets out of workflow logs and summaries.
- Test the env apply script with a fake SSH command in CI.
- Test the icon URL and manifest before deployment.

### 17.15 Accessibility and mobile UX

- Use fieldsets and legends for filter groups.
- Keep every input labeled.
- Ensure keyboard navigation and visible focus.
- Do not rely on color alone for state.
- Keep the page usable at 360px width.
- Provide a readable summary of the active filters.
- Add a reset button that restores defaults.

### 17.16 Missed-item acceptance criteria

- [ ] `PUBLIC_BASE_URL` is required and validated in staging and production
- [ ] Manifest and icon URLs work behind proxy headers
- [ ] Install-in-Stremio link is present and updates with the config
- [ ] Security headers are present on HTML pages
- [ ] Public stream route has rate and concurrency limits
- [ ] Ephemeral `DATA_DIR` recovery and optional volume restore are documented and tested
- [ ] Startup readiness and graceful shutdown are tested
- [ ] Updater fallback to last-good and bundled snapshots is tested
- [ ] Cache hit/miss/coalesced behavior is observable
- [ ] Container runs as non-root and passes image scan
- [ ] `NOTICE.md` and upstream licenses are included
- [ ] `docs/runbook.md` covers deploy, rollback, env apply, and recovery
- [ ] Alerts cover fleet health, provider failure rate, update age, and log sink health
- [ ] v1 configure links remain compatible
- [ ] CI lints the workflow and tests the env apply script
- [ ] Configure page passes the accessibility and mobile checks

### 17.17 Stremio protocol and HTTP compatibility

- Keep the manifest limited to the `stream` resource and `movie`/`series` types.
- Keep a stable addon id and a valid absolute logo.
- Return CORS headers on every route, including `/manifest.json`.
- Always return `200` with `{ "streams": [] }` for provider failures.
- Support `GET`, `HEAD`, and `OPTIONS` on every public route.
- Make `HEAD` return the same status and headers as `GET`, with no body.
- Ensure `HEAD /stream/...` performs no provider fan-out.
- Return `404` for `/subtitles` on every method.
- Return `405` with `Allow` for unsupported methods.
- Test `tt`, `tmdb:`, and optional `mal:` IDs for movies, series, season packs, and episodes, including conditional manifest prefixes.
- Test v1 and v2 configuration URLs.
- Test CORS preflight and content types.
- Include `curl -I` checks in CI for manifest, health, stream, and logo.

### 17.18 Web scraper and provider safety standards

- Give every outbound request a timeout and a maximum response size.
- Cap redirects and reject unsafe schemes.
- Reject loopback, private, link-local, and metadata addresses for provider fetches.
- Re-resolve and validate redirects to prevent SSRF.
- Retry only idempotent `GET`/`HEAD` requests with bounded backoff and jitter.
- Respect `Retry-After` and provider rate limits.
- Use a truthful project User-Agent; document any provider-required override.
- Respect robots.txt and provider terms where applicable.
- Do not bypass authentication, paywalls, DRM, or access controls.
- Never execute remote code; only load pinned, reviewed, vendored provider modules.
- Validate provider snapshots in staging and swap atomically.
- Keep the last good snapshot and bundled fallback.
- Classify provider outcomes as `ok`, `empty`, `timeout`, `error`, or `skipped`.
- Do not count `skipped` as a provider failure.
- Redact cookies, tokens, API keys, and full stream URLs from logs.
- Add tests for timeout, retry, redirect abuse, SSRF rejection, malformed HTML/JSON, and snapshot rollback.

## 18. Risks and mitigations

| Risk | Mitigation |
|---|---|
| SA7 is CommonJS while core is ESM | Keep a minimal module-format marker under `fleets/sa7` |
| Upstream code imports its own routes/config | Remove only addon glue; keep provider runtime boundaries |
| Vega optional native dependency | Keep `curl-cffi-node` optional |
| Updater in gateway may fail to reload a worker | Add `/internal/reload`, retries, and health state |
| Cloudflare API latency or outage | Bounded queue, async batching, circuit breaker, stdout fallback |
| Log volume/cost | Sample INFO, never sample errors/timeouts, aggregate metrics, compress, retain with limits |
| Secret leakage in logs | Central redaction, URL sanitization, tests for cookies/auth/API keys |
| Provider policy drift | Startup/CI validation against `provider-audit.csv` |
| Beamup loses `/data` | Treat storage as ephemeral; bundled snapshot and env-based settings |
| Beamup proxy caches a live route | Set and verify cache headers for `/stream`, health, stats, and configure |
| Worker contract or restart failure | Internal token, contract version, schema validation, restart backoff, crash-loop readiness |
| Single replica prevents horizontal scaling | Document the assumption; add a distributed updater lock before scaling |
| Provider replacement regresses coverage | Stage one replacement per fleet, compare metrics, revert policy if needed |
| Cutover regression | Staging app, baseline comparisons, Docker smoke tests, rollback to old app |

## 19. Full project workflow and operational completion

This section closes workflow gaps that are not covered by the feature sections above.

### 19.1 Development and release workflow

- Pin Node with `.nvmrc`, `engines`, and `packageManager`; use `npm ci`.
- Protect `main`; require pull requests and all CI checks; no direct pushes.
- Local workflow:
  - `npm ci`
  - `npm run dev` starts the gateway and three workers on loopback with ephemeral `DATA_DIR`
  - `npm run test:feature`
- Keep a mock worker fixture under `tests/fixtures` so gateway behavior can be tested without upstream providers.
- Every provider-policy change updates `config/providers.json`, `provider-audit.csv`, tests, and the runbook in one PR.
- Definition of done: lint, typecheck, full tests, build, Docker build, smoke tests, docs, and changelog.
- Use semantic versions and git tags. `ADDON_VERSION` comes from the tag or commit SHA.
- Update `CHANGELOG.md` for user-visible and operational changes.
- Use clear commit messages and never commit secrets.
- Run Dependabot weekly with grouped minor/patch updates; review majors manually.
- Pin GitHub Actions by commit SHA.

### 19.2 Worker contract and supervisor

- Add internal worker defaults:
  - `SA7_INTERNAL_URL=http://127.0.0.1:7001`
  - `NUVIO_INTERNAL_URL=http://127.0.0.1:7002`
  - `VEGA_INTERNAL_URL=http://127.0.0.1:7003`
- Protect internal routes with a shared `INTERNAL_TOKEN` header; workers reject missing or invalid tokens.
- Include `CONTRACT_VERSION` in worker health; the gateway refuses incompatible workers.
- Validate every internal request and response with Zod; malformed responses become provider errors, never crashes.
- Propagate client disconnect, gateway deadline, and shutdown through `AbortController` to all workers.
- Supervisor responsibilities:
  - Spawn workers before the gateway accepts traffic.
  - Wait for readiness with a bounded timeout.
  - Restart crashed workers with capped exponential backoff.
  - Enter a crash-loop state after repeated failures and fail readiness.
  - Drain in-flight requests and shut down workers gracefully.
- Enforce per-worker concurrency and timeout limits in addition to the global deadline.
- Document the single-replica assumption. Do not scale horizontally until a distributed updater lock and shared rate limiter exist.

### 19.3 HTTP, cache, and platform hardening

- Set an explicit CORS policy and expose only required headers.
- Enable response compression.
- Disable `x-powered-by`.
- Set server request/header/keep-alive timeouts.
- Return one consistent JSON error shape with `requestId`.
- Set and test cache headers per route. `/stream`, configured pages, health, stats, and root must not be cached by an intermediary unless explicitly intended.
- Verify Beamup proxy caching. Prior findings indicate `200`/`302` responses may be cached for up to 2 hours unless headers prevent it.
- Beamup constraints:
  - App names must include `docker` so the Dockerfile is detected.
  - Beamup may not provide persistent storage; treat `DATA_DIR` as ephemeral.
  - The bundled provider snapshot is the cold-start source of truth.
  - Provider settings come from environment, not a persistent local file.
  - Apply env changes in one SSH session; `config:set` is slow per key.
  - Record the exact remote, branch, and commit used for each deploy.
- Optional custom domain and TLS must set the correct `PUBLIC_BASE_URL`.

### 19.4 Metadata and external API operations

- Rate-limit and queue TMDB and Jikan calls; honor `429`, `Retry-After`, and bounded backoff.
- Cache metadata with explicit positive and negative TTLs, entry limits, and key namespaces.
- Race Cinemeta/TMDB lookups and abort the losing request.
- Never log full Jikan/TMDB URLs, API keys, config query paths, cookies, or stream URLs.
- Fail metadata resolution as empty, not `5xx`, when upstreams are unavailable.
- Keep provider replacement evidence-based and reversible as defined in §11.1.

### 19.5 Telemetry and data operations

- Version and migrate Cloudflare D1 schemas; document retention and deletion.
- Set R2 lifecycle rules and retention limits for raw JSONL.
- Use least-privilege Cloudflare tokens scoped to the specific D1 database and R2 bucket.
- Avoid high-cardinality metric labels; never use request IDs or raw URLs as labels.
- Define alert routing, owners, deduplication, and escalation.
- Add cost guards for log volume, D1 writes, R2 storage, and external API calls.
- Test backup and restore for any data that is not reproducible from the repository.

### 19.6 Environment provisioning checklist

- GitHub repository:
  - Branch protection and required CI checks.
  - `staging` and `production` environments with required reviewers for production.
  - Secrets for Beamup SSH access, app names, Cloudflare, and TMDB.
- Beamup:
  - Separate staging and production Docker apps.
  - SSH access verified from CI.
  - Production deployment restricted to the approved SHA.
- Cloudflare:
  - D1 database and R2 bucket created for the correct environment.
  - Token scopes verified.
- Metadata:
  - `TMDB_API_KEY` set in staging and production.
  - `MAL_ENABLED=true` only where required.
- Domain:
  - `PUBLIC_BASE_URL` set exactly and the icon/manifest checked through the public URL.

### 19.7 Cutover, rollback, and incident workflow

- Cutover:
  - Deploy and validate staging.
  - Capture baseline stream counts and provider outcomes.
  - Deploy the same SHA to production.
  - Keep the old app running through the observation window.
  - Verify manifest, configure page, icon, `HEAD /stream`, cache headers, and live stream results.
  - Only then mark the old app read-only or archive it.
- Rollback triggers:
  - Health or readiness failure.
  - Manifest/icon failure.
  - Stream regression or provider fan-out failure.
  - Unacceptable error rate or latency.
  - Cache or header behavior that breaks Stremio clients.
- Rollback:
  - Redeploy the previous known-good SHA.
  - Reapply the matching environment snapshot.
  - Re-run smoke tests and compare stream counts.
- Incidents:
  - Define severity, owner, and communication channel.
  - Use a kill switch to disable a failing fleet or provider without a redeploy.
  - Record the timeline, root cause, and follow-up actions.

### 19.8 Documentation and final acceptance

- Maintain `README.md`, `docs/architecture.md`, `docs/runbook.md`, `docs/decisions.md`, `CHANGELOG.md`, and an environment-variable table.
- Document the internal worker contract and its version.
- Document supported clients and ID formats.
- Document that subtitles and media proxying are intentionally absent.
- Add a final workflow acceptance checklist:
  - [ ] Local dev and mock-worker workflow works from a clean checkout.
  - [ ] Worker auth, contract version, abort propagation, restart, and crash-loop behavior are tested.
  - [ ] Beamup ephemeral storage and edge-cache behavior are verified.
  - [ ] CORS, compression, security headers, timeouts, and error shapes are tested.
  - [ ] D1 migrations, R2 retention, token scopes, alerts, and cost guards are documented.
  - [ ] Release, tag, changelog, provisioning, cutover, rollback, and incident workflows exist.
  - [ ] Single-replica assumptions are documented or replaced with a distributed lock.
  - [ ] Default-disabled providers are exactly YouTube, torrent scrapers, and Internet Archive.
  - [ ] Other disabled duplicate providers are available for the §11.1 replacement workflow.
  - [ ] Provider success, timeout, and replacement thresholds are visible in `/stats`.
