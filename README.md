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
See [architecture.md](architecture.md) for detailed component architecture and request flow.

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
