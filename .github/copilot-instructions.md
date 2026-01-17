# Niyati — AI Agent Instructions

AI-powered astrology platform. BFF architecture, JavaScript only.

> **Pattern Reference**: This project serves as a reference implementation for BFF-based JavaScript projects with comprehensive CI/CD, testing, and deployment patterns.

## ⚠️ Core Development Principles

> **TDD/BDD is MANDATORY** — No code without tests first. No exceptions.
> **Database is IMMUTABLE** — No `UPDATE`, no `ALTER`. Always idempotent, from scratch.
> **Infrastructure is ISOLATED** — Dev, CI, and Prod use non-overlapping ports, networks, volumes.
> **Tests are INDEPENDENT** — Run via CI scripts, deploy scripts, or standalone. Always reproducible.
> **CI/CD via SCRIPTS ONLY** — Never run raw Docker/npm commands. Always use `./scripts/ci/ci-run-tests.sh`, `./scripts/deploy_niyati.sh`, etc. Ensures consistency and reproducibility.
> **CONTAINERS ONLY** — All infrastructure (PostgreSQL, Redis, n8n, etc.) runs in Docker containers. Never install databases, message queues, or middleware directly on local machine. Ensures consistency across dev/CI/prod.
> **ISOLATED ENVIRONMENTS** — Always use virtual environments: Python (`venv`/`virtualenv`), Node.js (npm workspaces with `node_modules` hoisting). Never install dependencies globally. Ensures reproducible builds and no version conflicts.
> **FAIL FAST, FAIL LOUDLY** — Validate early in dev/CI. Use `set -euo pipefail` in scripts. Prefer explicit errors over silent failures. CI must fail on any test failure, linting error, or missing required env var.
> **EXPLICIT OVER CLEVER** — Prefer readable, maintainable code over clever tricks. Use descriptive names, avoid abbreviations. Comment *why*, not *what*. Code should be self-documenting.

## Architecture & Data Flow

Browser (React) → Caddy (proxy) → bff-platform/bff-auth → PostgreSQL
                                         ↓
                                    n8n (AI agent) ← Ollama (LLM)
                                          
Worker ← Redis (queue) — handles async jobs (email, etc.)
```

- **Pattern**: BFF-first. UI is a thin renderer — all business logic, billing, and validation happens server-side.
- **Frontend**: React + Vite (ES modules: `import`/`export`)
- **Backend**: Node.js + Express (CommonJS: `require`/`module.exports`)
- **n8n**: Runs locally on port 5678 (NOT containerized). Handles AI orchestration, conversation memory, LLM prompt control.

### BFF-First Philosophy

UI NEVER performs authoritative actions:
- **Billing**: Only BFF/n8n decrements credits after validating `isBillable`. UI shows optimistic updates but waits for server confirmation.
- **Validation**: BFF normalizes inputs (ISO dates, sanitization) and computes derived fields (`age`, `ageConfirmed`).
- **Charges**: Must be idempotent (use `reqId`) to prevent double deductions on retry.

Flow: `UI → n8n webhook (AI response) → UI calls BFF /chat/classify → UI calls BFF /deduct-credits → BFF deducts`

**SINGLE SOURCE OF TRUTH**: No duplicate logic across services/layers. Business logic in BFF, UI is renderer only. Database schema in migrations, never ad-hoc queries. Configuration in `app_config` table, not hardcoded.

### Lightweight UI Principles

UI is a **thin rendering layer** — no heavy processing, NLP, or business logic:

| ❌ Avoid in UI | ✅ Do in BFF |
|----------------|---------------|
| NLP/text classification (winkNLP) | Query classification via `/chat/classify` |
| Credit calculations | `/users/deduct-credits` returns balance |
| Date parsing/normalization | BFF normalizes to ISO format |
| Complex validation | BFF validates and returns errors |
| Direct DB queries | All data through BFF endpoints |

**Why**: Smaller bundle size, faster load times, single source of truth for business logic, easier testing.

**Pattern**: UI calls BFF → BFF processes → UI renders result. If you're tempted to add a new npm dependency to UI for processing, consider if it belongs in bff-platform instead.

## Key Directories

| Purpose | Location |
|---------|----------|
| BFF routes | [apps/bff-platform/lib/](apps/bff-platform/lib/), [apps/bff-auth/lib/](apps/bff-auth/lib/) |
| Shared utilities | [packages/commons/](packages/commons/) — logger, sanitize, ErrorCodes, responses |
| Test helpers | [packages/commons/test/helpers.js](packages/commons/test/helpers.js) — `createTestApp`, `createMockDb` |
| Frontend hooks | [apps/ui/src/hooks/](apps/ui/src/hooks/), services in [apps/ui/src/services/api.js](apps/ui/src/services/api.js) |
| Migrations | [packages/migrations/](packages/migrations/) (format: `YYYYMMDD_XX_desc.up.sql`) |
| E2E tests | [e2e/tests/](e2e/tests/) — Playwright browser tests |
| **Automation Scripts** | [scripts/](scripts/) — **all** automation lives here |
| GitHub Workflows | [.github/workflows/](.github/workflows/) — thin wrappers calling scripts |

## Project Structure Overview

```
niyati/
├── .github/
│   ├── workflows/          # GitHub Actions (thin wrappers)
│   │   ├── ci.yml          # Main CI → calls scripts/ci/ci-run-tests.sh
│   │   ├── ui-deploy.yml   # UI deployment to S3/CloudFront
│   │   └── security.yml    # Security scanning
│   └── copilot-instructions.md
├── apps/
│   ├── bff-platform/       # Main BFF service
│   ├── bff-auth/           # Auth service
│   ├── ui/                 # React frontend
│   └── worker/             # Background jobs
├── packages/
│   ├── commons/            # Shared utilities
│   └── migrations/         # SQL migrations
├── infra/               # Infrastructure & config
├── e2e/                    # Playwright E2E tests
├── scripts/                # All automation scripts
│   ├── lib/common.sh       # Shared bash library
│   ├── ci-run-tests.sh     # CI test runner
│   ├── deploy_niyati.sh    # Deployment script
│   └── ...
├── docker-compose.yml      # Base Docker config
├── docker-compose.ci.yml   # CI overlay (different ports, mock n8n)
├── docker-compose.prod.yml # Production overlay
├── .env.ci                 # CI environment variables
└── Caddyfile               # Caddy reverse proxy config
```

## Database Philosophy: Immutable, Idempotent, From Scratch

> **Golden Rule**: The database schema and seed data should be reproducible from scratch at any time.

### Why No UPDATE/ALTER?

| ❌ Problematic | ✅ Correct Approach |
|----------------|---------------------|
| `ALTER TABLE users ADD COLUMN x` | Create new migration with full table definition |
| `UPDATE users SET x = 'value'` | `INSERT ... ON CONFLICT DO UPDATE` (upsert) |
| `ALTER TABLE DROP COLUMN` | New migration file, rebuild schema |
| Manual data fixes | Idempotent seed scripts |

### Migration Strategy

```sql
-- ✅ CORRECT: Idempotent table creation
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  credits INTEGER DEFAULT 10
);

-- ✅ CORRECT: Idempotent index
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);

-- ✅ CORRECT: Idempotent seed data
INSERT INTO app_config (key, value)
VALUES ('credits_monthly_free', '10')
ON CONFLICT (key) DO NOTHING;

-- ❌ FORBIDDEN: These will be rejected in code review
ALTER TABLE users ADD COLUMN new_field VARCHAR(100);
UPDATE users SET credits = 0 WHERE expired = true;
```

### Database Rebuild Flow

```bash
# CI always starts fresh
docker compose down -v        # Remove volumes
docker compose up -d postgres # Start clean
./scripts/db.sh migrate       # Apply all migrations from scratch
./scripts/db.sh seed          # Apply idempotent seed data
```

## Integration Points

### n8n Workflow (AI Orchestration)
- Receives chat messages via webhook, executes AI agent with Ollama LLM, returns `{output}`
- Workflow definition: [apps/bff-platform/n8n/NiyatiWorkflow.json](apps/bff-platform/n8n/NiyatiWorkflow.json)
  - **CI uses mock**: [scripts/mocks/mock-n8n.js](scripts/mocks/mock-n8n.js) — simple HTTP server returning canned responses

### Worker Service (Background Jobs)
- Location: [apps/worker/worker.js](apps/worker/worker.js)
- Polls Redis queue for jobs (`email`, webhooks)
- Authenticates via `WORKER_TOKEN` from secrets
- Uses `getSecret()` pattern for Docker secrets (`_FILE` env vars)

### Secrets Pattern (Docker)

**NO SECRETS IN CODE**: All secrets via environment variables or Docker secrets (using `getSecret()` pattern). Never commit credentials, API keys, or tokens. Use `.env.example` as template, actual `.env` files are gitignored.

Services use `getSecret(envVar, fileEnvVar)` to read secrets from files in production:

```javascript
function getSecret(envVar, fileEnvVar) {
  if (process.env[fileEnvVar]) {
    return fs.readFileSync(process.env[fileEnvVar], 'utf8').trim();
  }
  return process.env[envVar];
}

const WORKER_TOKEN = getSecret('WORKER_TOKEN', 'WORKER_TOKEN_FILE');
```

- **Dev**: Set `WORKER_TOKEN=xxx` in `.env`
- **Prod**: Mount secret file, set `WORKER_TOKEN_FILE=/run/secrets/worker_token`
- Secrets location: [secrets/](secrets/) (gitignored in prod)

### Credits System

**Schema** ([packages/migrations/20251217_01_baseline.up.sql](packages/migrations/20251217_01_baseline.up.sql)):
- `credits`: Current balance (default: 10)
- `credits_last_reset`: Monthly reset timestamp
- `total_paid_amount`: Lifetime INR paid

**Configuration** (from `app_config` table, cached 5 min):
| Key | Default | Description |
|-----|---------|-------------|
| `credits_monthly_free` | 10 | Free credits per month |
| `credits_horoscope_cost` | 2 | Cost for daily horoscope |
| `credits_premium_cost` | 4 | Cost for birth chart/predictions |
| `credits_low_threshold` | 4 | Show payment prompt when below |
| `payment_amount_inr` | 500 | Payment amount (INR) |

**Billing Flow** (see [apps/ui/src/hooks/useChat.js](apps/ui/src/hooks/useChat.js), [apps/bff-platform/lib/queryClassifier.js](apps/bff-platform/lib/queryClassifier.js)):
1. UI sends message directly to n8n webhook, receives AI response
2. UI calls `POST /api/v1/chat/classify` with `{message}` → BFF returns `{queryType, creditCost, isBillable}`
3. If `isBillable`, UI calls `POST /api/v1/users/deduct-credits` with `{phoneNumber, amount: creditCost}`
4. **BFF** deducts credits from DB, returns updated balance
5. UI displays server-confirmed balance

**Query Classification** (server-side in [apps/bff-platform/lib/queryClassifier.js](apps/bff-platform/lib/queryClassifier.js)):
- `isHoroscopeQuery()`: horoscope, zodiac, rashifal → `credits_horoscope_cost` (2)
- `isPremiumAstrologyQuery()`: birth chart, predictions, remedies → `credits_premium_cost` (4)
- `isCasualConversation()`: greetings, profile info → no charge

**Classification Endpoint**: `POST /api/v1/chat/classify`
- Request: `{ message: string }`
- Response: `{ queryType: 'casual'|'horoscope'|'premium', creditCost: number, isBillable: boolean, config }`

**Monthly Reset**: Checked in `/users/identify` — if `credits_last_reset` is from a previous month, reset to `credits_monthly_free`.

## Backend Route Pattern

All BFF routes follow this structure ([apps/bff-platform/lib/users.js](apps/bff-platform/lib/users.js)):

```javascript
const { logger, sanitize, ErrorCodes } = require('@niyati/commons');

router.post('/action', async (req, res) => {
  try {
    const db = req.app.get('db');
    const { input } = req.body;
    if (!input) return res.sendError(ErrorCodes.VALIDATION_ERROR, 'Input required');
    
    const result = await db.query('SELECT * FROM items WHERE id = $1', [sanitize(input)]);
    if (result.rowCount === 0) return res.sendError(ErrorCodes.NOT_FOUND, 'Not found');
    
    logger.info({ msg: 'action_success', id: input });
    return res.sendSuccess({ data: result.rows[0] });
  } catch (err) {
    logger.error({ msg: 'action_failed', err: err.stack });
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed');
  }
});
```

## Frontend Hook Pattern

All hooks use `bffFetchWithRetry` ([apps/ui/src/hooks/useChat.js](apps/ui/src/hooks/useChat.js)):

```javascript
import { bffFetchWithRetry } from '../services/api';

export function useMyFeature() {
  const performAction = async (payload) => {
    const res = await bffFetchWithRetry('/api/v1/resource/action', {
      method: 'POST', body: JSON.stringify(payload)
    });
    return res.data;
  };
  return { performAction };
}
```

## Testing

### Backend Unit Tests (Jest)

Location: `apps/bff-platform/test/`, `apps/bff-auth/test/`

Use `createTestApp` and `createMockDb` from [packages/commons/test/helpers.js](packages/commons/test/helpers.js). These wire up `res.sendSuccess`/`res.sendError` automatically via `attachResponseHelpers` middleware.

```javascript
const request = require('supertest');
const { createTestApp, createMockDb, createMockCommons } = require('@test-helpers');

describe('My Feature', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    // Mock commons to isolate from real logger/config
    jest.mock('@niyati/commons', () => createMockCommons());
    
    const router = require('../lib/my-feature');
    // createTestApp mounts router with attachResponseHelpers middleware
    ({ app } = createTestApp('/api/v1/my-feature', router));
  });

  afterEach(() => jest.restoreAllMocks());

  test('POST /action returns success', async () => {
    // createMockDb accepts static result or custom handler function
    const mockDb = createMockDb({ rows: [{ id: 1 }], rowCount: 1 });
    app.set('db', mockDb);
    
    const res = await request(app)
      .post('/api/v1/my-feature/action')
      .send({ input: 'test' });
    
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('id', 1);
  });

  test('POST /action with custom DB handler', async () => {
    // Handler function for complex query logic
    const mockDb = createMockDb(async (sql, params) => {
      if (sql.includes('INSERT')) return { rows: [{ id: 99 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    app.set('db', mockDb);
    
    const res = await request(app).post('/api/v1/my-feature/action').send({ input: 'new' });
    expect(res.body.data.id).toBe(99);
  });
});
```

### E2E Tests (Playwright)

Location: [e2e/tests/](e2e/tests/)

E2E tests run against the full stack with route interception for deterministic behavior:

```javascript
const { test, expect } = require('@playwright/test');

test('user flow with stubbed API', async ({ page, baseURL }) => {
  // Stub API responses for deterministic tests
  await page.route('**/api/v1/users/identify', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        data: { returning: true, user: { id: 1, credits: 10 } }
      })
    });
  });

  // Stub n8n webhook (always stub external services)
  await page.route('**/webhook/**', route => {
    route.fulfill({
      status: 200,
      body: JSON.stringify({ output: "Today's horoscope..." })
    });
  });

  await page.goto(baseURL + '/');
  // ... interact with UI and assert
});
```

**REAL mode**: Set `REAL=1` to run against actual stack (CI). Only n8n webhook is stubbed.

## TDD/BDD Development Workflow

⚠️ **MANDATORY: Every code change MUST follow Test-Driven Development. No code without tests first.**

### The TDD Cycle (Red-Green-Refactor)

1. **Write test first** — Define expected behavior BEFORE writing any implementation
2. **Run test (RED)** — Verify test fails for the right reason (not syntax error)
3. **Implement minimal code (GREEN)** — Just enough to pass the test
4. **Refactor** — Clean up while keeping tests green
5. **Run full test suite** — Ensure no regressions
6. **Repeat** — Add next test case

### AI Agent Requirements

When implementing features or fixing bugs, AI agents MUST:

1. **Identify test file** — Locate or create the appropriate test file first
2. **Write failing test** — Add test case that captures the requirement/bug
3. **Verify RED** — Run test to confirm it fails (proves test is valid)
4. **Implement code** — Write minimal code to make test pass
5. **Verify GREEN** — Run test to confirm it passes
6. **Run CI** — Execute `./scripts/ci/ci-run-tests.sh` before considering work complete

**Never skip tests**. If asked to "just fix it quickly", still write the test first.

### Backend (Jest)

```bash
# Run specific test file in watch mode while developing
cd apps/bff-platform && npm test -- --watch queryClassifier.test.js

# Run all backend tests
cd apps/bff-platform && npm test
cd apps/bff-auth && npm test

# Check coverage (should maintain or improve)
cd apps/bff-platform && npm test -- --coverage
```

**Test file naming**: `<module>.test.js` in `test/` directory.

**Coverage requirement**: New code should maintain or improve coverage.

### E2E (Playwright - BDD style)

E2E tests describe user behavior scenarios:

```javascript
test('user sees payment prompt when credits are low', async ({ page }) => {
  // Given: user has low credits
  await stubIdentifyResponse(page, { credits: 2 });
  
  // When: user sends a premium query
  await page.goto('/');
  await page.fill('[data-testid=chat-input]', 'My birth chart');
  await page.click('[data-testid=send-button]');
  
  // Then: payment prompt appears
  await expect(page.locator('[data-testid=payment-prompt]')).toBeVisible();
});
```

```bash
# Run E2E tests
cd e2e && npx playwright test

# Run specific test file
cd e2e && npx playwright test credits_threshold.spec.js

# Debug mode with browser visible
cd e2e && npx playwright test --headed --debug
```

### When Adding New Features (TDD Checklist)

| Change Type | Step 1: Write Test | Step 2: Implement | Step 3: Verify |
|-------------|-------------------|-------------------|----------------|
| **New BFF endpoint** | Add test in `apps/bff-*/test/` using `createTestApp`/`createMockDb` | Implement route in `lib/` | Run `npm test` |
| **New UI hook** | Add unit test or E2E spec | Implement hook | Run E2E tests |
| **Query classification** | Add test case in `queryClassifier.test.js` | Update classifier | Run `npm test` |
| **Bug fix** | Write failing test that reproduces bug | Fix the code | Verify test passes |
| **Any change** | — | — | Run `./scripts/ci-run-tests.sh` |

**Workflow for Bug Fixes:**
```bash
# 1. Write test that reproduces the bug (should FAIL)
cd apps/bff-platform && npm test -- queryClassifier.test.js

# 2. Implement fix
# ... edit code ...

# 3. Verify test now passes
cd apps/bff-platform && npm test -- queryClassifier.test.js

# 4. Run full CI before committing
./scripts/ci-run-tests.sh
```

## CI/CD Architecture

> **Design Principle**: All CI/CD logic lives in bash scripts ([scripts/](scripts/)), NOT in GitHub workflow YAML. Workflows are thin wrappers that call scripts. This enables local reproducibility and easier debugging.

### CI/CD Improvements & Fixes (January 2026)

**Issues Fixed:**
1. ✅ **Script path references** — Updated all Dockerfiles, docker-compose files, workflows to use new script locations (`scripts/ci/`, `scripts/docker/`, `scripts/mocks/`)
2. ✅ **Database not created** — Added `CREATE DATABASE` command in CI runner before applying migrations (line 68-69 in `scripts/ci/ci-run-tests.sh`)
3. ✅ **Migrations not running** — Added migration application loop with proper error handling (lines 71-78)
4. ✅ **E2E tests failing** — Fixed by adding complete Docker Compose setup/teardown in CI runner
5. ✅ **Environment isolation** — CI now uses `infra/.env.ci` exclusively (separate ports, CI-specific config)
6. ✅ **Non-idempotent CI** — Added cleanup trap, `docker compose down -v` before `up`, database recreation
7. ✅ **Missing error handling** — Added proper error checks, exit codes, and trap cleanup

**Principle Established:**
> **CI/CD via SCRIPTS ONLY** — Never run raw `docker compose` or `npm` commands in workflows. Always use wrapper scripts (`./scripts/ci/ci-run-tests.sh`, `./scripts/deploy_niyati.sh`). This ensures:
> - Consistent behavior between CI and local execution
> - Single source of truth for logic (scripts, not YAML)
> - Easier debugging (run scripts locally)
> - Better error handling and logging

**Environment Configuration:**
- **CI**: Uses `infra/.env.ci` (ports 6173, 4000, 4001, 56432, 7379) — loaded automatically by CI runner
- **Dev**: Uses `infra/.env` (default ports)
- **Prod**: Uses `infra/.env.example` as template + secrets

### Script Organization

```
scripts/
├── lib/
│   └── common.sh           # Shared library (MUST source in all scripts)
├── ci/                     # CI test runners
│   ├── ci-run-tests.sh    # Main CI runner (backend + E2E)
│   └── run_e2e_with_coverage.sh
├── docker/                 # Container helper scripts
│   ├── wait-for-db.sh
│   ├── entrypoint.sh
│   └── healthcheck-http.sh
├── mocks/                  # Mock servers for CI
│   ├── mock-n8n.js        # Mock AI agent (canned responses)
│   ├── mock-webhook.js
│   ├── simulate_webhook.js
│   └── sample_event.json
├── deploy_niyati.sh        # Comprehensive deployment script
├── docker-dev.sh           # Development Docker helper
├── db.sh                   # Database management
└── smoke_test.sh           # Health verification
```

### Shared Library ([scripts/lib/common.sh](scripts/lib/common.sh))

Every script MUST source the common library:

```bash
#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"  # Or ../lib/common.sh if in subdirectory

PROJECT_ROOT="$(find_project_root "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"
```

**Available Functions**:
| Category | Functions |
|----------|-----------|
| Logging | `log_info`, `log_warn`, `log_error`, `log_debug`, `log_step`, `log_success`, `log_fail`, `print_header` |
| Environment | `find_project_root`, `load_env`, `load_project_env`, `ensure_env_files` |
| Docker | `check_docker`, `get_compose_cmd`, `wait_for_container`, `wait_for_postgres` |
| HTTP | `check_url_with_retries`, `run_health_checks` |
| Utility | `confirm_action`, `require_command`, `get_timestamp` |

### CI Test Runner ([scripts/ci/ci-run-tests.sh](scripts/ci/ci-run-tests.sh))

**Purpose**: Idempotent CI script that runs all tests in a clean Docker environment.

```bash
# Full CI suite (default)
./scripts/ci/ci-run-tests.sh

# Skip E2E tests (faster, backend only)
./scripts/ci/ci-run-tests.sh --skip-e2e

# Skip backend tests (E2E only)
./scripts/ci/ci-run-tests.sh --skip-backend

# Keep stack running for debugging
./scripts/ci/ci-run-tests.sh --no-cleanup
```

**What it does** (in order):
1. Loads CI environment from `infra/.env.ci` (CI-specific ports, config)
2. Tears down any existing CI stack (`docker compose down -v`) — **clean slate**
3. Builds and starts CI stack with mock n8n
4. Waits for all services to be healthy
5. Creates database `niyati_ci` if it doesn't exist
6. Applies database migrations from scratch (idempotent)
7. Applies seed data (idempotent `ON CONFLICT DO NOTHING`)
8. Runs backend Jest tests (`bff-platform`, `bff-auth`)
9. Runs E2E Playwright tests
10. Cleans up on exit (success or failure) via trap

**Key Features**:
- **Idempotent**: Safe to run multiple times, always starts fresh
- **Clean database**: Volumes destroyed, schema rebuilt from migrations
- **Cleanup trap**: Always cleans up, even on Ctrl+C or failure
- **Separate ports**: CI uses different ports to avoid conflicts with dev
- **Mock n8n**: Uses [scripts/mocks/mock-n8n.js](scripts/mocks/mock-n8n.js) for deterministic AI responses
- **No shared state**: Each run is completely independent
./scripts/ci-run-tests.sh --no-cleanup
```

**What it does** (in order):
1. Sources `.env.ci` for CI-specific ports
2. Tears down any existing CI stack (`docker compose down -v`) — **clean slate**
3. Builds and starts CI stack with mock n8n
4. Waits for all services to be healthy
5. Applies database migrations from scratch (idempotent)
6. Applies seed data (idempotent `ON CONFLICT DO NOTHING`)
7. Runs backend Jest tests (`bff-platform`, `bff-auth`)
8. Runs E2E Playwright tests
9. Cleans up on exit (success or failure) via trap

**Key Features**:
- **Idempotent**: Safe to run multiple times, always starts fresh
- **Clean database**: Volumes destroyed, schema rebuilt from migrations
- **Cleanup trap**: Always cleans up, even on Ctrl+C or failure
- **Separate ports**: CI uses different ports to avoid conflicts with dev
- **Mock n8n**: Uses [scripts/mocks/mock-n8n.js](scripts/mocks/mock-n8n.js) for deterministic AI responses
- **No shared state**: Each run is completely independent

### Test Independence Principles

Tests can be executed through multiple paths:

| Execution Path | Command | Use Case |
|----------------|---------|----------|
| **CI Script** | `./scripts/ci-run-tests.sh` | Full integration, GitHub Actions |
| **Deploy Script** | `./scripts/deploy_niyati.sh --env=dev --action=test` | Pre-deploy validation |
| **Standalone Backend** | `cd apps/bff-platform && npm test` | Development iteration |
| **Standalone E2E** | `cd e2e && npx playwright test` | UI testing against running stack |

**All paths must produce the same results** because:
- Tests don't depend on execution order
- Each test suite manages its own setup/teardown
- Database is always rebuilt from scratch in CI
- External services are mocked consistently

### Deployment Script ([scripts/deploy_niyati.sh](scripts/deploy_niyati.sh))

**Purpose**: Comprehensive deployment tool with safety features.

```bash
# Development deployment
./scripts/deploy_niyati.sh --env=dev --action=deploy

# Production deployment
./scripts/deploy_niyati.sh --env=prod --action=deploy

# Restart specific service
./scripts/deploy_niyati.sh --env=prod --action=restart --service=bff-platform

# Fresh start (clean everything, rebuild)
./scripts/deploy_niyati.sh --env=dev --action=fresh

# Show status
./scripts/deploy_niyati.sh --action=status
```

**Actions**:
| Action | Description |
|--------|-------------|
| `deploy` | Full deployment: build, migrate, start (default) |
| `restart` | Restart services (use `--service=<name>` for specific) |
| `stop` | Stop all services |
| `rebuild` | Force rebuild (no-cache) then start |
| `clean` | Stop and remove containers, volumes, networks |
| `fresh` | Complete clean slate: remove everything, rebuild, deploy |
| `migrate` | Run database migrations only |
| `status` | Show status of all services |

**Options**:
| Option | Description |
|--------|-------------|
| `--env=dev\|prod` | Target environment |
| `--service=<name>` | Target specific service (for restart) |
| `--dry-run` | Print commands without executing |
| `--verbose` | Detailed output |
| `-y, --yes` | Non-interactive (auto-confirm) |
| `--skip-checks` | Skip pre-deploy validation |
| `--skip-health` | Skip post-deploy health verification |
| `--deep` | Deep clean (remove images, build cache) |

### GitHub Workflows

Workflows are **thin wrappers** that call scripts:

**[.github/workflows/ci.yml](.github/workflows/ci.yml)** — Main CI:
```yaml
- name: Run Full Integration Suite
  run: ./scripts/ci/ci-run-tests.sh
```

**[.github/workflows/ui-deploy.yml](.github/workflows/ui-deploy.yml)** — UI Deployment:
- Builds UI with Vite
- Deploys to S3 + CloudFront via OIDC
- Requires secrets: `AWS_ROLE_ARN`, `AWS_REGION`, `UI_S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`

**[.github/workflows/security.yml](.github/workflows/security.yml)** — Security scanning

### Protected Branches

- **PR Only:** Direct pushes to `master` are forbidden; all changes must be submitted via a pull request.
- **Required Checks:** Merge only after all required CI checks pass (backend Jest + E2E run via `./scripts/ci/ci-run-tests.sh`).
- **Merge Strategy:** Prefer "Squash and merge" for feature PRs; use "Rebase and merge" for small fixups; use a merge commit for release PRs.
- **Reviewers & Approvals:** Require at least one approving reviewer; include maintainer/team review for release or sensitive changes.
- **Local Verification:** Run `./scripts/ci/ci-run-tests.sh` locally before opening a PR; `--skip-e2e` is acceptable for fast iteration.
- **Hotfixes:** For emergency fixes, create a `hotfix/` branch, tag maintainers, and include CI artifacts; maintainers may fast-track after approvals.
- **CI Flakes & Evidence:** If CI fails intermittently, re-run and attach Playwright traces/logs to the PR for triage.
- **Conflict Resolution:** Rebase onto `master` or resolve conflicts locally before merging.

### Docker Compose Architecture

**Layered Configuration**:
```bash
# Development (default)
docker compose up -d
# Uses: docker-compose.yml + docker-compose.override.yml

# Production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# CI
docker compose --env-file .env.ci -f docker-compose.yml -f docker-compose.ci.yml up -d
```

**File Purposes**:
| File | Purpose |
|------|---------|
| `docker-compose.yml` | Base services (postgres, redis, bffs, ui, caddy) |
| `docker-compose.override.yml` | Dev defaults (volumes, hot reload) |
| `docker-compose.prod.yml` | Production (fixed container names, health checks) |
| `docker-compose.ci.yml` | CI (different ports, mock n8n service) |
| `.env.ci` | CI environment variables |

### Infrastructure Isolation

**Design Principle**: Dev, CI, and Prod environments are completely isolated — they can run simultaneously without conflicts.

| Resource Type | Dev | CI | Prod |
|---------------|-----|-----|------|
| **Project Name** | `niyati` | `niyati-ci` | `niyati-prod` |
| **Network** | `niyati_default` | `niyati-ci_default` | `niyati-prod_default` |
| **Volumes** | `niyati_postgres-data` | `niyati-ci_postgres-data` | `niyati-prod_postgres-data-prod` |
| **Containers** | `niyati-*-1` | `niyati-ci-*-1` | `niyati-*-prod` |

**Why Isolation Matters**:
- Run CI tests while dev stack is running
- Deploy to prod without affecting CI
- Debug issues in isolation
- No port conflicts or volume corruption

### Port Configuration

CI uses separate ports to allow running alongside dev:

| Service | Dev/Prod | CI | Notes |
|---------|----------|-----|-------|
| Caddy (UI) | 5173 | **6173** | Browser access |
| BFF Platform | 3000 | **4000** | Internal port |
| BFF Auth | 3001 | **4001** | Internal port |
| PostgreSQL | 5432 | **56432** | External for seeding |
| Redis | 6379 | **7379** | External for debugging |
| n8n/mock | 5678 | **6678** | Mock in CI |

### Mock Services

**[scripts/mocks/mock-n8n.js](scripts/mocks/mock-n8n.js)**:
- Simple HTTP server that returns canned AI responses
- Used in CI instead of real n8n + Ollama
- Returns: `{ output: "Hello — I see your profile. Here's today's horoscope: You will feel a gentle clarity today.\n" }`

### Adding New Scripts

1. Create script in `scripts/`:
```bash
#!/usr/bin/env bash
# =============================================================================
# Script Name
# =============================================================================
# Description of what this script does
#
# Usage: ./scripts/my-script.sh [OPTIONS]
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

PROJECT_ROOT="$(find_project_root "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Your script logic here
log_step "Starting..."
```

2. Make executable: `chmod +x scripts/my-script.sh`
3. Add to [scripts/README.md](scripts/README.md) documentation

## Commands

### CI/CD Commands

| Task | Command |
|------|---------|
| **Run full CI** | `./scripts/ci/ci-run-tests.sh` |
| CI (backend only) | `./scripts/ci/ci-run-tests.sh --skip-e2e` |
| CI (keep stack) | `./scripts/ci/ci-run-tests.sh --no-cleanup` |
| **Deploy dev** | `./scripts/deploy_niyati.sh --env=dev --action=deploy` |
| **Deploy prod** | `./scripts/deploy_niyati.sh --env=prod --action=deploy` |
| Fresh start | `./scripts/deploy_niyati.sh --env=dev --action=fresh` |
| Status check | `./scripts/deploy_niyati.sh --action=status` |
| Clean up | `./scripts/deploy_niyati.sh --action=clean --yes` |

### Development Commands

| Task | Command |
|------|---------|
| Dev stack | `docker compose up -d` |
| Dev logs | `docker compose logs -f` |
| Start dev UI | `cd ui && npm run dev` |
| Mock n8n | `node scripts/mocks/mock-n8n.js` |
| DB shell | `./scripts/db.sh shell` |
| Run migrations | `./scripts/db.sh migrate` |

### Testing Commands

| Task | Command |
|------|---------|
| Backend tests (platform) | `cd apps/bff-platform && npm test` |
| Backend tests (auth) | `cd apps/bff-auth && npm test` |
| Single test file | `cd apps/bff-platform && npm test -- queryClassifier.test.js` |
| Watch mode | `cd apps/bff-platform && npm test -- --watch` |
| Coverage | `cd apps/bff-platform && npm test -- --coverage` |
| E2E tests | `cd e2e && npx playwright test` |
| E2E specific | `cd e2e && npx playwright test credits_threshold.spec.js` |
| E2E debug | `cd e2e && npx playwright test --headed --debug` |

### Troubleshooting Commands

| Task | Command |
|------|---------|
| Check CI ports | `lsof -i :6173 -i :4000 -i :4001` |
| Kill stuck CI | `docker compose -p niyati-ci down -v --remove-orphans` |
| View container logs | `docker compose logs <service>` |
| Restart service | `docker compose restart <service>` |
| Check health | `curl http://localhost:5173/api/v1/telemetry/health` |

## Critical Rules

### 1. TDD/BDD is Mandatory (Non-Negotiable)
- **Write test FIRST** — Before any implementation code
- **Red-Green-Refactor** — Test fails → implement → test passes → refactor
- **No shortcuts** — Even "quick fixes" require a failing test first
- **Run CI before commit** — `./scripts/ci/ci-run-tests.sh` must pass

### 2. Database: Idempotent, From Scratch, No Mutations
- **Always parameterized** — Use `$1`, `$2`. NEVER concatenate strings.
- **Idempotent DDL** — `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`
- **Idempotent DML** — `INSERT ... ON CONFLICT DO NOTHING`
- **STRICTLY FORBIDDEN** — `UPDATE` and `ALTER` statements
- **Schema changes** — Create new migration file, rebuild from scratch
- **Data fixes** — Use `INSERT ... ON CONFLICT` or create new table
- **Why**: Ensures reproducibility, simplifies rollbacks, eliminates state drift

### 3. Infrastructure: Isolated Environments
- **Non-overlapping resources** — Dev, CI, and Prod use different ports, networks, volumes
- **Idempotent scripts** — Safe to run multiple times, always produce same result
- **Clean starts** — `docker compose down -v` before `up` in CI/deploy
- **Named resources** — Use project prefixes (`niyati-dev-`, `niyati-ci-`, `niyati-prod-`)

### 4. Tests: Independent and Reproducible
- **Multiple execution paths** — Tests run via CI scripts, deploy scripts, or standalone
- **No shared state** — Each test file/suite is self-contained
- **Deterministic** — Same input → same output, always
- **Mock external services** — n8n, external APIs stubbed in tests

### 5. Code Standards
- **Async/await** — All async code wrapped in try/catch with proper error responses
- **Migrations** — Name: `YYYYMMDD_XX_desc.up.sql`. Path: `packages/migrations/`
- **CI/CD logic** — Lives in [scripts/](scripts/), NOT in GitHub workflow YAML
- **Billing** — Server-side only. UI displays but never performs authoritative charges
- **Scripts** — All bash scripts MUST source `scripts/lib/common.sh` for consistency

## Environment Configs

### Docker Compose Modes

| Mode | Command | Compose Files |
|------|---------|---------------|
| **Development** | `docker compose up -d` | `docker-compose.yml` + `docker-compose.override.yml` |
| **Production** | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` | `docker-compose.yml` + `docker-compose.prod.yml` |
| **CI** | `./scripts/ci-run-tests.sh` (auto) | `docker-compose.yml` + `docker-compose.ci.yml` + `.env.ci` |

### Port Configuration (CI vs Dev/Prod)

CI uses separate ports to avoid conflicts when running alongside dev environment:

| Service | Dev/Prod | CI | Notes |
|---------|----------|-----|-------|
| Caddy (UI) | 5173 | **6173** | External browser access |
| BFF Platform | 3000 | **4000** | Internal container port |
| BFF Auth | 3001 | **4001** | Internal container port |
| Postgres | 5432 | **56432** | External for test seeding |
| Redis | 6379 | **7379** | External for debugging |
| n8n/mock | 5678 | **6678** | External for debugging |

### Key Environment Files

| File | Purpose |
|------|---------|
| `.env` | Development environment (gitignored) |
| `.env.ci` | CI-specific ports and mock config |
| `.env.example` | Template for `.env` |
| `secrets/` | Docker secrets (gitignored in prod) |

### Running CI Locally

```bash
# Full CI suite (recommended)
./scripts/ci-run-tests.sh

# Manual Docker compose with CI config
docker compose --env-file .env.ci -f docker-compose.yml -f docker-compose.ci.yml up -d
```

**Important**: When `bff-auth` calls `bff-platform` internally, it uses `BFF_PLATFORM_BASE` environment variable. In CI, this is set to `http://bff-platform:4000/api/v1` to match the CI port.
## Documentation as Code

**DOCUMENTATION AS CODE**: Keep docs in sync with code changes. Update [.github/copilot-instructions.md](.github/copilot-instructions.md) when patterns change. Update README when commands change. Docs that lie are worse than no docs.
## For AI Agents: Quick Start

When you need to make changes to Niyati:

1. **Understand the change**: Is it backend, frontend, CI, or deployment?
2. **Write test first**: Always TDD — failing test before code
3. **Make the change**: Follow patterns in existing code
4. **Run tests**: `npm test` for unit tests
5. **Run full CI**: `./scripts/ci-run-tests.sh` before considering done
6. **Document**: Update this file if you change architecture or add new patterns