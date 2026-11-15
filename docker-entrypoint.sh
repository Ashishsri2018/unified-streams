#!/usr/bin/env sh
set -e

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
