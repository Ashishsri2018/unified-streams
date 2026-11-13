# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
### Fixed
- Nuvio and Vega workers now derive their global deadline from `BACKEND_TIMEOUT_MS` minus a 1s margin, so partial results return before the gateway aborts the worker request.
- SA7 now receives the derived `ADDON_DEADLINE_MS` (and matching stream-cap/circuit env names) instead of falling back to its 25s default.
- Nuvio bounds TMDB resolution and snapshot loading by the request deadline.
- Worker stream handlers abort in-flight provider work when the gateway disconnects.
- Gateway cache coalescing preserves the partial flag so partial responses emit `max-age=30`.
- Responses arriving at the derived worker deadline are treated as partial even when a worker returns HTTP 200.
- Stream responses send `private, max-age=180/30` with `cloudflare-cdn-cache-control` to prevent Beamup's Cloudflare zone from rewriting the browser TTL to 4h.

## [1.0.0] - 2026-11-12
### Added
- Initial release of Unified Streams clean build.
- Single public gateway with Stremio manifest, stream handler, configure UI, health, and stats.
- Integrated SA7, Nuvio, and Vega provider runtimes as internal loopback workers.
- Gateway cache with 180s full / 30s partial TTL (non-empty only).
- Unified configuration schema v2 with v1 backward compatibility.
- Resolution, size, and subtitle language filters.
- Support for IMDb, TMDB, and MAL content IDs.
