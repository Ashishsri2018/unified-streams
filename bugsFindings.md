# Bugs & Logic Findings

Review of the `unified-streams` gateway + SA7/Nuvio/Vega workers. Findings are
ordered by severity. Each item lists the location, the observed behavior, impact,
and a suggested fix. Items marked **(latent)** only fire with non-default
configuration or are currently unreachable, but are still correctness risks.

## Summary

| Severity | Count | Themes |
| --- | --- | --- |
| Critical | 0 | — |
| High | 5 | observability wiring, crash-on-spawn, worker startup, update success bookkeeping, request coalescing |
| Medium | 9 | config propagation, cache stats, abort races, health reporting, size/partial data loss, state durability |
| Low | 7 | dead code, rate limiter race, unused warnings, hardcoded metrics, external-stream field loss |

## High

### [skip] 1. Logger silently ignores all logging configuration and never installs the Cloudflare sink

- **Where:** `src/core/logger.ts:112` (`export const logger = new Logger()`),
  `src/core/logger.ts:26-34` (defaults `minLevel: 'info'`, `sampleRate: 1.0`),
  `src/core/env.ts:11-18` (schema defaults), `src/core/env.ts:279-280` (only
  `LOG_LEVEL`/`LOG_FORMAT` copied to workers), `src/core/logging/cloudflareSink.ts:11`.
- **What:** The singleton is constructed at import time with no options. Nothing
  ever reads `LOG_SAMPLE_RATE`, `LOG_SLOW_MS`, `LOG_QUEUE_MAX`, `LOG_BATCH_SIZE`,
  `LOG_FLUSH_MS`, or `LOG_SINK`. `CloudflareSink` is exported but never imported or
  instantiated, even when `LOG_SINK=cloudflare` and `CLOUDFLARE_LOG_ENDPOINT` is
  set. `LOG_FORMAT=pretty` is also ignored (`StdoutSink` always emits JSON).
  Because `sampleRate` defaults to `1.0` rather than the configured `0.1`, info
  logging is *more* verbose than the intended config, not less.
- **Impact:** Log volume/sampling and remote log delivery are effectively
  inoperative; operators cannot tune noise or ship logs as documented.
- **Fix:** Build the logger from `AppEnv` in `index.ts` (inject into
  `createGatewayApp`), wire `queueMax/batchSize/flushMs/slowMs/minLevel/sampleRate`,
  add a `pretty` stdout formatter, and instantiate `CloudflareSink` when
  `LOG_SINK=cloudflare` (falling back to stdout if endpoint is missing).

### 2. Supervisor has no `error` listener on spawned workers

- **Where:** `src/supervisor.ts:104-112`.
- **What:** `spawn()` can emit `'error'` (e.g. `ENOENT` for `npx`, exec failures)
  but only `'exit'` is handled. An unhandled `'error'` event throws and crashes the
  gateway process.
- **Impact:** A single missing launcher (`npx` absent, bad path) kills the entire
  gateway instead of restarting one fleet.
- **Fix:** Add `child.on('error', ...)` that logs, deletes the map entry, and
  schedules a restart (dedupe with the `'exit'` path). Consider tracking restart
  attempts/backoff.

### 3. Vega worker startup promise has no rejection handler

- **Where:** `src/fleets/vega/worker.ts:190-194`.
- **What:** `void initVega().then(() => server.listen(...))` has no `.catch`.
  Any failure in `createRuntime`, `stateStore.load`, `preloadFromDisk`, or client
  construction becomes an unhandled rejection; the server never binds and the
  process may not exit, so the supervisor's `'exit'` restart never triggers.
- **Impact:** Vega can hang forever as a non-listening process; gateway requests
  all fall through to empty via worker timeouts.
- **Fix:** `initVega().then(...).catch((err) => { logger.error(...); process.exitCode = 1; process.exit(1); })`
  so the supervisor restarts it, or log and keep a degraded listener.

### 4. Update success is recorded before the worker actually reloads

- **Where:** `src/core/updater/scheduler.ts:147-160` (records `sha`, `lastSuccess`
  right after `installUpdate`), `src/fleets/vega/worker.ts:158-161`
  (`void runtime?.updater?.runOnce('manual')` then immediate `200`),
  `src/fleets/nuvio/worker.ts:155-158` (`void snapshots.refresh(true)` then `200`).
- **What:** `POST /internal/reload` acknowledges immediately while the real
  fetch/download/activate runs asynchronously. `WorkerClient.reload()` only checks
  HTTP status, so the scheduler marks the remote SHA as installed even if the async
  update later fails. The next attempt is 20-24h away, and the gateway's
  `/health` `updater.sha` will claim a SHA the worker never activated.
- **Impact:** A failed provider snapshot update is invisible until the next daily
  cycle; stale providers persist silently for up to a day.
- **Fix:** Make reload await completion (or return `{ accepted, promise }`), or
  have the gateway verify the worker's reported SHA matches the remote SHA after
  reload before writing `lastSuccess`. On mismatch, schedule a short retry rather
  than the normal interval.

### 5. Nuvio request coalescing shares the first caller's abort signal

- **Where:** `src/fleets/nuvio/nuvio/pipeline.ts:318-339` (joins `inflight`),
  `:338` (`produce(request, signal, cacheKey)` uses the creator's signal).
- **What:** The first caller's `AbortSignal` drives the shared `produce()` call.
  Any later caller that coalesces onto the same key is not wired to its own
  signal. If the first client disconnects, the shared work aborts and *all*
  coalesced callers receive `[]`, even though their requests are still open.
  (Vega avoids this with a reference-counted controller; Nuvio does not.)
- **Impact:** One flaky/aborted client can cancel concurrent legitimate viewers of
  the same title, producing transient empty stream lists.
- **Fix:** Use a shared internal `AbortController` with a waiter count (abort only
  when waiters drop to zero), and race each waiter against its own signal, as
  `vega/pipeline/streamHandler.ts` does.

## Medium

### 6. Values loaded from `defaults.env` / profile env are not visible to `process.env` readers

- **Where:** `src/index.ts:11` (`loadAppEnv()` result is local), `src/addon/app.ts:56-61`
  (`hasTmdb: Boolean(process.env.TMDB_API_KEY)`, `hasMal: process.env.MAL_ENABLED === 'true'`),
  `src/addon/health.ts:110` (`process.env.GIT_COMMIT`), `src/addon/configure.ts`
  (`process.env.PUBLIC_BASE_URL`).
- **What:** Config is merged from `config/defaults.env` + profile + real env into a
  parsed `env` object, but it is never written back to `process.env`. Handlers that
  read `process.env` directly therefore miss values supplied only via config files
  (e.g. setting `MAL_ENABLED=true` or `TMDB_API_KEY` in a profile/defaults file
  will not add `mal:`/`tmdb:` prefixes). `GIT_COMMIT` is also read from
  `process.env` while `env.GIT_COMMIT` exists.
- **Impact:** Config-file settings silently disagree with runtime behavior;
  manifest prefixes and health metadata can be wrong for an instance.
- **Fix:** Pass the parsed `AppEnv` (or the specific values) into
  `createGatewayApp`/handlers instead of reading `process.env`, or assign the
  merged values onto `process.env` at startup.

### 7. Manifest advertises `mal:` IDs that no fleet can parse

- **Where:** `src/addon/manifest.ts:27-29`, `src/fleets/nuvio/addon/parseId.ts:3`,
  `src/fleets/vega/addon/parseId.ts:3`, `src/fleets/sa7/content-id.js:1-4`.
- **What:** `idPrefixes` includes `mal:` when `MAL_ENABLED=true`, but all three
  workers only accept `tt\d+` / `tmdb:\d+`. A `mal:123:1:2` request yields empty
  streams from every fleet while Stremio believes the addon handles it.
- **Impact:** Misleading capability advertisement; MAL content always plays empty.
- **Fix:** Either implement `mal:` parsing/conversion (and map to Cinemeta/TMDB)
  in the workers, or stop emitting the `mal:` prefix until supported.

### 8. Gateway cache reports coalesced requests as cache `hit`

- **Where:** `src/core/cache.ts:112-128`, `src/core/cache.ts:118-124`
  (`return { ..., hit: true }`), `src/core/cache.ts:86` (`get()` increments
  `misses` before coalescing), `src/addon/stream.ts:95` (`X-Cache` from `hit`).
- **What:** A coalesced (single-flight) request returns `hit: true`, so
  `X-Cache: hit` is sent and `hits` is not incremented for it, while the earlier
  `get()` already counted a `miss`. Cache hit/miss counters therefore don't match
  `X-Cache` semantics and overstate misses.
- **Impact:** Misleading cache telemetry and client/proxy debugging; no functional
  stream breakage.
- **Fix:** Return a distinct `coalesced` flag (and `X-Cache: coalesced`), and only
  increment `misses` when the request is neither a hit nor joined to an in-flight
  entry.

### 9. Vega in-flight entries can be joined after their work was aborted/settled

- **Where:** `src/fleets/vega/pipeline/streamHandler.ts:374-416`.
- **What:** Entries are deleted in `finally` via a microtask, and the shared
  controller is aborted when `waiters <= 0`. A request arriving in the window
  between completion/abort and map deletion can pick up the stale entry, increment
  `waiters`, and `await` a promise that resolves to `[]` (aborted) or to already
  returned results — the abort is not undone.
- **Impact:** Occasional spurious empty responses under disconnect churn; also
  `waiters` accounting can abort work that a just-arrived caller wanted.
- **Fix:** Delete the entry synchronously before resolving/aborting waiters, or
  store an `aborted/settled` flag and skip/restart stale entries.

### 10. Nuvio worker health hardcodes snapshot refresh state

- **Where:** `src/fleets/nuvio/worker.ts:119-124` (`refreshing: false`,
  `lastError: null`) vs the real state in `src/fleets/nuvio/nuvio/snapshot.ts:70-87`
  (`getHealth()`), and `:93-98`.
- **What:** `SnapshotManager` tracks `refreshing` and `lastError`, but the health
  payload ignores them. Gateway `/health` and `/status` therefore report Nuvio as
  idle/healthy during a failed or in-progress refresh.
- **Impact:** Status/observability lies about Nuvio snapshot health.
- **Fix:** Call `snapshots.getHealth()` and map its fields into the worker payload
  (Vega has the same shape available via `runtime.updater.getHealth()`).

### 11. Gateway `/health` can never return 503

- **Where:** `src/addon/health.ts:163` (`report.status === 'error' ? 503 : 200`),
  `src/addon/health.ts:88-90` (only `ok`/`degraded` assigned),
  `src/core/telemetry.ts:3` (`HealthStatus` includes `error`).
- **What:** `buildHealthReport` never sets `status: 'error'`, so the 503 branch is
  unreachable even when every worker is down. The `error` status exists in the
  type but is never produced.
- **Impact:** Container/orchestrator health probes never see an unhealthy gateway;
  load balancers keep routing traffic.
- **Fix:** Derive `error` when all fleets fail or startup checks fail, or change
  the HTTP mapping to `degraded` → 503 if that is the intended signal.

### 12. SA7 ignores numeric `size` when applying the max-size filter

- **Where:** `src/fleets/sa7/filters.js:77-86`.
- **What:** `sizeBytesOf` only inspects `stream.size`, `title`, and `description`
  when they are strings. A provider that returns a numeric `size` (bytes) is treated
  as size-unknown, so `keepUnknown` defaults determine whether it is kept/dropped.
- **Impact:** Size filtering is inconsistent with the gateway (`filters.ts`
  handles numeric `size`) and can drop or keep the wrong SA7 streams.
- **Fix:** Accept `typeof stream.size === 'number'` first and return it directly.

### 13. SA7 loses the partial-result flag before the gateway sees it

- **Where:** `src/fleets/sa7/worker.js:122-123` (only `{ streams }`),
  `src/fleets/sa7/streams.js:181` (computes `{ value, partial }`).
- **What:** `collectStreams` computes partial (deadline/skips/timeouts), but the
  worker strips it and returns only `streams`. The gateway falls back to a timing
  heuristic (`workerClient.ts:76-90`) to guess partial results.
- **Impact:** Partial results caused by circuit-skipped or failed providers can be
  cached with the full 180s TTL when the response happens to arrive early.
- **Fix:** Return `partial` in the SA7 worker response (the contract already
  supports it) and have `collectStreams` propagate it.

### 14. Updater state file is written non-atomically and loaded without validation

- **Where:** `src/core/updater/state.ts:20-25` (raw `JSON.parse` cast),
  `:37-45` (`fs.writeFileSync` in place).
- **What:** A crash mid-write can truncate/corrupt `*-updater-state.json`, and the
  loader accepts any JSON shape, so malformed fields can flow into scheduling
  (`Date.parse` on non-strings, etc.). No temp-file + rename is used.
- **Impact:** Corrupted state can silently disable or mis-schedule updates.
- **Fix:** Validate on load (Zod or explicit checks) and write via
  `writeFileSync(tmp)` + `renameSync`, matching the atomic patterns used elsewhere.

### 15. Vega abort listener in `resolveInfo` is never removed

- **Where:** `src/fleets/vega/pipeline/streamHandler.ts:652-664`.
- **What:** `callerSignal.addEventListener('abort', ...)` is registered for the
  `Promise.race`, but when the metadata promise wins the listener is not removed.
  It remains attached until the request signal is GC'd.
- **Impact:** Minor listener/memory retention on long-lived keep-alive requests;
  no correctness break.
- **Fix:** Use `{ once: true }` plus `removeEventListener` in a `finally`, or reuse
  `withTimeout`/`AbortSignal.any` helpers already present.

## Low

### [skip] 16. Jikan rate limiter does not actually enforce its limits (currently dead code)

- **Where:** `src/core/jikan.ts:22-39`, class used only via `src/core/metadata.ts`;
  `MetadataResolver` is never instantiated at runtime (only tests reference it).
- **What:** `waitForSlot` reads the last timestamp and sleeps, but concurrent
  callers all read the same value and wake together, so the 3 req/s limit can be
  exceeded. `JIKAN_MAX_RPM` / `queue` / `isProcessing` are never used, and the
  60-request window is only trimmed, never enforced.
- **Impact:** Latent 429s if this client is ever wired up.
- **Fix:** Serialize with a promise chain/mutex and enforce both RPS and RPM; or
  delete the unused client.

### 17. Runtime-dead modules in the gateway

- **Where:** `src/core/metadata.ts`, `src/core/jikan.ts`, `src/core/policy.ts`
  (`ProviderPolicy`), `src/core/concurrency.ts` (`CircuitBreaker`/`clampTimeout`).
- **What:** These are referenced only by their own definitions/tests; the live
  policy path is `config/providers.json` → `env.ts::deriveFleetEnv`. Because
  `ProviderPolicy.isProviderEnabled` uses `list.has(id)` literally, a `*` deny
  entry would not work there even if used.
- **Impact:** Confusing duplicate policy/rate-limit implementations and tests that
  give false confidence.
- **Fix:** Remove the dead modules/tests or wire them as the single source of truth;
  handle `*` explicitly if kept.

### 18. Vega `configWarnings` is never called

- **Where:** `src/fleets/vega/config.ts:260`.
- **What:** The helper computes configuration warnings but neither the worker nor
  runtime invokes it, so bad config (e.g. missing key/URL combinations) is silent.
- **Impact:** Misconfiguration is only discovered via failed provider calls.
- **Fix:** Log its output during `initVega`, or surface it in `/internal/health`.

### 19. Hardcoded/placeholder metrics in health and pipeline

- **Where:** `src/fleets/vega/pipeline/streamHandler.ts:359-362`
  (`coalesced: 0`), `src/addon/health.ts:116` (`metadata` all zeros),
  `src/addon/health.ts:139` (`deadlineHits: 0`).
- **What:** Several reported metrics are constants, not measurements. `coalesced`
  is hardcoded despite the pipeline tracking in-flight reuse.
- **Impact:** Dashboards/`/stats` show fabricated values.
- **Fix:** Track real counters (or omit fields that are not measured).

### 20. External-link normalization drops stream metadata

- **Where:** `src/addon/merge.ts:44-62`.
- **What:** For `externalUrl` streams the normalized object is rebuilt from
  `name/title/description/externalUrl/behaviorHints` only, dropping `subtitles`,
  `size`, `quality`, `infoHash`, and `fileIdx`.
- **Impact:** Size/quality filters and subtitle display cannot see metadata for
  external links; may be intentional for HTML pages, but is easy to miss.
- **Fix:** Preserve the safe metadata fields (or document the intentional drop).

### 21. Nuvio adapter coerces non-array worker payloads to empty

- **Where:** `src/fleets/nuvio/nuvio/loader.ts` (stream wrapper), consumed by
  `nuvio/pipeline.ts` (which has a `non_array` outcome branch).
- **What:** The loader converts non-array results to `[]`, so the pipeline's
  explicit `non_array` handling can never trigger, hiding contract violations and
  making provider bugs look like empty results.
- **Impact:** Harder to detect a scraper returning an invalid shape; empty
  results are cached/served as normal.
- **Fix:** Let the raw value through (or throw) so the pipeline can classify and
  telemetry can record `non_array`.

## Notes / non-issues verified

- Workers intentionally disable stream caches (`STREAM_CACHE_TTL_MS=0`); this is
  documented policy, not a bug. SA7's `stream-cache` disabled path is correct.
- `config/providers.json` uses explicit allow-lists per instance, so the
  `enabled.length === 0 → disabled: ['*']` fallback in `env.ts` is not currently
  hit; all three fleets do handle `'*'` in their disabled filters.
- Bundled `src/fleets/nuvio/snapshot/state.json` and
  `src/fleets/vega/providers-baseline/Zenda-Cross` exist, so bundled/preload paths
  have the expected inputs.
- `filterStream`'s `\b(720p|hd)\b` regex was checked: it does not match tokens
  like `hdhub4u` due to the trailing word-character boundary; low risk.
