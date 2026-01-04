#!/usr/bin/env bash
# =============================================================================
# CI Test Runner for Niyati
# =============================================================================
# Runs the full test suite including backend unit tests and E2E tests in a
# CI environment using Docker Compose.
#
# Usage: ./scripts/ci-run-tests.sh
#
# Environment:
#   CI uses .env.ci with different ports to avoid conflicts with dev/production:
#   - Caddy (external): 6173 (prod: 5173)
#   - BFF Platform: 4000 (prod: 3000)
#   - BFF Auth: 4001 (prod: 3001)
#   - Postgres: 56432 (prod: 5432)
#   - n8n mock: 6678 (prod: 5678)
# =============================================================================

# Load common library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

# Configuration
PROJECT_ROOT="$(find_project_root "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# =============================================================================
# CI-SPECIFIC ENVIRONMENT SETUP
# =============================================================================

ENV_FILE=".env.ci"

if [[ -f "$PROJECT_ROOT/$ENV_FILE" ]]; then
    log_info "Loading CI environment from $ENV_FILE"
    set -a  # auto-export variables
    source "$PROJECT_ROOT/$ENV_FILE"
    set +a
else
    log_error "$ENV_FILE not found! CI requires this file for port configuration."
    log_info "Creating default .env.ci..."
    cat > "$PROJECT_ROOT/$ENV_FILE" <<'ENVEOF'
# CI Environment - Auto-generated
BFF_PLATFORM_PORT=4000
BFF_AUTH_PORT=4001
CADDY_HTTP_PORT=6173
N8N_PORT=6678
POSTGRES_PORT=56432
REDIS_PORT=7379
POSTGRES_USER=niyati
POSTGRES_PASSWORD=niyati_ci_pass
POSTGRES_DB=niyati_ci
SERVICE_TOKEN=ci-test-token
VITE_N8N_WEBHOOK_URL=/webhook/chat
CORS_ALLOWED=http://localhost:6173
NODE_ENV=production
BUILD_TARGET=production
ENVEOF
    source "$PROJECT_ROOT/$ENV_FILE"
fi

# CI port defaults (different from production to avoid conflicts)
export BFF_PLATFORM_PORT="${BFF_PLATFORM_PORT:-4000}"
export BFF_AUTH_PORT="${BFF_AUTH_PORT:-4001}"
export CADDY_HTTP_PORT="${CADDY_HTTP_PORT:-6173}"
export N8N_PORT="${N8N_PORT:-6678}"
export POSTGRES_PORT="${POSTGRES_PORT:-56432}"
export REDIS_PORT="${REDIS_PORT:-7379}"
export SERVICE_TOKEN="${SERVICE_TOKEN:-ci-test-token}"
export POSTGRES_USER="${POSTGRES_USER:-niyati}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-niyati_ci_pass}"
export POSTGRES_DB="${POSTGRES_DB:-niyati_ci}"

# Export BASE_URL using CI Caddy port
export BASE_URL="http://localhost:${CADDY_HTTP_PORT}"

log_info "CI Ports: Caddy=${CADDY_HTTP_PORT}, BFF-Platform=${BFF_PLATFORM_PORT}, BFF-Auth=${BFF_AUTH_PORT}, Postgres=${POSTGRES_PORT}"
log_info "BASE_URL: ${BASE_URL}"

# Compose command with CI overlay and env file
COMPOSE_CMD="docker compose --env-file $ENV_FILE -f docker-compose.yml -f docker-compose.ci.yml"

log_info "Starting CI test script from ${PROJECT_ROOT}"

# =============================================================================
# STEP 1: Start the Stack
# =============================================================================

log_step "🚀 Starting Docker Stack for CI (with mock n8n)..."
# Don't fail the script if one container reports unhealthy; continue and verify readiness below
$COMPOSE_CMD up -d --build || true

# Wait for important containers to report healthy when possible
log_step "⏳ Waiting for key containers to be healthy (ui-service, caddy, bff-platform, bff-auth)..."

# First wait for ui-service to finish building (it exits after build in CI)
log_step "⏳ Waiting for ui-service to build static assets..."
UI_BUILD_READY=0
for i in $(seq 1 120); do
    # Check if ui-service container has exited successfully (exit code 0) or is running
    UI_STATUS=$($COMPOSE_CMD ps --format '{{.State}}' ui-service 2>/dev/null || echo "unknown")
    UI_EXIT=$($COMPOSE_CMD ps --format '{{.ExitCode}}' ui-service 2>/dev/null || echo "")
    
    if [[ "$UI_STATUS" == "exited" && "$UI_EXIT" == "0" ]]; then
        log_success "ui-service build completed successfully"
        UI_BUILD_READY=1
        break
    elif [[ "$UI_STATUS" == "running" ]]; then
        # Still building
        echo -n "."
    elif [[ "$UI_STATUS" == "exited" && "$UI_EXIT" != "0" ]]; then
        log_error "ui-service build failed with exit code $UI_EXIT"
        $COMPOSE_CMD logs ui-service | tail -50
        break
    fi
    sleep 2
done
echo ""

if [[ "$UI_BUILD_READY" -ne 1 ]]; then
    log_warn "ui-service may not have completed; checking if static files exist..."
    # Check if index.html exists in the volume
    if $COMPOSE_CMD exec -T caddy test -f /srv/index.html 2>/dev/null; then
        log_success "Static files found in /srv"
        UI_BUILD_READY=1
    else
        log_error "No index.html found in /srv - UI build may have failed"
        log_step "Attempting to rebuild ui-service..."
        $COMPOSE_CMD up -d --build ui-service
        sleep 30
    fi
fi

for svc in caddy bff-platform bff-auth; do
    container_id=$($COMPOSE_CMD ps -q $svc 2>/dev/null || true)
    if [[ -n "$container_id" ]]; then
        # wait_for_container accepts container id or name
        if ! wait_for_container "$container_id" 90 2; then
            log_warn "$svc did not report healthy; continuing but E2E may fail"
        fi
    else
        log_debug "No container id found for $svc; skipping container health wait"
    fi
done

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

# Install shared commons dependencies on the host so tests can require them
log_step "📦 Installing be/commons dependencies on host..."
npm ci --prefix be/commons || { log_error "Failed to install be/commons deps"; exit 6; }

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
DETECT_FLAG=""
if [[ "${JEST_DETECT_OPEN_HANDLES:-0}" == "1" ]]; then
    DETECT_FLAG="--detectOpenHandles"
    log_info "Enabling Jest --detectOpenHandles for bff-platform tests"
fi
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}" NODE_ENV=test npx jest --config jest.config.cjs --runInBand --coverage ${DETECT_FLAG} || { log_error "bff-platform tests failed"; exit 2; }

log_step "🧪 Running bff-auth tests locally against compose Postgres..."
cd ../bff-auth
npm ci --include=dev
DETECT_FLAG=""
if [[ "${JEST_DETECT_OPEN_HANDLES:-0}" == "1" ]]; then
    DETECT_FLAG="--detectOpenHandles"
    log_info "Enabling Jest --detectOpenHandles for bff-auth tests"
fi
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}" NODE_ENV=test npx jest --config jest.config.cjs --runInBand ${DETECT_FLAG} || { log_error "bff-auth tests failed"; exit 3; }

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

    # Install Playwright browsers (required for E2E tests)
    log_step "🎭 Installing Playwright browsers..."
    npx playwright install --with-deps chromium

    # Run the tests
    export REAL=1
    # BASE_URL already set from CI env (port ${CADDY_HTTP_PORT})

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

    # Give Docker network a moment to stabilize after container restarts
    log_step "⏳ Allowing Docker network to stabilize..."
    sleep 5

    # Wait for proxied API (Caddy) to be healthy with longer timeout
    log_step "⏳ Waiting for proxied API (Caddy) to report healthy..."
    if check_url_with_retries "${BASE_URL}/api/v1/telemetry/health" 90 2; then
        log_success "Proxied API is healthy"
    else
        log_error "Proxied API did not become healthy within timeout"
        log_step "Dumping Caddy logs for debugging:"
        $COMPOSE_CMD logs caddy | tail -100
        E2E_EXIT_CODE=3
    fi

    # Wait for UI service with extended timeout
    log_step "⏳ Waiting for UI service to be ready..."
    UI_READY=0
    for i in $(seq 1 120); do
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${BASE_URL}/" 2>/dev/null || echo "000")
        if [[ "$HTTP_CODE" == "200" ]]; then
            BODY_SNIPPET=$(curl -s --max-time 5 "${BASE_URL}/" | head -c 500)
            if echo "$BODY_SNIPPET" | grep -qE "<html|<!DOCTYPE|<div id=\"root\"|<script.*src="; then
                log_success "UI service is ready (HTTP 200, valid HTML)"
                UI_READY=1
                break
            else
                log_debug "Got HTTP 200 but body doesn't look like HTML: ${BODY_SNIPPET:0:100}"
            fi
        elif [[ "$HTTP_CODE" == "404" ]]; then
            # Caddy is up but static files not ready yet
            log_debug "Attempt $i: HTTP 404 - static files not ready yet"
        fi
        echo -n "."
        sleep 1
    done
    echo ""

    if [[ "$UI_READY" -ne 1 ]]; then
        log_error "UI service did not become ready within timeout"
        log_step "Dumping Caddy logs for debugging:"
        $COMPOSE_CMD logs caddy | tail -50
        log_step "Checking if index.html exists in Caddy container:"
        $COMPOSE_CMD exec -T caddy ls -la /srv/ || true
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

