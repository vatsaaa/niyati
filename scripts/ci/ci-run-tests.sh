#!/usr/bin/env bash
set -euo pipefail

# CI Test Runner for Niyati (scripts/ci/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

# Defaults
SKIP_E2E=0
SKIP_BACKEND=0
NO_CLEANUP=0
for arg in "$@"; do
  case "$arg" in
  --skip-e2e) SKIP_E2E=1 ;;
  --skip-backend) SKIP_BACKEND=1 ;;
  --no-cleanup) NO_CLEANUP=1 ;;
  esac
done

ARTIFACTS_COVERAGE_DIR="$PROJECT_ROOT/artifacts/coverage"
mkdir -p "$ARTIFACTS_COVERAGE_DIR"

# Load CI environment variables
if [[ -f "$PROJECT_ROOT/infra/.env.ci" ]]; then
  log_info "Loading CI environment from infra/.env.ci"
  set -a  # Export all variables
  source "$PROJECT_ROOT/infra/.env.ci"
  set +a
else
  log_warn "infra/.env.ci not found - using defaults"
fi

# =============================================================================
# DOCKER SETUP & TEARDOWN
# =============================================================================

COMPOSE_PROJECT="niyati-ci"
COMPOSE_CMD="docker compose --env-file infra/.env.ci -f infra/docker-compose.yml -f infra/docker-compose.ci.yml -p $COMPOSE_PROJECT"

cleanup() {
  if [[ "$NO_CLEANUP" -eq 0 ]]; then
    log_step "🧹 Cleaning up CI stack..."
    cd "$PROJECT_ROOT"
    $COMPOSE_CMD down -v --remove-orphans || true
  else
    log_info "Skipping cleanup (--no-cleanup)"
  fi
}

trap cleanup EXIT

log_step "🚀 Starting CI Docker stack..."
cd "$PROJECT_ROOT"

# Tear down any existing CI stack
$COMPOSE_CMD down -v --remove-orphans || true

# Start CI stack
$COMPOSE_CMD up -d --build

# Wait for postgres
log_info "Waiting for PostgreSQL..."
for i in $(seq 1 60); do
  if docker exec "${COMPOSE_PROJECT}-postgres-1" pg_isready -U "${POSTGRES_USER:-niyati}" >/dev/null 2>&1; then
    log_success "PostgreSQL ready"
    break
  fi
  sleep 1
done

# Create database if it doesn't exist
log_step "📦 Creating database..."
DB_NAME="${POSTGRES_DB:-niyati_ci}"
DB_USER="${POSTGRES_USER:-niyati}"
docker exec "${COMPOSE_PROJECT}-postgres-1" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || log_info "Database $DB_NAME already exists"

# Apply migrations
log_step "📦 Applying migrations..."
for f in "$PROJECT_ROOT/packages/migrations"/*.up.sql; do
  if [[ -f "$f" ]]; then
    log_info "Applying $(basename "$f")"
    docker exec -i "${COMPOSE_PROJECT}-postgres-1" psql -U "$DB_USER" -d "$DB_NAME" < "$f"
  fi
done

# Wait for services to be healthy
log_info "Waiting for services..."
sleep 5

BACKEND_EXIT=0
if [[ "$SKIP_BACKEND" -eq 0 ]]; then
  log_step "🧪 Running backend tests..."

  # Install commons
  npm ci --prefix packages/commons --prefer-offline --no-audit --silent

  # bff-platform tests (run package test script so coverage flag in package.json is respected)
  log_info "Testing bff-platform..."
  cd "$PROJECT_ROOT/apps/bff-platform"
  npm ci --include=dev --prefer-offline --no-audit --silent
  NODE_ENV=test npm test --silent || BACKEND_EXIT=1
  # collect coverage artifact if produced
  if [[ -d "coverage" ]]; then
    mkdir -p "$ARTIFACTS_COVERAGE_DIR/bff-platform"
    cp -r coverage/* "$ARTIFACTS_COVERAGE_DIR/bff-platform/" || true
  fi
  cd "$PROJECT_ROOT"

  # bff-auth tests (only if bff-platform passed)
  if [[ "$BACKEND_EXIT" -eq 0 ]]; then
    log_info "Testing bff-auth..."
    cd "$PROJECT_ROOT/apps/bff-auth"
    npm ci --include=dev --prefer-offline --no-audit --silent
    NODE_ENV=test npm test --silent || BACKEND_EXIT=1
    if [[ -d "coverage" ]]; then
      mkdir -p "$ARTIFACTS_COVERAGE_DIR/bff-auth"
      cp -r coverage/* "$ARTIFACTS_COVERAGE_DIR/bff-auth/" || true
    fi
    cd "$PROJECT_ROOT"
  fi

  if [[ "$BACKEND_EXIT" -eq 0 ]]; then
    log_success "Backend tests passed"
  else
    log_error "Backend tests failed"
  fi
else
  log_info "Skipping backend tests (--skip-backend)"
fi

# E2E step handled by top-level wrapper if requested
E2E_EXIT=0
if [[ "$SKIP_E2E" -eq 0 && "$BACKEND_EXIT" -eq 0 ]]; then
  log_step "🎭 Running E2E tests..."
  if [[ "${CI_COLLECT_E2E_COVERAGE:-0}" == "1" ]]; then
    log_info "Running E2E with server-side coverage collection"
    "$PROJECT_ROOT/scripts/run_e2e_with_coverage.sh" || E2E_EXIT=1
  else
    cd "$PROJECT_ROOT/e2e"
    npm install --include=dev
    npx playwright install chromium 2>/dev/null || true

    export REAL=1
    export BASE_URL="http://localhost:6173"
    npx playwright test --project=api || E2E_EXIT=1
    cd "$PROJECT_ROOT"
  fi

  [[ "$E2E_EXIT" -eq 0 ]] && log_success "E2E tests passed" || log_error "E2E tests failed"
else
  [[ "$SKIP_E2E" -eq 1 ]] && log_info "Skipping E2E tests (--skip-e2e)"
fi

if [[ "$BACKEND_EXIT" -ne 0 || "$E2E_EXIT" -ne 0 ]]; then
  log_fail "CI FAILED"
  exit 1
fi

# Merge coverage artifacts and enforce threshold if requested
if [[ "${CI_MERGE_COVERAGE:-1}" == "1" ]]; then
  log_step "🔀 Merging coverage artifacts"
  COVERAGE_THRESHOLD="${COVERAGE_THRESHOLD:-100}" "$SCRIPT_DIR/../merge_coverage.sh" || {
    log_error "Coverage merge failed or threshold not met"
    exit 1
  }
  log_success "✅ ALL CI TESTS PASSED"
else
  log_success "✅ ALL CI TESTS PASSED (coverage merge skipped)"
fi
exit 0
