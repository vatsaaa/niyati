#!/usr/bin/env bash
# =============================================================================
# Git Hooks Setup for Niyati
# =============================================================================
# Configures git hooks using the .husky directory for pre-commit, pre-push,
# and commit-msg hooks.
#
# Usage: ./scripts/setup-hooks.sh
# =============================================================================

# Load common library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

PROJECT_ROOT="$(find_project_root "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

log_step "🔧 Setting up git hooks..."

# Check if we're in a git repository
if [[ ! -d ".git" ]]; then
    log_error "Not a git repository"
    echo "Please run this script from the root of the git repository"
    exit 1
fi

# Create .husky directory if it doesn't exist
if [[ ! -d ".husky" ]]; then
    log_error ".husky directory not found"
    exit 1
fi

# Make hooks executable
log_step "Making hooks executable..."
chmod +x .husky/pre-commit 2>/dev/null || true
chmod +x .husky/pre-push 2>/dev/null || true
chmod +x .husky/commit-msg 2>/dev/null || true

# Configure git to use .husky for hooks
log_step "Configuring git..."
git config core.hooksPath .husky

log_success "Git hooks installed successfully!"
echo ""
echo -e "${YELLOW}Installed hooks:${NC}"
echo "  • pre-commit:  Runs linting, formatting, and security checks"
echo "  • pre-push:    Runs full test suite and build verification"
echo "  • commit-msg:  Enforces conventional commit message format"
echo ""
echo -e "${YELLOW}To bypass hooks (not recommended):${NC}"
echo "  git commit --no-verify"
echo "  git push --no-verify"
echo ""
