#!/usr/bin/env bash
# =============================================================================
# Database Management Script for Niyati
# =============================================================================
# Provides helpers for managing PostgreSQL in Docker
#
# Usage: ./scripts/db.sh <command> [options]
#
# Commands: start, stop, restart, status, logs, psql, migrate, seed, reset,
#           backup, restore, health
# =============================================================================

# Load common library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

# Configuration
PROJECT_ROOT="$(find_project_root "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

CONTAINER_NAME="postgres"
COMPOSE_MODE="dev"
PROD_MODE=false

# Parse arguments for mode early to set CONTAINER_NAME correctly
for arg in "$@"; do
    if [[ "$arg" == "--prod" ]]; then
        PROD_MODE=true
        COMPOSE_MODE="prod"
        CONTAINER_NAME="niyati-postgres-prod"
    fi
done

# =============================================================================
# USAGE
# =============================================================================

print_usage() {
    cat << EOF
${BOLD}Database Management Script for Niyati${NC}

${YELLOW}Usage:${NC} $0 <command> [options]

${YELLOW}Commands:${NC}
  ${GREEN}start${NC}           Start PostgreSQL container
  ${GREEN}stop${NC}            Stop PostgreSQL container
  ${GREEN}restart${NC}         Restart PostgreSQL container
  ${GREEN}status${NC}          Check PostgreSQL status
  ${GREEN}logs${NC}            View PostgreSQL logs
  ${GREEN}psql${NC}            Connect to PostgreSQL shell
  ${GREEN}migrate${NC}         Run migrations
  ${GREEN}seed${NC}            Seed test data
  ${GREEN}reset${NC}           Reset database (${RED}WARNING: destructive${NC})
  ${GREEN}backup${NC}          Backup database to file
  ${GREEN}restore${NC}         Restore database from file
  ${GREEN}health${NC}          Check database health

${YELLOW}Options:${NC}
  --prod          Use production configuration
  -h, --help      Show this help message

${YELLOW}Examples:${NC}
  $0 start                    # Start dev database
  $0 start --prod             # Start prod database
  $0 psql                     # Connect to dev database
  $0 migrate                  # Run migrations
  $0 backup db_backup.sql     # Backup database
  $0 restore db_backup.sql    # Restore from backup

EOF
}

# =============================================================================
# DATABASE FUNCTIONS
# =============================================================================

db_start() {
    log_info "Starting PostgreSQL..."
    local compose_cmd
    compose_cmd=$(get_compose_cmd "$COMPOSE_MODE")
    $compose_cmd up -d postgres
    log_success "PostgreSQL started"
    db_health
}

db_stop() {
    log_warn "Stopping PostgreSQL..."
    local compose_cmd
    compose_cmd=$(get_compose_cmd "$COMPOSE_MODE")
    $compose_cmd stop postgres
    log_success "PostgreSQL stopped"
}

db_restart() {
    db_stop
    sleep 2
    db_start
}

db_status() {
    log_info "PostgreSQL container status:"
    docker ps -a --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
}

db_logs() {
    log_info "PostgreSQL logs (last 50 lines, press Ctrl+C to exit):"
    docker logs -f --tail 50 "$CONTAINER_NAME"
}

db_psql() {
    local dbname="${POSTGRES_DB:-niyati_dev}"
    local dbuser="${POSTGRES_USER:-niyati}"
    
    log_info "Connecting to PostgreSQL as $dbuser..."
    docker exec -it "$CONTAINER_NAME" psql -U "$dbuser" -d "$dbname"
}

db_migrate() {
    log_info "Running database migrations..."
    
    local dbname="${POSTGRES_DB:-niyati_dev}"
    local dbuser="${POSTGRES_USER:-niyati}"
    local migrations_dir="$PROJECT_ROOT/packages/migrations"
    
    if [[ ! -d "$migrations_dir" ]]; then
        log_error "Migrations directory not found: $migrations_dir"
        exit 1
    fi
    
    log_step "Applying SQL migrations from $migrations_dir..."
    
    # Apply all .up.sql files in order
    for migration in "$migrations_dir"/*.up.sql; do
        if [[ -f "$migration" ]]; then
            log_step "Applying $(basename "$migration")..."
            docker exec -i "$CONTAINER_NAME" psql -U "$dbuser" -d "$dbname" < "$migration"
        fi
    done
    
    log_success "Migrations completed"
}

db_seed() {
    log_info "Seeding test data..."
    
    local compose_cmd
    compose_cmd=$(get_compose_cmd "$COMPOSE_MODE")
    
    # Check if auth service is running
    if ! docker ps --filter "name=bff-auth" --format "{{.Names}}" | grep -q "bff-auth"; then
        log_warn "BFF Auth service not running. Starting it..."
        $compose_cmd up -d bff-auth
        sleep 5
    fi
    
    local bff_container="bff-auth"
    
    # Check if seed script exists
    if docker exec "$bff_container" test -f /app/scripts/seed_test_data.js 2>/dev/null; then
        docker exec -it "$bff_container" node /app/scripts/seed_test_data.js
        log_success "Seeding completed"
    elif [[ -f "$PROJECT_ROOT/be/seed_ci.sql" ]]; then
        log_step "Applying be/seed_ci.sql..."
        local dbname="${POSTGRES_DB:-niyati_dev}"
        local dbuser="${POSTGRES_USER:-niyati}"
        docker exec -i "$CONTAINER_NAME" psql -U "$dbuser" -d "$dbname" < "$PROJECT_ROOT/be/seed_ci.sql"
        log_success "Seeding completed"
    else
        log_warn "No seed script found. You can seed data manually."
    fi
}

db_reset() {
    echo -e "${RED}WARNING: This will DELETE ALL DATA in the database!${NC}"
    if ! confirm_action "Are you sure you want to continue?" "n"; then
        log_info "Aborted."
        exit 0
    fi
    
    local dbname="${POSTGRES_DB:-niyati_dev}"
    local dbuser="${POSTGRES_USER:-niyati}"
    
    log_warn "Dropping and recreating database..."
    docker exec -it "$CONTAINER_NAME" psql -U "$dbuser" -d postgres -c "DROP DATABASE IF EXISTS $dbname;"
    docker exec -it "$CONTAINER_NAME" psql -U "$dbuser" -d postgres -c "CREATE DATABASE $dbname OWNER $dbuser;"
    
    log_success "Database reset complete. Run migrations to set up schema."
}

db_backup() {
    local backup_file="${1:-db_backup_$(get_timestamp).sql}"
    local dbname="${POSTGRES_DB:-niyati_dev}"
    local dbuser="${POSTGRES_USER:-niyati}"
    
    log_info "Backing up database to $backup_file..."
    docker exec "$CONTAINER_NAME" pg_dump -U "$dbuser" -d "$dbname" > "$backup_file"
    log_success "Backup saved to $backup_file"
}

db_restore() {
    local backup_file="$1"
    
    if [[ -z "$backup_file" ]]; then
        log_error "Please specify backup file"
        echo "Usage: $0 restore <backup_file.sql>"
        exit 1
    fi
    
    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        exit 1
    fi
    
    local dbname="${POSTGRES_DB:-niyati_dev}"
    local dbuser="${POSTGRES_USER:-niyati}"
    
    log_warn "Restoring database from $backup_file..."
    docker exec -i "$CONTAINER_NAME" psql -U "$dbuser" -d "$dbname" < "$backup_file"
    log_success "Database restored"
}

db_health() {
    log_info "Checking database health..."
    
    local dbname="${POSTGRES_DB:-niyati_dev}"
    local dbuser="${POSTGRES_USER:-niyati}"
    
    if ! wait_for_postgres "$CONTAINER_NAME" 30; then
        exit 1
    fi
    
    # Show connection info
    docker exec "$CONTAINER_NAME" psql -U "$dbuser" -d "$dbname" -c "SELECT version();" -t
    docker exec "$CONTAINER_NAME" psql -U "$dbuser" -d "$dbname" -c \
        "SELECT current_database() as database, current_user as user, pg_size_pretty(pg_database_size(current_database())) as size;" -t
    
    # Show table count
    local table_count
    table_count=$(docker exec "$CONTAINER_NAME" psql -U "$dbuser" -d "$dbname" -t -c \
        "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema');")
    echo "User tables: $table_count"
}

# =============================================================================
# MAIN
# =============================================================================

# Parse arguments
COMMAND=""
ARGS=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --prod)
            PROD_MODE=true
            COMPOSE_MODE="prod"
            shift
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        start|stop|restart|status|logs|psql|migrate|seed|reset|backup|restore|health)
            COMMAND=$1
            shift
            ARGS="$*"
            break
            ;;
        *)
            if [[ -z "$COMMAND" ]]; then
                log_error "Unknown command: $1"
                print_usage
                exit 1
            fi
            ;;
    esac
done

if [[ -z "$COMMAND" ]]; then
    print_usage
    exit 1
fi

# Load environment
load_project_env "$PROJECT_ROOT"

# Execute command
case $COMMAND in
    start)   db_start ;;
    stop)    db_stop ;;
    restart) db_restart ;;
    status)  db_status ;;
    logs)    db_logs ;;
    psql)    db_psql ;;
    migrate) db_migrate ;;
    seed)    db_seed ;;
    reset)   db_reset ;;
    backup)  db_backup $ARGS ;;
    restore) db_restore $ARGS ;;
    health)  db_health ;;
    *)
        log_error "Unknown command: $COMMAND"
        print_usage
        exit 1
        ;;
esac
