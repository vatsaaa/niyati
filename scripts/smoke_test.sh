#!/usr/bin/env bash
# =============================================================================
# Smoke Tests for Niyati
# =============================================================================
# Runs health checks against local containers to verify the stack is healthy.
#
# Usage: ./scripts/smoke_test.sh
#
# Environment Variables:
#   SMOKE_MAX_RETRIES  - Maximum retry attempts (default: 10)
#   SMOKE_SLEEP_BASE   - Base sleep time between retries (default: 2)
# =============================================================================

# Load common library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

log_info "Running smoke tests against local containers"

# Configuration
SMOKE_MAX_RETRIES=${SMOKE_MAX_RETRIES:-10}
SMOKE_SLEEP_BASE=${SMOKE_SLEEP_BASE:-2}

# Load project env for port configuration
PROJECT_ROOT="$(find_project_root "$SCRIPT_DIR" 2>/dev/null)" || PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
load_project_env "$PROJECT_ROOT" 2>/dev/null || true

# List of endpoints to verify
endpoints=(
    "http://localhost:${BFF_PLATFORM_PORT:-3000}/api/v1/telemetry/health"
    "http://localhost:${BFF_AUTH_PORT:-3001}/api/v1/telemetry/health"
    "http://localhost:${UI_DEV_PORT:-5173}/"
    "http://localhost:${BFF_PLATFORM_PORT:-3000}/api/v1/identify"
)

failed=0
for url in "${endpoints[@]}"; do
    if ! check_url_with_retries "$url" "$SMOKE_MAX_RETRIES" "$SMOKE_SLEEP_BASE"; then
        failed=1
    fi
done

echo ""
if [[ $failed -ne 0 ]]; then
    log_fail "One or more smoke checks failed"
    exit 1
fi

log_success "All smoke tests passed"
