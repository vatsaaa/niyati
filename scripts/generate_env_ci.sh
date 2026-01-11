#!/usr/bin/env bash
set -euo pipefail

# Generate infra/.env.ci from environment variables (safe for CI)
mkdir -p infra
cat > infra/.env.ci <<'EOF'
# CI-generated .env.ci (created by workflow)
BFF_PLATFORM_PORT=${BFF_PLATFORM_PORT:-4000}
BFF_AUTH_PORT=${BFF_AUTH_PORT:-4001}
CADDY_HTTP_PORT=${CADDY_HTTP_PORT:-6173}
N8N_PORT=${N8N_PORT:-6678}
BASE_URL=${BASE_URL:-http://127.0.0.1:6173}
POSTGRES_PORT=${POSTGRES_PORT:-56432}
REDIS_PORT=${REDIS_PORT:-7379}
NODE_ENV=production
BUILD_TARGET=production
IMAGE_TAG=ci
SERVICE_TOKEN=${SERVICE_TOKEN:-ci-test-token}
POSTGRES_USER=${POSTGRES_USER:-niyati}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-niyati_ci_pass}
POSTGRES_DB=${POSTGRES_DB:-niyati_ci}
VITE_N8N_WEBHOOK_URL=/webhook/chat
VITE_BFF_BASE_URL=
VITE_DEBUG_MODE=true
CORS_ALLOWED=http://localhost:6173,http://127.0.0.1:6173
LOG_LEVEL=info
LOG_PRETTY_PRINT=false
API_VERSION=v1
ASTRO_API_URL=${ASTRO_API_URL:-https://json.freeastrologyapi.com}
ASTRO_API_KEY=${ASTRO_API_KEY:-}
GEOCODE_MAPS_KEY=${GEOCODE_MAPS_KEY:-}
GEOCODE_CACHE_TTL=86400
EMAIL_FROM=
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
AWS_REGION=${AWS_REGION:-ap-south-1}
NIYATI_DEPLOYER_RGN=${NIYATI_DEPLOYER_RGN:-ap-south-1}
EOF

echo "[INFO] infra/.env.ci written"
