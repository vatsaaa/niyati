#!/usr/bin/env bash
set -e

REPO_ROOT="$(pwd)"
echo "Starting CI test script from ${REPO_ROOT}"

# 1. Start the Stack (Force CI configuration)
echo "🚀 Starting Docker Stack for CI (with mock n8n)..."
# don't fail the script if one container reports unhealthy; continue and verify readiness below
docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d --build || true

# 1b. Restart Caddy to ensure it picks up any Caddyfile changes
# (needed because caddy might be "Running" from a previous session while Caddyfile was edited)
echo "🔄 Restarting Caddy to ensure latest Caddyfile is loaded..."
docker compose -f docker-compose.yml -f docker-compose.ci.yml restart caddy || true

# 2. Wait for Postgres inside compose
echo "⏳ Waiting for Postgres inside compose..."
for i in $(seq 1 60); do
  docker compose -f docker-compose.yml -f docker-compose.ci.yml exec -T postgres pg_isready -U ${POSTGRES_USER:-niyati} -d ${POSTGRES_DB:-niyati_dev} >/dev/null 2>&1 || true
  docker compose -f docker-compose.yml -f docker-compose.ci.yml exec -T postgres pg_isready -U ${POSTGRES_USER:-niyati} -d ${POSTGRES_DB:-niyati_dev} >/dev/null 2>&1 && break || sleep 1
done

# 3. Run migrations and seeds inside the postgres container
echo "📦 Applying migrations inside compose Postgres..."
for f in $(ls -1 be/migrations/*.up.sql | sort); do
  echo "Applying $f"
  cat "$f" | docker compose -f docker-compose.yml -f docker-compose.ci.yml exec -T postgres psql -U ${POSTGRES_USER:-niyati} -d ${POSTGRES_DB:-niyati_dev}
done

if [ -f be/seed_ci.sql ]; then
  echo "Applying be/seed_ci.sql inside compose Postgres..."
  cat be/seed_ci.sql | docker compose -f docker-compose.yml -f docker-compose.ci.yml exec -T postgres psql -U ${POSTGRES_USER:-niyati} -d ${POSTGRES_DB:-niyati_dev} || { echo "Failed to apply be/seed_ci.sql"; exit 5; }
else
  echo "be/seed_ci.sql not found, skipping seed step"
fi

# 4. Ensure devDependencies inside bff-platform container so tests (supertest, jest) are present.
echo "🛠️ Installing devDependencies inside bff-platform container..."
docker compose -f docker-compose.yml -f docker-compose.ci.yml exec -T bff-platform npm install --include=dev || true


# 5. Run bff-platform tests LOCALLY against compose Postgres (exposed on 55432)
echo "🧪 Running bff-platform tests locally against compose Postgres..."
cd be/bff-platform
npm ci --include=dev
DATABASE_URL="postgresql://${POSTGRES_USER:-niyati}:${POSTGRES_PASSWORD:-niyati_dev_pass}@127.0.0.1:55432/${POSTGRES_DB:-niyati_dev}" NODE_ENV=test npm test || { echo "bff-platform tests failed"; exit 2; }

# 6. Run bff-auth tests LOCALLY against compose Postgres
echo "🧪 Running bff-auth tests locally against compose Postgres..."
cd ../bff-auth
npm ci --include=dev
DATABASE_URL="postgresql://${POSTGRES_USER:-niyati}:${POSTGRES_PASSWORD:-niyati_dev_pass}@127.0.0.1:55432/${POSTGRES_DB:-niyati_dev}" NODE_ENV=test npm test || { echo "bff-auth tests failed"; exit 3; }

# 7. Optional: run UI or other checks here

# --- NEW SECTION: Run E2E Tests ---
echo "🎭 Preparing E2E Tests..."

# Get the absolute path of the repo root (try script-relative, fallback to caller cwd)
# Use BASH_SOURCE to reliably locate the script file when possible
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" >/dev/null 2>&1 && pwd || true)"
if [ -n "$SCRIPT_DIR" ] && [ -d "$SCRIPT_DIR" ]; then
  SCRIPT_REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
else
  SCRIPT_REPO_ROOT="$REPO_ROOT"
fi
E2E_DIR="$SCRIPT_REPO_ROOT/e2e"

echo "📍 Repo Root (invocation): $REPO_ROOT"
echo "📍 Repo Root (script-resolved): $SCRIPT_REPO_ROOT"
echo "📍 Looking for E2E at: $E2E_DIR"

if [ -d "$E2E_DIR" ]; then
  echo "✅ E2E directory found. Running tests..."
  cd "$E2E_DIR"

  # Install deps if node_modules is missing
  if [ ! -d "node_modules" ]; then
    echo "📦 Installing Playwright dependencies..."
    npm ci
  fi

  # Run the tests
  export REAL=1
  # Use 'localhost' so Caddy host-based routing and server blocks match
  export BASE_URL=http://localhost:5173
  # Ensure UI is reachable at BASE_URL; if not, build+serve a local UI for tests
  UI_PID=""
  if ! curl -sSf "${BASE_URL}/" >/dev/null 2>&1; then
    echo "UI not reachable at ${BASE_URL}; building and serving local UI..."
    if [ -d "$SCRIPT_REPO_ROOT/ui" ]; then
      (cd "$SCRIPT_REPO_ROOT/ui" && npm ci && npm run build) || { echo "UI build failed"; E2E_EXIT_CODE=1; }
      # serve the built UI on port 5173
      # Use npx --yes to avoid interactive install prompts in CI
      npx --yes http-server "$SCRIPT_REPO_ROOT/ui/dist" -p 5173 --silent >/tmp/ui-server.log 2>&1 &
      UI_PID=$!
      echo "Started local UI server (pid=${UI_PID}), waiting for it to become available..."
      for i in $(seq 1 30); do
        curl -sSf "${BASE_URL}/" >/dev/null 2>&1 && break || sleep 1
      done
    else
      echo "No ui directory found at $SCRIPT_REPO_ROOT/ui; cannot start UI for E2E"
      E2E_EXIT_CODE=1
    fi
  fi

  # Wait for proxied API (Caddy) AND UI to be healthy before running Playwright
  echo "⏳ Waiting for proxied API (Caddy) to report healthy..."
  API_READY=0
  for i in $(seq 1 60); do
    if curl -sSf "${BASE_URL}/api/v1/telemetry/health" >/dev/null 2>&1; then
      echo "✅ Proxied API is healthy via ${BASE_URL}/api/v1/telemetry/health"
      API_READY=1
      break
    fi
    echo -n "."
    sleep 1
  done

  if [ "$API_READY" -ne 1 ]; then
    echo "❌ Proxied API did not become healthy within timeout"
    E2E_EXIT_CODE=3
  fi

  # Also wait for UI service to serve the index.html (Caddy proxies /* -> ui-service)
  echo "⏳ Waiting for UI service to be ready (serving index.html)..."
  UI_READY=0
  for i in $(seq 1 60); do
    # Check that root returns 200 and contains something that looks like HTML
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/")
    if [ "$HTTP_CODE" = "200" ]; then
      # Double-check it's actually returning HTML content, not a 200 error page
      BODY_SNIPPET=$(curl -s "${BASE_URL}/" | head -c 200)
      if echo "$BODY_SNIPPET" | grep -q "<html\|<!DOCTYPE\|<div id=\"root\""; then
        echo "✅ UI service is ready (serving HTML at ${BASE_URL}/)"
        UI_READY=1
        break
      fi
    fi
    echo -n "."
    sleep 1
  done

  if [ "$UI_READY" -ne 1 ]; then
    echo "❌ UI service did not become ready within timeout (last HTTP code: ${HTTP_CODE})"
    E2E_EXIT_CODE=4
  fi

  if [ "${E2E_EXIT_CODE:-0}" -eq 0 ]; then
    npx playwright test --project=api
    E2E_EXIT_CODE=$?
  fi
else
  echo "⚠️  E2E directory NOT found at $E2E_DIR"
  echo "   Current contents of root: $(ls "$REPO_ROOT")"
  E2E_EXIT_CODE=1
fi

cd "$REPO_ROOT"

# 8. Cleanup: stop compose stack

echo "🧹 Cleaning up compose stack..."
# ensure we run docker compose down from repo root (we may have cd'd into subfolders)
cd "${REPO_ROOT}"
docker compose -f docker-compose.yml -f docker-compose.ci.yml down -v --remove-orphans || true

if [ "${E2E_EXIT_CODE:-0}" -ne 0 ]; then
  echo "❌ E2E Tests Failed!"
  exit ${E2E_EXIT_CODE}
fi

echo "✅ ALL TESTS PASSED (Backend + E2E)"

