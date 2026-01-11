#!/usr/bin/env bash
set -euo pipefail

# Run E2E tests with server-side coverage collection for BFF services.
# Starts bff-platform and bff-auth locally under c8 (V8 coverage), runs Playwright,
# then collects coverage artifacts into artifacts/coverage/e2e.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

ARTIFACTS_DIR="$PROJECT_ROOT/artifacts/coverage/e2e"
mkdir -p "$ARTIFACTS_DIR"

export NODE_ENV=test

PORT_PLATFORM=${BFF_PLATFORM_PORT:-4000}
PORT_AUTH=${BFF_AUTH_PORT:-4001}

echo "[e2e-coverage] Starting bff-platform under coverage on port $PORT_PLATFORM"
cd "$PROJECT_ROOT/apps/bff-platform"
npm ci --prefer-offline --no-audit --silent
# Start with c8; output will be in coverage/ by default
npx c8 --reporter=lcov --reporter=json --reporter=text -- npm start &
PLATFORM_PID=$!
sleep 2

echo "[e2e-coverage] Starting bff-auth under coverage on port $PORT_AUTH"
cd "$PROJECT_ROOT/apps/bff-auth"
npm ci --prefer-offline --no-audit --silent
npx c8 --reporter=lcov --reporter=json --reporter=text -- npm start &
AUTH_PID=$!

# Wait for services to become healthy (simple check)
echo "[e2e-coverage] Waiting for services to be ready..."
for i in $(seq 1 30); do
  if curl -s -f "http://localhost:${PORT_PLATFORM}/api/v1/telemetry/health" >/dev/null 2>&1 && \
     curl -s -f "http://localhost:${PORT_AUTH}/api/v1/telemetry/health" >/dev/null 2>&1; then
    echo "[e2e-coverage] Services healthy"
    break
  fi
  sleep 1
done

echo "[e2e-coverage] Running Playwright tests (api)..."
cd "$PROJECT_ROOT/e2e"
npm ci --prefer-offline --no-audit --silent
npx playwright install chromium >/dev/null 2>&1 || true
BASE_URL="http://127.0.0.1:${PORT_PLATFORM}" npx playwright test --project=api || E2E_EXIT=1

echo "[e2e-coverage] Stopping BFF services..."
kill $PLATFORM_PID || true
kill $AUTH_PID || true
wait $PLATFORM_PID 2>/dev/null || true
wait $AUTH_PID 2>/dev/null || true

# Collect coverage artifacts
echo "[e2e-coverage] Collecting coverage artifacts"
if [[ -d "$PROJECT_ROOT/apps/bff-platform/coverage" ]]; then
  mkdir -p "$ARTIFACTS_DIR/bff-platform"
  cp -r "$PROJECT_ROOT/apps/bff-platform/coverage"/* "$ARTIFACTS_DIR/bff-platform/" || true
fi
if [[ -d "$PROJECT_ROOT/apps/bff-auth/coverage" ]]; then
  mkdir -p "$ARTIFACTS_DIR/bff-auth"
  cp -r "$PROJECT_ROOT/apps/bff-auth/coverage"/* "$ARTIFACTS_DIR/bff-auth/" || true
fi

echo "[e2e-coverage] Done. Coverage artifacts available under $ARTIFACTS_DIR"
exit 0
