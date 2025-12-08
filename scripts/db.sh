#!/bin/bash
# Database Management Script for Niyati
# Provides helpers for managing PostgreSQL in Docker

set -e

COMPOSE_FILE="docker-compose.yml"
COMPOSE_PROD_FILE="docker-compose.prod.yml"
CONTAINER_NAME="niyati-postgres-dev"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function print_usage() {
    cat << EOF
Database Management Script for Niyati

Usage: $0 <command> [options]

Commands:
  start           Start PostgreSQL container
  stop            Stop PostgreSQL container
  restart         Restart PostgreSQL container
  status          Check PostgreSQL status
  logs            View PostgreSQL logs
  psql            Connect to PostgreSQL shell
  migrate         Run migrations
  seed            Seed test data
  reset           Reset database (WARNING: destructive)
  backup          Backup database to file
  restore         Restore database from file
  health          Check database health

Options:
  --prod          Use production configuration
  -h, --help      Show this help message

Examples:
  $0 start                    # Start dev database
  $0 start --prod             # Start prod database
  $0 psql                     # Connect to dev database
  $0 migrate                  # Run migrations
  $0 backup db_backup.sql     # Backup database
  $0 restore db_backup.sql    # Restore from backup

EOF
}

function check_env() {
    if [ ! -f .env ]; then
        echo -e "${YELLOW}Warning: .env file not found. Using defaults from .env.example${NC}"
        if [ -f .env.example ]; then
            echo "Creating .env from .env.example..."
            cp .env.example .env
        else
            echo -e "${RED}Error: Neither .env nor .env.example found${NC}"
            exit 1
        fi
    fi
    source .env
}

function db_start() {
    echo -e "${GREEN}Starting PostgreSQL...${NC}"
    if [ "$PROD_MODE" = true ]; then
        docker-compose -f $COMPOSE_FILE -f $COMPOSE_PROD_FILE up -d postgres
        CONTAINER_NAME="niyati-postgres-prod"
    else
        docker-compose -f $COMPOSE_FILE up -d postgres
    fi
    echo -e "${GREEN}PostgreSQL started${NC}"
    db_health
}

function db_stop() {
    echo -e "${YELLOW}Stopping PostgreSQL...${NC}"
    if [ "$PROD_MODE" = true ]; then
        docker-compose -f $COMPOSE_FILE -f $COMPOSE_PROD_FILE stop postgres
    else
        docker-compose -f $COMPOSE_FILE stop postgres
    fi
    echo -e "${GREEN}PostgreSQL stopped${NC}"
}

function db_restart() {
    db_stop
    sleep 2
    db_start
}

function db_status() {
    echo "PostgreSQL container status:"
    docker ps -a --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
}

function db_logs() {
    echo "PostgreSQL logs (last 50 lines, press Ctrl+C to exit):"
    docker logs -f --tail 50 $CONTAINER_NAME
}

function db_psql() {
    local DBNAME="${POSTGRES_DB:-niyati_dev}"
    local DBUSER="${POSTGRES_USER:-niyati}"
    
    echo -e "${GREEN}Connecting to PostgreSQL as $DBUSER...${NC}"
    docker exec -it $CONTAINER_NAME psql -U $DBUSER -d $DBNAME
}

function db_migrate() {
    echo -e "${GREEN}Running database migrations...${NC}"
    
    local DBNAME="${POSTGRES_DB:-niyati_dev}"
    local DBUSER="${POSTGRES_USER:-niyati}"
    local MIGRATIONS_DIR="./be/migrations"
    
    if [ ! -d "$MIGRATIONS_DIR" ]; then
        echo -e "${RED}Error: Migrations directory not found: $MIGRATIONS_DIR${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}Applying SQL migrations from $MIGRATIONS_DIR...${NC}"
    
    # Apply all .up.sql files in order
    for migration in "$MIGRATIONS_DIR"/*.up.sql; do
        if [ -f "$migration" ]; then
            echo -e "${GREEN}Applying $(basename "$migration")...${NC}"
            docker exec -i $CONTAINER_NAME psql -U $DBUSER -d $DBNAME < "$migration"
        fi
    done
    
    echo -e "${GREEN}Migrations completed${NC}"
}

function db_seed() {
    echo -e "${GREEN}Seeding test data...${NC}"
    
    # Check if auth service is running (it has the seed script)
    if ! docker ps --filter "name=niyati-bff-auth" --format "{{.Names}}" | grep -q "niyati-bff-auth"; then
        echo -e "${YELLOW}BFF Auth service not running. Starting it...${NC}"
        if [ "$PROD_MODE" = true ]; then
            docker-compose -f $COMPOSE_FILE -f $COMPOSE_PROD_FILE up -d bff-auth
        else
            docker-compose -f $COMPOSE_FILE up -d bff-auth
        fi
        sleep 5
    fi
    
    local BFF_CONTAINER="niyati-bff-auth-dev"
    if [ "$PROD_MODE" = true ]; then
        BFF_CONTAINER="niyati-bff-auth-prod"
    fi
    
    # Check if seed script exists
    if docker exec $BFF_CONTAINER test -f ../scripts/seed_test_data.js; then
        docker exec -it $BFF_CONTAINER node ../scripts/seed_test_data.js
        echo -e "${GREEN}Seeding completed${NC}"
    else
        echo -e "${YELLOW}Warning: seed_test_data.js not found in be/scripts/${NC}"
        echo -e "${YELLOW}You can seed data manually using SQL or create the seed script${NC}"
    fi
}

function db_reset() {
    echo -e "${RED}WARNING: This will DELETE ALL DATA in the database!${NC}"
    read -p "Are you sure you want to continue? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        echo "Aborted."
        exit 0
    fi
    
    local DBNAME="${POSTGRES_DB:-niyati_dev}"
    local DBUSER="${POSTGRES_USER:-niyati}"
    
    echo -e "${YELLOW}Dropping and recreating database...${NC}"
    docker exec -it $CONTAINER_NAME psql -U $DBUSER -d postgres -c "DROP DATABASE IF EXISTS $DBNAME;"
    docker exec -it $CONTAINER_NAME psql -U $DBUSER -d postgres -c "CREATE DATABASE $DBNAME OWNER $DBUSER;"
    
    echo -e "${GREEN}Database reset complete. Run migrations to set up schema.${NC}"
}

function db_backup() {
    local BACKUP_FILE="${1:-db_backup_$(date +%Y%m%d_%H%M%S).sql}"
    local DBNAME="${POSTGRES_DB:-niyati_dev}"
    local DBUSER="${POSTGRES_USER:-niyati}"
    
    echo -e "${GREEN}Backing up database to $BACKUP_FILE...${NC}"
    docker exec $CONTAINER_NAME pg_dump -U $DBUSER -d $DBNAME > "$BACKUP_FILE"
    echo -e "${GREEN}Backup saved to $BACKUP_FILE${NC}"
}

function db_restore() {
    local BACKUP_FILE="$1"
    
    if [ -z "$BACKUP_FILE" ]; then
        echo -e "${RED}Error: Please specify backup file${NC}"
        echo "Usage: $0 restore <backup_file.sql>"
        exit 1
    fi
    
    if [ ! -f "$BACKUP_FILE" ]; then
        echo -e "${RED}Error: Backup file not found: $BACKUP_FILE${NC}"
        exit 1
    fi
    
    local DBNAME="${POSTGRES_DB:-niyati_dev}"
    local DBUSER="${POSTGRES_USER:-niyati}"
    
    echo -e "${YELLOW}Restoring database from $BACKUP_FILE...${NC}"
    docker exec -i $CONTAINER_NAME psql -U $DBUSER -d $DBNAME < "$BACKUP_FILE"
    echo -e "${GREEN}Database restored${NC}"
}

function db_health() {
    echo -e "${GREEN}Checking database health...${NC}"
    
    local DBNAME="${POSTGRES_DB:-niyati_dev}"
    local DBUSER="${POSTGRES_USER:-niyati}"
    
    # Wait for database to be ready
    echo -n "Waiting for database to be ready"
    for i in {1..30}; do
        if docker exec $CONTAINER_NAME pg_isready -U $DBUSER -d $DBNAME > /dev/null 2>&1; then
            echo -e "\n${GREEN}✓ Database is healthy${NC}"
            
            # Show connection info
            docker exec $CONTAINER_NAME psql -U $DBUSER -d $DBNAME -c "SELECT version();" -t
            docker exec $CONTAINER_NAME psql -U $DBUSER -d $DBNAME -c "SELECT current_database() as database, current_user as user, pg_size_pretty(pg_database_size(current_database())) as size;" -t
            
            # Show table count
            local TABLE_COUNT=$(docker exec $CONTAINER_NAME psql -U $DBUSER -d $DBNAME -t -c "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema');")
            echo "User tables: $TABLE_COUNT"
            
            return 0
        fi
        echo -n "."
        sleep 1
    done
    
    echo -e "\n${RED}✗ Database is not healthy${NC}"
    exit 1
}

# Parse arguments
PROD_MODE=false
COMMAND=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --prod)
            PROD_MODE=true
            CONTAINER_NAME="niyati-postgres-prod"
            shift
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        start|stop|restart|status|logs|psql|migrate|seed|reset|backup|restore|health)
            COMMAND=$1
            shift
            ;;
        *)
            if [ -z "$COMMAND" ]; then
                echo -e "${RED}Unknown command: $1${NC}"
                print_usage
                exit 1
            fi
            ARGS="$@"
            break
            ;;
    esac
done

if [ -z "$COMMAND" ]; then
    print_usage
    exit 1
fi

# Load environment
check_env

# Execute command
case $COMMAND in
    start)
        db_start
        ;;
    stop)
        db_stop
        ;;
    restart)
        db_restart
        ;;
    status)
        db_status
        ;;
    logs)
        db_logs
        ;;
    psql)
        db_psql
        ;;
    migrate)
        db_migrate
        ;;
    seed)
        db_seed
        ;;
    reset)
        db_reset
        ;;
    backup)
        db_backup $ARGS
        ;;
    restore)
        db_restore $ARGS
        ;;
    health)
        db_health
        ;;
    *)
        echo -e "${RED}Unknown command: $COMMAND${NC}"
        print_usage
        exit 1
        ;;
esac
