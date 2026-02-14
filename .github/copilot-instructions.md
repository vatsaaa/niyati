# Niyati — AI Agent Instructions

AI-powered astrology platform. BFF architecture, JavaScript only.

> **Pattern Reference**: This project serves as a reference implementation for BFF-based JavaScript projects with comprehensive CI/CD, testing, and deployment patterns.

## ⚠️ Core Development Principles

> **TDD/BDD is MANDATORY** — No code without tests first. No exceptions.
> **Database is IMMUTABLE** — No `UPDATE`, no `ALTER`. Always idempotent, from scratch.
> **Infrastructure is ISOLATED** — Dev, CI, and Prod use non-overlapping ports, networks, volumes.
> **Tests are INDEPENDENT** — Run via CI scripts, deploy scripts, or standalone. Always reproducible.

## Architecture & Data Flow

```
Browser (React/Vite) → Caddy (reverse proxy) → bff-platform / bff-auth → PostgreSQL
                                                       ↓
                                                  n8n (AI agent) ← Ollama (LLM)

Worker ← Redis (queue) — handles async jobs (email, etc.)
```

- **Pattern**: BFF-first. UI is a thin renderer — all business logic, billing, and validation happens server-side.
- **Frontend**: React + Vite (ES modules: `import`/`export`)
- **Backend**: Node.js + Express (CommonJS: `require`/`module.exports`)
- **n8n**: Runs locally on port 5678 (NOT containerized in dev/prod). Handles AI orchestration, conversation memory, LLM prompt control.

### Caddy Routing (order matters)

| Path | Destination | Notes |
|------|-------------|-------|
| `/api/v1/users/deduct-credits` | **bff-platform:3000** | Explicit override |
| `/api/v1/users/add-credits` | **bff-platform:3000** | Explicit override |
| `/api/v1/users/*` | **bff-auth:3001** | identify, profile, etc. |
| `/api/v1/auth/*` | **bff-auth:3001** | Login, OAuth, tokens |
| `/webhook/*` | **n8n:5678** | AI webhook (host.docker.internal) |
| `/api/*` | **bff-platform:3000** | All other APIs (chat, geocode, astrology, profile, telemetry) |
| `/*` | Static `/srv` | React SPA with try_files fallback |

> **Key**: Both bff-platform and bff-auth define `/users/profile` and `/users/identify`. Through Caddy, only the bff-auth versions are hit for identify. The bff-platform `/users/profile` is reached directly by the UI for profile saves via the `/api/*` catch-all.

### BFF-First Philosophy

UI NEVER performs authoritative actions:
- **Billing**: Only BFF decrements credits after validating `isBillable`. UI shows optimistic updates but waits for server confirmation.
- **Validation**: BFF normalizes inputs (ISO dates, sanitization) and computes derived fields (`age`, `isAdult`).
- **Charges**: Must be idempotent (use `reqId`) to prevent double deductions on retry.
- **Profile extraction**: Server-side NLP via `POST /api/v1/profile/extract` — no NLP libraries in UI.

### Lightweight UI Principles

UI is a **thin rendering layer** — no heavy processing, NLP, or business logic:

| ❌ Avoid in UI | ✅ Do in BFF |
|----------------|---------------|
| NLP/text classification | Query classification via `/chat/classify` |
| Credit calculations | `/users/deduct-credits` returns balance |
| Date parsing/normalization | BFF normalizes to ISO format |
| Complex validation | BFF validates and returns errors |
| Direct DB queries | All data through BFF endpoints |
| Profile field extraction | `/profile/extract` in bff-platform |

**`bffFetch` convention**: The UI's `bffFetch()` calls `buildApiUrl(path)` which prepends the API version prefix. Always pass **short paths** like `/users/profile`, NOT `/api/v1/users/profile` (which would double-prefix).

## Key Directories

| Purpose | Location |
|---------|----------|
| BFF platform routes | [apps/bff-platform/lib/](apps/bff-platform/lib/) — users, chat, geocode, astrology, profileExtractor |
| BFF auth routes | [apps/bff-auth/lib/](apps/bff-auth/lib/) — auth, users, internal, oauth |
| BFF platform entry | [apps/bff-platform/src/index.js](apps/bff-platform/src/index.js) |
| BFF auth entry | [apps/bff-auth/src/index.js](apps/bff-auth/src/index.js) |
| Shared utilities | [packages/commons/](packages/commons/) — logger, sanitize, ErrorCodes, responses |
| Test helpers | [packages/commons/test/helpers.js](packages/commons/test/helpers.js) — `createTestApp`, `createMockDb` |
| Frontend hooks | [apps/ui/src/hooks/](apps/ui/src/hooks/) — useChat, useLogin, useAppState, usePWA |
| Frontend API client | [apps/ui/src/services/api.js](apps/ui/src/services/api.js) — bffFetch, bffFetchWithRetry |
| Migrations | [packages/migrations/](packages/migrations/) (format: `YYYYMMDD_XX_desc.up.sql`) |
| E2E tests | [e2e/tests/](e2e/tests/) — 11 Playwright spec files |
| **Automation Scripts** | [scripts/](scripts/) — **all** CI/CD logic lives here, NOT in GitHub YAML |
| Infrastructure | [infra/](infra/) — Compose files, Caddyfile, env files, secrets |
| GitHub Workflows | [.github/workflows/](.github/workflows/) — thin wrappers calling scripts/ |

## Project Structure

```
niyati/
├── .github/
│   ├── workflows/          # GitHub Actions (thin wrappers)
│   └── copilot-instructions.md
├── apps/
│   ├── bff-platform/       # Main BFF service (port 3000)
│   │   ├── lib/            # Route handlers
│   │   ├── services/       # External service integrations
│   │   ├── src/index.js    # Express app entry
│   │   └── test/           # Jest tests
│   ├── bff-auth/           # Auth service (port 3001)
│   │   ├── lib/            # Route handlers
│   │   ├── src/index.js    # Express app entry
│   │   └── test/           # Jest tests
│   ├── ui/                 # React + Vite frontend
│   │   ├── src/hooks/      # useChat, useLogin, useAppState, usePWA
│   │   ├── src/services/   # API client
│   │   ├── src/utils/      # Utilities (profile, date normalization)
│   │   └── test/           # Vitest tests
│   ├── n8n/                # n8n workflow definition
│   └── worker/             # Background job processor
├── packages/
│   ├── commons/            # Shared libraries
│   └── migrations/         # SQL migrations (7 files)
├── infra/                  # ALL infrastructure config
│   ├── docker-compose.yml          # Base services
│   ├── docker-compose.override.yml # Dev (hot reload, local ports)
│   ├── docker-compose.prod.yml     # Prod (secrets, HTTPS, fixed names)
│   ├── docker-compose.ci.yml       # CI (different ports, mock n8n)
│   ├── Caddyfile                   # Production proxy config
│   ├── Caddyfile.dev               # Dev proxy config
│   ├── .env                        # Prod env (gitignored)
│   ├── .env.example                # Template
│   └── secrets/                    # Docker secrets (gitignored)
├── e2e/                    # Playwright E2E tests (11 specs)
├── scripts/                # All automation scripts
│   ├── lib/common.sh       # Shared bash library (22 functions)
│   ├── ci-run-tests.sh     # CI test runner
│   ├── deploy_niyati.sh    # Deployment script (9 actions)
│   └── ...
└── README.md
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

### Tables (8 total)

| Table | Purpose |
|-------|---------|
| `users` | Core user record (phone, name, DOB, credits, is_adult) |
| `user_profiles` | Extended profile (normalized fields from NLP extraction) |
| `user_credits` | Credit balance tracking |
| `charge_transactions` | Billing audit trail |
| `app_config` | Application config (key-value, cached 5 min in BFF) |
| `oauth_accounts` | OAuth provider links |
| `refresh_tokens` | JWT refresh tokens |
| `password_resets` | Password reset requests |

## Integration Points

### n8n Workflow (AI Orchestration)
- Receives chat messages via webhook, executes AI agent with Ollama LLM, returns `{output}`
- Workflow definition: [apps/n8n/NiyatiWorkflow.json](apps/n8n/NiyatiWorkflow.json)
- **CI uses mock**: [scripts/mock-n8n.js](scripts/mock-n8n.js) — simple HTTP server returning canned responses

### Worker Service (Background Jobs)
- Location: [apps/worker/worker.js](apps/worker/worker.js)
- Polls Redis queue for jobs (`email`, webhooks)
- Authenticates via `WORKER_TOKEN` from secrets
- Uses `getSecret()` pattern for Docker secrets (`_FILE` env vars)

### Secrets Pattern (Docker)

Services use `getSecret(envVar, fileEnvVar)` to read secrets from files in production:

```javascript
function getSecret(envVar, fileEnvVar) {
  if (process.env[fileEnvVar]) {
    return fs.readFileSync(process.env[fileEnvVar], 'utf8').trim();
  }
  return process.env[envVar];
}
```

- **Dev**: Set `WORKER_TOKEN=xxx` in `.env`
- **Prod**: Mount secret file, set `WORKER_TOKEN_FILE=/run/secrets/worker_token`

### Credits System

**Configuration** (from `app_config` table, cached 5 min):
| Key | Default | Description |
|-----|---------|-------------|
| `credits_monthly_free` | 10 | Free credits per month |
| `credits_horoscope_cost` | 2 | Cost for daily horoscope |
| `credits_premium_cost` | 4 | Cost for birth chart/predictions |
| `credits_low_threshold` | 4 | Show payment prompt when below |
| `payment_amount_inr` | 500 | Payment amount (INR) |

**Billing Flow**:
1. UI sends message directly to n8n webhook, receives AI response
2. UI calls `POST /api/v1/chat/classify` with `{message}` → BFF returns `{queryType, creditCost, isBillable}`
3. If `isBillable`, UI calls `POST /api/v1/users/deduct-credits` with `{phoneNumber, amount: creditCost}`
4. **BFF** deducts credits from DB, returns updated balance
5. UI displays server-confirmed balance

**Query Classification** (server-side in [apps/bff-platform/lib/nlpClassifier.js](apps/bff-platform/lib/nlpClassifier.js)):
- `isHoroscopeQuery()`: horoscope, zodiac, rashifal → 2 credits
- `isPremiumAstrologyQuery()`: birth chart, predictions, remedies → 4 credits
- `isCasualConversation()`: greetings, profile info → no charge

**Monthly Reset**: Checked in `/users/identify` — if `credits_last_reset` is from a previous month, reset to `credits_monthly_free`.

## Backend Route Pattern

All BFF routes follow this structure:

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

All hooks use `bffFetchWithRetry` or `bffFetch`:

```javascript
import { bffFetchWithRetry } from '../services/api';

export function useMyFeature() {
  const performAction = async (payload) => {
    // Use SHORT paths — bffFetch prepends /api/v1 automatically
    const res = await bffFetchWithRetry('/resource/action', {
      method: 'POST', body: JSON.stringify(payload)
    });
    return res.data;
  };
  return { performAction };
}
```

> **Important**: `bffFetch('/users/profile', ...)` is correct. `bffFetch('/api/v1/users/profile', ...)` is WRONG (double-prefixes to `/api/v1/api/v1/users/profile`).

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
    jest.mock('@niyati/commons', () => createMockCommons());
    const router = require('../lib/my-feature');
    ({ app } = createTestApp('/api/v1/my-feature', router));
  });

  afterEach(() => jest.restoreAllMocks());

  test('POST /action returns success', async () => {
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

### UI Unit Tests (Vitest)

Location: `apps/ui/src/**/__tests__/`

```bash
cd apps/ui && npm test                    # All UI tests (uses npx vitest)
cd apps/ui && npm test -- <file>          # Specific test file
```

> **Note**: vitest is hoisted to root `node_modules/` by npm workspaces. The `test` script uses `npx vitest` to find it regardless of hoisting.

### E2E Tests (Playwright)

Location: [e2e/tests/](e2e/tests/) — 11 spec files

E2E tests run against the full stack with route interception for deterministic behavior:

```javascript
const { test, expect } = require('@playwright/test');

test('user flow with stubbed API', async ({ page, baseURL }) => {
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
6. **Run CI** — Execute `./scripts/ci-run-tests.sh` before considering work complete

**Never skip tests**. If asked to "just fix it quickly", still write the test first.

### When Adding New Features (TDD Checklist)

| Change Type | Step 1: Write Test | Step 2: Implement | Step 3: Verify |
|-------------|-------------------|-------------------|----------------|
| **New BFF endpoint** | Add test in `apps/bff-*/test/` using `createTestApp`/`createMockDb` | Implement route in `lib/` | Run `npm test` |
| **New UI hook** | Add unit test or E2E spec | Implement hook | Run E2E tests |
| **Query classification** | Add test case in `nlpClassifier.test.js` | Update classifier | Run `npm test` |
| **Bug fix** | Write failing test that reproduces bug | Fix the code | Verify test passes |
| **Any change** | — | — | Run `./scripts/ci-run-tests.sh` |

## CI/CD Architecture

> **Design Principle**: All CI/CD logic lives in bash scripts ([scripts/](scripts/)), NOT in GitHub workflow YAML. Workflows are thin wrappers that call scripts. This enables local reproducibility and easier debugging.

### CI Test Runner ([scripts/ci-run-tests.sh](scripts/ci-run-tests.sh))

```bash
./scripts/ci-run-tests.sh                # Full CI (backend + E2E)
./scripts/ci-run-tests.sh --skip-e2e     # Backend only (faster)
./scripts/ci-run-tests.sh --skip-backend # E2E only
./scripts/ci-run-tests.sh --no-cleanup   # Keep stack running for debugging
./scripts/ci-run-tests.sh --verbose      # Detailed output
```

**What it does** (in order):
1. Check/liberate CI ports (4000, 4001, 6173, 56432, 7379, 6678)
2. Bootstrap: ensure lockfiles, `npm ci` for test packages
3. Tear down existing CI stack (`docker compose down -v`) — clean slate
4. Build and start CI stack with mock n8n
5. Wait for all services to be healthy
6. Apply database migrations from scratch
7. Clean database for fresh E2E state
8. Run backend Jest tests (bff-platform, bff-auth)
9. Run E2E Playwright tests with `REAL=1`
10. Merge coverage reports
11. Cleanup on exit (success or failure) via trap

**Compose command**: `docker compose --env-file infra/.env -f infra/docker-compose.yml -f infra/docker-compose.ci.yml`
**Project name**: `niyati-ci`

### Deployment Script ([scripts/deploy_niyati.sh](scripts/deploy_niyati.sh))

9 actions: `deploy`, `fresh`, `restart`, `rebuild`, `migrate`, `status`, `verify`, `stop`, `clean`

See [README.md](../README.md#deployment) for full usage.

### GitHub Workflows

Workflows are **thin wrappers** that call scripts:

- **[ci.yml](.github/workflows/ci.yml)** — Main CI: `./scripts/ci-run-tests.sh`
- **[ui-deploy.yml](.github/workflows/ui-deploy.yml)** — UI to S3 + CloudFront via OIDC
- **[security.yml](.github/workflows/security.yml)** — Security scanning

### Protected Branches

- **PR Only**: Direct pushes to `master` are forbidden
- **Required Checks**: All CI checks must pass before merge
- **Merge Strategy**: Squash and merge for features, rebase for fixups
- **Local Verification**: Run `./scripts/ci-run-tests.sh` before opening a PR

## Commands

### CI/CD Commands

| Task | Command |
|------|---------|
| **Run full CI** | `./scripts/ci-run-tests.sh` |
| CI (backend only) | `./scripts/ci-run-tests.sh --skip-e2e` |
| CI (keep stack) | `./scripts/ci-run-tests.sh --no-cleanup` |
| **Deploy prod** | `./scripts/deploy_niyati.sh --env=prod --action=deploy` |
| **Fresh prod** | `./scripts/deploy_niyati.sh --env=prod --action=fresh -y --verbose` |
| Status | `./scripts/deploy_niyati.sh --action=status` |
| Verify | `./scripts/deploy_niyati.sh --env=prod --action=verify --quick` |
| Stop | `./scripts/deploy_niyati.sh --env=prod --action=stop` |
| Clean | `./scripts/deploy_niyati.sh --env=prod --action=clean -y` |
| Restart one | `./scripts/deploy_niyati.sh --env=prod --action=restart --service=bff-platform` |

### Development Commands

| Task | Command |
|------|---------|
| Dev stack | `./scripts/deploy_niyati.sh --env=dev --action=deploy` |
| Dev fresh | `./scripts/deploy_niyati.sh --env=dev --action=fresh -y` |
| Dev logs | `docker logs -f niyati-bff-platform-1` |
| Mock n8n | `node scripts/mock-n8n.js` |
| DB shell | `./scripts/db.sh shell` |
| Run migrations | `./scripts/db.sh migrate` |

### Testing Commands

| Task | Command |
|------|---------|
| Backend (platform) | `cd apps/bff-platform && npm test` |
| Backend (auth) | `cd apps/bff-auth && npm test` |
| Single test file | `cd apps/bff-platform && npm test -- users.test.js` |
| Watch mode | `cd apps/bff-platform && npm test -- --watch` |
| Coverage | `cd apps/bff-platform && npm test -- --coverage` |
| UI tests | `cd apps/ui && npm test` |
| UI single file | `cd apps/ui && npm test -- src/hooks/__tests__/useChat.profileSave.test.js` |
| E2E all | `cd e2e && npx playwright test` |
| E2E specific | `cd e2e && npx playwright test credits_threshold.spec.js` |
| E2E debug | `cd e2e && npx playwright test --headed --debug` |

### Troubleshooting Commands

| Task | Command |
|------|---------|
| Check CI ports | `lsof -i :6173 -i :4000 -i :4001` |
| Kill stuck CI | `docker compose -p niyati-ci down -v --remove-orphans` |
| View logs | `docker logs -f niyati-bff-platform-prod` |
| Restart service | `./scripts/deploy_niyati.sh --env=prod --action=restart --service=<name>` |
| Health check | `curl http://localhost:5173/api/v1/telemetry/health` |
| DB query | `docker exec -i niyati-postgres-prod psql -U niyati -d niyati_prod -c "SELECT ..."` |

## Critical Rules

### 1. TDD/BDD is Mandatory (Non-Negotiable)
- **Write test FIRST** — Before any implementation code
- **Red-Green-Refactor** — Test fails → implement → test passes → refactor
- **No shortcuts** — Even "quick fixes" require a failing test first
- **Run CI before commit** — `./scripts/ci-run-tests.sh` must pass

### 2. Database: Idempotent, From Scratch, No Mutations
- **Always parameterized** — Use `$1`, `$2`. NEVER concatenate strings.
- **Idempotent DDL** — `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`
- **Idempotent DML** — `INSERT ... ON CONFLICT DO NOTHING`
- **STRICTLY FORBIDDEN** — `UPDATE` and `ALTER` statements
- **Schema changes** — Create new migration file, rebuild from scratch
- **Data fixes** — Use `INSERT ... ON CONFLICT` or create new table

### 3. Infrastructure: Isolated Environments
- **Non-overlapping resources** — Dev, CI, and Prod use different ports, networks, volumes
- **Idempotent scripts** — Safe to run multiple times, always produce same result
- **Clean starts** — `docker compose down -v` before `up` in CI/deploy
- **All compose files in `infra/`** — NOT at project root

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
- **UI API calls** — Use short paths (`/users/profile`), NOT full paths (`/api/v1/users/profile`)

## Environment Configs

### Docker Compose Modes

| Mode | Compose Files | Command |
|------|---------------|---------|
| **Development** | `infra/docker-compose.yml` + `infra/docker-compose.override.yml` | `./scripts/deploy_niyati.sh --env=dev --action=deploy` |
| **Production** | `infra/docker-compose.yml` + `infra/docker-compose.prod.yml` | `./scripts/deploy_niyati.sh --env=prod --action=deploy` |
| **CI** | `infra/docker-compose.yml` + `infra/docker-compose.ci.yml` | `./scripts/ci-run-tests.sh` (automatic) |

### Port Configuration

| Service | Dev/Prod | CI | Notes |
|---------|----------|-----|-------|
| Caddy (UI) | 5173 | **6173** | External browser access |
| BFF Platform | 3000 | **4000** | Container port |
| BFF Auth | 3001 | **4001** | Container port |
| Postgres | 5432 | **56432** | External for seeding |
| Redis | 6379 | **7379** | External for debugging |
| n8n/mock | 5678 | **6678** | External for debugging |

### Environment Files

| File | Purpose |
|------|---------|
| `infra/.env` | Production environment (gitignored) |
| `infra/.env.example` | Template for .env |
| `infra/.env.bff.auth` | bff-auth specific vars |
| `infra/.env.bff.platform` | bff-platform specific vars |
| `infra/.env.ui` | UI build-time vars |
| `infra/secrets/` | Docker secrets (gitignored) |

## For AI Agents: Quick Start

When you need to make changes to Niyati:

1. **Understand the change**: Is it backend, frontend, CI, or deployment?
2. **Write test first**: Always TDD — failing test before code
3. **Make the change**: Follow patterns in existing code
4. **Run tests**: `npm test` for unit tests
5. **Run full CI**: `./scripts/ci-run-tests.sh` before considering done
6. **Document**: Update this file if you change architecture or add new patterns

### Key Gotchas

- **Caddy routing**: `/api/v1/users/*` → bff-auth, EXCEPT `deduct-credits` and `add-credits` → bff-platform
- **bffFetch paths**: Use `/users/profile` NOT `/api/v1/users/profile` (buildApiUrl adds the prefix)
- **vitest**: Hoisted to root `node_modules/`; UI uses `npx vitest` in its test script
- **Compose files**: All in `infra/`, not at project root
- **Env files**: All in `infra/`, not at project root
- **Both BFFs share the same Postgres DB** — bff-platform can write to auth tables directly
