#!/usr/bin/env sh
set -e

# Reduce glibc malloc arena overhead for the multi-process Node runtime.
# Must be set before Node starts; setting it at runtime has no effect.
export MALLOC_ARENA_MAX="${MALLOC_ARENA_MAX:-1}"

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
