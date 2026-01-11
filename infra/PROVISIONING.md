# Provisioning notes — prod environment & branch protection

This document contains commands and rationale for setting up the `prod` Actions environment,
secrets, and branch protection for the `master` branch. Only repo admins should run these.

1) Create `prod` environment (admin):

```bash
# create environment
gh api --method PUT /repos/<owner>/<repo>/environments/prod
```

2) Add environment secrets (admin):

```bash
# add a secret to the prod environment (example)
export GHCR_PAT="<PERSONAL_ACCESS_TOKEN_WITH_packages:write>"
gh secret set GHCR_PAT --env prod --body "$GHCR_PAT"

# other secrets
gh secret set ACCESS_TOKEN_SECRET --env prod --body "$(openssl rand -hex 32)"
gh secret set POSTGRES_PASSWORD --env prod --body "<db-password>"
gh secret set DATABASE_URL --env prod --body "postgresql://..."
```

3) Configure environment protection (required reviewers): go to GitHub UI: Settings → Environments → prod → Protection rules → add required reviewers.

4) Branch protection (example via gh API):

```bash
gh api --method PUT /repos/<owner>/<repo>/branches/master/protection -f required_status_checks='{"strict":true,"contexts":["CI"]}' -f enforce_admins=true -f required_pull_request_reviews='{"dismiss_stale_reviews":true,"required_approving_review_count":1}'
```

Notes
- Do NOT store real secrets in the repo. Use environment secrets or an external vault.
- Only allow pushing `infra-v*` tags by maintainers.
