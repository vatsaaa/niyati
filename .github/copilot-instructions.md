# Niyati — AI Agent Instructions

AI-powered astrology platform. BFF architecture, JavaScript only.

## Architecture & Data Flow

```
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
| BFF routes | [be/bff-platform/lib/](be/bff-platform/lib/), [be/bff-auth/lib/](be/bff-auth/lib/) |
| Shared utilities | [be/commons/](be/commons/) — logger, sanitize, ErrorCodes, responses |
| Test helpers | [be/commons/test/helpers.js](be/commons/test/helpers.js) — `createTestApp`, `createMockDb` |
| Frontend hooks | [ui/src/hooks/](ui/src/hooks/), services in [ui/src/services/api.js](ui/src/services/api.js) |
| Migrations | [be/migrations/](be/migrations/) (format: `YYYYMMDD_XX_desc.up.sql`) |
| E2E tests | [e2e/tests/](e2e/tests/) — Playwright browser tests |
| CI/Deploy | [scripts/](scripts/) — **all** automation lives here |

## Integration Points

### n8n Workflow (AI Orchestration)
- Runs on **local machine port 5678** — not in Docker
- Receives chat messages via webhook, executes AI agent with Ollama LLM, returns `{output}`
- Workflow definition: [be/n8n/NiyatiWorkflow.json](be/n8n/NiyatiWorkflow.json)
- **CI uses mock**: [scripts/mock-n8n.js](scripts/mock-n8n.js) — simple HTTP server returning canned responses

### Worker Service (Background Jobs)
- Location: [be/worker/worker.js](be/worker/worker.js)
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

const WORKER_TOKEN = getSecret('WORKER_TOKEN', 'WORKER_TOKEN_FILE');
```

- **Dev**: Set `WORKER_TOKEN=xxx` in `.env`
- **Prod**: Mount secret file, set `WORKER_TOKEN_FILE=/run/secrets/worker_token`
- Secrets location: [secrets/](secrets/) (gitignored in prod)

### Credits System

**Schema** ([be/migrations/20251217_01_baseline.up.sql](be/migrations/20251217_01_baseline.up.sql)):
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

**Billing Flow** (see [ui/src/hooks/useChat.js](ui/src/hooks/useChat.js), [be/bff-platform/lib/queryClassifier.js](be/bff-platform/lib/queryClassifier.js)):
1. UI sends message directly to n8n webhook, receives AI response
2. UI calls `POST /api/v1/chat/classify` with `{message}` → BFF returns `{queryType, creditCost, isBillable}`
3. If `isBillable`, UI calls `POST /api/v1/users/deduct-credits` with `{phoneNumber, amount: creditCost}`
4. **BFF** deducts credits from DB, returns updated balance
5. UI displays server-confirmed balance

**Query Classification** (server-side in [be/bff-platform/lib/queryClassifier.js](be/bff-platform/lib/queryClassifier.js)):
- `isHoroscopeQuery()`: horoscope, zodiac, rashifal → `credits_horoscope_cost` (2)
- `isPremiumAstrologyQuery()`: birth chart, predictions, remedies → `credits_premium_cost` (4)
- `isCasualConversation()`: greetings, profile info → no charge

**Classification Endpoint**: `POST /api/v1/chat/classify`
- Request: `{ message: string }`
- Response: `{ queryType: 'casual'|'horoscope'|'premium', creditCost: number, isBillable: boolean, config }`

**Monthly Reset**: Checked in `/users/identify` — if `credits_last_reset` is from a previous month, reset to `credits_monthly_free`.

## Backend Route Pattern

All BFF routes follow this structure ([be/bff-platform/lib/users.js](be/bff-platform/lib/users.js)):

```javascript
const { logger, sanitize, ErrorCodes } = require('../../commons');

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

All hooks use `bffFetchWithRetry` ([ui/src/hooks/useChat.js](ui/src/hooks/useChat.js)):

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

Location: `be/bff-platform/test/`, `be/bff-auth/test/`

Use `createTestApp` and `createMockDb` from [be/commons/test/helpers.js](be/commons/test/helpers.js). These wire up `res.sendSuccess`/`res.sendError` automatically via `attachResponseHelpers` middleware.

```javascript
const request = require('supertest');
const { createTestApp, createMockDb, createMockCommons } = require('@test-helpers');

describe('My Feature', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    // Mock commons to isolate from real logger/config
    jest.mock('../commons', () => createMockCommons());
    
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
6. **Run CI** — Execute `./scripts/ci-run-tests.sh` before considering work complete

**Never skip tests**. If asked to "just fix it quickly", still write the test first.

### Backend (Jest)

```bash
# Run specific test file in watch mode while developing
cd be/bff-platform && npm test -- --watch queryClassifier.test.js

# Run all backend tests
cd be/bff-platform && npm test
cd be/bff-auth && npm test

# Check coverage (should maintain or improve)
cd be/bff-platform && npm test -- --coverage
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
| **New BFF endpoint** | Add test in `be/bff-*/test/` using `createTestApp`/`createMockDb` | Implement route in `lib/` | Run `npm test` |
| **New UI hook** | Add unit test or E2E spec | Implement hook | Run E2E tests |
| **Query classification** | Add test case in `queryClassifier.test.js` | Update classifier | Run `npm test` |
| **Bug fix** | Write failing test that reproduces bug | Fix the code | Verify test passes |
| **Any change** | — | — | Run `./scripts/ci-run-tests.sh` |

**Workflow for Bug Fixes:**
```bash
# 1. Write test that reproduces the bug (should FAIL)
cd be/bff-platform && npm test -- queryClassifier.test.js

# 2. Implement fix
# ... edit code ...

# 3. Verify test now passes
cd be/bff-platform && npm test -- queryClassifier.test.js

# 4. Run full CI before committing
./scripts/ci-run-tests.sh
```

## Commands

| Task | Command |
|------|---------|
| **Run CI locally** | `./scripts/ci-run-tests.sh` |
| Backend tests (platform) | `cd be/bff-platform && npm test` |
| Backend tests (auth) | `cd be/bff-auth && npm test` |
| E2E tests | `cd e2e && npx playwright test` |
| Start dev UI | `cd ui && npm run dev` |
| Deploy | `./scripts/deploy_niyati.sh --env=prod --action=deploy` |
| Dev stack | `docker compose up -d` |
| CI stack (manual) | `docker compose --env-file .env.ci -f docker-compose.yml -f docker-compose.ci.yml up -d` |
| Start mock n8n | `node scripts/mock-n8n.js` |
| Check CI ports | `lsof -i :6173 -i :4000 -i :4001` |

## Critical Rules

1. **SQL**: Always parameterized (`$1`, `$2`). Never concatenate strings.
2. **Async**: All async code wrapped in try/catch with proper error responses.
3. **Migrations**: Use `CREATE TABLE IF NOT EXISTS`. Name: `YYYYMMDD_XX_desc.up.sql`.
4. **CI**: Logic lives in [scripts/ci-run-tests.sh](scripts/ci-run-tests.sh), not GitHub workflow YAML.
5. **Billing**: Server-side only. UI displays but never performs authoritative charges.
6. **TDD Required**: All code changes MUST have tests written FIRST. No exceptions.

## Environment Configs

- **Dev**: `docker-compose.yml` + `docker-compose.override.yml`
- **Prod**: `docker-compose.yml` + `docker-compose.prod.yml`
- **CI**: `docker-compose.yml` + `docker-compose.ci.yml` + `.env.ci` (uses mock-n8n)

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

**Key Files**:
- [.env.ci](.env.ci) — CI-specific environment variables and ports
- [docker-compose.ci.yml](docker-compose.ci.yml) — CI overlay with port mapping and mock-n8n

**Running CI locally**:
```bash
# Full CI suite (recommended)
./scripts/ci-run-tests.sh

# Manual Docker compose with CI config
docker compose --env-file .env.ci -f docker-compose.yml -f docker-compose.ci.yml up -d
```

**Important**: When `bff-auth` calls `bff-platform` internally, it uses `BFF_PLATFORM_BASE` environment variable. In CI, this is set to `http://bff-platform:4000/api/v1` to match the CI port.