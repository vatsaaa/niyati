#!/usr/bin/env bash
# =============================================================================
# Niyati Scripts - Common Library
# =============================================================================
# Shared functions used across all Niyati scripts. Source this file at the
# beginning of any bash script in this repository.
#
# Usage:
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   source "${SCRIPT_DIR}/lib/common.sh"
# =============================================================================

# Exit on error, undefined vars, and pipe failures
set -euo pipefail

# =============================================================================
# COLOR DEFINITIONS
# =============================================================================
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export CYAN='\033[0;36m'
export MAGENTA='\033[0;35m'
export BOLD='\033[1m'
export NC='\033[0m' # No Color

# =============================================================================
# LOGGING FUNCTIONS
# =============================================================================

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_debug() {
    if [[ "${DEBUG:-0}" == "1" ]]; then
        echo -e "${CYAN}[DEBUG]${NC} $1"
    fi
}

log_step() {
    echo -e "${BLUE}→${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_fail() {
    echo -e "${RED}✗${NC} $1" >&2
}

# Print a section header
print_header() {
    local title="$1"
    local width="${2:-50}"
    local border=$(printf '═%.0s' $(seq 1 $width))
    echo -e "${BLUE}╔${border}╗${NC}"
    printf "${BLUE}║${NC} %-$((width-2))s ${BLUE}║${NC}\n" "$title"
    echo -e "${BLUE}╚${border}╝${NC}"
}

# =============================================================================
# ENVIRONMENT FUNCTIONS
# =============================================================================

# Find the project root directory
find_project_root() {
    local dir="${1:-$(pwd)}"
    while [[ "$dir" != "/" ]]; do
        # New structure: apps/ and packages/ directories with infra/docker-compose.yml
        if [[ -d "$dir/apps" && -d "$dir/packages" && -f "$dir/infra/docker-compose.yml" ]]; then
            echo "$dir"
            return 0
        fi
        # Legacy structure: be/ and ui/ directories with docker-compose.yml
        if [[ -f "$dir/docker-compose.yml" && -d "$dir/be" && -d "$dir/ui" ]]; then
            echo "$dir"
            return 0
        fi
        dir="$(dirname "$dir")"
    done
    log_error "Could not find project root (no apps/packages structure or legacy be/ui structure)"
    return 1
}

# Load environment variables from .env file
load_env() {
    local env_file="${1:-.env}"
    if [[ -f "$env_file" ]]; then
        log_debug "Loading environment from $env_file"
        set -a
        # shellcheck disable=SC1090
        source "$env_file"
        set +a
        return 0
    else
        log_warn "Environment file not found: $env_file"
        return 1
    fi
}

# Load all project environment files
load_project_env() {
    local project_root="${1:-$(find_project_root)}"
    cd "$project_root"
    
    local infra_dir="infra"
    
    # Load main .env from infra dir
    [[ -f "$infra_dir/.env" ]] && load_env "$infra_dir/.env"
    
    # Export common defaults
    export POSTGRES_USER="${POSTGRES_USER:-niyati}"
    export POSTGRES_DB="${POSTGRES_DB:-niyati_dev}"
    export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-niyati_dev_pass}"
    export BFF_PLATFORM_PORT="${BFF_PLATFORM_PORT:-3000}"
    export BFF_AUTH_PORT="${BFF_AUTH_PORT:-3001}"
    export UI_DEV_PORT="${UI_DEV_PORT:-5173}"
}

# Ensure required environment files exist
ensure_env_files() {
    local project_root="${1:-$(pwd)}"
    local infra_dir="infra"
    local created_any=0
    
    log_info "Checking environment files in $infra_dir/..."
    
    # Check main .env in infra
    if [[ ! -f "$project_root/$infra_dir/.env" ]]; then
        if [[ -f "$project_root/$infra_dir/.env.example" ]]; then
            log_step "Creating $infra_dir/.env from example..."
            cp "$project_root/$infra_dir/.env.example" "$project_root/$infra_dir/.env"
            log_success "Created $infra_dir/.env"
            created_any=1
        else
            log_warn "$infra_dir/.env and example not found"
        fi
    else
        log_success "$infra_dir/.env exists"
    fi
    
    # Check service-specific env files in infra
    for svc in auth platform; do
        local env_file="$project_root/$infra_dir/.env.bff.${svc}"
        local example_file="$project_root/$infra_dir/.env.bff.${svc}.example"
        
        if [[ ! -f "$env_file" ]]; then
            if [[ -f "$example_file" ]]; then
                log_step "Creating $infra_dir/.env.bff.${svc} from example..."
                cp "$example_file" "$env_file"
                log_success "Created $infra_dir/.env.bff.${svc}"
                created_any=1
            else
                log_warn "$infra_dir/.env.bff.${svc} not found - skipping"
            fi
        else
            log_success "$infra_dir/.env.bff.${svc} exists"
        fi
    done
    
    # Check UI env file in infra
    if [[ ! -f "$project_root/$infra_dir/.env.ui" ]]; then
        if [[ -f "$project_root/$infra_dir/.env.ui.example" ]]; then
            log_step "Creating $infra_dir/.env.ui from example..."
            cp "$project_root/$infra_dir/.env.ui.example" "$project_root/$infra_dir/.env.ui"
            log_success "Created $infra_dir/.env.ui"
            created_any=1
        else
            log_step "Creating $infra_dir/.env.ui with defaults..."
            cat > "$project_root/$infra_dir/.env.ui" << 'EOF'
VITE_APP_VERSION=0.1.0-dev
VITE_BFF_BASE_URL=http://localhost:3000
VITE_DEBUG_MODE=true
EOF
            log_success "Created $infra_dir/.env.ui"
            created_any=1
        fi
    else
        log_success "$infra_dir/.env.ui exists"
    fi
    
    return $created_any
}

# =============================================================================
# DOCKER FUNCTIONS
# =============================================================================

# Check if Docker is installed and running
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        echo "Please install Docker Desktop from: https://docs.docker.com/get-docker/"
        return 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker is not running"
        echo "Please start Docker Desktop and try again"
        return 1
    fi
    
    log_success "Docker is installed and running"
    return 0
}

# Get the compose command based on mode
get_compose_cmd() {
    local mode="${1:-dev}"
    local base_cmd="docker compose"
    local infra_dir="infra"
    
    case "$mode" in
        dev|development)
            echo "$base_cmd -f $infra_dir/docker-compose.yml -f $infra_dir/docker-compose.override.yml"
            ;;
        override)
            echo "$base_cmd -f $infra_dir/docker-compose.yml -f $infra_dir/docker-compose.override.yml"
            ;;
        prod|production)
            echo "$base_cmd -f $infra_dir/docker-compose.yml -f $infra_dir/docker-compose.prod.yml"
            ;;
        ci)
            echo "$base_cmd -f $infra_dir/docker-compose.yml -f $infra_dir/docker-compose.ci.yml"
            ;;
        *)
            echo "$base_cmd"
            ;;
    esac
}

# Wait for a container to be healthy
wait_for_container() {
    local container="$1"
    local max_attempts="${2:-30}"
    local interval="${3:-1}"
    local attempt=1
    
    log_info "Waiting for $container to be healthy..."
    while [[ $attempt -le $max_attempts ]]; do
        local status
        status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "not_found")
        
        case "$status" in
            healthy)
                log_success "$container is healthy"
                return 0
                ;;
            not_found)
                # Container might not have health check, check if running
                local running
                running=$(docker inspect --format='{{.State.Running}}' "$container" 2>/dev/null || echo "false")
                if [[ "$running" == "true" ]]; then
                    log_success "$container is running (no health check)"
                    return 0
                fi
                ;;
        esac
        
        log_debug "Attempt $attempt/$max_attempts: $container status=$status"
        sleep "$interval"
        ((attempt++))
    done
    
    log_error "$container did not become healthy after $max_attempts attempts"
    return 1
}

# Wait for PostgreSQL to be ready
wait_for_postgres() {
    local container="${1:-postgres}"
    local max_attempts="${2:-60}"
    local db_user="${POSTGRES_USER:-niyati}"
    local db_name="${POSTGRES_DB:-niyati_dev}"
    local attempt=1
    
    log_info "Waiting for PostgreSQL to be ready..."
    while [[ $attempt -le $max_attempts ]]; do
        if docker exec "$container" pg_isready -U "$db_user" -d "$db_name" >/dev/null 2>&1; then
            log_success "PostgreSQL is ready"
            return 0
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done
    
    echo ""
    log_error "PostgreSQL did not become ready after $max_attempts seconds"
    return 1
}

# =============================================================================
# HTTP/HEALTH CHECK FUNCTIONS
# =============================================================================

# Check a URL with retries
check_url_with_retries() {
    local url="$1"
    local max_attempts="${2:-10}"
    local base_sleep="${3:-2}"
    local attempt=1
    local max_sleep=10
    
    log_info "Checking $url (up to $max_attempts attempts)"
    while [[ $attempt -le $max_attempts ]]; do
        local http_code
        http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
        
        if [[ "$http_code" == "200" ]]; then
            log_success "$url is reachable (HTTP $http_code)"
            return 0
        fi
        
        # Calculate sleep with cap
        local sleep_time=$((base_sleep * attempt))
        if [[ $sleep_time -gt $max_sleep ]]; then
            sleep_time=$max_sleep
        fi
        
        log_debug "Attempt $attempt/$max_attempts: $url returned HTTP $http_code, sleeping ${sleep_time}s"
        sleep "$sleep_time"
        ((attempt++))
    done
    
    log_fail "$url not reachable after $max_attempts attempts"
    return 1
}

# Run health checks on standard endpoints
# NOTE: This function assumes ports are exposed to host (dev mode).
# For production, use deploy_niyati.sh which checks via docker exec.
run_health_checks() {
    local base_url="${1:-http://localhost}"
    local platform_port="${BFF_PLATFORM_PORT:-3000}"
    local auth_port="${BFF_AUTH_PORT:-3001}"
    local ui_port="${UI_DEV_PORT:-5173}"
    local failed=0
    
    echo ""
    log_info "Running health checks..."
    echo ""
    
    # BFF Platform
    echo -n "BFF Platform (port $platform_port): "
    if curl -s "http://127.0.0.1:${platform_port}/api/v1/telemetry/health" | jq -r '.status' 2>/dev/null; then
        :
    else
        echo -e "${RED}unhealthy${NC}"
        failed=1
    fi
    
    # BFF Auth
    echo -n "BFF Auth (port $auth_port): "
    if curl -s "http://127.0.0.1:${auth_port}/api/v1/telemetry/health" | jq -r '.status' 2>/dev/null; then
        :
    else
        echo -e "${RED}unhealthy${NC}"
        failed=1
    fi
    
    # UI
    echo -n "UI (port $ui_port): "
    if curl -s "http://127.0.0.1:${ui_port}/" >/dev/null 2>&1; then
        echo -e "${GREEN}healthy${NC}"
    else
        echo -e "${RED}unhealthy${NC}"
        failed=1
    fi
    
    return $failed
}

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

# Confirm a destructive action
confirm_action() {
    local message="${1:-Are you sure?}"
    local default="${2:-n}"
    
    if [[ "${FORCE:-0}" == "1" ]] || [[ "${CI:-false}" == "true" ]]; then
        return 0
    fi
    
    local prompt
    if [[ "$default" == "y" ]]; then
        prompt="[Y/n]"
    else
        prompt="[y/N]"
    fi
    
    read -p "$message $prompt: " -r response
    response="${response:-$default}"
    
    if [[ "$response" =~ ^[Yy]([Ee][Ss])?$ ]]; then
        return 0
    fi
    return 1
}

# Check if a command exists
require_command() {
    local cmd="$1"
    local install_hint="${2:-}"
    
    if ! command -v "$cmd" &> /dev/null; then
        log_error "Required command not found: $cmd"
        if [[ -n "$install_hint" ]]; then
            echo "Install with: $install_hint"
        fi
        return 1
    fi
    return 0
}

# Get timestamp for backups/logs
get_timestamp() {
    date +%Y%m%d_%H%M%S
}
