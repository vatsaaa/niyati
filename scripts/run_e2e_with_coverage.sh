#!/usr/bin/env bash
# Compatibility wrapper — delegates to scripts/ci/run_e2e_with_coverage.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/ci/run_e2e_with_coverage.sh" "$@"
