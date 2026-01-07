#!/usr/bin/env bash
set -euo pipefail

# Wrapper to prepare CI-like environment locally and optionally run Playwright E2E.
# Usage: scripts/run_independent_tests_local.sh [--e2e]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [ ! -f .env.ci ]; then
  echo ".env.ci not found in repo root; aborting"
  exit 1
fi

echo "Exporting .env.ci..."
export $(grep -v '^#' .env.ci | xargs)

COMPOSE_CMD="docker compose --env-file .env.ci -f docker-compose.yml -f docker-compose.ci.yml -p niyati-ci"

echo "Tearing down any previous CI stack (safe to ignore errors)..."
$COMPOSE_CMD down -v --remove-orphans || true

echo "Starting CI overlay..."
$COMPOSE_CMD up -d --build

echo "Waiting for Postgres to become ready (up to 60s)..."
for i in $(seq 1 60); do
  $COMPOSE_CMD exec -T postgres pg_isready -U "${POSTGRES_USER:-niyati}" -d "${POSTGRES_DB:-niyati_ci}" >/dev/null 2>&1 && break || sleep 1
done

echo "Applying migrations..."
for f in packages/migrations/*.up.sql; do
  echo "  -> applying $f"
  cat "$f" | $COMPOSE_CMD exec -T postgres psql -U "${POSTGRES_USER:-niyati}" -d "${POSTGRES_DB:-niyati_ci}"
done

if [ -f be/seed_ci.sql ]; then
  echo "Applying seed_ci.sql..."
  cat be/seed_ci.sql | $COMPOSE_CMD exec -T postgres psql -U "${POSTGRES_USER:-niyati}" -d "${POSTGRES_DB:-niyati_ci}"
fi

echo "Environment ready at http://localhost:${CADDY_PORT:-6173}"

if [ "${1:-}" = "--e2e" ]; then
  echo "Running E2E: installing e2e deps and running Playwright..."
  cd "$REPO_ROOT/e2e"
  npm ci
  npx playwright install --with-deps
  BASE_URL="http://localhost:${CADDY_PORT:-6173}" npx playwright test
fi

echo "Done. To run full CI suite, run: ./scripts/ci-run-tests.sh"
