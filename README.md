# 🌟 Niyati

AI-powered conversational astrology platform delivering personalized horoscopes, birth-chart insights, and guidance through natural-language chat.

> **⚠️ Development Standards**
> - **TDD/BDD is MANDATORY** — No code without tests first
> - **Database is IMMUTABLE** — No `UPDATE`, no `ALTER`. Always idempotent, from scratch.
> - **Infrastructure is ISOLATED** — Dev, CI, Prod use non-overlapping ports, networks, volumes
> - **Tests are INDEPENDENT** — Run via CI scripts, deploy scripts, or standalone

---

## Table of Contents

- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Deployment](#deployment)
- [Stop, Start & Restart](#stop-start--restart)
- [Testing](#testing)
- [User Flow Specification](#user-flow-specification)
- [API Reference](#api-reference)
- [Credits & Billing](#credits--billing)
- [Database](#database)
- [Infrastructure & Configuration](#infrastructure--configuration)
- [Scripts Reference](#scripts-reference)
- [PWA Features](#pwa-features)
- [Troubleshooting](#troubleshooting)

---

## Architecture

### System Overview

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Browser   │────▶│    Caddy    │────▶│ bff-platform │────▶│     n8n     │
│  (React UI) │◀────│  (Reverse   │◀────│  (Express)   │◀────│  (AI Agent) │
│   Vite/PWA  │     │   Proxy)    │     │  🔒 Auth MW  │     └──────┬──────┘
└─────────────┘     │  :5173/80   │     └──────────────┘            │
                    │             │     ┌──────────────┐     ┌──────▼──────┐
                    │             │────▶│   bff-auth   │     │   Ollama    │
                    └─────────────┘     │  (Express)   │     │  (Llama3.1) │
                                        │  🔑 JWT issuer│     └─────────────┘
                                        └──────┬───────┘
                    ┌─────────────┐     ┌──────▼───────┐
                    │   Worker    │◀────│   Redis      │
                    │ (jobs/email)│     │  :6379       │
                    └─────────────┘     └──────────────┘
                                        ┌──────────────┐
                                        │  PostgreSQL  │
                                        │  :5432       │
                                        └──────────────┘
```

**Authentication Flow**: bff-auth issues JWT access tokens on `POST /users/identify`. The UI stores the token and sends it as `Authorization: Bearer <token>` on all subsequent API calls. bff-platform validates tokens via `authenticateOrReject` middleware (calls `POST /auth/validate` on bff-auth) before processing sensitive routes (deduct-credits, add-credits, profile, profile/extract).

### Message & Data Flow

#### New User Onboarding

```
1. User opens app → Caddy serves React SPA from /srv
2. User enters phone + consent → UI calls POST /api/v1/users/identify (→ bff-auth)
3. bff-auth looks up user in DB → returns { returning: false, access_token: "<JWT>" }
4. UI stores access_token (sessionStorage + memory) for authenticated API calls
5. UI shows welcome message, begins conversational profile collection
6. User provides name, DOB, TOB, place of birth in natural language
7. UI calls POST /api/v1/profile/extract (→ bff-platform, 🔒 Bearer token) for NLP extraction
8. Profile fields extracted → UI displays in sidebar, asks for missing fields
9. All fields collected → UI calls POST /api/v1/users/profile (→ bff-platform, 🔒 Bearer token)
10. bff-platform validates token via bff-auth, then upserts user_profiles, user_credits, AND users tables
11. UI shows PayQR for non-paid users (₹500 for 50 credits)
```

#### Chat & Billing Flow

```
1. User sends message → UI sends directly to n8n webhook → receives AI response
2. UI calls POST /api/v1/chat/classify (→ bff-platform) with { message }
3. bff-platform classifies query:
   - casual (greetings, profile info) → isBillable: false, cost: 0
   - horoscope (zodiac, rashifal)     → isBillable: true,  cost: 2
   - premium (birth chart, remedies)  → isBillable: true,  cost: 4
4. If isBillable → UI calls POST /api/v1/users/deduct-credits (→ bff-platform, 🔒 Bearer token)
5. bff-platform validates token, deducts from DB → returns updated balance
6. UI displays AI response + server-confirmed credit balance
```

#### Returning User Login

```
1. User enters phone → POST /api/v1/users/identify (→ bff-auth)
2. bff-auth returns { returning: true, user: { name, credits, ... }, access_token: "<JWT>" }
3. UI stores access_token for authenticated API calls
4. UI calls GET /api/v1/geocode/current-location (→ bff-platform)
5. UI compares current location with last_login_location
6. UI calls n8n webhook with user context → receives personalized greeting
7. If n8n fails → UI generates local fallback greeting
8. UI calls POST /api/v1/users/profile (→ bff-platform, 🔒 Bearer token) to update last_login_location
```

### Caddy Routing Rules

Caddy reverse-proxies API requests based on path. Order matters:

| Path | Destination | Purpose |
|------|-------------|---------|
| `/api/v1/users/deduct-credits` | **bff-platform:3000** | Credit deduction (explicit override) |
| `/api/v1/users/add-credits` | **bff-platform:3000** | Credit addition (explicit override) |
| `/api/v1/users/*` | **bff-auth:3001** | All other user ops (identify, profile, etc.) |
| `/api/v1/auth/*` | **bff-auth:3001** | Authentication |
| `/webhook/*` | **n8n:5678** | AI webhook (host.docker.internal in dev/prod) |
| `/api/*` | **bff-platform:3000** | Everything else (chat, geocode, astrology, profile, telemetry) |
| `/*` | Static files `/srv` | React SPA with `try_files` fallback |

> **Note**: Both bff-platform and bff-auth define `/users/profile` and `/users/identify` endpoints. Through Caddy, only the **bff-auth** versions are hit for identify. However, `/api/v1/users/profile` is also handled by bff-platform (which Caddy routes to bff-auth, which then syncs with bff-platform). The bff-platform POST `/users/profile` is called directly by the UI via the catch-all `/api/*` route when the full path `/api/v1/users/profile` is used from specific UI flows.

### BFF-First Design Philosophy

The UI is a **thin rendering layer**. All business logic, billing, and validation happens server-side:

| ❌ Never in UI | ✅ Always in BFF |
|----------------|-----------------|
| NLP / text classification | `/chat/classify` endpoint |
| Credit calculations | `/users/deduct-credits` returns balance |
| Date parsing / normalization | BFF normalizes to ISO format |
| Complex validation | BFF validates and returns errors |
| Direct DB queries | All data through BFF endpoints |
| Profile field extraction | `/profile/extract` uses server-side NLP |

---

## Project Structure

```
niyati/
├── .github/
│   ├── workflows/              # GitHub Actions (thin wrappers calling scripts/)
│   │   ├── ci.yml              # Main CI → calls scripts/ci-run-tests.sh
│   │   ├── ui-deploy.yml       # UI deployment to S3/CloudFront
│   │   └── security.yml        # Security scanning
│   └── copilot-instructions.md # AI agent development guide
├── apps/
│   ├── bff-platform/           # Main BFF service (port 3000)
│   │   ├── lib/                # Route handlers (users, chat, geocode, astrology, profile)
│   │   ├── services/           # External service integrations (astrology, geocode)
│   │   ├── src/index.js        # Express app entry point
│   │   └── test/               # Jest unit tests
│   ├── bff-auth/               # Auth service (port 3001)
│   │   ├── lib/                # Route handlers (auth, users, internal, oauth)
│   │   ├── src/index.js        # Express app entry point
│   │   └── test/               # Jest unit tests
│   ├── ui/                     # React + Vite frontend (port 5173)
│   │   ├── src/hooks/          # useChat, useLogin, useAppState, usePWA
│   │   ├── src/services/       # API client (bffFetch, bffFetchWithRetry)
│   │   ├── src/utils/          # Profile extraction, date normalization
│   │   └── test/               # Vitest unit tests
│   ├── n8n/                    # n8n workflow definition
│   │   └── NiyatiWorkflow.json # AI agent workflow (import into n8n)
│   └── worker/                 # Background job processor
│       └── worker.js           # Redis queue consumer (email, webhooks)
├── packages/
│   ├── commons/                # Shared: logger, sanitize, ErrorCodes, config
│   │   └── test/helpers.js     # createTestApp, createMockDb, createMockCommons
│   └── migrations/             # SQL migrations (YYYYMMDD_NN_desc.up.sql)
├── infra/                      # Infrastructure & orchestration
│   ├── docker-compose.yml      # Base service definitions
│   ├── docker-compose.override.yml  # Dev defaults (hot reload, local ports)
│   ├── docker-compose.prod.yml # Production (fixed names, secrets, HTTPS)
│   ├── docker-compose.ci.yml   # CI (different ports, mock n8n, coverage)
│   ├── Caddyfile               # Production reverse proxy config
│   ├── Caddyfile.dev           # Development reverse proxy config
│   ├── .env                    # Production environment (gitignored)
│   ├── .env.example            # Template for .env
│   └── secrets/                # Docker secrets (gitignored)
├── e2e/                        # Playwright end-to-end tests
│   └── tests/                  # 11 spec files
├── scripts/                    # All automation (CI/CD logic lives here, NOT in YAML)
│   ├── lib/common.sh           # Shared bash library (22 functions)
│   ├── ci-run-tests.sh         # Full CI: backend + E2E tests
│   ├── deploy_niyati.sh        # Deployment management (9 actions)
│   ├── db.sh                   # Database management
│   ├── mock-n8n.js             # Mock n8n for CI (canned AI responses)
│   └── ...                     # smoke_test.sh, docker-dev.sh, etc.
└── README.md
```

---

## Quick Start

### Prerequisites

- **Docker** and **Docker Compose** v2+ (required)
- **Node.js** v20+ and npm (for local test runs)
- **Ollama** for AI features ([ollama.ai](https://ollama.ai))
- **n8n** for workflow automation (`npm install -g n8n`)

### 1. Clone & Configure

```bash
git clone https://github.com/vatsaaa/niyati.git
cd niyati

# Copy example env and edit with your keys
cp infra/.env.example infra/.env
nano infra/.env
```

### 2. Start All Services (Development)

```bash
# Fresh start with all services
./scripts/deploy_niyati.sh --env=dev --action=fresh -y

# Or manually:
docker compose -f infra/docker-compose.yml -f infra/docker-compose.override.yml up -d --build
```

### 3. Verify Health

```bash
# Check all services
./scripts/deploy_niyati.sh --action=status

# Or individual health endpoints
curl http://localhost:3000/api/v1/telemetry/health  # bff-platform
curl http://localhost:3001/api/v1/telemetry/health  # bff-auth
curl http://localhost:5173/                          # UI via Caddy
```

### 4. Start AI Services (required for chat)

```bash
# Terminal 1: Ollama
ollama pull llama3.1 && ollama serve

# Terminal 2: n8n
n8n start
# Open http://localhost:5678, import apps/n8n/NiyatiWorkflow.json
```

### 5. Access the Application

| Service | URL | Description |
|---------|-----|-------------|
| **UI** | http://localhost:5173 | React app via Caddy |
| **bff-platform** | http://localhost:3000 | Platform API (direct) |
| **bff-auth** | http://localhost:3001 | Auth API (direct) |
| **n8n** | http://localhost:5678 | Workflow editor |
| **PostgreSQL** | localhost:5432 | Database |
| **Redis** | localhost:6379 | Cache / job queue |
| **MailHog** | http://localhost:8025 | Dev email capture |

---

## Deployment

All deployment is managed through `scripts/deploy_niyati.sh`. Infrastructure compose files live in `infra/`.

### Actions

| Action | Command | Description |
|--------|---------|-------------|
| **deploy** | `./scripts/deploy_niyati.sh --env=prod --action=deploy` | Build, migrate, start |
| **fresh** | `./scripts/deploy_niyati.sh --env=prod --action=fresh -y` | Clean everything, rebuild from scratch |
| **restart** | `./scripts/deploy_niyati.sh --env=prod --action=restart` | Restart all services |
| **restart one** | `./scripts/deploy_niyati.sh --env=prod --action=restart --service=bff-platform` | Restart specific service |
| **rebuild** | `./scripts/deploy_niyati.sh --env=prod --action=rebuild` | Force rebuild (no-cache) then start |
| **migrate** | `./scripts/deploy_niyati.sh --env=prod --action=migrate` | Apply DB migrations only |
| **status** | `./scripts/deploy_niyati.sh --action=status` | Show status of all services |
| **verify** | `./scripts/deploy_niyati.sh --env=prod --action=verify` | Health checks + config verification |
| **stop** | `./scripts/deploy_niyati.sh --env=prod --action=stop` | Stop all services |
| **clean** | `./scripts/deploy_niyati.sh --env=prod --action=clean -y` | Remove containers, volumes, networks |

### Options

| Option | Description |
|--------|-------------|
| `--env=dev\|prod` | Target environment (required for most actions) |
| `--service=<name>` | Target specific service (for restart) |
| `--component=<name>` | Component to verify (for verify: all/postgres/redis/bff-platform/bff-auth/ui/caddy/worker) |
| `--dry-run` | Print commands without executing |
| `--verbose` | Detailed output |
| `-y, --yes` | Non-interactive (auto-confirm) |
| `--skip-checks` | Skip pre-deploy validation |
| `--skip-health` | Skip post-deploy health verification |
| `--no-start` | With fresh: wipe but don't start |
| `--quick` | Health-only verification (~30s) |
| `--run-tests` | Run smoke tests during verify (~2min) |
| `--deep` | Deep verification with E2E tests (~5-10min) |
| `--log-file=PATH` | Write logs to file |
| `--project-name=NAME` | Override Docker project name |

### Deployment Examples

```bash
# === PRODUCTION ===

# Full fresh production deployment (most common for first deploy or reset)
./scripts/deploy_niyati.sh --env=prod --action=fresh -y --verbose

# Deploy incremental changes (rebuild + migrate + restart)
./scripts/deploy_niyati.sh --env=prod --action=deploy

# Rebuild only bff-platform after code changes
./scripts/deploy_niyati.sh --env=prod --action=restart --service=bff-platform

# Run migrations after adding new .up.sql file
./scripts/deploy_niyati.sh --env=prod --action=migrate

# Verify everything is healthy
./scripts/deploy_niyati.sh --env=prod --action=verify --quick

# === DEVELOPMENT ===

# Fresh dev environment
./scripts/deploy_niyati.sh --env=dev --action=fresh -y

# Just start (if already built)
./scripts/deploy_niyati.sh --env=dev --action=deploy

# === CI (automated) ===
./scripts/ci-run-tests.sh              # Full CI (backend + E2E)
./scripts/ci-run-tests.sh --skip-e2e   # Backend only (faster)
```

---

## Stop, Start & Restart

### Stop All Services

```bash
# Graceful stop (preserves data volumes)
./scripts/deploy_niyati.sh --env=prod --action=stop

# Or with docker compose directly
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml down
```

### Start Again (after stop)

```bash
# Start existing containers (no rebuild)
./scripts/deploy_niyati.sh --env=prod --action=deploy

# Or directly
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml up -d
```

### Restart Specific Services

```bash
# Restart a single service
./scripts/deploy_niyati.sh --env=prod --action=restart --service=bff-platform
./scripts/deploy_niyati.sh --env=prod --action=restart --service=bff-auth
./scripts/deploy_niyati.sh --env=prod --action=restart --service=caddy

# Restart all
./scripts/deploy_niyati.sh --env=prod --action=restart
```

### Full Clean Restart (destructive — destroys data)

```bash
# Wipe everything and start over
./scripts/deploy_niyati.sh --env=prod --action=fresh -y --verbose

# Or just clean without starting
./scripts/deploy_niyati.sh --env=prod --action=clean -y
```

### View Logs

```bash
# All services
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml logs -f

# Specific service
docker logs -f niyati-bff-platform-prod
docker logs -f niyati-caddy-prod
docker logs -f niyati-postgres-prod
```

---

## Testing

### Test Strategy

| Layer | Framework | Location | Command |
|-------|-----------|----------|---------|
| **bff-platform** unit | Jest | `apps/bff-platform/test/` | `cd apps/bff-platform && npm test` |
| **bff-auth** unit | Jest | `apps/bff-auth/test/` | `cd apps/bff-auth && npm test` |
| **UI** unit | Vitest | `apps/ui/src/**/__tests__/` | `cd apps/ui && npm test` |
| **E2E** | Playwright | `e2e/tests/` | `cd e2e && npx playwright test` |
| **Full CI** | All above | — | `./scripts/ci-run-tests.sh` |

### Running Tests

```bash
# === FULL CI (recommended before committing) ===
./scripts/ci-run-tests.sh              # Backend + E2E in Docker
./scripts/ci-run-tests.sh --skip-e2e   # Backend only (faster iteration)
./scripts/ci-run-tests.sh --skip-backend  # E2E only
./scripts/ci-run-tests.sh --no-cleanup    # Keep Docker stack after tests

# === BACKEND UNIT TESTS ===
cd apps/bff-platform && npm test                          # All platform tests
cd apps/bff-platform && npm test -- users.test.js         # Single file
cd apps/bff-platform && npm test -- --watch               # Watch mode
cd apps/bff-platform && npm test -- --coverage            # With coverage

cd apps/bff-auth && npm test                              # All auth tests

# === UI UNIT TESTS ===
cd apps/ui && npm test                                     # All UI tests
cd apps/ui && npm test -- src/hooks/__tests__/useChat.profileSave.test.js  # Single file

# === E2E TESTS ===
cd e2e && npx playwright test                              # All E2E specs
cd e2e && npx playwright test credits_threshold.spec.js    # Single spec
cd e2e && npx playwright test --headed --debug             # Visual debug mode
```

### TDD Workflow (Mandatory)

Every code change follows Red-Green-Refactor:

1. **Write test first** — Define expected behavior before implementation
2. **Run test (RED)** — Verify it fails for the right reason
3. **Implement minimal code (GREEN)** — Just enough to pass
4. **Refactor** — Clean up while keeping tests green
5. **Run full suite** — Ensure no regressions
6. **Run CI** — `./scripts/ci-run-tests.sh` before considering done

### Backend Test Helpers

Tests use `createTestApp` and `createMockDb` from `packages/commons/test/helpers.js`:

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

  test('POST /action returns success', async () => {
    const mockDb = createMockDb({ rows: [{ id: 1 }], rowCount: 1 });
    app.set('db', mockDb);
    const res = await request(app).post('/api/v1/my-feature/action').send({ input: 'test' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
```

### E2E Test Files

| File | Scenario |
|------|----------|
| `complete_user_journey.spec.js` | Full new-user onboarding flow |
| `returning_user.spec.js` | Returning user login + greeting |
| `identify_chat.spec.js` | User identification + chat |
| `profile_extraction.spec.js` | NLP profile field extraction |
| `profile_lock.spec.js` | Profile immutability after save |
| `profile_no_deduct.spec.js` | Profile queries don't cost credits |
| `credits_threshold.spec.js` | Low-credit warnings + payment prompt |
| `payment_flow.spec.js` | Payment QR + credit addition |
| `classify_auth_failure_deduction.spec.js` | Classification + deduction |
| `dashboard.spec.js` | Dashboard display |
| `social_login.spec.js` | OAuth login flow |

---

## User Flow Specification

### Phase 1: Authentication & User Identification

1. User navigates to the app → Caddy serves the React SPA
2. Landing page shows: Country dropdown (default: INDIA), Phone number input, Consent checkbox
3. "Begin Your Journey" button enabled only when all fields valid
4. On submit → `POST /api/v1/users/identify` via bff-auth
5. **New user**: `{ returning: false }` — user gets 10 free credits, starts profile collection
6. **Returning user**: `{ returning: true, user: {...} }` — profile populated, personalized greeting

### Phase 2: Conversational Profile Collection (New Users)

Required fields: **Name**, **Date of Birth**, **Time of Birth**, **Place of Birth**

The app uses incremental NLP extraction — each user message is parsed for any available profile fields:

- `POST /api/v1/profile/extract` — server-side NLP extracts name, DOB, TOB, POB from natural text
- Extracted fields appear immediately in the profile sidebar
- Follow-up prompts ask only for remaining missing fields
- **No credits deducted** during profile collection
- **User saved to DB only when ALL fields are present** — upserts into `users`, `user_profiles`, and `user_credits` tables

Example interaction:
```
User: "I am Ankur Vatsa, born on 19 May 1979 at 09:30 am in New Delhi"
→ All 4 fields extracted in one message
→ Profile saved → PayQR shown for non-paid users
```

### Phase 3: Payment & Credits

- New users start with **10 free credits**
- After profile completion, PayQR (₹500 for 50 credits) is displayed
- Payment is manual (UPI QR scan) — admin adds credits via `POST /api/v1/users/add-credits`
- Credits are deducted server-side only — UI never performs authoritative charges

### Phase 4: Astrology Chat

- Messages go to n8n webhook → Ollama LLM generates response
- Query classified server-side (`/chat/classify`) to determine billing
- **Casual** (greetings): free | **Horoscope**: 2 credits | **Premium** (birth chart, remedies): 4 credits
- Monthly credit reset: free credits restored on first login of each month

### Contraction Rule

All AI/bot messages enforce a no-contraction policy:
- "I am" not "I'm", "you are" not "you're", "do not" not "don't"
- Applied server-side before sending to UI

---

## API Reference

### bff-platform (port 3000)

All endpoints prefixed with `/api/v1/`.

#### Users (`/api/v1/users/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/users/identify` | Identify user, monthly credit reset |
| POST | `/users/profile` | Create/update user profile (upserts users + user_profiles + user_credits) |
| POST | `/users/sync` | Sync profile (internal, requires X-Service-Token) |
| GET | `/users/lookup` | Lookup user by phone |
| POST | `/users/deduct-credits` | Deduct credits (billing) |
| POST | `/users/add-credits` | Add credits (payment confirmation) |
| POST | `/users/can-ask` | Check if user can afford a query type |
| GET | `/users/config` | Get app_config values |

#### Chat (`/api/v1/chat/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/chat/classify` | Classify query type and billing cost |

#### Profile (`/api/v1/profile/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/profile/extract` | NLP extraction of profile fields from text |

#### Geocode (`/api/v1/geocode/`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/geocode/current-location` | IP-based current location |
| POST | `/geocode/search` | Location search |
| POST | `/geocode/reverse` | Reverse geocode (lat/lon → address) |
| POST | `/geocode/lookup` | Location lookup |
| POST | `/geocode/structured` | Structured geocode query |
| GET | `/geocode/proxy/*` | Proxy to geocode provider |

#### Astrology (`/api/v1/astrology/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/astrology/compute` | Compute full birth chart |
| POST | `/astrology/planets` | Planetary positions |
| POST | `/astrology/horoscope-svg` | Generate horoscope SVG |
| POST | `/astrology/navamsa` | Navamsa chart |
| POST | `/astrology/divisional` | Divisional charts |
| POST | `/astrology/geo-details` | Geo details for astrology |

#### Telemetry (`/api/v1/telemetry/`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/telemetry/health` | Health check |

### bff-auth (port 3001)

All endpoints prefixed with `/api/v1/`.

#### Auth (`/api/v1/auth/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Phone login (rate-limited) |
| POST | `/auth/register` | Registration |
| POST | `/auth/token` | Token exchange |
| POST | `/auth/logout` | Logout |
| GET | `/auth/me` | Get current user |
| POST | `/auth/request-password-reset` | Password reset request (rate-limited) |
| POST | `/auth/reset-password` | Reset password |
| POST | `/auth/link` | Link OAuth account |
| POST | `/auth/unlink` | Unlink OAuth account |
| GET | `/auth/:provider` | OAuth redirect |
| POST | `/auth/oauth/callback` | OAuth callback |

#### Users (`/api/v1/users/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/users/identify` | Identify user by phone |
| POST | `/users/profile` | Update user profile |

#### Internal (`/api/v1/internal/`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/internal/users/lookup` | Internal user lookup (X-Service-Token) |
| GET | `/internal/users/:id` | Internal user fetch (X-Service-Token) |

---

## Credits & Billing

### Credit Configuration (from `app_config` table)

| Key | Default | Description |
|-----|---------|-------------|
| `credits_monthly_free` | 10 | Free credits per month |
| `credits_horoscope_cost` | 2 | Cost for daily horoscope |
| `credits_premium_cost` | 4 | Cost for birth chart / predictions / remedies |
| `credits_low_threshold` | 4 | Show payment prompt when balance is below |
| `payment_amount_inr` | 500 | Payment amount (INR) |

### Billing Rules

- **Server-side only** — UI displays balances but never performs authoritative deductions
- **Idempotent** — Uses `reqId` to prevent double deductions on retry
- **Monthly reset** — On first `/users/identify` call of each month, credits reset to `credits_monthly_free`
- **Classification** — `POST /api/v1/chat/classify` returns `{ queryType, creditCost, isBillable }`

### Query Types

| Type | Examples | Cost |
|------|----------|------|
| `casual` | Greetings, profile info, "hello", "thanks" | 0 (free) |
| `horoscope` | "my horoscope", "zodiac sign", "rashifal" | 2 credits |
| `premium` | "birth chart", "predictions", "remedies", "kundli" | 4 credits |

---

## Database

### Philosophy: Immutable, Idempotent, From Scratch

> **Golden Rule**: The database schema and seed data must be reproducible from scratch at any time.

| ❌ FORBIDDEN | ✅ Correct Approach |
|-------------|---------------------|
| `ALTER TABLE users ADD COLUMN x` | New migration with full table definition |
| `UPDATE users SET x = 'value'` | `INSERT ... ON CONFLICT DO UPDATE` (upsert) |
| `ALTER TABLE DROP COLUMN` | New migration file, rebuild schema |
| Manual data fixes | Idempotent seed scripts |

### Migration Files

Located in `packages/migrations/`, naming: `YYYYMMDD_NN_description.up.sql`

| File | Description |
|------|-------------|
| `20251217_01_baseline.up.sql` | Baseline schema (users, app_config, oauth_accounts, etc.) |
| `20251217_02_baseline_seed.sql` | Seed data for app_config |
| `20260102_01_add_charge_transactions.up.sql` | charge_transactions table |
| `20260104_01_add_is_adult.up.sql` | is_adult field |
| `20260107_01_seed_ci.up.sql` | CI-specific seed data |
| `20260110_01_user_profiles_and_credits.up.sql` | user_profiles and user_credits tables |
| `20260110_02_backfill_user_profiles_and_credits.up.sql` | Backfill data |

### Tables

| Table | Purpose |
|-------|---------|
| `users` | Core user record (phone, name, DOB, TOB, POB, credits, is_adult) |
| `user_profiles` | Extended profile data (normalized fields) |
| `user_credits` | Credit balance tracking |
| `charge_transactions` | Billing audit trail |
| `app_config` | Application configuration (key-value, cached 5 min) |
| `oauth_accounts` | OAuth provider links |
| `refresh_tokens` | JWT refresh tokens |
| `password_resets` | Password reset requests |

### Migration Patterns

```sql
-- ✅ Idempotent table creation
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  credits INTEGER DEFAULT 10
);

-- ✅ Idempotent index
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);

-- ✅ Idempotent seed data
INSERT INTO app_config (key, value)
VALUES ('credits_monthly_free', '10')
ON CONFLICT (key) DO NOTHING;

-- ❌ FORBIDDEN
ALTER TABLE users ADD COLUMN new_field VARCHAR(100);
UPDATE users SET credits = 0 WHERE expired = true;
```

### Database Commands

```bash
./scripts/db.sh migrate   # Apply all migrations
./scripts/db.sh seed       # Apply seed data
./scripts/db.sh shell      # Connect to psql
./scripts/db.sh health     # Check DB health
./scripts/db.sh backup backup.sql   # Backup
./scripts/db.sh restore backup.sql  # Restore
./scripts/db.sh reset      # Reset (destructive!)
```

---

## Infrastructure & Configuration

### Docker Compose Layers

All compose files are in `infra/`:

| Mode | Files | Command |
|------|-------|---------|
| **Development** | `docker-compose.yml` + `docker-compose.override.yml` | `./scripts/deploy_niyati.sh --env=dev --action=deploy` |
| **Production** | `docker-compose.yml` + `docker-compose.prod.yml` | `./scripts/deploy_niyati.sh --env=prod --action=deploy` |
| **CI** | `docker-compose.yml` + `docker-compose.ci.yml` | `./scripts/ci-run-tests.sh` (automatic) |

### Environment Isolation

Dev, CI, and Prod are fully isolated — they can run simultaneously:

| Resource | Dev | CI | Prod |
|----------|-----|-----|------|
| **Project** | `niyati` | `niyati-ci` | `niyati-prod` |
| **Network** | `niyati_default` | `niyati-ci_default` | `niyati-prod_default` |
| **Volumes** | `niyati_postgres-data` | `niyati-ci_postgres-data` | `niyati-prod_postgres-data-prod` |
| **Containers** | `niyati-*-1` | `niyati-ci-*-1` | `niyati-*-prod` |

### Port Configuration

| Service | Dev | CI | Prod |
|---------|-----|-----|------|
| Caddy (UI) | 5173 | **6173** | 80/443 |
| BFF Platform | 3000 | **4000** | 3000 |
| BFF Auth | 3001 | **4001** | 3001 |
| PostgreSQL | 5432 | **56432** | 5432 |
| Redis | 6379 | **7379** | 6379 |
| n8n / mock | 5678 | **6678** | 5678 |

### Environment Files

| File | Purpose |
|------|---------|
| `infra/.env` | Production environment (gitignored) |
| `infra/.env.example` | Template |
| `infra/.env.bff.auth` | bff-auth specific vars |
| `infra/.env.bff.platform` | bff-platform specific vars |
| `infra/.env.ui` | UI build-time vars |
| `infra/secrets/` | Docker secrets directory (gitignored) |

### Docker Secrets (Production)

Services use `getSecret(envVar, fileEnvVar)` to read secrets from files:

```javascript
function getSecret(envVar, fileEnvVar) {
  if (process.env[fileEnvVar]) {
    return fs.readFileSync(process.env[fileEnvVar], 'utf8').trim();
  }
  return process.env[envVar];
}
```

Secrets: `postgres_password`, `jwt_secret`, `access_token_secret`, `worker_token`, `service_token`

---

## Scripts Reference

All automation lives in `scripts/`. Every script sources `scripts/lib/common.sh`.

### Core Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `deploy_niyati.sh` | Deployment management | `./scripts/deploy_niyati.sh --env=prod --action=fresh -y` |
| `ci-run-tests.sh` | Full CI test runner | `./scripts/ci-run-tests.sh [--skip-e2e] [--skip-backend] [--no-cleanup]` |
| `db.sh` | Database management | `./scripts/db.sh migrate\|seed\|shell\|health\|backup\|restore\|reset` |
| `docker-dev.sh` | Dev Docker helper | `./scripts/docker-dev.sh` |
| `smoke_test.sh` | Health verification | `./scripts/smoke_test.sh` |

### Utility Scripts

| Script | Purpose |
|--------|---------|
| `mock-n8n.js` | Mock n8n for CI (canned AI responses) |
| `mock-webhook.js` | Mock webhook for testing |
| `seed_test_data.js` | Seed test data |
| `run_migrations.js` | Run SQL migrations programmatically |
| `merge_coverage.sh` | Merge coverage reports |
| `healthcheck-http.sh` | HTTP health check for Docker |
| `wait-for-db.sh` | Wait for PostgreSQL readiness |
| `entrypoint.sh` | Docker container entrypoint |

### Shared Library (`scripts/lib/common.sh`)

22 functions available to all scripts:

| Category | Functions |
|----------|-----------|
| **Logging** | `log_info`, `log_warn`, `log_error`, `log_debug`, `log_step`, `log_success`, `log_fail`, `print_header` |
| **Environment** | `find_project_root`, `load_env`, `load_project_env`, `ensure_env_files` |
| **Docker** | `check_docker`, `get_compose_cmd`, `ensure_compose_only`, `wait_for_container`, `wait_for_postgres` |
| **HTTP** | `check_url_with_retries`, `run_health_checks` |
| **Utility** | `confirm_action`, `require_command`, `get_timestamp` |

### Creating New Scripts

```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"
PROJECT_ROOT="$(find_project_root "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

log_step "Starting..."
# Your logic here
```

---

## PWA Features

The UI is a Progressive Web App:
- **Installable** — Add to home screen prompt
- **Offline detection** — Shows online/offline status
- **Service worker** — Caches static assets
- Hooks: `usePWA()`, `useOnlineStatus()`, `useServiceWorker()`

---

## Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| `vitest: command not found` | Run `npm install` from project root — vitest is hoisted to root `node_modules/` |
| CI ports in use | `lsof -i :6173 -i :4000 -i :4001` then `docker compose -p niyati-ci down -v --remove-orphans` |
| DB migrations fail | Check `packages/migrations/` for syntax errors; run `./scripts/db.sh shell` to inspect |
| n8n not responding | Ensure Ollama is running (`ollama serve`), n8n started (`n8n start`), and webhook URL configured |
| CORS errors | Check `CORS_ALLOWED` in env matches the origin you're accessing from |
| Container unhealthy | `docker logs <container-name>` to check startup errors |

### Useful Commands

```bash
# Check service status
./scripts/deploy_niyati.sh --action=status

# View container logs
docker logs -f niyati-bff-platform-prod

# Database shell
docker exec -it niyati-postgres-prod psql -U niyati -d niyati_prod

# Check specific user
docker exec -i niyati-postgres-prod psql -U niyati -d niyati_prod \
  -c "SELECT id, phone_number, name, credits FROM users WHERE phone_number LIKE '%1234567890';"

# Restart single service
./scripts/deploy_niyati.sh --env=prod --action=restart --service=bff-platform

# Full CI
./scripts/ci-run-tests.sh
```

---

## Contributing: Git Workflow

The `master` branch is **protected** — direct pushes are forbidden. All changes go through Pull Requests with required CI checks.

### Prerequisites

```bash
# Verify git and GitHub CLI are installed
git --version       # >= 2.x
gh --version        # >= 2.x (install: brew install gh)

# Authenticate gh-CLI with your GitHub account (one-time setup)
gh auth login       # Follow the interactive prompt (HTTPS recommended)
```

### Step-by-Step: Commit and Push Changes

```bash
# 1. Make sure you're on a feature branch (NOT master)
#    If on master, create a new branch from your current state
git checkout -b fix/my-feature-description

# 2. Check what files have changed
git status --short

# 3. Review the diff for unintended changes
git diff --stat HEAD

# 4. SECURITY CHECK: scan diff for leaked secrets before committing
#    Only documentation references should appear, never actual passwords/keys
git diff HEAD -- . ':!package-lock.json' | grep -iE "(password|secret|token|api.key|private.key)" | grep "^+"

# 5. Verify .gitignore covers sensitive files (should show NO output)
git ls-files --cached -- 'infra/.env' 'infra/secrets/'

# 6. Stage all changes
git add -A

# 7. Commit with a descriptive message (Conventional Commits format)
#    Types: fix, feat, docs, refactor, test, chore, ci
git commit -m "fix: brief description of change

- Detail 1: what was changed and why
- Detail 2: another change in this commit
- Detail 3: tests added/updated"

# 8. Push the feature branch to remote
git push origin fix/my-feature-description
```

### Step-by-Step: Open a Pull Request

```bash
# 9. Create PR using gh-CLI
#    --base: target branch (always master)
#    --head: your feature branch
#    --title: PR title (matches commit message convention)
#    --body-file: markdown file with PR description (or use --body for inline)
gh pr create \
  --base master \
  --head fix/my-feature-description \
  --title "fix: brief description of change" \
  --body-file /path/to/pr-body.md

# Alternative: create PR with inline body
gh pr create \
  --base master \
  --head fix/my-feature-description \
  --title "fix: brief description of change" \
  --body "## Summary
Describe the changes here.

### Testing
- All bff-platform tests: N passed
- All bff-auth tests: N passed
- All UI tests: N passed"

# 10. Check PR status and CI results
gh pr status                              # Overview of your PRs
gh pr checks fix/my-feature-description   # View CI check results
gh pr view fix/my-feature-description     # View PR details in terminal

# 11. After CI passes and review approved, merge the PR
#     Squash merge is the default strategy for feature branches
gh pr merge fix/my-feature-description --squash --delete-branch
```

### Required Checks

Before a PR can be merged:
- **Full Stack Tests** CI job must pass (`./scripts/ci-run-tests.sh`)
- This includes: backend unit tests (bff-platform, bff-auth), E2E Playwright tests

### Quick Reference

| Task | Command |
|------|---------|
| Create branch | `git checkout -b fix/description` |
| Stage + commit | `git add -A && git commit -m "fix: description"` |
| Push branch | `git push origin fix/description` |
| Create PR | `gh pr create --base master --head fix/description --title "fix: description"` |
| Check CI status | `gh pr checks fix/description` |
| Merge PR | `gh pr merge fix/description --squash --delete-branch` |
| Return to master | `git checkout master && git pull` |







Used command "niyati % ./scripts/deploy_niyati.sh --env=prod --action=fresh -y --verbose" on my local laptop to deploy and run application niyati in production mode

Launched "http://localhost/" and I can see landing page for the application

Selected country = "INDIA"; entered phone number "9899162012" and checked the box for "I consent to sharing my birth information and agree to the Privacy Policy"

"Begin Your Journey" button activated, clicked it.

In back ground check the location from where the user is operating. Check if the phone number exists in database, if they are a paying user, last login location and their current credit balance.

If the phone number exists, fetch user profile from database and it should be shown in the user profile section of the app.

App's chat window shows:
phone number in user profile section, "-" for all other fields and 10 free Credits

If the phone number exists in database, then the user is a returning user. They should be greeted with a personalized message in chat box. The message should include user's name and location if they are available in database e.g., if the user is operating from a location that is different from last login location the app should greet them that the user is in a new location and how are they finding the new location. 
The message should also include user's current credit balance. If the user is a paid user and has enough credits they can ask questions about their future, love life, career and more, additional credits are available. If the user is a non-paid user, then remind them that they can ask questions about what today holds for them but they need to pay for being able to ask questions about their future, love life, career and more, additional credits are available. And then show payment QR code as well.

If the phone number does not exist in database, then the user is a new user and they should be asked to share their name, date of birth, time of birth and place of birth in natural language format.
In chat box, message is "Hello and welcome! I am Niyati, here to help you discover your astrological destiny. To get started, could you please share your name, when you were born (date and time), and where you were born?"

User sent message: "I am Ankur Vatsa, born on 19 May 1979 at 09:30 am in New Delhi"

App displays all user info in app screen user profile section at the top. This means, user profile details were successfully extracted from user message. 

As soon as all user profile details are knwon, the user should be created in database as a "non-paying" user.

When new user's profile is completely discovered, create the birth chart for the user using astrology APIs which should be stored on disk and the path to the birth chart should be stored in database as well. A small thumbnail of the birth chart should should appear in the user profile section of the app. 

For paid users, clicking on the thumbnail shows the full birth chart in a modal. For non-paid users, clicking on the thumbnail should show PayQR code and remind the user to pay if the wish to see the full birth chart.

For returning users, birth chart should be fetched from disk and shown when paid user clicks on the thumbnail in user profile section of the app. If the user is a non-paying user, then when they click on the thumbnail, they should be shown payment QR code and reminded to pay if they wish to see the full birth chart.

App: "Hi Ankur, I now know your name and birth details. I also see that you are in Mumbai, Maharashtra, India. You have 10 credits and you can ask questions about what today holds for you. For questions about your future, love life, career and more, additional credits are available."

Expected: User should be shown payment QR code

User: What is the date today and what does the day hold for me?

Expected: User is asking about today and asks to reveal what could the user expect from today, hence free credits can be used even though the user is a non-paying user. 2 credits should be deducted from the free credits.

Expected: App UI sends user message along with user profile details to bff-platform in a properly structured manner. This message should be forwarded to n8n URL as is.

Message returned by n8n should be sent to bff-platform and it should be sent to app ui and displayed in the chat.

At this stage, app should also display the payment QR code and remind the user that they should pay 500/- to be able to 

Actual observations are as follows:

App (shows 10 credits): Hi Ankur, I now know your name and birth details. I also see that you are in Mumbai, Maharashtra, India. You have 10 credits and you can ask questions about what today holds for you. For questions about your future, love life, career and more, additional credits are available.

Ensure to follow all instructions in #file:copilot-instructions.md  and fix the code accordingly to meet the expected behavior as described above.