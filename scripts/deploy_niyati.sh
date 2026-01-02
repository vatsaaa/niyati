#!/usr/bin/env bash
# =============================================================================
# Niyati Platform Deployment Script
# =============================================================================
# Comprehensive deployment tool with explicit actions, idempotent operations,
# safety checks, and observability features.
#
# Usage:
#   ./scripts/deploy_niyati.sh --env=<dev|prod> --action=<action> [OPTIONS]
#
# Actions:
#   deploy    Full deployment: build, migrate, start (default)
#   restart   Restart all services (or specific service with --service=<name>)
#   stop      Stop all services
#   rebuild   Force rebuild all images (no-cache) then start
#   clean     Stop services, remove orphans, volumes, networks, images
#   fresh     Complete fresh start: clean everything, rebuild, deploy (like new machine)
#   migrate   Run database migrations only
#   status    Show status of all services
#
# Options:
#   --env=dev|prod       Environment (default: dev)
#   --action=<action>    Action to perform (default: deploy)
#   --project-name=NAME  Compose project name (default: niyati or niyati-prod)
#   --service=<name>     Target specific service (for restart action)
#   --dry-run            Print commands without executing
#   --verbose            Show detailed output
#   --log-file=PATH      Save deploy output to PATH (appends)
#   -y, --yes            Non-interactive mode (auto-confirm all prompts)
#   --skip-checks        Skip pre-deploy validation checks
#   --skip-health        Skip post-deploy health verification
#   -h, --help           Show this help message
#
# Examples:
#   ./scripts/deploy_niyati.sh --env=dev --action=deploy
#   ./scripts/deploy_niyati.sh --env=prod --action=restart --service=bff-platform
#   ./scripts/deploy_niyati.sh --env=dev --action=rebuild --dry-run
#   ./scripts/deploy_niyati.sh --action=clean --yes
#
# Naming Policy:
#   This script uses explicit -p (project name) with compose to ensure stable
#   container naming. Production uses container_name in docker-compose.prod.yml
#   for fixed names; dev relies on compose-generated names with project prefix.
#   Always run 'down --remove-orphans' before switching between dev/prod modes.
#
# =============================================================================

set -euo pipefail

# =============================================================================
# INITIALIZATION
# =============================================================================

# Load common library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

# Configuration
PROJECT_ROOT="$(find_project_root "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Lockfile for preventing concurrent deploys
LOCKFILE="/tmp/niyati-deploy.lock"
LOCK_FD=200

# =============================================================================
# DEFAULT VALUES
# =============================================================================

ENV="dev"
ACTION="deploy"
PROJECT=""
SERVICE=""
DRY_RUN=0
VERBOSE=0
INTERACTIVE=1
LOG_FILE=""
SKIP_CHECKS=0
SKIP_HEALTH=0

# =============================================================================
# USAGE / HELP
# =============================================================================

show_help() {
    cat << 'EOF'
Niyati Platform Deployment Script

Usage:
  ./scripts/deploy_niyati.sh --env=<dev|prod> --action=<action> [OPTIONS]

Actions:
  deploy    Full deployment: build, migrate, start (default)
  restart   Restart all services (or specific service with --service=<name>)
  stop      Stop all services
  rebuild   Force rebuild all images (no-cache) then start
  clean     Stop services, remove orphans, volumes, networks, images
  fresh     Complete fresh start: clean everything, rebuild, deploy (like new machine)
  migrate   Run database migrations only
  status    Show status of all services

Options:
  --env=dev|prod       Environment (default: dev)
  --action=<action>    Action to perform (default: deploy)
  --project-name=NAME  Compose project name (default: niyati or niyati-prod)
  --service=<name>     Target specific service (for restart action)
  --dry-run            Print commands without executing
  --verbose            Show detailed output
  --log-file=PATH      Save deploy output to PATH (appends)
  -y, --yes            Non-interactive mode (auto-confirm prompts)
  --skip-checks        Skip pre-deploy validation checks
  --skip-health        Skip post-deploy health verification
  -h, --help           Show this help message

Examples:
  # Full dev deployment
  ./scripts/deploy_niyati.sh --env=dev --action=deploy

  # Production deployment with logging
  ./scripts/deploy_niyati.sh --env=prod --action=deploy --log-file=/var/log/niyati-deploy.log

  # Restart a single service
  ./scripts/deploy_niyati.sh --env=dev --action=restart --service=bff-platform

  # Rebuild all images and redeploy
  ./scripts/deploy_niyati.sh --env=dev --action=rebuild

  # Clean up everything
  ./scripts/deploy_niyati.sh --action=clean --yes

  # Dry-run to see what would happen
  ./scripts/deploy_niyati.sh --env=prod --action=deploy --dry-run

EOF
    exit 0
}

# =============================================================================
# ARGUMENT PARSING
# =============================================================================

for arg in "$@"; do
    case $arg in
        -h|--help)
            show_help
            ;;
        --env=*)
            ENV="${arg#--env=}"
            if [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then
                log_error "Invalid --env value: $ENV (must be 'dev' or 'prod')"
                exit 1
            fi
            ;;
        --action=*)
            ACTION="${arg#--action=}"
            if [[ ! "$ACTION" =~ ^(deploy|restart|stop|rebuild|clean|fresh|migrate|status)$ ]]; then
                log_error "Invalid --action value: $ACTION"
                log_error "Valid actions: deploy, restart, stop, rebuild, clean, fresh, migrate, status"
                exit 1
            fi
            ;;
        --project-name=*)
            PROJECT="${arg#--project-name=}"
            ;;
        --service=*)
            SERVICE="${arg#--service=}"
            ;;
        --dry-run)
            DRY_RUN=1
            ;;
        --verbose)
            VERBOSE=1
            export DEBUG=1
            ;;
        --log-file=*)
            LOG_FILE="${arg#--log-file=}"
            ;;
        -y|--yes)
            INTERACTIVE=0
            export FORCE=1
            ;;
        --skip-checks)
            SKIP_CHECKS=1
            ;;
        --skip-health)
            SKIP_HEALTH=1
            ;;
        # Legacy support
        --prod)
            ENV="prod"
            ;;
        *)
            log_warn "Unknown argument: $arg"
            ;;
    esac
done

# =============================================================================
# COMPOSE COMMAND SETUP
# =============================================================================

# Set default project name based on environment
if [[ -z "$PROJECT" ]]; then
    if [[ "$ENV" == "prod" ]]; then
        PROJECT="niyati-prod"
    else
        PROJECT="niyati"
    fi
fi

# Build compose command with explicit files and project name
if [[ "$ENV" == "prod" ]]; then
    COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"
else
    COMPOSE_FILES="-f docker-compose.yml -f docker-compose.override.yml"
fi

COMPOSE_CMD="docker compose -p $PROJECT $COMPOSE_FILES"

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

# Deployment prompts
deploy_prompt() {
    if [[ $INTERACTIVE -eq 1 ]]; then
        confirm_action "$1" "y"
    else
        return 0
    fi
}

# Run command wrapper: prints command, optionally executes, logs output
run_cmd() {
    local cmd="$1"
    echo "+ $cmd"
    
    if [[ $DRY_RUN -eq 1 ]]; then
        return 0
    fi

    if [[ -n "$LOG_FILE" ]]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] + $cmd" >> "$LOG_FILE"
        if [[ $VERBOSE -eq 1 ]]; then
            eval "$cmd" 2>&1 | tee -a "$LOG_FILE"
            return ${PIPESTATUS[0]}
        else
            eval "$cmd" >> "$LOG_FILE" 2>&1
            return $?
        fi
    else
        if [[ $VERBOSE -eq 1 ]]; then
            eval "$cmd"
            return $?
        else
            eval "$cmd"
            return $?
        fi
    fi
}

# Capture command output (for queries)
capture_eval() {
    local cmd="$1"
    if [[ $DRY_RUN -eq 1 ]]; then
        echo ""
        return 0
    fi
    local out
    out=$(eval "$cmd" 2>/dev/null || true)
    if [[ -n "$LOG_FILE" && $VERBOSE -eq 1 ]]; then
        echo "> $cmd" >> "$LOG_FILE"
        echo "$out" >> "$LOG_FILE"
    fi
    echo "$out"
}

# Acquire deployment lock (prevents concurrent deploys)
# Uses mkdir for portable atomic locking (works on macOS and Linux)
acquire_lock() {
    if [[ $DRY_RUN -eq 1 ]]; then
        log_debug "DRY-RUN: would acquire lock at $LOCKFILE"
        return 0
    fi
    
    # mkdir is atomic - if it succeeds, we have the lock
    if ! mkdir "$LOCKFILE" 2>/dev/null; then
        # Check if the lock is stale (older than 1 hour)
        if [[ -d "$LOCKFILE" ]]; then
            local lock_age=0
            if [[ "$(uname)" == "Darwin" ]]; then
                lock_age=$(( $(date +%s) - $(stat -f %m "$LOCKFILE") ))
            else
                lock_age=$(( $(date +%s) - $(stat -c %Y "$LOCKFILE") ))
            fi
            
            if [[ $lock_age -gt 3600 ]]; then
                log_warn "Removing stale lock (age: ${lock_age}s)"
                rm -rf "$LOCKFILE"
                mkdir "$LOCKFILE" 2>/dev/null || {
                    log_error "Failed to acquire lock after removing stale lock"
                    exit 1
                }
            else
                log_error "Another deployment is in progress (lockfile: $LOCKFILE)"
                log_error "Lock age: ${lock_age}s. If you're sure no other deploy is running:"
                log_error "  rm -rf $LOCKFILE"
                exit 1
            fi
        fi
    fi
    
    # Write PID to lockfile for debugging
    echo "$$" > "$LOCKFILE/pid"
    log_debug "Acquired deployment lock (PID: $$)"
}

# Release deployment lock
release_lock() {
    if [[ $DRY_RUN -eq 1 ]]; then
        return 0
    fi
    rm -rf "$LOCKFILE" 2>/dev/null || true
    log_debug "Released deployment lock"
}

# Cleanup on exit
cleanup() {
    release_lock
}
trap cleanup EXIT

# =============================================================================
# VALIDATION FUNCTIONS
# =============================================================================

# Validate required environment files exist
validate_env_files() {
    log_info "Validating environment files..."
    local missing=0
    
    local required_files=(".env")
    if [[ "$ENV" == "prod" ]]; then
        required_files+=(".env.bff.auth" ".env.bff.platform")
    fi
    
    for f in "${required_files[@]}"; do
        if [[ ! -f "$PROJECT_ROOT/$f" ]]; then
            log_error "Missing required file: $f"
            missing=1
        else
            log_debug "Found: $f"
        fi
    done
    
    if [[ $missing -eq 1 ]]; then
        log_error "Please create missing environment files before deploying."
        return 1
    fi
    
    log_success "Environment files validated"
    return 0
}

# Validate required secrets exist (production only)
validate_secrets() {
    if [[ "$ENV" != "prod" ]]; then
        return 0
    fi
    
    log_info "Validating secrets..."
    local missing=0
    
    local required_secrets=(
        "secrets/postgres_password.txt"
        "secrets/jwt_secret.txt"
    )
    
    for secret in "${required_secrets[@]}"; do
        if [[ ! -f "$PROJECT_ROOT/$secret" ]]; then
            log_error "Missing required secret: $secret"
            missing=1
        elif [[ ! -s "$PROJECT_ROOT/$secret" ]]; then
            log_error "Secret file is empty: $secret"
            missing=1
        else
            log_debug "Found secret: $secret"
        fi
    done
    
    if [[ $missing -eq 1 ]]; then
        log_error "Please create missing secrets before production deployment."
        return 1
    fi
    
    log_success "Secrets validated"
    return 0
}

# Check Docker is available
validate_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        return 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker is not running"
        return 1
    fi
    
    log_success "Docker is available"
    return 0
}

# Check for port conflicts before starting services
validate_ports() {
    log_info "Checking for port conflicts..."
    
    # Load env for port values
    load_project_env "$PROJECT_ROOT" 2>/dev/null || true
    
    local ports_to_check=()
    local port_names=()
    
    # Define ports based on environment
    if [[ "$ENV" == "prod" ]]; then
        ports_to_check=(5432 6379 80 443)
        port_names=("PostgreSQL" "Redis" "HTTP" "HTTPS")
    else
        ports_to_check=(
            "${POSTGRES_PORT:-5432}"
            "${REDIS_PORT:-6379}"
            "${BFF_PLATFORM_PORT:-3000}"
            "${BFF_AUTH_PORT:-3001}"
            "${UI_DEV_PORT:-5173}"
        )
        port_names=("PostgreSQL" "Redis" "BFF-Platform" "BFF-Auth" "UI/Caddy")
    fi
    
    local conflicts=0
    local conflict_details=""
    
    for i in "${!ports_to_check[@]}"; do
        local port="${ports_to_check[$i]}"
        local name="${port_names[$i]}"
        
        # Check if port is in use (works on macOS and Linux)
        local in_use=""
        if command -v lsof &> /dev/null; then
            in_use=$(lsof -i ":$port" -sTCP:LISTEN 2>/dev/null | tail -n +2 | head -1)
        elif command -v ss &> /dev/null; then
            in_use=$(ss -tlnp 2>/dev/null | grep ":$port " | head -1)
        elif command -v netstat &> /dev/null; then
            in_use=$(netstat -an 2>/dev/null | grep "LISTEN" | grep ":$port " | head -1)
        fi
        
        if [[ -n "$in_use" ]]; then
            # Check if it's our own container from same project
            local container_using=""
            container_using=$(docker ps --format '{{.Names}}' --filter "publish=$port" 2>/dev/null | head -1)
            
            if [[ -n "$container_using" ]]; then
                # Check if it's from our project
                if [[ "$container_using" == *"$PROJECT"* ]] || [[ "$container_using" == "niyati-"* && "$ENV" == "prod" ]]; then
                    log_debug "Port $port ($name) in use by our container: $container_using (OK)"
                else
                    log_error "Port $port ($name) in use by container: $container_using"
                    conflict_details+="  - Port $port ($name): container '$container_using'\n"
                    conflicts=1
                fi
            else
                # Non-Docker process using the port
                local proc_info=""
                if command -v lsof &> /dev/null; then
                    proc_info=$(lsof -i ":$port" -sTCP:LISTEN 2>/dev/null | tail -n +2 | awk '{print $1 " (PID: " $2 ")"}' | head -1)
                fi
                log_error "Port $port ($name) in use by: ${proc_info:-unknown process}"
                conflict_details+="  - Port $port ($name): ${proc_info:-unknown process}\n"
                conflicts=1
            fi
        else
            log_debug "Port $port ($name) is available"
        fi
    done
    
    if [[ $conflicts -eq 1 ]]; then
        echo ""
        log_error "Port conflicts detected:"
        echo -e "$conflict_details"
        log_error "Please stop conflicting services before deploying."
        log_error "To stop other Niyati stacks:"
        log_error "  docker compose -p <project-name> down --remove-orphans"
        return 1
    fi
    
    log_success "No port conflicts"
    return 0
}

# Run all pre-deploy validations
run_validations() {
    if [[ $SKIP_CHECKS -eq 1 ]]; then
        log_warn "Skipping pre-deploy validations (--skip-checks)"
        return 0
    fi
    
    log_info "Running pre-deploy validations..."
    validate_docker || exit 1
    validate_env_files || exit 1
    validate_secrets || exit 1
    validate_ports || exit 1
    echo ""
}

# =============================================================================
# HEALTH CHECK FUNCTIONS
# =============================================================================

# Get container health status by service name
get_service_health() {
    local svc="$1"
    local cid
    cid=$(capture_eval "$COMPOSE_CMD ps -q $svc")
    if [[ -z "$cid" ]]; then
        echo "not running"
        return 1
    fi
    docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' "$cid" 2>/dev/null || echo "unknown"
}

# Verify service health via HTTP endpoint
verify_service_health() {
    local name="$1"
    local url="$2"
    local max_attempts="${3:-10}"
    local attempt=1
    
    log_debug "Checking $name at $url"
    while [[ $attempt -le $max_attempts ]]; do
        if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
            return 0
        fi
        sleep 2
        ((attempt++))
    done
    return 1
}

# Run comprehensive health checks
run_health_checks() {
    if [[ $SKIP_HEALTH -eq 1 ]]; then
        log_warn "Skipping health checks (--skip-health)"
        return 0
    fi
    
    if [[ $DRY_RUN -eq 1 ]]; then
        log_warn "DRY-RUN: skipping health checks (no containers running)"
        return 0
    fi
    
    echo ""
    log_info "Running health checks..."
    
    # Load env for ports
    load_project_env "$PROJECT_ROOT" 2>/dev/null || true
    
    local platform_port="${BFF_PLATFORM_PORT:-3000}"
    local auth_port="${BFF_AUTH_PORT:-3001}"
    local ui_port="${UI_DEV_PORT:-5173}"
    local failed=0
    
    # Container status
    echo ""
    echo "Container Status:"
    printf "  %-15s %s\n" "Service" "Status"
    printf "  %-15s %s\n" "-------" "------"
    
    for svc in postgres redis bff-auth bff-platform ui-service caddy; do
        local status
        status=$(get_service_health "$svc")
        if [[ "$status" == "healthy" || "$status" == "running" ]]; then
            printf "  %-15s ${GREEN}%s${NC}\n" "$svc" "$status"
        elif [[ "$status" == "not running" ]]; then
            printf "  %-15s ${YELLOW}%s${NC}\n" "$svc" "$status"
        else
            printf "  %-15s ${RED}%s${NC}\n" "$svc" "$status"
        fi
    done
    
    # HTTP endpoint checks
    echo ""
    echo "HTTP Health Endpoints:"
    
    echo -n "  BFF Platform (/api/v1/telemetry/health): "
    if verify_service_health "bff-platform" "http://127.0.0.1:${platform_port}/api/v1/telemetry/health" 5; then
        echo -e "${GREEN}healthy${NC}"
    else
        echo -e "${RED}unhealthy${NC}"
        failed=1
    fi
    
    echo -n "  BFF Auth (/api/v1/telemetry/health): "
    if verify_service_health "bff-auth" "http://127.0.0.1:${auth_port}/api/v1/telemetry/health" 5; then
        echo -e "${GREEN}healthy${NC}"
    else
        echo -e "${RED}unhealthy${NC}"
        failed=1
    fi
    
    echo -n "  UI (via Caddy): "
    if verify_service_health "ui" "http://127.0.0.1:${ui_port}/" 5; then
        echo -e "${GREEN}healthy${NC}"
    else
        echo -e "${RED}unhealthy${NC}"
        failed=1
    fi
    
    if [[ $failed -eq 1 ]]; then
        echo ""
        log_error "Some services are unhealthy. Check logs with: $COMPOSE_CMD logs"
        return 1
    fi
    
    echo ""
    log_success "All health checks passed"
    return 0
}

# =============================================================================
# MIGRATION FUNCTIONS
# =============================================================================

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    if [[ $DRY_RUN -eq 1 ]]; then
        log_warn "DRY-RUN: migrations require running containers"
        log_warn "In actual run, would start postgres/redis then run migrations"
        return 0
    fi
    
    # Ensure infrastructure is running
    log_info "Starting infrastructure services (postgres, redis)..."
    run_cmd "$COMPOSE_CMD up -d postgres redis"
    
    # Get postgres container ID and wait for healthy
    local pg_container
    pg_container=$(capture_eval "$COMPOSE_CMD ps -q postgres")
    if [[ -z "$pg_container" ]]; then
        log_error "Could not find postgres container"
        return 1
    fi
    
    if ! wait_for_container "$pg_container" 120 1; then
        log_error "Postgres did not become healthy"
        return 1
    fi
    
    # Run migrations based on environment
    if [[ "$ENV" == "prod" ]]; then
        # Production: use dedicated migrate service with proper mounts
        log_info "Running migrations via migrate service..."
        run_cmd "$COMPOSE_CMD --profile migration run --rm migrate"
    else
        # Development: run migrations with explicit mounts for local files
        log_info "Running migrations with local file mounts..."
        local network="${PROJECT}_niyati"
        local db_url="postgresql://${POSTGRES_USER:-niyati}:${POSTGRES_PASSWORD:-niyati_dev_pass}@postgres:5432/${POSTGRES_DB:-niyati_dev}"
        
        run_cmd "docker run --rm \
            --network $network \
            -v \"$PROJECT_ROOT/be/migrations:/migrations:ro\" \
            -v \"$PROJECT_ROOT/be/scripts/run_migrations.sh:/scripts/run_migrations.sh:ro\" \
            -e DATABASE_URL=\"$db_url\" \
            niyati/bff-platform:local \
            sh /scripts/run_migrations.sh"
    fi
    
    log_success "Migrations completed"
}

# =============================================================================
# ACTION IMPLEMENTATIONS
# =============================================================================

# ACTION: deploy
action_deploy() {
    print_header "Niyati Deployment ($ENV)"
    
    run_validations
    acquire_lock
    
    # Step 1: Clean up any existing stack
    log_info "Removing existing stack and orphans..."
    run_cmd "$COMPOSE_CMD down --remove-orphans || true"
    
    # Step 2: Build images
    if deploy_prompt "Build Docker images?"; then
        log_info "Building Docker images..."
        run_cmd "$COMPOSE_CMD build"
    fi
    
    # Step 3: Run migrations
    if deploy_prompt "Run database migrations?"; then
        run_migrations
    fi
    
    # Step 4: Start services
    log_info "Starting all services..."
    run_cmd "$COMPOSE_CMD up -d"
    
    # Step 5: Health checks
    sleep 5  # Brief wait for containers to initialize
    run_health_checks
    
    echo ""
    log_success "Deployment complete!"
    show_access_info
}

# ACTION: restart
action_restart() {
    print_header "Niyati Restart ($ENV)"
    
    acquire_lock
    
    if [[ -n "$SERVICE" ]]; then
        log_info "Restarting service: $SERVICE"
        run_cmd "$COMPOSE_CMD up -d --no-deps --build $SERVICE"
    else
        log_info "Restarting all services..."
        run_cmd "$COMPOSE_CMD down --remove-orphans || true"
        run_cmd "$COMPOSE_CMD up -d --build"
    fi
    
    sleep 3
    run_health_checks
    
    log_success "Restart complete!"
}

# ACTION: stop
action_stop() {
    print_header "Niyati Stop ($ENV)"
    
    acquire_lock
    
    log_info "Stopping all services..."
    run_cmd "$COMPOSE_CMD down --remove-orphans"
    
    log_success "All services stopped"
}

# ACTION: rebuild
action_rebuild() {
    print_header "Niyati Rebuild ($ENV)"
    
    run_validations
    acquire_lock
    
    # Stop existing stack
    log_info "Stopping existing stack..."
    run_cmd "$COMPOSE_CMD down --remove-orphans || true"
    
    # Rebuild with no-cache
    log_info "Rebuilding all images (no-cache)..."
    run_cmd "$COMPOSE_CMD build --no-cache"
    
    # Run migrations if requested
    if deploy_prompt "Run database migrations?"; then
        run_migrations
    fi
    
    # Start services
    log_info "Starting all services..."
    run_cmd "$COMPOSE_CMD up -d"
    
    sleep 5
    run_health_checks
    
    log_success "Rebuild complete!"
    show_access_info
}

# ACTION: clean
action_clean() {
    print_header "Niyati Clean ($ENV)"
    
    acquire_lock
    
    # Step 1: Stop and remove all containers for BOTH project names
    log_info "Stopping all services from all project names..."
    run_cmd "docker compose -p niyati -f docker-compose.yml -f docker-compose.override.yml down --remove-orphans --volumes 2>/dev/null || true"
    run_cmd "docker compose -p niyati-prod -f docker-compose.yml -f docker-compose.prod.yml down --remove-orphans --volumes 2>/dev/null || true"
    
    # Step 2: Force remove any orphaned niyati containers by name
    log_info "Removing any orphaned niyati containers..."
    run_cmd "docker ps -a --filter 'name=niyati' -q | xargs -r docker rm -f 2>/dev/null || true"
    
    # Step 3: Remove niyati networks
    log_info "Removing niyati networks..."
    run_cmd "docker network rm niyati_niyati niyati_default niyati-prod_niyati niyati-prod_default 2>/dev/null || true"
    run_cmd "docker network prune -f"
    
    # Step 4: Remove niyati volumes
    log_info "Removing niyati volumes..."
    run_cmd "docker volume ls --filter 'name=niyati' -q | xargs -r docker volume rm -f 2>/dev/null || true"
    
    # Step 5: Remove niyati images
    if deploy_prompt "Remove all niyati Docker images?"; then
        log_info "Removing niyati images..."
        run_cmd "docker images --filter 'reference=niyati/*' -q | xargs -r docker rmi -f 2>/dev/null || true"
    fi
    
    # Step 6: Prune unused images
    if deploy_prompt "Prune unused Docker images?"; then
        log_info "Pruning unused images..."
        run_cmd "docker image prune -f"
    fi
    
    # Step 7: Prune build cache
    if deploy_prompt "Prune Docker build cache?"; then
        log_info "Pruning build cache..."
        run_cmd "docker builder prune -f"
    fi
    
    log_success "Cleanup complete!"
}

# ACTION: fresh - Complete fresh start (clean + rebuild + deploy)
action_fresh() {
    print_header "Niyati Fresh Deployment ($ENV)"
    
    log_warn "This will perform a COMPLETE fresh start:"
    log_warn "  - Stop all niyati containers"
    log_warn "  - Remove all volumes (DATABASE DATA WILL BE LOST)"
    log_warn "  - Remove all networks"
    log_warn "  - Remove all niyati images"
    log_warn "  - Rebuild everything from scratch"
    log_warn "  - Run migrations on fresh database"
    echo ""
    
    if ! deploy_prompt "Continue with fresh deployment?"; then
        log_info "Aborted."
        exit 0
    fi
    
    acquire_lock
    
    # Step 1: Thorough cleanup
    log_info "=== Step 1/6: Complete cleanup ==="
    run_cmd "docker compose -p niyati -f docker-compose.yml -f docker-compose.override.yml down --remove-orphans --volumes 2>/dev/null || true"
    run_cmd "docker compose -p niyati-prod -f docker-compose.yml -f docker-compose.prod.yml down --remove-orphans --volumes 2>/dev/null || true"
    run_cmd "docker ps -a --filter 'name=niyati' -q | xargs -r docker rm -f 2>/dev/null || true"
    
    # Step 2: Remove networks
    log_info "=== Step 2/6: Remove networks ==="
    run_cmd "docker network rm niyati_niyati niyati_default niyati-prod_niyati niyati-prod_default 2>/dev/null || true"
    run_cmd "docker network prune -f"
    
    # Step 3: Remove volumes
    log_info "=== Step 3/6: Remove volumes ==="
    run_cmd "docker volume ls --filter 'name=niyati' -q | xargs -r docker volume rm -f 2>/dev/null || true"
    
    # Step 4: Remove images and prune
    log_info "=== Step 4/6: Remove images and prune ==="
    run_cmd "docker images --filter 'reference=niyati/*' -q | xargs -r docker rmi -f 2>/dev/null || true"
    run_cmd "docker system prune -f"
    
    # Step 5: Build fresh images
    log_info "=== Step 5/6: Build fresh images (no-cache) ==="
    run_cmd "$COMPOSE_CMD build --no-cache"
    
    # Step 6: Start services (migrations run automatically via healthcheck dependencies)
    log_info "=== Step 6/6: Start services ==="
    run_cmd "$COMPOSE_CMD up -d"
    
    # Wait for services to be healthy
    log_info "Waiting for services to become healthy..."
    sleep 10
    run_health_checks
    
    echo ""
    log_success "Fresh deployment complete!"
    show_access_info
}

# ACTION: migrate
action_migrate() {
    print_header "Niyati Migrations ($ENV)"
    
    acquire_lock
    run_migrations
}

# ACTION: status
action_status() {
    print_header "Niyati Status ($ENV)"
    
    echo ""
    log_info "Docker Compose Configuration:"
    echo "  Project:  $PROJECT"
    echo "  Files:    $COMPOSE_FILES"
    echo "  Command:  $COMPOSE_CMD"
    
    echo ""
    log_info "Running Containers:"
    run_cmd "$COMPOSE_CMD ps"
    
    run_health_checks
}

# Show access information
show_access_info() {
    if [[ $DRY_RUN -eq 1 ]]; then
        return 0
    fi
    
    load_project_env "$PROJECT_ROOT" 2>/dev/null || true
    local ui_port="${UI_DEV_PORT:-5173}"
    
    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo "  Access the Niyati platform at: http://localhost:${ui_port}"
    echo ""
    echo "  Useful commands:"
    echo "    View logs:    $COMPOSE_CMD logs -f"
    echo "    Service logs: $COMPOSE_CMD logs -f <service>"
    echo "    Stop all:     $0 --env=$ENV --action=stop"
    echo "═══════════════════════════════════════════════════════"
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

# Print configuration
echo ""
log_info "Configuration:"
echo "  Environment:    $ENV"
echo "  Action:         $ACTION"
echo "  Project:        $PROJECT"
echo "  Compose:        $COMPOSE_FILES"
[[ -n "$SERVICE" ]] && echo "  Service:        $SERVICE"
[[ $DRY_RUN -eq 1 ]] && echo "  Mode:           DRY-RUN"
[[ -n "$LOG_FILE" ]] && echo "  Log file:       $LOG_FILE"
echo ""

# Initialize log file
if [[ -n "$LOG_FILE" ]]; then
    echo "========================================" >> "$LOG_FILE"
    echo "Niyati Deploy: $(date)" >> "$LOG_FILE"
    echo "Action: $ACTION | Env: $ENV | Project: $PROJECT" >> "$LOG_FILE"
    echo "========================================" >> "$LOG_FILE"
fi

# Execute the requested action
case "$ACTION" in
    deploy)
        action_deploy
        ;;
    restart)
        action_restart
        ;;
    stop)
        action_stop
        ;;
    rebuild)
        action_rebuild
        ;;
    clean)
        action_clean
        ;;
    fresh)
        action_fresh
        ;;
    migrate)
        action_migrate
        ;;
    status)
        action_status
        ;;
    *)
        log_error "Unknown action: $ACTION"
        exit 1
        ;;
esac

# Final message
echo ""
if [[ $DRY_RUN -eq 1 ]]; then
    log_info "Dry-run complete — no commands were executed."
    log_info "Re-run without --dry-run to apply changes."
fi
