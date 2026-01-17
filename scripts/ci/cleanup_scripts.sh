#!/usr/bin/env bash
set -euo pipefail

# Removes redundant top-level script files that were moved into scripts/docker/ and scripts/mocks/
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPTS_DIR="$BASE_DIR/scripts"

FILES=(
  "mock-n8n.js"
  "mock-webhook.js"
  "simulate_webhook.js"
  "sample_event.json"
  "wait-for-db.sh"
  "entrypoint.sh"
  "healthcheck-http.sh"
)

for f in "${FILES[@]}"; do
  path="$SCRIPTS_DIR/$f"
  if [[ -e "$path" ]]; then
    echo "Removing $path"
    rm -f "$path"
  else
    echo "Not found: $path"
  fi
done

echo "Cleanup complete."
