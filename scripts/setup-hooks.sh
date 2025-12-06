#!/usr/bin/env bash
# Setup git hooks for Niyati project

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔧 Setting up git hooks...${NC}"

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo -e "${RED}❌ Not a git repository${NC}"
    echo "Please run this script from the root of the git repository"
    exit 1
fi

# Create .husky directory if it doesn't exist
if [ ! -d ".husky" ]; then
    echo -e "${RED}❌ .husky directory not found${NC}"
    exit 1
fi

# Make hooks executable
echo "  → Making hooks executable..."
chmod +x .husky/pre-commit
chmod +x .husky/pre-push
chmod +x .husky/commit-msg

# Configure git to use .husky for hooks
echo "  → Configuring git..."
git config core.hooksPath .husky

echo -e "${GREEN}✅ Git hooks installed successfully!${NC}"
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
