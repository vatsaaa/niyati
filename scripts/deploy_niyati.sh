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
    $COMPOSE_CMD run --rm bff-platform /app/scripts/run_migrations.sh
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

echo -n "Auth:      "
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:${BFF_AUTH_PORT:-3001}/api/v1/telemetry/health"

echo -n "Platform:  "
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:${BFF_PLATFORM_PORT:-3000}/api/v1/telemetry/health"

echo -n "UI:        "
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:${UI_DEV_PORT:-5173}"

echo -n "Mailhog:   "
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:8025"

echo -n "Redis:     "
$COMPOSE_CMD logs redis 2>&1 | grep -q 'Ready to accept connections' && echo 'OK' || echo 'NOT READY'

echo -n "Caddy:     "
$COMPOSE_CMD logs caddy 2>&1 | grep -q 'serving initial configuration' && echo 'OK' || echo 'NOT READY'

echo -n "N8N:       "
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:5678"

# Done
echo ""
log_success "Deployment complete!"

if [[ $INTERACTIVE -eq 1 ]]; then
    echo ""
    echo "You can now access the Niyati platform at http://localhost:${UI_DEV_PORT:-5173}"
    echo "For logs, run: $COMPOSE_CMD logs -f"
    echo "For verbose logs, re-run this script with --verbose."
fi
