#!/usr/bin/env bash
# =============================================================================
# CI Test Runner for Niyati
# =============================================================================
# Idempotent CI script: tears down any existing stack, starts fresh, runs tests,
# and cleans up on exit (success or failure).
#
# Usage: ./scripts/ci-run-tests.sh [OPTIONS]
#
# Options:
#   --skip-e2e      Skip E2E tests, run only backend unit tests
#   --skip-backend  Skip backend tests, run only E2E
#   --no-cleanup    Don't tear down stack after tests (for debugging)
#   --verbose       Show detailed output
#   -h, --help      Show this help
# =============================================================================

set -euo pipefail

# =============================================================================
# INITIALIZATION
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

PROJECT_ROOT="$(find_project_root "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Directory to collect coverage artifacts from each package
ARTIFACTS_COVERAGE_DIR="$PROJECT_ROOT/artifacts/coverage"
mkdir -p "$ARTIFACTS_COVERAGE_DIR"

# Options
SKIP_E2E=0
SKIP_BACKEND=0
NO_CLEANUP=0
VERBOSE=0

# =============================================================================
# ARGUMENT PARSING
# =============================================================================

show_help() {
    sed -n '2,/^# ====/p' "$0" | grep '^#' | sed 's/^# //'
    exit 0
}

for arg in "$@"; do
    case $arg in
        -h|--help)      show_help ;;
        --skip-e2e)     SKIP_E2E=1 ;;
        --skip-backend) SKIP_BACKEND=1 ;;
        --no-cleanup)   NO_CLEANUP=1 ;;
        --verbose)      VERBOSE=1 ;;
        *) log_error "Unknown option: $arg"; exit 1 ;;
    esac
done

# =============================================================================
# CI ENVIRONMENT
# =============================================================================

ENV_FILE="infra/.env"
[[ -f "$ENV_FILE" ]] || { log_error "$ENV_FILE not found (create with scripts/generate_env_ci.sh or provide infra/.env)"; exit 1; }

set -a
source "$ENV_FILE"
set +a

# Exports for tests
export BFF_PLATFORM_PORT="${BFF_PLATFORM_PORT:-4000}"
export BFF_AUTH_PORT="${BFF_AUTH_PORT:-4001}"
export CADDY_HTTP_PORT="${CADDY_HTTP_PORT:-6173}"
export POSTGRES_PORT="${POSTGRES_PORT:-56432}"
export POSTGRES_USER="${POSTGRES_USER:-niyati}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-niyati_ci_pass}"
export POSTGRES_DB="${POSTGRES_DB:-niyati_ci}"
export REDIS_PORT="${REDIS_PORT:-7379}"
export N8N_PORT="${N8N_PORT:-6678}"
export BASE_URL="http://localhost:${CADDY_HTTP_PORT}"
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}"

# Compose command
COMPOSE_CMD="docker compose --env-file $ENV_FILE -f infra/docker-compose.yml -f infra/docker-compose.ci.yml"
PROJECT_NAME="niyati-ci"

log_info "CI Environment: BASE_URL=${BASE_URL}, DB=${DATABASE_URL%%@*}@..."

# =============================================================================
# CLEANUP FUNCTION (runs on exit)
# =============================================================================

cleanup() {
    local exit_code=$?
    if [[ "$NO_CLEANUP" -eq 1 ]]; then
        log_warn "Skipping cleanup (--no-cleanup). Stack is still running."
        log_info "To clean up manually: $COMPOSE_CMD -p $PROJECT_NAME down -v --remove-orphans"
    else
        # If we failed, collect compose logs for debugging before tearing down
        if [[ $exit_code -ne 0 ]]; then
            log_warn "CI failed (exit code=$exit_code). Collecting compose logs to artifacts/ci-logs for debugging..."
            mkdir -p "$ARTIFACTS_COVERAGE_DIR/ci-logs"
            # Capture full compose logs
            $COMPOSE_CMD -p "$PROJECT_NAME" logs --no-color --timestamps > "$ARTIFACTS_COVERAGE_DIR/ci-logs/compose-logs.txt" 2>&1 || true
            # Capture per-service recent logs for quick inspection
            for svc in bff-auth bff-platform postgres redis n8n ui-service caddy; do
                $COMPOSE_CMD -p "$PROJECT_NAME" logs --no-color --timestamps --tail=100 "$svc" > "$ARTIFACTS_COVERAGE_DIR/ci-logs/${svc}.log" 2>&1 || true
            done
            log_info "Compose logs written to $ARTIFACTS_COVERAGE_DIR/ci-logs/"
            # Redact known secret values from collected logs to avoid leaking secrets in artifacts
            if [[ -f "$ENV_FILE" ]]; then
                log_info "Redacting secrets from collected logs..."
                # Keys to redact; extend as needed
                for key in ACCESS_TOKEN_SECRET ASTRO_API_KEY POSTGRES_PASSWORD DATABASE_URL GHCR_PAT; do
                    val=$(grep -E "^${key}=" "$ENV_FILE" | sed -E 's/^'"${key}"'=//g' || true)
                    if [[ -n "$val" ]]; then
                        # Replace literal occurrences in collected logs with [REDACTED]
                        for f in "$ARTIFACTS_COVERAGE_DIR/ci-logs/"*; do
                            if [[ -f "$f" ]]; then
                                sed -i.bak "s|${val}|[REDACTED]|g" "$f" 2>/dev/null || true
                            fi
                        done
                    fi
                done
                log_info "Redaction complete"
            fi
        fi

        log_step "🧹 Cleaning up CI stack..."
        $COMPOSE_CMD -p "$PROJECT_NAME" down -v --remove-orphans 2>/dev/null || true
        
        # Explicit volume removal as fallback
        for vol in postgres-data redis-data caddy_data caddy_config ui-dist; do
            docker volume rm "${PROJECT_NAME}_${vol}" 2>/dev/null || true
        done
    fi
    exit $exit_code
}
trap cleanup EXIT

# =============================================================================
# HELPER: PORT CHECK & FREEDOM
# =============================================================================

check_and_liberate_port() {
    local port=$1
    local label=$2
    
    if lsof -n -i :$port -t >/dev/null 2>&1; then
        log_warn "Port $port ($label) is currently in use."
        
        # Check if it's a Docker container
        local container_id=$(docker ps -q --filter publish=$port)
        
        if [[ -n "$container_id" ]]; then
             log_info "Found conflicting Docker container ($container_id). Stopping it to ensure fresh environment..."
             docker stop $container_id >/dev/null || true
             docker rm $container_id >/dev/null || true
        else
             log_error "Port $port is in use by a non-Docker process. Please free it up manually to proceed."
             lsof -n -i :$port
             exit 1
        fi
    else
        log_info "Port $port ($label) is free."
    fi
}

# =============================================================================
# STEP 0: PRE-FLIGHT CHECKS
# =============================================================================

log_step "🔍 Checking for port conflicts..."
check_and_liberate_port "$BFF_PLATFORM_PORT" "BFF Platform"
check_and_liberate_port "$BFF_AUTH_PORT" "BFF Auth"
check_and_liberate_port "$CADDY_HTTP_PORT" "UI"
check_and_liberate_port "$POSTGRES_PORT" "Postgres"
check_and_liberate_port "$REDIS_PORT" "Redis"
check_and_liberate_port "$N8N_PORT" "Mock N8N"

# =============================================================================
# STEP 0.5: BOOTSTRAP / LOCKFILE CHECKS
# - Ensure package-lock.json exists for packages used in CI builds so
#   Docker `npm ci` does not fail interactively. If missing, generate
#   a package-lock only (non-committed) to stabilize CI builds.
# - Ensure per-package dev dependencies are installable by running
#   a lightweight `npm --package-lock-only` or `npm ci` when appropriate.
# =============================================================================

log_step "🔧 Ensuring lockfiles and test tool availability..."

# Packages to ensure lockfiles for
PKGS=("apps/ui" "apps/bff-platform" "apps/bff-auth" "packages/commons" "e2e")
for p in "${PKGS[@]}"; do
    if [[ -f "$p/package.json" ]]; then
        if [[ ! -f "$p/package-lock.json" && ! -f "$p/yarn.lock" ]]; then
            log_info "Generating package-lock.json for $p (so Docker builds and local CI are stable)"
            npm --prefix "$p" install --package-lock-only --silent || {
                log_warn "Failed to generate package-lock for $p; continuing but CI Docker build may fail."
            }
        else
            log_info "Lockfile present for $p"
        fi
    fi
done

# Ensure local test runners can be installed (non-fatal) so later npm ci won't prompt.
TEST_PKGS=("packages/commons" "apps/bff-platform" "apps/bff-auth" "e2e" "apps/ui")
for tp in "${TEST_PKGS[@]}"; do
    if [[ -f "$tp/package.json" ]]; then
        log_info "Running lightweight npm ci for $tp to ensure dev deps are resolvable"
        npm ci --prefix "$tp" --prefer-offline --no-audit --silent || {
            log_warn "npm ci failed for $tp; tests may still pass inside Docker where builds are isolated."
        }
    fi
done

# Verify playwright CLI is available (install browsers later before E2E)
if ! command -v npx >/dev/null 2>&1; then
    log_error "npx not found in PATH — Node.js tooling required for CI."
    exit 1
fi

# =============================================================================
# STEP 1: FRESH START
# =============================================================================

log_step "🗑️  Tearing down any existing CI stack..."
$COMPOSE_CMD -p "$PROJECT_NAME" down -v --remove-orphans 2>/dev/null || true

# Explicit volume removal as fallback (docker compose down -v sometimes misses volumes)
log_step "🧹 Explicitly removing CI volumes to ensure clean database state..."
for vol in postgres-data redis-data caddy_data caddy_config ui-dist; do
    docker volume rm "${PROJECT_NAME}_${vol}" 2>/dev/null || true
done

# Ensure UI lockfile exists so Docker `npm ci` does not fail
if [[ ! -f "apps/ui/package-lock.json" ]]; then
    log_step "⚙️  Generating apps/ui/package-lock.json for CI (non-committed)"
    # Generate package-lock only for the UI workspace so `npm ci` in the Docker build will succeed
    npm --prefix apps/ui install --package-lock-only --silent || true
fi

log_step "🚀 Starting CI stack (with mock n8n)..."
$COMPOSE_CMD -p "$PROJECT_NAME" up -d --build

# =============================================================================
# STEP 2: WAIT FOR SERVICES
# =============================================================================

log_step "⏳ Waiting for Postgres..."
for i in $(seq 1 60); do
    $COMPOSE_CMD -p "$PROJECT_NAME" exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1 && break
    sleep 1
done

log_step "⏳ Waiting for BFF services..."
for svc in bff-platform bff-auth; do
    # Convert bff-platform to BFF_PLATFORM_PORT
    svc_upper=$(echo "$svc" | tr '[:lower:]-' '[:upper:]_')
    port_var="${svc_upper}_PORT"
    port="${!port_var}"
    
    log_info "Waiting for $svc on port $port..."
    for i in $(seq 1 60); do
        if $COMPOSE_CMD -p "$PROJECT_NAME" exec -T "$svc" wget -q --spider "http://localhost:$port/api/v1/telemetry/health" 2>/dev/null; then
            log_success "$svc is healthy"
            break
        fi
        sleep 1
        [[ $i -eq 60 ]] && { log_error "$svc failed to become healthy"; exit 1; }
    done
done

log_step "⏳ Waiting for UI (Caddy) at ${BASE_URL}..."
for i in $(seq 1 90); do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "${BASE_URL}/" 2>/dev/null || echo "000")
    [[ "$HTTP_CODE" == "200" ]] && { log_success "UI is ready"; break; }
    sleep 1
done

# =============================================================================
# STEP 3: APPLY MIGRATIONS & SEED
# =============================================================================

log_step "📦 Applying migrations..."
for f in $(ls -1 packages/migrations/*.up.sql 2>/dev/null | sort); do
    cat "$f" | $COMPOSE_CMD -p "$PROJECT_NAME" exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null
done

# =============================================================================
# STEP 3.5: DATABASE CLEANUP - ensure clean state for E2E tests
# Truncate/clean test-related tables so E2E tests can start fresh.
# This is a safety net in case volumes were not fully removed.
# =============================================================================

log_step "🧹 Cleaning database for fresh E2E test state..."
$COMPOSE_CMD -p "$PROJECT_NAME" exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'EOF' >/dev/null
-- Delete test user data to ensure "new user" tests work correctly
-- Uses phone numbers from the E2E test specs
DELETE FROM user_profiles WHERE phone_number IN ('+1-9992223333', '+919999999999', '+919876543210', '+14155551234');
DELETE FROM users WHERE phone_number IN ('+1-9992223333', '+919999999999', '+919876543210', '+14155551234');
DELETE FROM charge_transactions WHERE phone_number IN ('+1-9992223333', '+919999999999', '+919876543210', '+14155551234');
EOF
log_info "Database cleaned for E2E tests"

# =============================================================================
# STEP 3.6: CI LINT - detect legacy localStorage keys in tests/source
# Fail fast if any tests reference `niyati_user_` keys. This prevents
# E2E flakes caused by key renames between code and tests.
# =============================================================================

log_step "🔎 CI LINT: Searching for legacy localStorage keys..."
LEGACY_MATCHES=$(grep -R --line-number "niyati_user_" -- ./e2e ./apps 2>/dev/null || true)
if [[ -n "$LEGACY_MATCHES" ]]; then
    log_error "Found legacy localStorage keys referencing 'niyati_user_':\n$LEGACY_MATCHES"
    log_error "Please update tests or source to use 'niyati_' canonical keys."
    exit 1
else
    log_info "No legacy localStorage keys detected."
fi


# Any seed data should live as idempotent migrations under packages/migrations
# (e.g. packages/migrations/*seed*.up.sql). The migrations loop above already
# applied all .up.sql files, so no legacy be/seed_ci.sql handling is required.

# =============================================================================
# STEP 4: BACKEND TESTS
# =============================================================================

BACKEND_EXIT=0
if [[ "$SKIP_BACKEND" -eq 0 ]]; then
    log_step "🧪 Running backend tests..."

    # Install shared packages (auth-core must come before commons which depends on it)
    npm install --prefix packages/auth-core --prefer-offline --no-audit --silent
    npm ci --prefix packages/commons --prefer-offline --no-audit --silent

    # bff-platform tests (run package test script so coverage flag in package.json is respected)
    log_info "Testing bff-platform..."
    cd apps/bff-platform
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
        cd apps/bff-auth
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

# =============================================================================
# STEP 5: E2E TESTS
# =============================================================================

E2E_EXIT=0
if [[ "$SKIP_E2E" -eq 0 && "$BACKEND_EXIT" -eq 0 ]]; then
    log_step "🎭 Running E2E tests..."
    # If CI_COLLECT_E2E_COVERAGE is set, run E2E using local server processes under c8
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

# =============================================================================
# FINAL RESULT
# =============================================================================

if [[ "$BACKEND_EXIT" -ne 0 || "$E2E_EXIT" -ne 0 ]]; then
    log_fail "CI FAILED"
    exit 1
fi

# Merge coverage artifacts and enforce threshold if requested
if [[ "${CI_MERGE_COVERAGE:-1}" == "1" ]]; then
    log_step "🔀 Merging coverage artifacts"
    COVERAGE_THRESHOLD="${COVERAGE_THRESHOLD:-100}" "$SCRIPT_DIR/merge_coverage.sh" || {
        log_error "Coverage merge failed or threshold not met"
        exit 1
    }
    log_success "✅ ALL CI TESTS PASSED"
else
    log_success "✅ ALL CI TESTS PASSED (coverage merge skipped)"
fi
exit 0
