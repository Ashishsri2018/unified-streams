# Architecture Decision Records (ADRs)

## ADR-001: Single Gateway with Internal Loopback Workers
- **Status**: Accepted
- **Context**: Wrapping three separate addons with individual manifests, configure UIs, and health checks caused duplicate caches, conflicting ports, and uncoordinated updaters.
- **Decision**: Consolidate into one gateway process exposing public endpoints. Fleet workers bind only to `127.0.0.1` and expose internal `/internal/*` routes with zero public visibility.

## ADR-002: Single Gateway Response Cache (Non-Empty Only)
- **Status**: Accepted
- **Context**: Caching empty results prevented transient upstream failures from recovering, while caching in workers led to stale double-caching.
- **Decision**: Disable worker caches (`STREAM_CACHE_TTL_MS=0`). Centralize caching in the gateway: 180s for complete responses, 30s for partial responses. Empty stream responses are never cached.

## ADR-003: Unified Configuration Schema v2
- **Status**: Accepted
- **Context**: Users need control over stream resolution (e.g. 720p max), file size limits, and subtitle languages without breaking older v1 links.
- **Decision**: Deploy schema v2 encoding with backward-compatible v1 decoding fallback.
