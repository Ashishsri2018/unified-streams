# Unified Streams

Unified Stremio stream addon combining SA7, Nuvio, and Vega provider fleets behind a single public gateway, single container, single configuration system, single cache, and unified telemetry.

## Features
- **One Gateway**: Single public HTTP server serving Stremio manifest, stream routes, configuration, health, and status dashboard.
- **Three Internal Fleets**: SA7, Nuvio, and Vega run as loopback worker processes (`127.0.0.1`).
- **One Stream Cache**: Response cache at the gateway with 180s TTL for full results and 30s TTL for partial results. Non-empty results only.
- **Unified Filtering**: Gateway filtering for resolution ranges and file size caps. Inline subtitle tracks returned with a stream are passed through unchanged.
- **Full ID Support**: Resolves IMDb (`tt`) and TMDB (`tmdb:`) directly. `mal:` IDs are mapped to a canonical IMDb/TMDB ID via AnimeAPI (Jikan + TMDB search fallback) before fleet fan-out. `kitsu:` IDs are first mapped to MAL through the Kitsu API and then follow the same path. `tvdb:` IDs resolve through TVMaze (series) and TMDB external-ID lookup (movies); the manifest advertises all five prefixes.
- **HTTP/1.1 Strict Compatibility**: Explicit `GET`, `HEAD`, and `OPTIONS` handling across all endpoints.
- **In-Process Updaters**: 20-24 hour jittered background refresh for provider definitions without external cron dependencies.

## Architecture
See [architecture.md](architecture.md) for detailed component architecture and request flow.

## Content IDs

The manifest advertises the `tt`, `tmdb:`, `mal:`, `kitsu:`, and `tvdb:` prefixes. Stream requests use `/stream/{movie|series}/{id}.json`.

| ID type | Movie | Series | Example |
|---|---|---|---|
| IMDb | `tt...` | `tt...:S:E` or `tt...:S` (season pack) | `tt0111161` |
| TMDB | `tmdb:N` | `tmdb:N:S:E` or `tmdb:N:S` (season pack) | `tmdb:1399:1:1` |
| MyAnimeList | `mal:N` | `mal:N:E` (season 1) or `mal:N:S:E` | `mal:1535:1:1` |
| Kitsu | `kitsu:N` | `kitsu:N:E` (season 1) or `kitsu:N:S:E` | `kitsu:1376:1:1` |
| TheTVDB | `tvdb:N` | `tvdb:N:S:E` or `tvdb:N:S` (season pack) | `tvdb:460458:1:1` |

MAL and Kitsu series require at least one numeric suffix: `N:E` is season 1, episode E; `N:S:E` is season S, episode E. Unlike IMDb/TMDB, a single suffix is interpreted as an episode, not a season pack. TVDB uses IMDb/TMDB semantics: `tvdb:N:S` is a season pack.

### How anime and TVDB IDs work

- Kitsu IDs are first resolved to a MAL ID through the Kitsu mappings API (`GET {KITSU_URL}/anime/{id}/mappings`, default `https://kitsu.io/api/edge`), then follow the MAL path below.
- TVDB series are resolved through TVMaze (`GET {TVMAZE_URL}/lookup/shows?thetvdb={id}`, default `https://api.tvmaze.com`). If TVMaze has no IMDb mapping, or for TVDB movies, the gateway uses TMDB's external-ID lookup (`/find/{id}?external_source=tvdb_id`) when `TMDB_API_KEY` is configured.
- The gateway queries AnimeAPI (`GET {ANIMEAPI_URL}/myanimelist/{id}`) for an IMDb/TMDB mapping, using at most 40% of the resolution budget so the fallback still has time to run. AnimeAPI's `themoviedb_type` selects the TMDB endpoint when a TMDB ID is used.
- If no mapping is found, it falls back to Jikan (title/year) plus a ranked TMDB title search. When a Kitsu ID has no MAL mapping, the Kitsu canonical title/year is used for the same TMDB search. The TMDB detail call is skipped when too little budget remains; the search result still yields a `tmdb:N` ID.
- The source ID is rewritten to the canonical `tt...` or `tmdb:N` ID (preserving season/episode suffixes) before fan-out, so all three fleets handle it with their normal IMDb/TMDB logic. If resolution fails, the response is HTTP 200 with `{ "streams": [] }` and no worker fan-out.
- `ANIMEAPI_URL`, `KITSU_URL`, and `TVMAZE_URL` can be overridden in `config/defaults.env` or a per-instance env file.
- Resolution uses a budget derived from `GLOBAL_DEADLINE_MS - BACKEND_TIMEOUT_MS` (clamped: 500–2000ms for anime, 250–5000ms for other metadata; 1s/2s anime on Beamup/Railway), so worker deadlines and platform proxy limits are unchanged. Kitsu mapping uses the first 35% of that budget and the MAL pipeline the remainder. TVDB uses the general metadata budget. Budget expiries and transient upstream failures are not cached as misses; only definitive 404s keep the 60s negative TTL, while other failures use a 5s TTL.

## Running with Docker

Unified Streams is packaged as a single, self-contained multi-stage Docker container running Node 22 on an unprivileged `node` user with `dumb-init`. The container bundles the public gateway along with all three internal fleet worker runtimes.

### Quick Start (Docker CLI)

1. **Build the image**:
   ```bash
   docker build -t unified-streams .
   ```

2. **Run the container**:
   ```bash
   docker run -d \
     --name unified-streams \
     -p 7000:7000 \
     -v $(pwd)/data:/data \
     -e INSTANCE_PROFILE=generic \
     -e PORT=7000 \
     -e DATA_DIR=/data \
     unified-streams
   ```

### Docker Compose

You can also deploy with `docker-compose.yml`:

```yaml
version: "3.8"

services:
  unified-streams:
    build: .
    image: unified-streams:latest
    container_name: unified-streams
    restart: unless-stopped
    ports:
      - "7000:7000"
    environment:
      - INSTANCE_PROFILE=generic
      - PORT=7000
      - DATA_DIR=/data
      - LOG_LEVEL=info
      # Optional API keys and secrets:
      # - TMDB_API_KEY=your_tmdb_key
      # - ANIMEAPI_URL=https://animeapi.my.id
      # - KITSU_URL=https://kitsu.io/api/edge
      # - TVMAZE_URL=https://api.tvmaze.com
      # - FEBBOX_UI_COOKIE=your_febbox_cookie
      # - GRAMCINEMA_TOKEN=your_gramcinema_token
      # - KARTOONS_TOKEN=your_kartoons_token
    volumes:
      - ./data:/data
```

### Container Details
- **Port Mapping**: Only port `7000` (the gateway) needs to be exposed. The internal workers (`7001` for SA7, `7002` for Nuvio, `7003` for Vega) run strictly on loopback (`127.0.0.1`) inside the container and are isolated from external traffic.
- **Data Persistence**: Mount a persistent volume at `/data` to store updater snapshots, downloaded provider assets, and runtime state across restarts.
- **Healthcheck**: The Docker image includes an automatic healthcheck via `node scripts/healthcheck.mjs` against the `/health` endpoint.

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

## Disclaimer & Legal Notice

- **Search Engine & Browser Model**: Unified Streams acts strictly as an automated search indexer and scraper, functioning like a web browser. It queries and indexes links publicly accessible on third-party websites and servers across the internet.
- **No Media Hosting**: Unified Streams does **not** host, upload, store, cache, encode, or re-transmit any media files, video streams, torrents, or copyrighted content. All media streams are delivered directly from independent, third-party hosting providers and web servers.
- **User Responsibility**: Users are solely responsible for ensuring that their use of this software complies with all applicable local, national, and international laws, copyright regulations, and third-party terms of service.

## Third-Party Licenses & Attribution

Unified Streams respects and strictly adheres to the open-source licenses of the upstream projects and provider runtimes it incorporates:

- **Vega Providers / Zenda-Cross**: Licensed under the **MIT License**.
- **Nuvio Plugin / Eclipsia**: Licensed under the **MIT License**.
- **SA7 ANI / cb-providers**: Licensed under the **GNU General Public License v3.0 (GPL-3.0)**.

All third-party code and provider definitions retain their original licenses and copyright notices. See [NOTICE.md](NOTICE.md) for full licensing details.
