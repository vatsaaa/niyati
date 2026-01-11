#!/usr/bin/env bash
set -euo pipefail

# Helper script to create the GitHub Actions `prod` environment and add secrets.
# WARNING: this script requires repo admin permissions and gh CLI configured.
# Run locally as an admin: ./scripts/setup_prod_env.sh

REPO_OWNER="vatsaaa"
REPO_NAME="niyati"
ENV_NAME="prod"

echo "This script will create the Actions environment '$ENV_NAME' and guide you to add secrets."
echo "Requires: gh CLI authenticated as a repo admin."

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not found. Install from https://cli.github.com/"
  exit 1
fi

echo "Creating environment (if it doesn't exist)..."
gh api --method PUT /repos/${REPO_OWNER}/${REPO_NAME}/environments/${ENV_NAME} || true

cat <<'EOF'
Next steps (manual or via gh):

# 1) Add environment secrets (example for GHCR_PAT):
#   export GHCR_PAT="<token>"
#   gh secret set GHCR_PAT --env prod --body "$GHCR_PAT"

# 2) Add other secrets similarly (ACCESS_TOKEN_SECRET, POSTGRES_PASSWORD, DATABASE_URL, etc):
#   gh secret set ACCESS_TOKEN_SECRET --env prod --body "$(openssl rand -hex 32)"

# 3) Configure required reviewers for the environment via UI:
#   Settings -> Environments -> prod -> Protection rules -> Add required reviewers
#   (or via REST API as an admin if desired)

EOF

echo "Script finished. Review and add secrets as noted above."
