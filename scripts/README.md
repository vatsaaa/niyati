# Niyati Scripts

This directory contains shell scripts and utilities for managing the Niyati platform development, testing, and deployment workflows.

## Quick Reference

| Script | Purpose | Common Usage |
|--------|---------|--------------|
| `docker-dev.sh` | Development Docker helper | `./scripts/docker-dev.sh up` |
| `db.sh` | Database management | `./scripts/db.sh migrate` |
| `deploy_niyati.sh` | Production deployment | `./scripts/deploy_niyati.sh --prod` |
| `ci-run-tests.sh` | CI test runner | `./scripts/ci-run-tests.sh` |
| `smoke_test.sh` | Health check verification | `./scripts/smoke_test.sh` |

## Directory Structure

```
scripts/
├── lib/
│   └── common.sh       # Shared library (colors, logging, Docker helpers)
├── docker-dev.sh       # Development Docker operations
├── db.sh               # Database management
├── deploy_niyati.sh    # Deployment script
├── ci-run-tests.sh     # CI test runner
├── smoke_test.sh       # Smoke tests
├── prod_integration_test.sh  # Production integration tests
├── setup-hooks.sh      # Git hooks setup
├── mock-n8n.js         # Mock n8n server for CI
└── mock-webhook.js     # Mock webhook server for testing
```

## Shared Library

All bash scripts source `lib/common.sh` which provides:

### Colors
```bash
$RED, $GREEN, $YELLOW, $BLUE, $CYAN, $MAGENTA, $BOLD, $NC
```

### Logging Functions
```bash
log_info "message"      # Green [INFO] prefix
log_warn "message"      # Yellow [WARN] prefix
log_error "message"     # Red [ERROR] prefix (to stderr)
log_debug "message"     # Only when DEBUG=1
log_step "message"      # Blue arrow prefix
log_success "message"   # Green checkmark
log_fail "message"      # Red X mark
print_header "title"    # Boxed header
```

### Environment Functions
```bash
find_project_root       # Find Niyati project root
load_env ".env"         # Load env file
load_project_env        # Load all project env files
ensure_env_files        # Create missing .env files from examples
```

### Docker Functions
```bash
check_docker            # Verify Docker is installed and running
get_compose_cmd "mode"  # Get compose command for dev/prod/ci
wait_for_container      # Wait for container health
wait_for_postgres       # Wait for PostgreSQL readiness
```

### HTTP/Health Functions
```bash
check_url_with_retries "url" [max_attempts] [sleep_base]
run_health_checks       # Check all standard service endpoints
```

### Utility Functions
```bash
confirm_action "msg"    # Interactive confirmation (respects FORCE=1)
require_command "cmd"   # Check if command exists
get_timestamp           # YYYYMMDD_HHMMSS format
```

---

## Script Details

### docker-dev.sh

Development Docker helper that replaces the old `docker-setup.sh`.

```bash
# First-time setup (creates .env files, checks Docker)
./scripts/docker-dev.sh setup

# Start all services
./scripts/docker-dev.sh up

# View logs
./scripts/docker-dev.sh logs
./scripts/docker-dev.sh logs-bff
./scripts/docker-dev.sh logs-auth
./scripts/docker-dev.sh logs-ui

# Container shells
./scripts/docker-dev.sh shell-bff
./scripts/docker-dev.sh shell-auth
./scripts/docker-dev.sh shell-ui

# Other commands
./scripts/docker-dev.sh down       # Stop services
./scripts/docker-dev.sh restart    # Restart services
./scripts/docker-dev.sh build      # Rebuild images (no cache)
./scripts/docker-dev.sh clean      # Remove volumes
./scripts/docker-dev.sh ps         # Show container status
./scripts/docker-dev.sh health     # Run health checks
```

### db.sh

Database management for PostgreSQL.

```bash
# Lifecycle
./scripts/db.sh start              # Start PostgreSQL
./scripts/db.sh stop               # Stop PostgreSQL
./scripts/db.sh restart            # Restart PostgreSQL
./scripts/db.sh status             # Show container status

# Database operations
./scripts/db.sh psql               # Open psql shell
./scripts/db.sh migrate            # Run all migrations
./scripts/db.sh seed               # Seed test data
./scripts/db.sh reset              # DROP and recreate database

# Backup/Restore
./scripts/db.sh backup             # Backup to timestamped file
./scripts/db.sh backup mybackup.sql
./scripts/db.sh restore mybackup.sql

# Health
./scripts/db.sh health             # Check database health

# Production mode
./scripts/db.sh start --prod
./scripts/db.sh migrate --prod
```

### deploy_niyati.sh

Production deployment with interactive or CI modes.

```bash
# Interactive deployment (prompts for each step)
./scripts/deploy_niyati.sh

# Non-interactive (auto-confirm all prompts)
./scripts/deploy_niyati.sh -y

# Production mode
./scripts/deploy_niyati.sh --prod

# Verbose output
./scripts/deploy_niyati.sh --verbose

# CI deployment (non-interactive, production)
./scripts/deploy_niyati.sh -y --prod
```

### ci-run-tests.sh

Runs the complete CI test suite:

1. Starts Docker stack with CI configuration
2. Waits for PostgreSQL
3. Runs database migrations
4. Runs bff-platform and bff-auth unit tests
5. Runs E2E tests with Playwright
6. Cleans up

```bash
./scripts/ci-run-tests.sh
```

### smoke_test.sh

Quick health verification for all services.

```bash
# Default configuration
./scripts/smoke_test.sh

# Custom retry settings
SMOKE_MAX_RETRIES=20 SMOKE_SLEEP_BASE=3 ./scripts/smoke_test.sh
```

Checks:
- BFF Platform health endpoint
- BFF Auth health endpoint
- UI service
- Identify endpoint

### prod_integration_test.sh

Production integration tests.

```bash
# Default (localhost)
./scripts/prod_integration_test.sh

# Custom base URL
BASE_URL=https://niyati.example.com ./scripts/prod_integration_test.sh
```

Tests:
- Caddy health
- BFF Platform health
- BFF Auth health
- Profile sync endpoint

### setup-hooks.sh

Configures git hooks using husky.

```bash
./scripts/setup-hooks.sh
```

Installs:
- `pre-commit`: Linting, formatting, security checks
- `pre-push`: Full test suite
- `commit-msg`: Conventional commits

### mock-n8n.js

Mock n8n server for CI testing. Returns predictable AI responses.

```bash
node scripts/mock-n8n.js
# Listens on port 5678
```

### mock-webhook.js

Mock webhook server for testing webhook integrations.

```bash
node scripts/mock-webhook.js
# Listens on PORT env var or 5678
```

---

## Environment Variables

Scripts respect these environment variables from `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | `niyati` | Database user |
| `POSTGRES_DB` | `niyati_dev` | Database name |
| `POSTGRES_PASSWORD` | `niyati_dev_pass` | Database password |
| `BFF_PLATFORM_PORT` | `3000` | BFF Platform port |
| `BFF_AUTH_PORT` | `3001` | BFF Auth port |
| `UI_DEV_PORT` | `5173` | UI development port |

Control variables:

| Variable | Description |
|----------|-------------|
| `DEBUG=1` | Enable debug logging |
| `FORCE=1` | Skip confirmation prompts |
| `CI=true` | Auto-skip interactive prompts |

---

## Adding New Scripts

When creating a new script:

1. Add the shebang and header:
```bash
#!/usr/bin/env bash
# =============================================================================
# Script Name
# =============================================================================
# Description of what the script does.
#
# Usage: ./scripts/my-script.sh [options]
# =============================================================================
```

2. Source the common library:
```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"
```

3. Find project root and change to it:
```bash
PROJECT_ROOT="$(find_project_root "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"
```

4. Use the provided logging and utility functions instead of raw `echo`.

5. Make the script executable:
```bash
chmod +x scripts/my-script.sh
```
