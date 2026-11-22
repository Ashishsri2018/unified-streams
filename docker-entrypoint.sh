#!/usr/bin/env sh
set -e

# Reduce glibc malloc arena overhead for the Node runtime.
export MALLOC_ARENA_MAX="${MALLOC_ARENA_MAX:-1}"

if [ -z "${NODE_OPTIONS:-}" ]; then
  export NODE_OPTIONS="--max-old-space-size=${HEAP_MAX_MB:-700} --max-semi-space-size=${SEMI_SPACE_MB:-8}"
fi

# Ensure data directories exist
mkdir -p "${DATA_DIR:-/data}/tmp" \
         "${DATA_DIR:-/data}/sa7" \
         "${DATA_DIR:-/data}/nuvio" \
         "${DATA_DIR:-/data}/vega"

exec "$@"
