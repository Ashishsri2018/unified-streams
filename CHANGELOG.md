# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
### Fixed
- Restrict `externalUrl` classification strictly to HTML pages; extensionless URLs (such as `dash-hls-bridge` or direct CDN endpoints) remain direct playable streams in `url`, and compressed files (`.zip`, `.rar`, etc.) remain in `url` with a `🔲 ` emoji prefix added to their `name`.
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
