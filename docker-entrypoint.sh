#!/usr/bin/env sh
set -e

# Reduce glibc malloc arena overhead for the Node runtime.
export MALLOC_ARENA_MAX="${MALLOC_ARENA_MAX:-1}"

if [ -z "${NODE_OPTIONS:-}" ]; then
  export NODE_OPTIONS="--max-old-space-size=${HEAP_MAX_MB:-160} --max-semi-space-size=${SEMI_SPACE_MB:-8}"
fi

# Ensure data directories exist
mkdir -p "${DATA_DIR:-/data}/tmp" \
         "${DATA_DIR:-/data}/sa7" \
         "${DATA_DIR:-/data}/nuvio" \
         "${DATA_DIR:-/data}/vega"

# Sourced defaults if available
if [ -f "config/defaults.env" ]; then
  # export non-comment lines
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      \#*|"") continue ;;
      *)
        key="${line%%=*}"
        # Only set if not already present in environment
        eval "current=\${$key}"
        if [ -z "$current" ]; then
          export "$line"
        fi
        ;;
    esac
  done < config/defaults.env
fi

exec "$@"
