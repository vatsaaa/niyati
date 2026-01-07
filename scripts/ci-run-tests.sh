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

ENV_FILE="infra/.env.ci"
[[ -f "$ENV_FILE" ]] || { log_error "$ENV_FILE not found"; exit 1; }

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
        log_step "🧹 Cleaning up CI stack..."
        $COMPOSE_CMD -p "$PROJECT_NAME" down -v --remove-orphans 2>/dev/null || true
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
# STEP 1: FRESH START
# =============================================================================

log_step "🗑️  Tearing down any existing CI stack..."
$COMPOSE_CMD -p "$PROJECT_NAME" down -v --remove-orphans 2>/dev/null || true

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

if [[ -f be/seed_ci.sql ]]; then
    log_step "📦 Applying CI seed data..."
    cat be/seed_ci.sql | $COMPOSE_CMD -p "$PROJECT_NAME" exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null
fi

# =============================================================================
# STEP 4: BACKEND TESTS
# =============================================================================

BACKEND_EXIT=0
if [[ "$SKIP_BACKEND" -eq 0 ]]; then
    log_step "🧪 Running backend tests..."
    
    # Install commons
    npm ci --prefix packages/commons --prefer-offline --no-audit --silent
    
    # bff-platform tests
    log_info "Testing bff-platform..."
    cd apps/bff-platform
    npm ci --include=dev --prefer-offline --no-audit --silent
    NODE_ENV=test npx jest --config jest.config.cjs --runInBand --forceExit || BACKEND_EXIT=1
    cd "$PROJECT_ROOT"
    
    if [[ "$BACKEND_EXIT" -eq 0 ]]; then
        # bff-auth tests
        log_info "Testing bff-auth..."
        cd apps/bff-auth
        npm ci --include=dev --prefer-offline --no-audit --silent
        NODE_ENV=test npx jest --config jest.config.cjs --runInBand --forceExit || BACKEND_EXIT=1
        cd "$PROJECT_ROOT"
    fi
    
    [[ "$BACKEND_EXIT" -eq 0 ]] && log_success "Backend tests passed" || log_error "Backend tests failed"
else
    log_info "Skipping backend tests (--skip-backend)"
fi

# =============================================================================
# STEP 5: E2E TESTS
# =============================================================================

E2E_EXIT=0
if [[ "$SKIP_E2E" -eq 0 && "$BACKEND_EXIT" -eq 0 ]]; then
    log_step "🎭 Running E2E tests..."
    
    cd "$PROJECT_ROOT/e2e"
    npm install --include=dev
    npx playwright install chromium 2>/dev/null || true
    
    export REAL=1
    export BASE_URL="http://localhost:6173"
    npx playwright test --project=api || E2E_EXIT=1
    cd "$PROJECT_ROOT"
    
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

log_success "✅ ALL CI TESTS PASSED"
exit 0
