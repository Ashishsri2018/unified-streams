# Unified Streams Code & Logic Issues Audit

**Date**: 2026-11-13  
**Target Repository**: `unified-streams`  
**Scope**: Gateway, Internal Workers (SA7, Nuvio, Vega), Telemetry, Configuration, Updaters, and Deployment Scripts.

---

## Executive Summary

A comprehensive architectural and code-level inspection was performed on the Unified Streams codebase to detect logic bugs, protocol violations, edge-case regressions, and concurrency issues. The findings are categorized into **Critical Functional Bugs**, **Observability & Telemetry Gaps**, **Concurrency & Security Issues**, and **Code Hygiene / Dead Code**.

---

## 1. Critical Functional Bugs

### 1.1 SA7 Worker Drops Streams with Unknown Resolution When Config is Present
- **Files**:
  - [`src/fleets/sa7/worker.js`](file:///root/iptv/unified-streams/src/fleets/sa7/worker.js#L102)
  - [`src/fleets/sa7/streams.js`](file:///root/iptv/unified-streams/src/fleets/sa7/streams.js#L175)
  - [`src/fleets/sa7/filters.js`](file:///root/iptv/unified-streams/src/fleets/sa7/filters.js#L136-L159)
- **Root Cause**:
  In `worker.js`, SA7 calls `collectStreams` passing the raw base64url config query string:
  ```js
  collectStreams(contentId, type, season, episode, query.get('config') || '')
  ```
  In `filters.js`, `streamPassesFilters(stream, config)` expects `config` to be a parsed filter object (`{ maxRes, keepUnknown, ... }`), **not** a raw base64 string.
  When `config` is a string:
  - `config.maxRes` evaluates to `undefined`, so `cfg.maxRes !== 'any'` is `true`.
  - `!config.keepUnknown` evaluates to `true`.
  - Every stream without an explicit resolution string in its title/name has `height == null` and is **immediately dropped** (`return false`)!
- **Impact**: Any configured Stremio request discards all SA7 streams with unknown resolutions. Per `AGENTS.md`, the gateway alone owns filtering; workers must not filter out streams based on unparsed configuration.
- **Remedy**: In `src/fleets/sa7/worker.js`, pass `DEFAULT_CONFIG` (or disable internal filtering in SA7) and let the gateway's `mergeAndFilterStreams` filter results.

---

### 1.2 SA7 Content ID Regex Fails on All Season Pack Requests
- **File**: [`src/fleets/sa7/content-id.js`](file:///root/iptv/unified-streams/src/fleets/sa7/content-id.js#L2-L4)
- **Root Cause**:
  The regex patterns for content IDs are:
  ```js
  { source: 'imdb', pattern: /^(tt\d+)(?::(\d+):(\d+))?$/ }
  { source: 'tmdb', pattern: /^tmdb:(\d+)(?::(\d+):(\d+))?$/ }
  ```
  The second group `(?::(\d+):(\d+))` requires **both** season and episode whenever a colon is present.
  When a season pack request arrives (`tt0944947:1` or `tmdb:1399:1`):
  1. `parseContentId` returns `null`.
  2. In `worker.js`, `contentId` falls back to the unparsed raw string `'tt0944947:1'`.
  3. SA7 attempts to resolve metadata via Cinemeta at `/meta/series/tt0944947:1.json`, which Cinemeta rejects with a 404.
  4. SA7 reports `no TMDB id resolved` and returns `0` streams.
- **Remedy**: Update the pattern to `/^(tt\d+)(?::(\d+)(?::(\d+))?)?$/` and `/^tmdb:(\d+)(?::(\d+)(?::(\d+))?)?$/`.

---

### 1.3 Nuvio and Vega Workers Reject Season 0 (Specials)
- **Files**:
  - [`src/fleets/nuvio/addon/parseId.ts`](file:///root/iptv/unified-streams/src/fleets/nuvio/addon/parseId.ts#L35)
  - [`src/fleets/vega/addon/parseId.ts`](file:///root/iptv/unified-streams/src/fleets/vega/addon/parseId.ts#L35)
- **Root Cause**:
  Both parsers enforce:
  ```ts
  if (!Number.isSafeInteger(season) || season < 1 || season > MAX_SEASON) return null;
  if (!Number.isSafeInteger(episode) || episode < 1 || episode > MAX_EPISODE) return null;
  ```
  `BUILD_PLAN.md` line 534 and Stremio conventions specify that season `0` represents specials (e.g. `tt0944947:0:1`). The gateway parser supports season 0, but Nuvio and Vega reject it, returning `{ streams: [] }`.
- **Remedy**: Update checks to allow `season >= 0` and `episode >= 0`.

---

### 1.4 Prefilled Configuration is Ignored in Configure UI
- **Files**:
  - [`src/addon/configureHtml.ts`](file:///root/iptv/unified-streams/src/addon/configureHtml.ts#L5)
  - [`src/addon/configure.ts`](file:///root/iptv/unified-streams/src/addon/configure.ts#L33)
- **Root Cause**:
  `handleConfigure` decodes the existing configuration URL and serializes `prefillJson`. But `renderConfigurePageHtml` marks the argument as `_prefillConfigJson` and never injects or consumes it on the client side.
- **Impact**: Visiting `/:config/configure` resets all user preferences (resolution ranges, size limits, language chips, fleet selections) back to defaults.
- **Remedy**: Inject `prefillJson` into the client `<script>` block and initialize form controls on load.

---

## 2. Observability & Health Reporting Issues

### 2.1 `/health` Reports Empty `updater: {}` and Zeroed Metadata Cache
- **Files**:
  - [`src/addon/health.ts`](file:///root/iptv/unified-streams/src/addon/health.ts#L121)
  - [`src/addon/stream.ts`](file:///root/iptv/unified-streams/src/addon/stream.ts#L10)
  - [`src/index.ts`](file:///root/iptv/unified-streams/src/index.ts#L45-L53)
- **Root Cause**:
  - `StreamHandlerContext` lacks a reference to `UpdaterScheduler`. Consequently, `buildHealthReport()` hardcodes `updater: {}`.
  - `MetadataResolver` in `src/core/metadata.ts` was implemented with full caching and stats (`getStats()`), but is not passed to `ctx`, leaving metadata cache stats hardcoded as `{ hits: 0, misses: 0, size: 0, maxEntries: 5000 }`.
- **Remedy**: Add `updaterScheduler?: UpdaterScheduler` and `metadataResolver?: MetadataResolver` to `StreamHandlerContext` and expose their live states in `/health`.

---

### 2.2 Docker Healthcheck Kills Container on Single-Worker Transient Restarts
- **Files**:
  - [`src/addon/health.ts`](file:///root/iptv/unified-streams/src/addon/health.ts#L98-L106)
  - [`scripts/healthcheck.mjs`](file:///root/iptv/unified-streams/scripts/healthcheck.mjs#L13)
- **Root Cause**:
  In `health.ts`, `report.ok` is set to `!isDegraded`, where `isDegraded` is `true` if any single fleet is down or restarting. `scripts/healthcheck.mjs` checks `if (json.ok)` and exits with code `1` if false.
  If one worker restarts (Supervisor restarts workers in 2s), the container fails healthcheck and Docker terminates all 3 fleets after 3 retries.
- **Remedy**: In `healthcheck.mjs`, exit 0 if `res.ok && json.status !== 'error'` (allowing degraded operation while single workers reboot).

---

### 2.3 Status Dashboard Crashes on HTTP 503
- **File**: [`src/addon/statusHtml.ts`](file:///root/iptv/unified-streams/src/addon/statusHtml.ts#L253-L256)
- **Root Cause**:
  `statusHtml.ts` fetches `/health` and throws if `!response.ok`. When all fleets fail, `/health` returns HTTP 503 with the diagnostic JSON. The dashboard catches this and displays a generic "unreachable / Health request failed: HTTP 503" instead of rendering the table with component and provider errors.
- **Remedy**: Parse JSON whenever `response.status === 200 || response.status === 503`.

---

### 2.4 Telemetry Type Mismatch for SA7 `lastError`
- **Files**:
  - [`src/fleets/sa7/lib/breaker.js`](file:///root/iptv/unified-streams/src/fleets/sa7/lib/breaker.js#L157)
  - [`src/addon/health.ts`](file:///root/iptv/unified-streams/src/addon/health.ts#L66)
  - [`src/core/telemetry.ts`](file:///root/iptv/unified-streams/src/core/telemetry.ts#L82)
- **Root Cause**:
  In SA7, `lastError` is an object `{ message, at }`, whereas `AggregateProviderMetric.lastError` in `telemetry.ts` is typed as `string | null`. In `health.ts`, it is assigned directly, violating strict typing and causing `[object Object]` to render in the status table.
- **Remedy**: Extract `stat.lastError.message` when `lastError` is an object.

---

## 3. Concurrency, Security & Edge Cases

### 3.1 Race Condition in `JikanClient` Rate Limiting
- **File**: [`src/core/jikan.ts`](file:///root/iptv/unified-streams/src/core/jikan.ts#L17-L40)
- **Root Cause**:
  `queue` and `isProcessing` are declared but never used. Multiple concurrent requests all inspect `lastRequestTimes` simultaneously, pass the check, and fire simultaneous upstream fetches to Jikan, causing HTTP 429 rate limits.
- **Remedy**: Implement a promise-based serialization queue for `waitForSlot()`.

---

### 3.2 Content-Security-Policy Uses `'unsafe-inline'`
- **Files**:
  - [`src/addon/configure.ts`](file:///root/iptv/unified-streams/src/addon/configure.ts#L25)
  - [`src/addon/status.ts`](file:///root/iptv/unified-streams/src/addon/status.ts#L22)
- **Root Cause**:
  Both routes specify `default-src 'self' 'unsafe-inline' https:;`, which violates `AGENTS.md` Section 5: *"Add security headers to HTML pages and use CSP nonces or hashes."*
- **Remedy**: Generate per-request nonces (`crypto.randomBytes(16).toString('base64')`), inject them into `<script nonce="...">`, and declare `'nonce-${nonce}'` in headers.

---

### 3.3 Container Rank Regex Misses URLs with Hash Fragments
- **File**: [`src/addon/merge.ts`](file:///root/iptv/unified-streams/src/addon/merge.ts#L78-L81)
- **Root Cause**:
  `/\.(mp4|mkv)($|\?)/.test(lower)` does not match URLs with hash fragments (e.g. `https://cdn.example.com/video.mp4#t=10`), falling back to rank 3 instead of rank 0.
- **Remedy**: Use `/\.(mp4|mkv)($|[?&#])/i.test(lower)`.

---

### 3.4 Dead Legacy Code in SA7
- **Files**:
  - [`src/fleets/sa7/server.js`](file:///root/iptv/unified-streams/src/fleets/sa7/server.js) (318 lines)
  - [`src/fleets/sa7/run.js`](file:///root/iptv/unified-streams/src/fleets/sa7/run.js) (76 lines)
- **Root Cause**:
  Legacy unmerged files defining obsolete standalone `/manifest.json` and `/subtitles/` servers that are never imported.
- **Remedy**: Remove both files to adhere to `AGENTS.md` Section 5 (*"Do not leave dead code, commented-out code, or unused exports"*).

---

### 3.5 Internal Worker Token Never Verified
- **Files**:
  - [`src/core/env.ts`](file:///root/iptv/unified-streams/src/core/env.ts#L146)
  - [`src/core/workerClient.ts`](file:///root/iptv/unified-streams/src/core/workerClient.ts#L28)
- **Root Cause**:
  `deriveFleetEnv` passes `INTERNAL_TOKEN` and `WorkerClient` sends `x-internal-token`, but `sa7/worker.js`, `nuvio/worker.ts`, and `vega/worker.ts` never inspect this header.
- **Remedy**: Add optional token verification middleware in workers when `process.env.INTERNAL_TOKEN` is present.
