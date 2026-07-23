#!/bin/sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repository_root"

clean_dependencies=false
if [ "${1:-}" = "--dependencies" ]; then
  clean_dependencies=true
elif [ "$#" -gt 0 ]; then
  echo "Usage: pnpm clean[:all]" >&2
  exit 2
fi

find apps packages minecraft tools -type d \
  \( -name dist -o -name target -o -name .next -o -name .turbo -o -name coverage \) \
  -prune -exec rm -rf {} +
rm -rf .turbo

if [ "$clean_dependencies" = true ]; then
  find apps packages minecraft tools -type d -name node_modules -prune -exec rm -rf {} +
  rm -rf node_modules
  echo "Removed reproducible build output and installed dependencies."
else
  echo "Removed reproducible build output."
fi
