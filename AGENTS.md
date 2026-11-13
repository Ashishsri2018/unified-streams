# AGENTS.md — Unified Streams

Project instructions for coding agents.

Read `BUILD_PLAN.md` first. It is the source of truth for architecture, scope, and acceptance criteria. If code and plan disagree, stop and reconcile the plan before implementing.

## 1. Project boundaries

Build one Stremio stream addon with:

- One public gateway
- One container
- One configuration system
- One health endpoint
- One stats endpoint
- One gateway stream cache: 180s full TTL, 30s partial TTL, non-empty results only
- One global settings env
- One root package and lockfile
- Three internal workers: SA7, Nuvio, Vega
- Three updater jobs in the gateway
- Three provider lists generated from one policy file

Rules:

- The gateway is the only public HTTP server.
- Workers bind to `127.0.0.1` and expose only internal routes.
- Workers must not expose `/manifest.json`, `/configure`, `/status`, logos, or public stream routes.
- Workers must not run a stream response cache.
- The gateway owns user configuration filtering, stream merging, caching, and the updater scheduler.
- All services use the shared logger, telemetry schema, and env schema.
- Do not add a second Dockerfile, entrypoint, config loader, logger, cache, or metrics format.

## 2. Stremio addon compatibility

Follow the Stremio addon protocol.

### Manifest

- Serve `/manifest.json` and `/:config/manifest.json`.
- Keep the addon `id` stable across releases.
- Required fields: `id`, `version`, `name`, `description`, `logo`, `types`, `resources`, `idPrefixes`, `catalogs`, and `behaviorHints.configurable`.
- `resources` must be `["stream"]`.
- `types` must be `["movie", "series"]`.
- `idPrefixes` must include `tt`; include `tmdb:` only when TMDB metadata is configured and `mal:` only when MAL/Jikan support is enabled.
- `catalogs` must be `[]`.
- `logo` must be an absolute PNG URL.
- Do not advertise subtitles, catalogs, meta, player, or library resources.
- Set `cache-control: public, max-age=300`.
- Serve CORS headers on every route, including `/manifest.json`.

### Stream route

- Support `/stream/:type/:id.json` and `/:config/stream/:type/:id.json`.
- Accept only `movie` and `series`.
- Support `tt123`, `tt123:season`, `tt123:season:episode`, `tmdb:123`, `tmdb:123:season`, `tmdb:123:season:episode`, `mal:123`, `mal:123:episode`, and `mal:123:season:episode`.
- For MAL, one numeric suffix is an episode; two suffixes are season and episode.
- Return `200` with `{ "streams": [] }` for invalid IDs, empty results, provider failures, or timeouts.
- Never return `5xx` for upstream failures.
- Merge partial results from healthy workers.
- Deduplicate by normalized URL or info hash.
- Sort direct streams before external links, then by quality and container.
- Cap results at `MAX_STREAMS`.
- Set `cache-control: no-store` on stream responses. Cloudflare is used for log delivery only, not caching; keep 180s/30s TTLs in the gateway cache.
- Never cache empty stream results.
- Propagate a stable request id to workers.

### Configuration URL

- Configuration is encoded in the path segment before the resource.
- Current schema is v2; keep v1 decoding for backward compatibility.
- Validate every decoded segment with Zod.
- Enforce a maximum encoded length.
- Invalid configuration falls back to safe defaults.
- Configuration must never execute code or select arbitrary URLs.
- Keep configuration bookmarkable and shareable.

### Subtitles

- Do not expose `/subtitles`.
- Do not advertise a subtitles resource.
- Filter only separate `stream.subtitles` tracks when configured.
- Never modify inline or embedded subtitle tracks.
- Never rewrite `stream.url`, `externalUrl`, or `infoHash` while filtering subtitles.

## 3. HTTP compatibility

Every public route must support `GET`, `HEAD`, and `OPTIONS`.

- `GET` returns the full body with the correct `content-type` and cache headers.
- `HEAD` returns the same status and headers as `GET`, with no body.
- `HEAD /stream/...` must not call workers or perform provider fan-out.
- `HEAD /stream/...` returns `200` with `x-cache: bypass`.
- `HEAD /manifest.json` returns the same headers as GET.
- `HEAD /configure` and `HEAD /status` return the same headers as GET.
- `HEAD /logo.png` reports the same `content-type` and `content-length` as GET.
- Unknown `HEAD` routes return `404` with no body.
- `/subtitles` returns `404` for every method.
- `OPTIONS` returns `204` with `allow: GET, HEAD, OPTIONS` and CORS headers.
- Unsupported methods return `405` with an `allow` header.
- Do not add mutating public endpoints.

## 4. Code efficiency

Optimize the real hot paths: stream resolution, merging, filtering, caching, and logging.

- Validate and reject invalid requests before doing expensive work.
- Use the gateway cache and request coalescing.
- Never duplicate a provider call for an identical in-flight request.
- Keep concurrency bounded.
- Apply a global deadline and per-worker timeouts.
- Prefer partial results over waiting for a slow worker.
- Avoid unbounded arrays, maps, queues, and promise fan-out.
- Use `Map` and `Set` for dedupe and lookup instead of nested scans.
- Parse IDs, config, and filters once.
- Avoid unnecessary object clones and repeated JSON serialization.
- Do not perform synchronous I/O or CPU-heavy work in the request path.
- Stream static assets instead of reading them fully into memory.
- Reuse HTTP connections where supported.
- Cap request, response, config, and log sizes.
- Keep log sampling separate from metric counting; never sample errors.
- Measure with `/stats` and benchmarks before optimizing.
- Do not add dependencies for small utilities.

## 5. Industry-standard coding

- Use TypeScript with strict mode for gateway and shared code.
- Keep SA7 CommonJS isolated behind a module-format boundary.
- Prefer small, focused modules with explicit types.
- Use Zod at every external boundary: HTTP input, config, env, and stored data.
- Avoid `any`; use `unknown` plus validation.
- Use consistent naming and file organization.
- Handle errors explicitly; do not swallow them.
- Return actionable errors without exposing internals.
- Keep public HTTP behavior stable.
- Use native `fetch` or the shared HTTP client; do not add a new HTTP library without approval.
- Do not introduce a new framework.
- Do not leave dead code, commented-out code, or unused exports.
- Avoid comments unless they explain a non-obvious constraint.
- Do not commit secrets, cookies, tokens, or `.env` files.
- Redact secrets and full stream URLs from logs.
- Add security headers to HTML pages and use CSP nonces or hashes.
- Keep the configure page accessible and usable at mobile widths.
- Write tests for behavior, not implementation details.
- Use the existing test runner and shared fixtures.
- Keep one root package, one lockfile, one tsconfig, one lint config, and one test config.

## 6. Build, test, and CI

- GitHub Actions is the only authority for release verification.
- CI runs policy check, icon check, lint, typecheck, full Vitest, build, Docker build, and smoke tests.
- Local development uses `npm run test:feature` for targeted feature tests.
- Do not require Docker locally for feature work.
- Do not add per-service lockfiles, tsconfigs, test runners, or CI workflows.
- Keep the container non-root and the healthcheck aligned with `/health`.
- Do not deploy outside GitHub Actions.
- Production deploys require staging success and environment approval.
- Keep rollback tested.

## 7. Definition of done

A change is complete only when:

- It matches `BUILD_PLAN.md`.
- Stremio addon compatibility is preserved.
- `GET`, `HEAD`, and `OPTIONS` behavior is correct.
- Failures fall back to `{ "streams": [] }`.
- Config remains backward compatible.
- Secrets and stream URLs are redacted.
- Relevant feature tests exist.
- GitHub Actions passes.
- Docker smoke tests pass.
- Documentation and the plan are updated when behavior changes.

## 8. Do not

- Do not split the project back into three independent addons.
- Do not expose worker ports or worker addon routes.
- Do not add a second cache, logger, config loader, or telemetry schema.
- Do not advertise or expose subtitles.
- Do not filter inline or embedded subtitles.
- Do not return `5xx` for provider failures.
- Do not perform provider fan-out for `HEAD`.
- Do not log secrets or full stream URLs.
- Do not commit generated secrets or private keys.
- Do not deploy outside GitHub Actions.
