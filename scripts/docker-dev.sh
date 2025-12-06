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
    
    if [ ! -f ".env.bff" ]; then
        log_warn ".env.bff not found. Creating from example..."
        if [ -f "be/bff/.env.example" ]; then
            cp be/bff/.env.example .env.bff
            log_info "Created .env.bff - please update with your API keys"
        else
            log_error ".env.example not found!"
            exit 1
        fi
    fi
    
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
case "$1" in
    up)
        check_env_files
        log_info "Starting development services..."
        docker-compose up -d
        log_info "Services started. Use 'docker-compose logs -f' to view logs"
        log_info "BFF: http://localhost:3000"
        log_info "UI: http://localhost:5173"
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
        echo "BFF Service:"
        curl -s http://localhost:3000/api/v1/telemetry/health | jq . || log_error "BFF unhealthy"
        echo ""
        echo "UI Service:"
        curl -s http://localhost:5173 > /dev/null && log_info "UI healthy" || log_error "UI unhealthy"
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
