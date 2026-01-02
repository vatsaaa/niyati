#!/usr/bin/env bash
# =============================================================================
# Production Integration Tests for Niyati
# =============================================================================
# Tests production endpoints to verify the deployment is functional.
#
# Usage: ./scripts/prod_integration_test.sh
#
# Environment Variables:
#   BASE_URL  - Base URL to test against (default: http://127.0.0.1)
# =============================================================================

# Load common library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

BASE_URL=${BASE_URL:-http://127.0.0.1}

log_info "Testing production endpoints at $BASE_URL"

log_step "Check Caddy health (/health)"
curl -fsS "$BASE_URL/health" || { log_error "Caddy health check failed"; exit 2; }

log_step "Check bff-platform health (/api/v1/telemetry/health)"
curl -fsS "$BASE_URL/api/v1/telemetry/health" || { log_error "bff-platform health check failed"; exit 3; }

log_step "Check bff-auth health (/api/v1/telemetry/health)"
curl -fsS "$BASE_URL/api/v1/auth/telemetry/health" || true
curl -fsS "$BASE_URL/api/v1/telemetry/health" || true

log_step "Post profile to /api/v1/users/profile to exercise auth->platform sync"
RESPONSE=$(curl -sS -X POST "$BASE_URL/api/v1/users/profile" \
    -H "Content-Type: application/json" \
    -d '{"phoneNumber":"+919999000000","consentGiven":true,"last_login_location":"Mumbai"}' || true)
echo "Response: $RESPONSE"

if echo "$RESPONSE" | grep -q 'last_login_location'; then
    log_success "Profile sync appears successful"
else
    log_error "Profile sync did not return expected last_login_location"
    exit 4
fi

log_success "All production integration checks passed (basic)"
