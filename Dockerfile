# syntax=docker/dockerfile:1

# Stage 1: Dependencies
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Stage 2: Build
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

# Stage 3: Runtime
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=7000 \
    DATA_DIR=/data \
    HOME=/data \
    TMPDIR=/data/tmp

RUN mkdir -p /data/tmp \
    && apt-get update \
    && apt-get install -y --no-install-recommends dumb-init ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY config ./config
COPY assets ./assets
COPY scripts ./scripts
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Copy vendored files and snapshots needed at runtime
COPY src/fleets/sa7 ./dist/fleets/sa7
COPY src/fleets/nuvio/snapshot ./dist/fleets/nuvio/snapshot
COPY src/fleets/vega/providers-baseline ./dist/fleets/vega/providers-baseline

RUN chmod 755 /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /data/tmp /data/sa7 /data/nuvio /data/vega \
    && chown -R node:node /data

USER node
EXPOSE 7000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "scripts/healthcheck.mjs"]

ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
