Reproducible test runbook
=========================

Purpose
-------
This document describes the exact, repeatable steps to bring up the deterministic CI-like environment locally and run the independent test suite (unit + E2E) the same way CI does.

Prerequisites
-------------
- Docker and Docker Compose (v2) installed and working.
- Node.js installed (version pinned in project files; use the same as CI).
- At project root, `.env.ci` exists (it is in repo).

Runbook (copy-paste)
--------------------
Run these commands from the repository root.

1. Export CI env and set the compose command

```bash
export $(grep -v '^#' .env.ci | xargs)
COMPOSE_CMD="docker compose --env-file .env.ci -f docker-compose.yml -f docker-compose.ci.yml -p niyati-ci"
```

2. Clean and start the CI overlay

```bash
$COMPOSE_CMD down -v --remove-orphans
$COMPOSE_CMD up -d --build
```

3. Wait for Postgres to be ready

```bash
for i in $(seq 1 60); do
  $COMPOSE_CMD exec -T postgres pg_isready -U "${POSTGRES_USER:-niyati}" -d "${POSTGRES_DB:-niyati_ci}" >/dev/null 2>&1 && break || sleep 1
done
```

4. Apply migrations and seed data (idempotent)

```bash
for f in be/migrations/*.up.sql; do
  cat "$f" | $COMPOSE_CMD exec -T postgres psql -U "${POSTGRES_USER:-niyati}" -d "${POSTGRES_DB:-niyati_ci}"
done
if [ -f be/seed_ci.sql ]; then
  cat be/seed_ci.sql | $COMPOSE_CMD exec -T postgres psql -U "${POSTGRES_USER:-niyati}" -d "${POSTGRES_DB:-niyati_ci}"
fi
```

5. Run tests

The repository includes an orchestrator `./scripts/ci-run-tests.sh` which runs the full suite. Use that for full CI-like runs:

```bash
./scripts/ci-run-tests.sh
```

Or run Playwright E2E manually from `e2e/`:

```bash
cd e2e
npm ci
npx playwright install --with-deps
BASE_URL=http://localhost:6173 npx playwright test
```

Best practices for deterministic runs
------------------------------------
- Always use the CI overlay: pass `-p niyati-ci` and `--env-file .env.ci` as shown above to avoid colliding with dev stacks.
- Mock external services in CI overlay (the repo's CI overlay uses a mock n8n). Do not hit external APIs during E2E.
- Keep migrations idempotent and seeds deterministic.
- Pin dependency versions (`package-lock.json`). Use the same Node version locally as CI.
- Clean prior state between runs with `docker compose down -v --remove-orphans`.

Adding automation
-----------------
If you want this automated, a small wrapper script `scripts/run_independent_tests_local.sh` is provided to prepare the environment and optionally run E2E. See that script for usage.

If tests still fail intermittently, collect service logs (`docker compose logs <service>`) and Playwright traces (`npx playwright show-trace <trace.zip>`).
