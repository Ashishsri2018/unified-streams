# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-11-12
### Added
- Initial release of Unified Streams clean build.
- Single public gateway with Stremio manifest, stream handler, configure UI, health, and stats.
- Integrated SA7, Nuvio, and Vega provider runtimes as internal loopback workers.
- Gateway cache with 180s full / 30s partial TTL (non-empty only).
- Unified configuration schema v2 with v1 backward compatibility.
- Resolution, size, and subtitle language filters.
- Support for IMDb, TMDB, and MAL content IDs.
