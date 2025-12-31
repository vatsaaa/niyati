#!/bin/bash
# Niyati Platform Deployment Script
# Supports interactive and non-interactive (CI) modes
# Usage: ./scripts/deploy_niyati.sh [-y] [--prod] [--verbose]

set -e

# --- CONFIG ---
PROD=0
INTERACTIVE=1
VERBOSE=0

for arg in "$@"; do
  case $arg in
    -y|--yes)
      INTERACTIVE=0
      shift
      ;;
    --prod)
      PROD=1
      shift
      ;;
    --verbose)
      VERBOSE=1
      shift
      ;;
  esac
done

log() {
  if [[ $VERBOSE -eq 1 ]]; then
    echo -e "[Niyati Deploy] $1"
  fi
}

prompt() {
  if [[ $INTERACTIVE -eq 1 ]]; then
    read -p "$1 [y/N]: " yn
    case $yn in
      [Yy]*) return 0 ;;
      *) return 1 ;;
    esac
  else
    return 0
  fi
}

# --- STEP 1: Select Mode ---
if [[ $PROD -eq 1 ]]; then
  COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"
  log "Production mode selected."
else
  COMPOSE_FILES="-f docker-compose.yml -f docker-compose.override.yml"
  log "Non-production (dev) mode selected."
fi

# --- STEP 2: Stop Existing Services ---
prompt "Stop all running Niyati containers?" && \
  docker compose $COMPOSE_FILES down || true

# --- STEP 3: Build Images (force rebuild) ---
prompt "Rebuild all Docker images (force no-cache)?" && \
  docker compose $COMPOSE_FILES build --no-cache

# --- STEP 4: Set up environment files ---
if [[ $INTERACTIVE -eq 1 ]]; then
  echo "\nCheck your .env, .env.bff.auth, .env.bff.platform, .env.ui files for correct secrets and config."
  read -p "Press Enter to continue..."
fi

# --- STEP 5: Run Migrations & Seed DB ---
prompt "Run DB migrations and seed data?" && \
  docker compose $COMPOSE_FILES run --rm bff-platform /app/scripts/run_migrations.sh

# --- STEP 6: Start All Services ---
prompt "Start all Niyati services (force recreate)?" && \
  docker compose $COMPOSE_FILES up -d --force-recreate

# --- STEP 7: Show Service Status ---
echo "\nNiyati services status:"
docker compose $COMPOSE_FILES ps

# --- STEP 8: Health Checks ---
echo "\nHealth checks:"
echo "Auth:      $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/v1/telemetry/health)"
echo "Platform:  $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/telemetry/health)"
echo "UI:        $(curl -s -o /dev/null -w '%{http_code}' http://localhost:5173)"
echo "Mailhog:   $(curl -s -o /dev/null -w '%{http_code}' http://localhost:8025)"
echo "Redis:     $(docker compose $COMPOSE_FILES logs redis 2>&1 | grep -q 'Ready to accept connections' && echo 'OK' || echo 'NOT READY')"
echo "Caddy:     $(docker compose $COMPOSE_FILES logs caddy 2>&1 | grep -q 'serving initial configuration' && echo 'OK' || echo 'NOT READY')"
echo "N8N:       $(curl -s -o /dev/null -w '%{http_code}' http://localhost:5678)"

echo "\nDeployment complete!"
if [[ $INTERACTIVE -eq 1 ]]; then
  echo "\nYou can now access the Niyati platform at http://localhost:5173"
  echo "For logs, run: docker compose $COMPOSE_FILES logs -f"
  echo "For verbose logs, re-run this script with --verbose."
fi
