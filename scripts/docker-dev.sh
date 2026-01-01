#!/usr/bin/env bash
# =============================================================================
# Docker Development Helper for Niyati
# =============================================================================
# Provides convenient commands for managing Docker services during development.
# This script also handles initial environment setup (replaces docker-setup.sh).
#
# Usage: ./scripts/docker-dev.sh [command]
# =============================================================================

# Load common library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

# Configuration
PROJECT_ROOT="$(find_project_root "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# =============================================================================
# USAGE
# =============================================================================

show_help() {
    cat << EOF
${BOLD}Niyati Docker Development Helper${NC}

${YELLOW}Usage:${NC} $0 [command]

${YELLOW}Commands:${NC}
  ${GREEN}setup${NC}       Initial setup - create env files, check Docker
  ${GREEN}up${NC}          Start all services in development mode
  ${GREEN}down${NC}        Stop all services
  ${GREEN}restart${NC}     Restart all services
  ${GREEN}logs${NC}        Show logs from all services
  ${GREEN}logs-bff${NC}    Show BFF Platform logs only
  ${GREEN}logs-auth${NC}   Show BFF Auth logs only
  ${GREEN}logs-ui${NC}     Show UI logs only
  ${GREEN}build${NC}       Rebuild all images
  ${GREEN}clean${NC}       Stop services and remove volumes
  ${GREEN}shell-bff${NC}   Open shell in BFF Platform container
  ${GREEN}shell-auth${NC}  Open shell in BFF Auth container
  ${GREEN}shell-ui${NC}    Open shell in UI container
  ${GREEN}ps${NC}          Show running containers
  ${GREEN}health${NC}      Check health status of services
  ${GREEN}help${NC}        Show this help message

${YELLOW}Examples:${NC}
  $0 setup              # First-time setup
  $0 up                 # Start services
  $0 logs-bff           # View BFF Platform logs
  $0 shell-bff          # Shell into BFF container

EOF
}

# =============================================================================
# COMMANDS
# =============================================================================

cmd_setup() {
    print_header "Niyati Docker Setup" 45
    echo ""
    
    # Check Docker
    check_docker || exit 1
    echo ""
    
    # Create environment files
    ensure_env_files "$PROJECT_ROOT"
    echo ""
    
    # Make scripts executable
    chmod +x "$SCRIPT_DIR"/*.sh 2>/dev/null || true
    log_success "Scripts are executable"
    echo ""
    
    print_header "Setup Complete!" 45
    echo ""
    echo -e "${GREEN}Next steps:${NC}"
    echo ""
    echo "1. Edit .env files and add your API keys:"
    echo -e "   ${YELLOW}nano .env.bff.auth${NC}"
    echo -e "   ${YELLOW}nano .env.bff.platform${NC}"
    echo ""
    echo "2. Start the services:"
    echo -e "   ${YELLOW}$0 up${NC}"
    echo ""
    echo "3. Access the application:"
    echo -e "   UI:           ${BLUE}http://localhost:${UI_DEV_PORT:-5173}${NC}"
    echo -e "   BFF Platform: ${BLUE}http://localhost:${BFF_PLATFORM_PORT:-3000}${NC}"
    echo -e "   BFF Auth:     ${BLUE}http://localhost:${BFF_AUTH_PORT:-3001}${NC}"
    echo ""
}

cmd_up() {
    ensure_env_files "$PROJECT_ROOT" || true
    log_info "Starting development services..."
    docker compose up -d
    log_success "Services started"
    echo ""
    log_info "Access points:"
    echo -e "  BFF Platform: ${BLUE}http://localhost:${BFF_PLATFORM_PORT:-3000}${NC}"
    echo -e "  BFF Auth:     ${BLUE}http://localhost:${BFF_AUTH_PORT:-3001}${NC}"
    echo -e "  UI:           ${BLUE}http://localhost:${UI_DEV_PORT:-5173}${NC}"
    echo ""
    log_info "View logs with: $0 logs"
}

cmd_down() {
    log_info "Stopping services..."
    docker compose down
    log_success "Services stopped"
}

cmd_restart() {
    log_info "Restarting services..."
    docker compose restart
    log_success "Services restarted"
}

cmd_logs() {
    docker compose logs -f
}

cmd_logs_bff() {
    docker compose logs -f bff-platform
}

cmd_logs_auth() {
    docker compose logs -f bff-auth
}

cmd_logs_ui() {
    docker compose logs -f ui-service
}

cmd_build() {
    log_info "Building images..."
    docker compose build --no-cache
    log_success "Build complete"
}

cmd_clean() {
    log_warn "This will stop services and remove volumes."
    if confirm_action "Continue?" "n"; then
        log_info "Cleaning up..."
        docker compose down -v
        log_success "Cleanup complete"
    else
        log_info "Cancelled"
    fi
}

cmd_shell_bff() {
    log_info "Opening shell in BFF Platform container..."
    docker compose exec bff-platform sh
}

cmd_shell_auth() {
    log_info "Opening shell in BFF Auth container..."
    docker compose exec bff-auth sh
}

cmd_shell_ui() {
    log_info "Opening shell in UI container..."
    docker compose exec ui-service sh
}

cmd_ps() {
    docker compose ps
}

cmd_health() {
    load_project_env "$PROJECT_ROOT"
    run_health_checks
}

# =============================================================================
# MAIN
# =============================================================================

# Load environment for port info
load_project_env "$PROJECT_ROOT" 2>/dev/null || true

case "${1:-help}" in
    setup)      cmd_setup ;;
    up)         cmd_up ;;
    down)       cmd_down ;;
    restart)    cmd_restart ;;
    logs)       cmd_logs ;;
    logs-bff)   cmd_logs_bff ;;
    logs-auth)  cmd_logs_auth ;;
    logs-ui)    cmd_logs_ui ;;
    build)      cmd_build ;;
    clean)      cmd_clean ;;
    shell-bff)  cmd_shell_bff ;;
    shell-auth) cmd_shell_auth ;;
    shell-ui)   cmd_shell_ui ;;
    ps)         cmd_ps ;;
    health)     cmd_health ;;
    help|--help|-h|"")
        show_help
        ;;
    *)
        log_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
