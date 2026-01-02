# Copilot / AI Agent Instructions for Niyati

> **Purpose**: Enable any AI coding agent (Claude, Gemini, GPT, etc.) to continue development of Niyati following the established patterns, conventions, and quality standards.

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Directory Structure](#directory-structure)
3. [Coding Style & Conventions](#coding-style--conventions)
4. [API Design Patterns](#api-design-patterns)
5. [Testing Philosophy & Patterns](#testing-philosophy--patterns)
6. [CI/CD Infrastructure](#cicd-infrastructure)
7. [Database & Migrations](#database--migrations)
8. [Docker & Deployment](#docker--deployment)
9. [Feature Development Workflow](#feature-development-workflow)
10. [Code Examples & Templates](#code-examples--templates)

---

## Architecture Overview

Niyati is an AI-powered astrology chat platform with a **BFF (Backend-for-Frontend) architecture**:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│    Caddy    │────▶│ bff-platform│────▶│     n8n     │
│  (React UI) │◀────│  (Reverse   │◀────│  (Express)  │◀────│  (AI Agent) │
└─────────────┘     │   Proxy)    │     └─────────────┘     └─────────────┘
                    │             │     ┌─────────────┐     ┌─────────────┐
                    │             │────▶│  bff-auth   │────▶│  PostgreSQL │
                    └─────────────┘     │  (Express)  │     └─────────────┘
                                        └─────────────┘     ┌─────────────┐
                                        ┌─────────────┐     │    Redis    │
                                        │   Worker    │◀────│   (Queue)   │
                                        └─────────────┘     └─────────────┘
```

### Core Components

| Component | Port | Technology | Purpose |
|-----------|------|------------|---------|
| `ui` | 5173 | React + Vite | Single-page chat interface |
| `bff-platform` | 3000 | Express.js | Chat, astrology, payments, telemetry |
| `bff-auth` | 3001 | Express.js | Authentication, user management |
| `caddy` | 80/443 | Caddy | Reverse proxy, SSL termination |
| `postgres` | 5432 | PostgreSQL | Persistent data storage |
| `redis` | 6379 | Redis | Session cache, job queue |
| `worker` | - | Node.js | Background job processing |
| `n8n` | 5678 | n8n (host) | AI workflow orchestration |

### Data Flow for Chat
1. **UI** sends chat message to `/api/v1/chat` (BFF endpoint)
2. **Caddy** routes to `bff-platform`
3. **bff-platform** normalizes payload, computes derived fields (age from DOB), syncs to DB
4. **bff-platform** forwards canonical payload to **n8n** webhook
5. **n8n** orchestrates AI response via Ollama LLM
6. Response flows back through chain to UI

---

## Directory Structure

```
niyati/
├── be/                          # Backend services
│   ├── bff-platform/            # Platform BFF service
│   │   ├── src/index.js         # Express server bootstrap
│   │   ├── lib/                 # Route handlers & utilities
│   │   │   ├── users.js         # User management routes
│   │   │   ├── telemetry.js     # Health & logging routes
│   │   │   ├── astrology.js     # Astrology calculation routes
│   │   │   ├── geocode.js       # Location resolution
│   │   │   └── queryClassifier.js # Message classification
│   │   ├── services/            # External service integrations
│   │   └── test/                # Jest unit tests
│   ├── bff-auth/                # Auth BFF service
│   │   ├── src/index.js         # Express server bootstrap
│   │   ├── lib/                 # Auth routes (auth.js, users.js)
│   │   └── test/                # Jest unit tests
│   ├── commons/                 # Shared utilities (imported by BFFs)
│   │   ├── index.js             # Main export
│   │   ├── lib/
│   │   │   ├── responses.js     # sendSuccess/sendError helpers
│   │   │   ├── logger.js        # Pino logger configuration
│   │   │   ├── sanitize.js      # Input sanitization
│   │   │   └── rateLimiter.js   # Rate limiting utilities
│   │   └── config/              # Configuration management
│   ├── migrations/              # SQL migration files
│   ├── scripts/                 # Shell scripts for operations
│   └── worker/                  # Background job processor
├── ui/                          # React frontend
│   ├── src/
│   │   ├── components/          # React components
│   │   ├── hooks/               # Custom React hooks
│   │   │   ├── useChat.js       # Main chat logic
│   │   │   ├── useLogin.js      # Authentication flow
│   │   │   └── __tests__/       # Vitest unit tests
│   │   ├── services/            # API clients
│   │   ├── utils/               # Utility functions
│   │   └── config.js            # Environment configuration
│   └── test/                    # Additional test utilities
├── e2e/                         # Playwright E2E tests
│   └── tests/                   # Test specifications
├── scripts/                     # Deployment & CI scripts
│   ├── deploy_niyati.sh         # Main deployment script
│   └── ci-run-tests.sh          # CI test runner
├── .github/
│   └── workflows/               # GitHub Actions CI/CD
├── docker-compose.yml           # Base compose configuration
├── docker-compose.prod.yml      # Production overrides
├── docker-compose.override.yml  # Development overrides
├── Caddyfile                    # Reverse proxy configuration
└── Makefile                     # Common commands
```

---

## Coding Style & Conventions

### Language & Module System
- **JavaScript only** — no TypeScript (intentional for simplicity)
- **ES Modules (ESM)** for frontend (`import/export`)
- **CommonJS** for backend (`require/module.exports`)
- Node.js 20+ required

### Naming Conventions

```javascript
// Files: kebab-case
// lib/query-classifier.js, utils/date-normalizer.js

// Variables & Functions: camelCase
const userCredits = 10;
function calculateAge(dob) { }

// Constants: UPPER_SNAKE_CASE
const MAX_RETRY_COUNT = 3;
const API_VERSION = 'v1';

// Database columns: snake_case
// phone_number, date_of_birth, created_at

// Environment variables: UPPER_SNAKE_CASE
// DATABASE_URL, N8N_WEBHOOK_URL
```

### Code Organization Patterns

**Backend Route Handler Pattern**:
```javascript
// be/bff-platform/lib/users.js
const express = require('express');
const router = express.Router();
const { logger, sanitize, ErrorCodes, config } = require('../../commons');

// Route: POST /api/v1/users/deduct-credits
router.post('/deduct-credits', async (req, res) => {
  try {
    const db = req.app.get('db');
    if (!db) {
      return res.sendError(ErrorCodes.SERVICE_UNAVAILABLE, 'Database not available');
    }
    
    const { phoneNumber, amount } = req.body;
    
    // Input validation
    if (!phoneNumber || typeof amount !== 'number') {
      return res.sendError(ErrorCodes.VALIDATION_ERROR, 'phoneNumber and amount required');
    }
    
    // Business logic
    const result = await db.query(
      'UPDATE users SET credits = GREATEST(0, credits - $2) WHERE phone_number = $1 RETURNING *',
      [sanitize(phoneNumber), amount]
    );
    
    if (result.rowCount === 0) {
      return res.sendError(ErrorCodes.NOT_FOUND, 'User not found');
    }
    
    // Success response
    return res.sendSuccess({ credits: result.rows[0].credits });
  } catch (err) {
    logger.error({ msg: 'deduct_credits_failed', err: err.stack });
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to deduct credits');
  }
});

module.exports = router;
```

**Frontend Hook Pattern**:
```javascript
// ui/src/hooks/useChat.js
import { useState } from 'react';
import { bffFetchWithRetry } from '../services/api';

export function useChat(profile, updateProfile, addMessage, auth) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async (text, onComplete) => {
    if (!text?.trim()) return;
    
    setIsLoading(true);
    try {
      // Add user message immediately (optimistic UI)
      addMessage({
        id: Date.now(),
        text: text.trim(),
        sender: 'user',
        timestamp: new Date()
      });

      // Call BFF endpoint
      const response = await bffFetchWithRetry('/api/v1/chat', {
        method: 'POST',
        body: JSON.stringify({ message: text, sessionId: auth.phoneNumber })
      });

      // Add bot response
      if (response?.data?.n8nResponse?.output) {
        addMessage({
          id: Date.now() + 1,
          text: response.data.n8nResponse.output,
          sender: 'bot',
          timestamp: new Date()
        });
      }
    } catch (err) {
      console.error('Chat error:', err);
      addMessage({
        id: Date.now() + 1,
        text: 'Sorry, I encountered an error. Please try again.',
        sender: 'bot',
        timestamp: new Date()
      });
    } finally {
      setIsLoading(false);
      onComplete?.();
    }
  };

  return { handleSend, isLoading };
}
```

### Error Handling Philosophy

1. **Always use try/catch** for async operations
2. **Use standardized error codes** from `ErrorCodes` enum
3. **Log errors with context** for debugging
4. **Return user-friendly messages** — never expose stack traces
5. **Graceful degradation** — continue operation when possible

```javascript
// Good: Comprehensive error handling
try {
  const result = await db.query(sql, params);
  return res.sendSuccess(result.rows);
} catch (err) {
  logger.error({ msg: 'query_failed', sql, err: err.message });
  return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database operation failed');
}

// Bad: Letting errors propagate unhandled
const result = await db.query(sql, params); // Could crash server!
```

### Response Format Standards

All API responses use consistent format via `res.sendSuccess()` / `res.sendError()`:

```javascript
// Success response
{
  "status": "ok",
  "data": { /* payload */ },
  "meta": { /* optional pagination, etc. */ }
}

// Error response
{
  "status": "error",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "phoneNumber is required",
    "details": { /* optional */ }
  }
}
```

---

## API Design Patterns

### URL Structure
```
/api/v1/{resource}/{action}

Examples:
POST /api/v1/chat                    # Send chat message
POST /api/v1/users/identify          # Identify user by phone
POST /api/v1/users/deduct-credits    # Deduct user credits
GET  /api/v1/telemetry/health        # Health check
```

### Request/Response Patterns

**Idempotent Operations** (use request IDs):
```javascript
// Request
POST /api/v1/users/deduct-credits
Headers: { "X-Idempotency-Key": "uuid-here" }
Body: { "phoneNumber": "+91-9876543210", "amount": 2 }

// Implementation checks if idempotency key was already processed
const existing = await db.query(
  'SELECT * FROM charge_transactions WHERE request_id = $1',
  [idempotencyKey]
);
if (existing.rowCount > 0) {
  return res.sendSuccess({ credits: existing.rows[0].credits_after, cached: true });
}
```

**Health Check Endpoint** (required for all services):
```javascript
// GET /api/v1/telemetry/health
router.get('/health', (req, res) => {
  res.sendSuccess({
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
```

---

## Testing Philosophy & Patterns

### Test Pyramid
```
        ┌───────────────┐
        │     E2E       │  ← Few, slow, high-value
        │  (Playwright) │
        ├───────────────┤
        │  Integration  │  ← Moderate count
        │    (Jest)     │
        ├───────────────┤
        │     Unit      │  ← Many, fast
        │ (Jest/Vitest) │
        └───────────────┘
```

### Backend Unit Tests (Jest)

Location: `be/bff-platform/test/*.test.js`

**Pattern: Mock dependencies, test route handlers**

```javascript
// be/bff-platform/test/credits.test.js
const request = require('supertest');
const express = require('express');

describe('credits endpoints', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    
    // Mock commons — keep real response helpers, mock logger
    jest.mock('../commons', () => {
      const responses = require('../../commons/lib/responses');
      return {
        logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
        sanitize: v => v,
        ErrorCodes: responses.ErrorCodes,
        config: {}
      };
    });

    // Setup Express app with router under test
    const router = require('../lib/users');
    app = express();
    app.use(express.json());
    const { attachResponseHelpers } = require('../../commons/lib/responses');
    app.use('/api/v1/users', attachResponseHelpers, router);
  });

  afterEach(() => jest.restoreAllMocks());

  test('POST /deduct-credits reduces credits when sufficient', async () => {
    // Create fake database
    const fakeDb = {
      async query(sql, params) {
        if (sql.trim().toUpperCase().startsWith('UPDATE USERS')) {
          return { rows: [{ id: 1, credits: 3 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
    };
    app.set('db', fakeDb);

    const res = await request(app)
      .post('/api/v1/users/deduct-credits')
      .send({ phoneNumber: '+91-1234', amount: 2 });

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('credits', 3);
  });

  test('POST /deduct-credits returns error for missing phone', async () => {
    app.set('db', { query: jest.fn() });

    const res = await request(app)
      .post('/api/v1/users/deduct-credits')
      .send({ amount: 2 }); // Missing phoneNumber

    expect(res.statusCode).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
```

**Key Jest Patterns**:
- Use `jest.resetModules()` in `beforeEach` to reset module state
- Mock `commons` to control logger behavior
- Use `supertest` for HTTP testing
- Create fake DB objects that return expected results
- Run with `--runInBand` to avoid parallel DB conflicts

### Frontend Unit Tests (Vitest)

Location: `ui/src/hooks/__tests__/*.test.js`

**Pattern: Test hooks via React test harness**

```javascript
// ui/src/hooks/__tests__/useChat.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React, { forwardRef, useImperativeHandle } from 'react';
import { act } from 'react';

// Mock external dependencies
vi.mock('../../utils/profileExtractor', () => ({
  extractProfileFields: vi.fn(async () => ({}))
}));
vi.mock('../../services/geo', () => ({
  resolveLocationAndTimezone: vi.fn()
}));
vi.mock('../../services/api', () => ({
  bffFetchWithRetry: vi.fn(),
  sendClientLog: vi.fn()
}));
vi.mock('../../config', () => ({
  N8N_WEBHOOK_URL: 'https://n8n.test/webhook',
  N8N_WEBHOOK_FALLBACK_URL: ''
}));

import { useChat } from '../useChat';

// Test harness to access hook methods
function HookHarness({ profile, updateProfile, addMessage, auth }, ref) {
  const { handleSend, isLoading } = useChat(profile, updateProfile, addMessage, auth);
  useImperativeHandle(ref, () => ({ handleSend, isLoading }));
  return null;
}
const Harness = forwardRef(HookHarness);

describe('useChat', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    try { localStorage.clear(); } catch (e) {}
  });

  it('does nothing for empty input', async () => {
    const addMessage = vi.fn();
    const ref = React.createRef();
    
    render(React.createElement(Harness, {
      ref,
      profile: {},
      updateProfile: vi.fn(),
      addMessage,
      auth: { countries: [], phoneNumber: '+1-111' }
    }));

    await act(async () => {
      await ref.current.handleSend('   ', () => {});
    });

    expect(addMessage).not.toHaveBeenCalled();
  });

  it('adds user message and calls API', async () => {
    const addMessage = vi.fn();
    const ref = React.createRef();
    
    // Mock fetch to return bot response
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ok',
        data: { n8nResponse: { output: 'Hello from bot!' } }
      })
    });

    render(React.createElement(Harness, {
      ref,
      profile: { user_name: 'Test' },
      updateProfile: vi.fn(),
      addMessage,
      auth: { countries: [], phoneNumber: '+1-111' }
    }));

    await act(async () => {
      await ref.current.handleSend('Hello', () => {});
    });

    // Verify user message was added
    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ sender: 'user', text: 'Hello' })
    );
  });
});
```

**Key Vitest Patterns**:
- Use `vi.mock()` at module level for dependencies
- Use `forwardRef` + `useImperativeHandle` to expose hook methods
- Wrap async hook calls in `act()`
- Use `vi.spyOn(global, 'fetch')` to mock fetch calls
- Clear localStorage in `beforeEach`

### E2E Tests (Playwright)

Location: `e2e/tests/*.spec.js`

**Pattern: Stub API routes, test user flows**

```javascript
// e2e/tests/identify_chat.spec.js
const { test, expect } = require('@playwright/test');

const PHONE = process.env.E2E_PHONE || '9992223333';

test('ui identify -> chat -> credits deducted', async ({ page, baseURL }) => {
  const base = process.env.BASE_URL || baseURL || 'http://127.0.0.1';
  await page.goto(base + '/');

  // Track credits in memory for stubbing
  let creditsValue = 10;

  // Stub API endpoints
  await page.route('**/api/v1/users/identify', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        data: {
          returning: true,
          user: {
            id: '1',
            name: 'Test User',
            phone_number: `+91-${PHONE}`,
            credits: creditsValue
          }
        }
      })
    });
  });

  await page.route('**/api/v1/users/deduct-credits', async (route, request) => {
    const post = JSON.parse(request.postData() || '{}');
    creditsValue = Math.max(0, creditsValue - (post.amount || 2));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', data: { credits: creditsValue } })
    });
  });

  // Stub n8n webhook
  await page.route('**/webhook/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ output: "Today's horoscope looks great!" })
    });
  });

  // Perform login flow
  await page.waitForSelector('text=Begin Your Journey');
  await page.fill('input[type="tel"]', PHONE);
  await page.click('text=Begin Your Journey');

  // Wait for chat interface
  await page.waitForSelector('[data-testid="chat-input"]', { timeout: 10000 });

  // Send chat message
  await page.fill('[data-testid="chat-input"]', "What's my horoscope?");
  await page.click('[data-testid="send-button"]');

  // Verify bot response appears
  await expect(page.locator('text=horoscope')).toBeVisible({ timeout: 15000 });

  // Verify credits were deducted
  expect(creditsValue).toBeLessThan(10);
});
```

**Key Playwright Patterns**:
- Use `page.route()` to intercept and stub API calls
- Use in-memory variables to track state changes
- Wait for elements with explicit timeouts
- Use `data-testid` attributes for reliable element selection
- Support both stubbed and real (`REAL=1`) modes

---

## CI/CD Infrastructure

### GitHub Actions Workflows

**Main CI Pipeline** (`.github/workflows/ci.yml`):
```yaml
name: CI
on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: '**/package-lock.json'

      - name: Install Dependencies
        run: npm ci

      - name: Run Full Test Suite
        run: ./scripts/ci-run-tests.sh

      - name: Run E2E Tests
        env:
          REAL: '1'
          BASE_URL: 'http://127.0.0.1:5173'
        run: |
          cd e2e
          npm ci
          npx playwright install --with-deps chromium
          npx playwright test --project=api

      - name: Upload Traces on Failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-traces
          path: e2e/test-results/
```

**CI Test Runner** (`scripts/ci-run-tests.sh`):
1. Start Docker Compose stack with mock n8n
2. Wait for Postgres to be ready
3. Apply migrations and seed data
4. Run backend unit tests against real DB
5. Run E2E tests
6. Tear down stack

### Required CI Checks
- All backend unit tests pass
- All frontend unit tests pass
- E2E tests pass
- No lint errors
- Bundle size under threshold

---

## Database & Migrations

### Migration File Convention
```
be/migrations/YYYYMMDD_XX_description.up.sql

Examples:
20251217_01_baseline.up.sql
20251217_02_baseline_seed.sql
20260102_01_add_charge_transactions.up.sql
```

### Migration Pattern
```sql
-- 20260102_01_add_charge_transactions.up.sql
-- Purpose: Add idempotency tracking for credit charges

CREATE TABLE IF NOT EXISTS charge_transactions (
    id SERIAL PRIMARY KEY,
    request_id VARCHAR(64) UNIQUE NOT NULL,
    phone_number VARCHAR(32) NOT NULL,
    amount INTEGER NOT NULL,
    credits_before INTEGER,
    credits_after INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_charge_transactions_phone 
ON charge_transactions(phone_number);

-- Migration runs idempotently via CREATE IF NOT EXISTS
```

### Core Tables
- `users` — User profiles (phone, DOB, credits, etc.)
- `charge_transactions` — Idempotent credit operations
- `refresh_tokens` — JWT refresh token storage
- `password_resets` — Password reset tokens
- `oauth_accounts` — OAuth provider links
- `app_config` — Runtime configuration

---

## Docker & Deployment

### Compose File Strategy
```
docker-compose.yml          # Base configuration (always loaded)
docker-compose.override.yml # Development defaults (auto-loaded)
docker-compose.prod.yml     # Production overrides (explicit)
docker-compose.e2e.yml      # E2E test overrides (explicit)
docker-compose.ci.yml       # CI environment overrides
```

### Deployment Commands
```bash
# Fresh production deployment
./scripts/deploy_niyati.sh --env=prod --action=fresh -y

# Regular production deploy
./scripts/deploy_niyati.sh --env=prod --action=deploy

# Development mode
docker compose up -d

# View logs
docker compose logs -f bff-platform

# Run E2E tests
make e2e
```

### Health Check Pattern
All services expose `/api/v1/telemetry/health` for Docker healthchecks:

```yaml
# docker-compose.yml
healthcheck:
  test: ["CMD-SHELL", "/usr/local/bin/healthcheck-http.sh http://localhost:3000/api/v1/telemetry/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

---

## Feature Development Workflow

### Adding a New Backend Endpoint

1. **Create/update route handler** in `be/bff-platform/lib/`
2. **Follow the standard pattern**:
   - Get DB from `req.app.get('db')`
   - Validate inputs
   - Use `res.sendSuccess()` / `res.sendError()`
   - Log operations with `logger.info/warn/error`
3. **Add unit test** in `be/bff-platform/test/`
4. **Update Caddyfile** if new route prefix
5. **Run tests**: `cd be/bff-platform && npm test`

### Adding a New UI Feature

1. **Create component** in `ui/src/components/`
2. **Create hook** if complex logic in `ui/src/hooks/`
3. **Add unit test** in `ui/src/hooks/__tests__/` or `ui/src/components/__tests__/`
4. **Run tests**: `cd ui && npm test`

### Adding Database Changes

1. **Create migration** in `be/migrations/YYYYMMDD_XX_description.up.sql`
2. **Use CREATE IF NOT EXISTS** for idempotency
3. **Update affected queries** in route handlers
4. **Test locally**: `docker compose down -v && docker compose up -d`

### Checklist Before PR

- [ ] Unit tests added/updated and passing
- [ ] No lint errors (`npm run lint`)
- [ ] Works in Docker: `docker compose up -d`
- [ ] API responses use `sendSuccess`/`sendError`
- [ ] Errors logged with context
- [ ] New env vars documented
- [ ] Migration idempotent (CREATE IF NOT EXISTS)

---

## Code Examples & Templates

### New Route Handler Template
```javascript
// be/bff-platform/lib/{resource}.js
const express = require('express');
const router = express.Router();
const { logger, sanitize, ErrorCodes } = require('../../commons');

/**
 * POST /api/v1/{resource}/{action}
 * Description of what this endpoint does
 */
router.post('/{action}', async (req, res) => {
  try {
    const db = req.app.get('db');
    if (!db) {
      return res.sendError(ErrorCodes.SERVICE_UNAVAILABLE, 'Database unavailable');
    }

    // 1. Extract and validate input
    const { field1, field2 } = req.body;
    if (!field1) {
      return res.sendError(ErrorCodes.VALIDATION_ERROR, 'field1 is required');
    }

    // 2. Business logic
    const result = await db.query('SELECT * FROM table WHERE id = $1', [field1]);
    
    if (result.rowCount === 0) {
      return res.sendError(ErrorCodes.NOT_FOUND, 'Resource not found');
    }

    // 3. Log for observability
    logger.info({ msg: '{action}_success', field1 });

    // 4. Return success
    return res.sendSuccess({ data: result.rows[0] });
  } catch (err) {
    logger.error({ msg: '{action}_failed', err: err.stack });
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Operation failed');
  }
});

module.exports = router;
```

### New Unit Test Template
```javascript
// be/bff-platform/test/{resource}.test.js
const request = require('supertest');
const express = require('express');

describe('{resource} endpoints', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('../commons', () => {
      const responses = require('../../commons/lib/responses');
      return {
        logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
        sanitize: v => v,
        ErrorCodes: responses.ErrorCodes,
        config: {}
      };
    });

    const router = require('../lib/{resource}');
    app = express();
    app.use(express.json());
    const { attachResponseHelpers } = require('../../commons/lib/responses');
    app.use('/api/v1/{resource}', attachResponseHelpers, router);
  });

  afterEach(() => jest.restoreAllMocks());

  test('POST /{action} succeeds with valid input', async () => {
    const fakeDb = {
      async query(sql, params) {
        return { rows: [{ id: 1 }], rowCount: 1 };
      }
    };
    app.set('db', fakeDb);

    const res = await request(app)
      .post('/api/v1/{resource}/{action}')
      .send({ field1: 'value' });

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('POST /{action} returns error for missing field', async () => {
    app.set('db', { query: jest.fn() });

    const res = await request(app)
      .post('/api/v1/{resource}/{action}')
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
```

### New Frontend Hook Test Template
```javascript
// ui/src/hooks/__tests__/{hook}.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React, { forwardRef, useImperativeHandle } from 'react';
import { act } from 'react';

vi.mock('../../services/api', () => ({
  bffFetchWithRetry: vi.fn()
}));

import { useMyHook } from '../{hook}';

function HookHarness(props, ref) {
  const hookResult = useMyHook(props.arg1, props.arg2);
  useImperativeHandle(ref, () => hookResult);
  return null;
}
const Harness = forwardRef(HookHarness);

describe('useMyHook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    try { localStorage.clear(); } catch (e) {}
  });

  it('returns expected initial state', () => {
    const ref = React.createRef();
    render(React.createElement(Harness, { ref, arg1: 'test', arg2: {} }));
    
    expect(ref.current.someValue).toBeDefined();
  });

  it('handles async operation', async () => {
    const ref = React.createRef();
    render(React.createElement(Harness, { ref, arg1: 'test', arg2: {} }));

    await act(async () => {
      await ref.current.asyncMethod();
    });

    expect(ref.current.result).toBe('expected');
  });
});
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `be/commons/lib/responses.js` | API response helpers (`sendSuccess`, `sendError`, `ErrorCodes`) |
| `be/commons/lib/logger.js` | Pino logger configuration |
| `be/bff-platform/src/index.js` | Platform server bootstrap |
| `be/bff-platform/lib/users.js` | User management routes |
| `ui/src/hooks/useChat.js` | Main chat logic hook |
| `ui/src/hooks/useLogin.js` | Authentication flow hook |
| `scripts/deploy_niyati.sh` | Deployment script with fresh/clean/deploy actions |
| `scripts/ci-run-tests.sh` | CI test runner |
| `Caddyfile` | Reverse proxy routing configuration |
| `docker-compose.yml` | Base Docker configuration |

---

## Quick Reference

### Run Tests
```bash
# Backend unit tests
cd be/bff-platform && npm test
cd be/bff-auth && npm test

# Frontend unit tests
cd ui && npm test

# E2E tests
cd e2e && npm test
# or
make e2e
```

### Common Commands
```bash
# Start development stack
docker compose up -d

# Fresh production deploy
./scripts/deploy_niyati.sh --env=prod --action=fresh -y

# View logs
docker compose logs -f bff-platform

# Check service health
curl http://localhost/api/v1/telemetry/health

# Access database
docker exec -it niyati-postgres-prod psql -U niyati -d niyati_dev
```

---

*This codebase was developed using Claude Opus 4.5 with GitHub Copilot. Follow these patterns to maintain consistency.*
