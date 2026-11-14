# Unified Streams

Unified Stremio stream addon combining SA7, Nuvio, and Vega provider fleets behind a single public gateway, single container, single configuration system, single cache, and unified telemetry.

## Features
- **One Gateway**: Single public HTTP server serving Stremio manifest, stream routes, configuration, health, and status dashboard.
- **Three Internal Fleets**: SA7, Nuvio, and Vega run as loopback worker processes (`127.0.0.1`).
- **One Stream Cache**: Response cache at the gateway with 180s TTL for full results and 30s TTL for partial results. Non-empty results only.
- **Unified Filtering**: Gateway filtering for resolution ranges and file size caps. Inline subtitle tracks returned with a stream are passed through unchanged.
- **Full ID Support**: Resolves IMDb (`tt`), TMDB (`tmdb:`), and MyAnimeList (`mal:`).
- **HTTP/1.1 Strict Compatibility**: Explicit `GET`, `HEAD`, and `OPTIONS` handling across all endpoints.
- **In-Process Updaters**: 20-24 hour jittered background refresh for provider definitions without external cron dependencies.

## Architecture
See [architecture.md](docs/architecture.md) for detailed component architecture and request flow.

## Running Locally
```bash
npm install
npm run dev
```

## Testing & Verification
```bash
npm run test:feature  # Run targeted feature tests
npm run verify        # CI verification suite: policy, icon, lint, typecheck, tests, build
```
