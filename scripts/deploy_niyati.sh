#!/usr/bin/env bash
# =============================================================================
# Niyati Platform Deployment Script
# =============================================================================
# Supports interactive and non-interactive (CI) modes for deploying the
# Niyati platform using Docker Compose.
#
# Usage: ./scripts/deploy_niyati.sh [-y] [--prod] [--verbose]
#
# Options:
#   -y, --yes     Non-interactive mode (auto-confirm all prompts)
#   --prod        Use production Docker Compose configuration
#   --verbose     Show detailed output
# =============================================================================

# Load common library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

# Configuration
PROJECT_ROOT="$(find_project_root "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Parse arguments
PROD=0
INTERACTIVE=1
VERBOSE=0

for arg in "$@"; do
    case $arg in
        -y|--yes)
            INTERACTIVE=0
            export FORCE=1
            shift
            ;;
        --prod)
            PROD=1
            shift
            ;;
        --verbose)
            VERBOSE=1
            export DEBUG=1
            shift
            ;;
    esac
done

# Helper function for deployment prompts
deploy_prompt() {
    if [[ $INTERACTIVE -eq 1 ]]; then
        confirm_action "$1" "y"
    else
        return 0
    fi
}

# =============================================================================
# DEPLOYMENT STEPS
# =============================================================================

# Select mode
if [[ $PROD -eq 1 ]]; then
    COMPOSE_CMD=$(get_compose_cmd "prod")
    log_info "Production mode selected"
else
    COMPOSE_CMD=$(get_compose_cmd "override")
    log_info "Development mode selected"
fi

# Step 1: Stop existing services
if deploy_prompt "Stop all running Niyati containers?"; then
    $COMPOSE_CMD down || true
fi

# Step 2: Build images
if deploy_prompt "Rebuild all Docker images (force no-cache)?"; then
    $COMPOSE_CMD build --no-cache
fi

# Step 3: Check environment files
if [[ $INTERACTIVE -eq 1 ]]; then
    echo ""
    log_warn "Check your .env, .env.bff.auth, .env.bff.platform, .env.ui files for correct secrets and config."
    read -p "Press Enter to continue..."
fi

# Step 4: Run migrations
if deploy_prompt "Run DB migrations and seed data?"; then
    # Ensure infra is running so migrations can connect to Postgres
    log_info "Starting infrastructure services required for migrations: postgres, redis"
    $COMPOSE_CMD up -d postgres redis

    # Resolve postgres container id from compose (works for dev and prod)
    PG_CONTAINER=$($COMPOSE_CMD ps -q postgres 2>/dev/null || true)
    if [[ -z "$PG_CONTAINER" ]]; then
        log_error "Could not find postgres container"
        exit 1
    fi

    # Wait for Postgres to be healthy before running migrations
    if ! wait_for_container "$PG_CONTAINER" 120 1; then
        log_error "Postgres did not become healthy; aborting migrations"
        exit 1
    fi

    # Run migrations using the appropriate runner:
    # - In production use the dedicated `migrate` service (it mounts /migrations)
    # - In development use the bff-platform image (local mounts may provide migrations)
    if [[ $PROD -eq 1 ]]; then
        log_info "Running migrations using migrate service"
        $COMPOSE_CMD run --rm migrate
    else
        log_info "Running migrations using bff-platform image"
        $COMPOSE_CMD run --rm bff-platform /app/scripts/run_migrations.sh
    fi
fi

# Step 5: Start services
if deploy_prompt "Start all Niyati services (force recreate)?"; then
    $COMPOSE_CMD up -d --force-recreate
fi

# Step 6: Show status
echo ""
log_info "Niyati services status:"
$COMPOSE_CMD ps

# Step 7: Health checks
echo ""
log_info "Health checks:"

# Load env for ports
load_project_env "$PROJECT_ROOT" 2>/dev/null || true

# Helper to get container health status from service name
get_service_health() {
    local svc="$1"
    local cid
    cid=$($COMPOSE_CMD ps -q "$svc" 2>/dev/null || true)
    if [[ -z "$cid" ]]; then
        echo "not running"
        return
    fi
    docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' "$cid" 2>/dev/null || echo "unknown"
}

echo -n "Auth:      "
get_service_health bff-auth

echo -n "Platform:  "
get_service_health bff-platform

echo -n "UI:        "
get_service_health ui-service

echo -n "Redis:     "
get_service_health redis

echo -n "Caddy:     "
get_service_health caddy

echo -n "Postgres:  "
get_service_health postgres

# Done
echo ""
log_success "Deployment complete!"

if [[ $INTERACTIVE -eq 1 ]]; then
    echo ""
    echo "You can now access the Niyati platform at http://localhost:${UI_DEV_PORT:-5173}"
    echo "For logs, run: $COMPOSE_CMD logs -f"
    echo "For verbose logs, re-run this script with --verbose."
fi
