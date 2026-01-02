#!/usr/bin/env bash
# =============================================================================
# CI Test Runner for Niyati
# =============================================================================
# Runs the full test suite including backend unit tests and E2E tests in a
# CI environment using Docker Compose.
#
# Usage: ./scripts/ci-run-tests.sh
# =============================================================================

# Load common library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

# Configuration
PROJECT_ROOT="$(find_project_root "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

COMPOSE_CMD="docker compose -f docker-compose.yml -f docker-compose.ci.yml"

log_info "Starting CI test script from ${PROJECT_ROOT}"

# =============================================================================
# STEP 1: Start the Stack
# =============================================================================

log_step "🚀 Starting Docker Stack for CI (with mock n8n)..."
# Don't fail the script if one container reports unhealthy; continue and verify readiness below
$COMPOSE_CMD up -d --build || true

# Restart Caddy to ensure it picks up any Caddyfile changes
log_step "🔄 Restarting Caddy to ensure latest Caddyfile is loaded..."
$COMPOSE_CMD restart caddy || true

# =============================================================================
# STEP 2: Wait for Postgres
# =============================================================================

log_step "⏳ Waiting for Postgres inside compose..."
for i in $(seq 1 60); do
    $COMPOSE_CMD exec -T postgres pg_isready -U ${POSTGRES_USER:-niyati} -d ${POSTGRES_DB:-niyati_dev} >/dev/null 2>&1 && break || sleep 1
done

# =============================================================================
# STEP 3: Run Migrations and Seeds
# =============================================================================

log_step "📦 Applying migrations inside compose Postgres..."
for f in $(ls -1 be/migrations/*.up.sql | sort); do
    log_debug "Applying $f"
    cat "$f" | $COMPOSE_CMD exec -T postgres psql -U ${POSTGRES_USER:-niyati} -d ${POSTGRES_DB:-niyati_dev}
done

if [[ -f be/seed_ci.sql ]]; then
    log_step "Applying be/seed_ci.sql inside compose Postgres..."
    cat be/seed_ci.sql | $COMPOSE_CMD exec -T postgres psql -U ${POSTGRES_USER:-niyati} -d ${POSTGRES_DB:-niyati_dev} || { log_error "Failed to apply be/seed_ci.sql"; exit 5; }
else
    log_warn "be/seed_ci.sql not found, skipping seed step"
fi

# =============================================================================
# STEP 4: Install devDependencies
# =============================================================================

log_step "🛠️ Installing devDependencies inside bff-platform container..."
$COMPOSE_CMD exec -T bff-platform npm install --include=dev || true

# =============================================================================
# STEP 5: Run Backend Tests
# =============================================================================

log_step "🧪 Running bff-platform tests locally against compose Postgres..."
cd be/bff-platform
npm ci --include=dev
DATABASE_URL="postgresql://${POSTGRES_USER:-niyati}:${POSTGRES_PASSWORD:-niyati_dev_pass}@127.0.0.1:55432/${POSTGRES_DB:-niyati_dev}" NODE_ENV=test npm test || { log_error "bff-platform tests failed"; exit 2; }

log_step "🧪 Running bff-auth tests locally against compose Postgres..."
cd ../bff-auth
npm ci --include=dev
DATABASE_URL="postgresql://${POSTGRES_USER:-niyati}:${POSTGRES_PASSWORD:-niyati_dev_pass}@127.0.0.1:55432/${POSTGRES_DB:-niyati_dev}" NODE_ENV=test npm test || { log_error "bff-auth tests failed"; exit 3; }

cd "$PROJECT_ROOT"

# =============================================================================
# STEP 6: E2E Tests
# =============================================================================

log_step "🎭 Preparing E2E Tests..."

E2E_DIR="$PROJECT_ROOT/e2e"
E2E_EXIT_CODE=0

log_debug "📍 Repo Root: $PROJECT_ROOT"
log_debug "📍 Looking for E2E at: $E2E_DIR"

if [[ -d "$E2E_DIR" ]]; then
    log_success "E2E directory found. Running tests..."
    cd "$E2E_DIR"

    # Install deps if node_modules is missing
    if [[ ! -d "node_modules" ]]; then
        log_step "📦 Installing Playwright dependencies..."
        npm ci
    fi

    # Run the tests
    export REAL=1
    export BASE_URL=http://localhost:5173

    # Ensure UI is reachable at BASE_URL
    UI_PID=""
    if ! curl -sSf "${BASE_URL}/" >/dev/null 2>&1; then
        log_warn "UI not reachable at ${BASE_URL}; building and serving local UI..."
        if [[ -d "$PROJECT_ROOT/ui" ]]; then
            (cd "$PROJECT_ROOT/ui" && npm ci && npm run build) || { log_error "UI build failed"; E2E_EXIT_CODE=1; }
            npx --yes http-server "$PROJECT_ROOT/ui/dist" -p 5173 --silent >/tmp/ui-server.log 2>&1 &
            UI_PID=$!
            log_debug "Started local UI server (pid=${UI_PID})"
            for i in $(seq 1 30); do
                curl -sSf "${BASE_URL}/" >/dev/null 2>&1 && break || sleep 1
            done
        else
            log_error "No ui directory found at $PROJECT_ROOT/ui"
            E2E_EXIT_CODE=1
        fi
    fi

    # Wait for proxied API (Caddy) to be healthy
    log_step "⏳ Waiting for proxied API (Caddy) to report healthy..."
    if check_url_with_retries "${BASE_URL}/api/v1/telemetry/health" 60 1; then
        log_success "Proxied API is healthy"
    else
        log_error "Proxied API did not become healthy within timeout"
        E2E_EXIT_CODE=3
    fi

    # Wait for UI service
    log_step "⏳ Waiting for UI service to be ready..."
    UI_READY=0
    for i in $(seq 1 60); do
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/")
        if [[ "$HTTP_CODE" == "200" ]]; then
            BODY_SNIPPET=$(curl -s "${BASE_URL}/" | head -c 200)
            if echo "$BODY_SNIPPET" | grep -q "<html\|<!DOCTYPE\|<div id=\"root\""; then
                log_success "UI service is ready"
                UI_READY=1
                break
            fi
        fi
        echo -n "."
        sleep 1
    done

    if [[ "$UI_READY" -ne 1 ]]; then
        log_error "UI service did not become ready within timeout"
        E2E_EXIT_CODE=4
    fi

    if [[ "${E2E_EXIT_CODE:-0}" -eq 0 ]]; then
        npx playwright test --project=api
        E2E_EXIT_CODE=$?
    fi
else
    log_warn "E2E directory NOT found at $E2E_DIR"
    E2E_EXIT_CODE=1
fi

cd "$PROJECT_ROOT"

# =============================================================================
# STEP 7: Cleanup
# =============================================================================

log_step "🧹 Cleaning up compose stack..."
$COMPOSE_CMD down -v --remove-orphans || true

if [[ "${E2E_EXIT_CODE:-0}" -ne 0 ]]; then
    log_fail "E2E Tests Failed!"
    exit ${E2E_EXIT_CODE}
fi

log_success "ALL TESTS PASSED (Backend + E2E)"

