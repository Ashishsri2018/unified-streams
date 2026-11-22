# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
### Added
- `mal:` stream IDs now resolve end-to-end: AnimeAPI supplies the canonical IMDb/TMDB mapping, with Jikan title/year plus TMDB search as fallback, and the gateway fan-out uses the rewritten ID with season/episode suffixes preserved. The manifest always advertises `mal:`.
- `kitsu:` stream IDs are now supported and advertised in the manifest. The gateway maps Kitsu to MAL through the Kitsu mappings API (`KITSU_URL`), then reuses the MAL resolution pipeline; when no MAL mapping exists it falls back to the Kitsu title/year plus TMDB search. This makes AIOMetadata anime catalogs (such as MAL Top Series, whose episode IDs are `kitsu:...`) work end-to-end.
- `tvdb:` stream IDs are now supported and advertised in the manifest. TVDB series resolve through TVMaze (`TVMAZE_URL`) to an IMDb ID; TVDB movies and series without a TVMaze IMDb mapping use TMDB's `external_source=tvdb_id` lookup when `TMDB_API_KEY` is configured. Unresolved TVDB IDs return HTTP 200 with empty streams and no worker fan-out.

### Changed
- Provider health now exposes `responseRate` (renamed from `successRate`) and a separate `yieldRate` (`responded / calls`) across `/health`, `/stats`, and `/status`. Providers that respond but never return streams are no longer presented as fully healthy. This is a breaking JSON rename for direct consumers of those endpoints.
- MAL metadata resolution uses a budget derived from `GLOBAL_DEADLINE_MS - BACKEND_TIMEOUT_MS` (clamped to 500–2000ms: 1s on Beamup, 2s on Railway), with AnimeAPI capped at 40% of that budget so the Jikan/TMDB fallback can still complete. The same headroom now bounds all metadata lookups, not just MAL.
- MAL resolution honours AnimeAPI's `themoviedb_type`, ranks TMDB search results by title/year instead of taking the first hit, skips the TMDB detail call when the budget is nearly exhausted, and no longer negatively caches budget expiries or transient failures (definitive 404s keep a 60s TTL, other failures use 5s). AnimeAPI responses are size-capped.
- The Docker healthcheck is now a pure liveness probe (`HEAD /health`) and no longer parses the health report body, so a transient single-fleet restart cannot falsely mark the container unhealthy.
- HTML pages now apply their CSP nonce to inline `<style>` as well as `<script>`, and `'unsafe-inline'` was removed from `style-src`.
- Closed the remaining `todo.md` items: dropped the three operational entries, and verified configure prefill and SA7 `server.js`/`run.js` removal were already resolved.
- Removed the unused Vega client rate limiter (`RateLimiter`) and its six dead `STREAM_*`/`PROXY_*` rate-limit configuration fields. No requests were ever rate-limited; this deletes unused code only.
- Redesigned `/configure` with grouped stream filters, a live human-readable filter summary, inline validation, and a clearer install flow. Provider fleet selection was removed; install links always enable all three fleets.
- Provider policy now uses deny lists on every profile so new providers added upstream are enabled automatically. Railway treats Nuvio as the primary fleet, disabling Vega providers duplicated in Nuvio and SA7 providers duplicated in Nuvio or Vega; Beamup preserves its existing active set without freezing out future providers.
- Hard-disabled BDIX scrapers (`bdix-cf`, `bdix-df`, `bdix-fh`) on every instance alongside torrent, Internet Archive, YouTube, and live-TV providers.
- Inline `stream.subtitles` tracks are no longer filtered or rewritten by the gateway; provider subtitle tracks pass through unchanged.

### Fixed
- Gateway-to-worker loopback requests now use the native `fetch` instead of Vega's process-wide provider transport shim. Previously those calls inherited Vega's `HTTP_TIMEOUT_MS` (15s) and were aborted long before the configured Railway `BACKEND_TIMEOUT_MS` (27s), so slower fleets returned empty/partial results for series like *The 100*. The fix covers SA7, Nuvio, and Vega, plus worker reload/health calls.
- A `mal:` movie request whose AnimeAPI mapping is a TV title no longer queries the TMDB movie endpoint, and TMDB title search no longer accepts an unrelated first result.
- The `/status` dashboard now renders a 503 `/health` response instead of showing "unreachable"; those responses still carry a full, renderable health report.
- SA7 `lastError` objects are normalized to readable strings in `/health`, `/stats`, and `/status` instead of showing `[object Object]`.
- Automatic provider updates now work for SA7: the scheduler downloads `SA7ANI/cb-providers` into `DATA_DIR/sa7/cb-providers`, seeds that directory from the bundled snapshot, swaps files atomically, and points the worker at the updated manifest. The scheduler also waits for worker readiness before the startup update, treats a failed reload as a failed check without advancing the stored SHA, and retries after 5 minutes.
- Route archives (`.zip`, `.rar`, `.7z`, etc.) to `externalUrl` because mobile players cannot open them; they keep the `🔲` name prefix and gain the `🖥️` title prefix. Extensionless URLs (such as `dash-hls-bridge` or direct CDN endpoints) remain direct playable streams in `url`.
- Revert timeout defaults to `GLOBAL_DEADLINE_MS=13000` and `BACKEND_TIMEOUT_MS=12000` (11s worker budget), ensuring cold requests return before Beamup's ~13.2s proxy cutoff and preventing Cloudflare 504 gateway timeouts.
- Add `🖥️` identification emoji prefix to the title of all `externalUrl` streams during gateway normalization.
- Nuvio and Vega workers now derive their global deadline from `BACKEND_TIMEOUT_MS` minus a 1s margin, so partial results return before the gateway aborts the worker request.
- Lower default `BACKEND_TIMEOUT_MS` to 12000 and `GLOBAL_DEADLINE_MS` to 13000, giving workers an 11s deadline. Live cache-busted requests showed the Beamup proxy cutting responses as early as ~14s; the previous 18s budget returned Cloudflare 504s, while the 12s budget returns partial results at ~11s.
- Disable Vega settle timers (`SETTLE_MS=0`, `EMPTY_FENCE_MS=0`). Slow providers now use the full worker deadline instead of being aborted early after a pause in progress.
- Remove `--no-restart` from the CI Dokku environment sync; the Beamup wrapper rejects it, so secrets were never applied.
- Vega now records deadline-truncated providers as `skipped` instead of `ok + empty`, so health and stats no longer report timeout starvation as genuine empty results.
- SA7 now receives the derived `ADDON_DEADLINE_MS` (and matching stream-cap/circuit env names) instead of falling back to its 25s default.
- Nuvio bounds TMDB resolution and snapshot loading by the request deadline.
- Worker stream handlers abort in-flight provider work when the gateway disconnects.
- Gateway cache coalescing preserves the partial flag so partial results use the 30s gateway TTL.
- Responses arriving at the derived worker deadline are treated as partial even when a worker returns HTTP 200.
- Stream responses send `cache-control: no-store`; Cloudflare is used for log delivery only and no CDN cache headers are sent. The 180s/30s TTLs remain internal to the gateway cache.

## [1.0.0] - 2026-11-12
### Added
- Initial release of Unified Streams clean build.
- Single public gateway with Stremio manifest, stream handler, configure UI, health, and stats.
- Integrated SA7, Nuvio, and Vega provider runtimes as internal loopback workers.
- Gateway cache with 180s full / 30s partial TTL (non-empty only).
- Unified configuration schema v2 with v1 backward compatibility.
- Resolution, size, and subtitle language filters.
- Support for IMDb, TMDB, and MAL content IDs.
