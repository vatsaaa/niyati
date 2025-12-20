#!/usr/bin/env bash
set -euo pipefail

echo "Running hardened smoke tests against local containers"

SMOKE_MAX_RETRIES=${SMOKE_MAX_RETRIES:-10}
SMOKE_SLEEP_BASE=${SMOKE_SLEEP_BASE:-2}

check_with_retries() {
  local url="$1"
  local attempt=1
  local max=${2:-$SMOKE_MAX_RETRIES}

  echo "Checking $url (up to $max attempts)"
  while [ $attempt -le $max ]; do
    if curl -fsS --max-time 8 "$url" >/dev/null 2>&1; then
      echo "OK: $url"
      return 0
    fi
    echo "Attempt $attempt/$max failed for $url"
    attempt=$((attempt+1))
    sleep_seconds=$((SMOKE_SLEEP_BASE * attempt))
    sleep $sleep_seconds
  done
  echo "FAIL after $max attempts: $url"
  return 1
}

# List of endpoints to verify
endpoints=(
  "http://127.0.0.1:3005/api/v1/telemetry/health"
  "http://127.0.0.1:3006/api/v1/telemetry/health"
  "http://127.0.0.1:5175/"
  "http://127.0.0.1:3005/api/v1/identify"
)

failed=0
for url in "${endpoints[@]}"; do
  if ! check_with_retries "$url"; then
    failed=1
  fi
done

if [ $failed -ne 0 ]; then
  echo "One or more smoke checks failed"
  exit 1
fi

echo "Smoke tests passed"
