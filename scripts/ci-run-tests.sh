#!/usr/bin/env bash
# Compatibility wrapper — delegates to scripts/ci/ci-run-tests.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/ci/ci-run-tests.sh" "$@"

# =============================================================================
# STEP 4: BACKEND TESTS
# =============================================================================

BACKEND_EXIT=0
if [[ "$SKIP_BACKEND" -eq 0 ]]; then
    log_step "🧪 Running backend tests..."

    # Install commons
    npm ci --prefix packages/commons --prefer-offline --no-audit --silent

    # bff-platform tests (run package test script so coverage flag in package.json is respected)
    log_info "Testing bff-platform..."
    cd apps/bff-platform
    npm ci --include=dev --prefer-offline --no-audit --silent
    NODE_ENV=test npm test --silent || BACKEND_EXIT=1
    # collect coverage artifact if produced
    if [[ -d "coverage" ]]; then
        mkdir -p "$ARTIFACTS_COVERAGE_DIR/bff-platform"
        cp -r coverage/* "$ARTIFACTS_COVERAGE_DIR/bff-platform/" || true
    fi
    cd "$PROJECT_ROOT"

    # bff-auth tests (only if bff-platform passed)
    if [[ "$BACKEND_EXIT" -eq 0 ]]; then
        log_info "Testing bff-auth..."
        cd apps/bff-auth
        npm ci --include=dev --prefer-offline --no-audit --silent
        NODE_ENV=test npm test --silent || BACKEND_EXIT=1
        if [[ -d "coverage" ]]; then
            mkdir -p "$ARTIFACTS_COVERAGE_DIR/bff-auth"
            cp -r coverage/* "$ARTIFACTS_COVERAGE_DIR/bff-auth/" || true
        fi
        cd "$PROJECT_ROOT"
    fi

    if [[ "$BACKEND_EXIT" -eq 0 ]]; then
        log_success "Backend tests passed"
    else
        log_error "Backend tests failed"
    fi
else
    log_info "Skipping backend tests (--skip-backend)"
fi

# =============================================================================
# STEP 5: E2E TESTS
# =============================================================================

E2E_EXIT=0
if [[ "$SKIP_E2E" -eq 0 && "$BACKEND_EXIT" -eq 0 ]]; then
    log_step "🎭 Running E2E tests..."
    # If CI_COLLECT_E2E_COVERAGE is set, run E2E using local server processes under c8
    if [[ "${CI_COLLECT_E2E_COVERAGE:-0}" == "1" ]]; then
        log_info "Running E2E with server-side coverage collection"
        "$PROJECT_ROOT/scripts/run_e2e_with_coverage.sh" || E2E_EXIT=1
    else
        cd "$PROJECT_ROOT/e2e"
        npm install --include=dev
        npx playwright install chromium 2>/dev/null || true
        
        export REAL=1
        export BASE_URL="http://localhost:6173"
        npx playwright test --project=api || E2E_EXIT=1
        cd "$PROJECT_ROOT"
    fi
    
    [[ "$E2E_EXIT" -eq 0 ]] && log_success "E2E tests passed" || log_error "E2E tests failed"
else
    [[ "$SKIP_E2E" -eq 1 ]] && log_info "Skipping E2E tests (--skip-e2e)"
fi

# =============================================================================
# FINAL RESULT
# =============================================================================

if [[ "$BACKEND_EXIT" -ne 0 || "$E2E_EXIT" -ne 0 ]]; then
    log_fail "CI FAILED"
    exit 1
fi

# Merge coverage artifacts and enforce threshold if requested
if [[ "${CI_MERGE_COVERAGE:-1}" == "1" ]]; then
    log_step "🔀 Merging coverage artifacts"
    COVERAGE_THRESHOLD="${COVERAGE_THRESHOLD:-100}" "$SCRIPT_DIR/merge_coverage.sh" || {
        log_error "Coverage merge failed or threshold not met"
        exit 1
    }
    log_success "✅ ALL CI TESTS PASSED"
else
    log_success "✅ ALL CI TESTS PASSED (coverage merge skipped)"
fi
exit 0
