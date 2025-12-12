#!/usr/bin/env bash
# Development helper script for Docker operations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_env_files() {
    log_info "Checking environment files..."
    
    # Check service-specific env files
    for svc in auth platform pthru; do
        if [ ! -f ".env.bff.${svc}" ]; then
            if [ -f ".env.bff.${svc}.example" ]; then
                log_warn ".env.bff.${svc} not found. Creating from example..."
                cp ".env.bff.${svc}.example" ".env.bff.${svc}"
                log_info "Created .env.bff.${svc} - please update with your API keys"
            else
                log_warn ".env.bff.${svc}.example not found - skipping"
            fi
        fi
    done
    
    if [ ! -f ".env.ui" ]; then
        log_warn ".env.ui not found. Creating with defaults..."
        cat > .env.ui << 'EOF'
VITE_APP_VERSION=0.1.0-dev
VITE_BFF_BASE_URL=http://localhost:3000
VITE_DEBUG_MODE=true
EOF
        log_info "Created .env.ui"
    fi
}

show_help() {
    cat << EOF
Niyati Docker Development Helper

Usage: ./scripts/docker-dev.sh [command]

Commands:
    up          Start all services in development mode
    down        Stop all services
    restart     Restart all services
    logs        Show logs from all services
    logs-bff    Show BFF logs only
    logs-ui     Show UI logs only
    build       Rebuild all images
    clean       Stop services and remove volumes
    shell-bff   Open shell in BFF container
    shell-ui    Open shell in UI container
    ps          Show running containers
    health      Check health status of services
    help        Show this help message

Examples:
    ./scripts/docker-dev.sh up
    ./scripts/docker-dev.sh logs-bff
    ./scripts/docker-dev.sh shell-bff

EOF
}

# Main script

# Load port configuration from .env
if [ -f ".env" ]; then
    export $(grep -E '^(BFF_PLATFORM_PORT|BFF_AUTH_PORT|UI_DEV_PORT)=' .env | xargs)
fi
BFF_PLATFORM_PORT=${BFF_PLATFORM_PORT:-3000}
BFF_AUTH_PORT=${BFF_AUTH_PORT:-3001}
UI_DEV_PORT=${UI_DEV_PORT:-5173}

case "$1" in
    up)
        check_env_files
        log_info "Starting development services..."
        docker-compose up -d
        log_info "Services started. Use 'docker-compose logs -f' to view logs"
        log_info "BFF Platform: http://localhost:${BFF_PLATFORM_PORT}"
        log_info "BFF Auth: http://localhost:${BFF_AUTH_PORT}"
        log_info "UI: http://localhost:${UI_DEV_PORT}"
        ;;
    down)
        log_info "Stopping services..."
        docker-compose down
        log_info "Services stopped"
        ;;
    restart)
        log_info "Restarting services..."
        docker-compose restart
        log_info "Services restarted"
        ;;
    logs)
        docker-compose logs -f
        ;;
    logs-bff)
        docker-compose logs -f bff-service
        ;;
    logs-ui)
        docker-compose logs -f ui-service
        ;;
    build)
        log_info "Building images..."
        docker-compose build --no-cache
        log_info "Build complete"
        ;;
    clean)
        log_warn "This will stop services and remove volumes. Continue? (y/N)"
        read -r response
        if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
            log_info "Cleaning up..."
            docker-compose down -v
            log_info "Cleanup complete"
        else
            log_info "Cancelled"
        fi
        ;;
    shell-bff)
        log_info "Opening shell in BFF container..."
        docker-compose exec bff-service sh
        ;;
    shell-ui)
        log_info "Opening shell in UI container..."
        docker-compose exec ui-service sh
        ;;
    ps)
        docker-compose ps
        ;;
    health)
        log_info "Checking service health..."
        echo ""
        echo "BFF Platform Service:"
        curl -s http://localhost:${BFF_PLATFORM_PORT}/api/v1/telemetry/health | jq . || log_error "BFF Platform unhealthy"
        echo ""
        echo "BFF Auth Service:"
        curl -s http://localhost:${BFF_AUTH_PORT}/api/v1/telemetry/health | jq . || log_error "BFF Auth unhealthy"
        echo ""
        echo "UI Service:"
        curl -s http://localhost:${UI_DEV_PORT} > /dev/null && log_info "UI healthy" || log_error "UI unhealthy"
        ;;
    help|--help|-h|"")
        show_help
        ;;
    *)
        log_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
