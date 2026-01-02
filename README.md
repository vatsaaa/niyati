# 🌟 Niyati

AI-powered conversational astrology platform delivering personalized horoscopes, birth-chart insights, and guidance through chat-based interactions.

## Table of Contents

- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Components](#components)
  - [PostgreSQL Database](#1-postgresql-database)
  - [Redis Cache](#2-redis-cache)
  - [MailHog SMTP](#3-mailhog-smtp-server)
  - [Caddy Proxy](#4-caddy-reverse-proxy)
  - [n8n Workflow Automation](#5-n8n-workflow-automation)
  - [ngrok Tunnel](#6-ngrok-tunnel)
  - [Backend Services](#7-backend-services)
  - [Frontend UI](#8-frontend-ui-react)
- [Environment Variables](#environment-variables)
- [Docker Commands Reference](#docker-commands-reference)
- [Scripts Reference](#scripts-reference)
- [Testing](#testing)
- [Production Deployment](#production-deployment)
- [API Reference](#api-reference)
- [Specifications](#specifications)
- [PWA Features](#pwa-features)
- [Roadmap & TODOs](#roadmap--todos)
- [Troubleshooting](#troubleshooting)

## Design: Keep the Client Lightweight (BFF-first)

Purpose: make the UI a thin collector and renderer while moving business logic, policy, and billing to trusted servers (BFF / `bff-platform` + `n8n`). This reduces client complexity, improves security, and centralizes audit/logging and feature flags.

- Server/BFF First
  - Add a small backend endpoint (extend `be/bff-platform`) that accepts UI payloads, normalizes metadata (ISO `dateOfBirth`, `timeOfBirth`, `placeOfBirth`, `userName`), computes derived fields (`age`, `ageConfirmed`) and stores authoritative state.
  - The BFF should decide `isSystemContext` for system-initiated messages and return a short canonical payload to the UI for display.
  - The BFF forwards a canonical, validated request to `n8n` so the workflow always receives consistent, server-validated data.

- `n8n` as Orchestrator (not Validator)
  - Keep `n8n` focused on conversation orchestration, memory persistence (age, dob, name) and LLM prompt control.
  - Post-process LLM outputs in `n8n` to sanitize stage directions (e.g., strip `*smiles*`) and to produce an explicit `isBillable` flag for each outgoing response.
  - Persist computed fields into the workflow memory node before the agent executes (ensures agent sees authoritative state).

- Centralize Billing & Charge Decisions Server-side
  - Only BFF or `n8n` should decrement credits after validating `isBillable` and message type.
  - UI must never perform the authoritative charge; it may show optimistic UI but waits for server confirmation before committing locally.
  - Charge endpoints must be idempotent (use `reqId` or request tokens) to avoid double deductions during retries.

- UI Responsibilities (keep them tiny)
  - Collect and minimally validate inputs (format DOB to ISO `YYYY-MM-DD`, basic syntactic checks).
  - Attach lightweight hints (e.g., `isSystemContext: true`) for system-originated messages but treat hints as non-authoritative.
  - Send canonical payload to BFF (not directly to `n8n`).
  - Render messages and defensively sanitize outputs (strip `*stage directions*`) for display only.
  - Fetch credit balance from backend; display server-confirmed balances.

- Auth, Trust & Observability
  - Use short-lived tokens / session IDs so backend can validate and tie requests to sessions.
  - Log parsed DOB/age and `isBillable` decisions server-side for audits. Add feature flags to toggle heuristics safely.

- Quick migration path (minimal changes)
  1. Add a BFF endpoint: `POST /api/v1/chat/proxy` that accepts UI payloads and returns canonical payload plus `isBillable` and credit balance.
  2. Update `ui/src/hooks/useChat.js` to call the BFF instead of posting directly to `n8n`.
  3. Move age computation + persistence + billing-gate logic to BFF and/or `n8n` (pre-agent memory persistence).
  4. UI renders server-provided `isBillable` and updated credit-balance values returned by the BFF.

- Minimal BFF endpoint spec (example)
  - Request: `POST /api/v1/chat/proxy`
    ```json
    {
      "reqId": "<client-session-reqid>",
      "message": "<user or system message text>",
      "sessionId": "<user-session-id>",
      "metadata": {
        "userName": "Ankur Vatsa",
        "dateOfBirth": "1979-05-19",
        "timeOfBirth": "07:30",
        "placeOfBirth": "New Delhi",
        "isSystemContext": true
      }
    }
    ```
  - Response: `200 OK`
    ```json
    {
      "reqId": "<same-reqid>",
      "forwardedToN8n": true,
      "n8nResponse": { "output": "...", "isBillable": false },
      "credits": 12
    }
    ```

- Testing checklist
  - Send initial system greeting (with DOB). Verify BFF computes `age`, sets `ageConfirmed`, persists it (or forwards to `n8n` memory), and returns `isBillable=false` and no credit deduction.
  - Reply with redundant confirmations ("Yes, I'm over 18"). Verify no credits deducted and `ageConfirmed` remains in memory.
  - Send an actual horoscope question. Verify `isBillable=true` is returned and credits are deducted by server-side billing.

Rationale: this pattern centralizes sensitive logic (billing, age computation) on trusted servers, making the UI easier to maintain and safer to operate in production.


---

## Architecture

```
                    ┌────────────────────────────────────┐
                    │       Frontend (UI) :5173          │
                    │       React + Vite + Tailwind      │
                    └───────────────┬────────────────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
  ┌───────────▼─────────────┐                 ┌───────────▼─────────────┐
  │   BFF Auth :3001        │                 │   BFF Platform :3000    │
  │   • Login/Register      │                 │   • Geocoding           │
  │   • JWT Tokens          │                 │   • Astrology APIs      │
  │   • Password Reset      │                 │   • Telemetry           │
  └───────────┬─────────────┘                 └───────────┬─────────────┘
              │                                           │
              └─────────────────┬─────────────────────────┘
                                |
                  ┌─────────────▼─────────────┐
                  │   PostgreSQL :5432        │
                  │   Users, Sessions, OAuth  │
                  └───────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     Supporting Services                             │
├─────────────────────────────────────────────────────────────────────┤
│  Redis :6379      │  MailHog :8025/:1025  │  ngrok (dev webhooks)   │
│  Cache/Sessions   │  Dev Email Capture    │  Tunnel for n8n         │
├─────────────────────────────────────────────────────────────────────┤
│         n8n :5678  ◄──────────►  Ollama (Llama3.1)                  │
│         Workflow Automation      Local LLM for AI features          │
└─────────────────────────────────────────────────────────────────────┘
```

### Project Structure

```
niyati/
├── be/
│   ├── bff-auth/        # Auth service (port 3001)
│   ├── bff-platform/    # Platform service (port 3000)
│   ├── commons/         # Shared libraries
│   ├── migrations/      # Database schema migrations
│   ├── worker/          # Background jobs processor
│   └── scripts/         # Backend utility scripts
├── ui/                  # React frontend (port 5173)
├── scripts/             # DevOps and utility scripts
├── secrets/             # Production secrets (gitignored)
├── docker-compose.yml          # Base configuration
├── docker-compose.override.yml # Dev overrides (auto-loaded)
├── docker-compose.prod.yml     # Production overrides
├── docker-compose.ci.yml       # CI test overrides
└── Caddyfile                   # Reverse proxy config
```

---

## Quick Start

### Prerequisites

- **Docker** and **Docker Compose** (required)
- **Ollama** for AI features ([ollama.ai](https://ollama.ai)) - required for chat
- **n8n** for workflow automation - required for AI responses

### 1. Clone and Configure

```bash
git clone https://github.com/vatsaaa/niyati.git
cd niyati

# Run setup script (creates .env files from examples)
./scripts/docker-setup.sh

# Edit environment files with your API keys
nano .env
```

### 2. Start All Services

```bash
# Stop any existing containers, rebuild, and start fresh
docker compose down --remove-orphans
docker compose up -d --build --force-recreate

# Verify services are running
docker compose ps
```

### 3. Verify Health

```bash
curl http://localhost:3001/api/v1/telemetry/health  # Auth service
curl http://localhost:3000/api/v1/telemetry/health  # Platform service
```

### 4. Access the Application

| Service | URL | Description |
|---------|-----|-------------|
| **UI** | http://localhost:5173 | React frontend |
| **Auth API** | http://localhost:3001 | Authentication service |
| **Platform API** | http://localhost:3000 | Business logic service |
| **MailHog** | http://localhost:8025 | Dev email capture |
| **PostgreSQL** | localhost:5432 | Database |
| **Redis** | localhost:6379 | Cache |

### 5. Start AI Services (Required for Chat)

```bash
# Terminal 1: Run Ollama with Llama3.1
ollama pull llama3.1 && ollama serve

# Terminal 2: Start ngrok tunnel for webhooks
ngrok http 5678

# Terminal 3: Start n8n with webhook URL
WEBHOOK_URL=https://your-ngrok-url.ngrok-free.app n8n start
```

---

## Components

### 1. PostgreSQL Database

PostgreSQL 15 stores users, sessions, OAuth accounts, and application data.

#### Setup

```bash
# Start PostgreSQL
docker compose up -d postgres

# Wait for healthy status
docker compose ps postgres
```

#### Migrations

Migration files are in `be/migrations/` with naming convention: `YYYYMMDD_NN_description.up.sql`

```bash
# Apply migrations manually
docker compose exec postgres psql -U niyati -d niyati_dev -f /docker-entrypoint-initdb.d/20251217_01_baseline.up.sql

# Or use the migration runner
docker compose run --rm bff-platform node /app/scripts/run_migrations.js
```

#### Database Operations

```bash
# Connect to PostgreSQL shell
docker compose exec postgres psql -U niyati -d niyati_dev

# Check database health
./scripts/db.sh health

# Backup database
./scripts/db.sh backup backup.sql

# Restore from backup
./scripts/db.sh restore backup.sql

# Reset database (WARNING: destructive)
./scripts/db.sh reset
```

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | `niyati` | Database user |
| `POSTGRES_PASSWORD` | (secret) | Database password |
| `POSTGRES_DB` | `niyati_dev` | Database name |
| `POSTGRES_PORT` | `5432` | Database port |
| `POSTGRES_MAX_CONNECTIONS` | `100` | Max connections |
| `POSTGRES_SHARED_BUFFERS` | `256MB` | Shared buffer size |

---

### 2. Redis Cache

Redis 7 provides caching for sessions, rate limiting, and background job queues.

#### Setup

```bash
# Start Redis
docker compose up -d redis

# Verify
docker compose exec redis redis-cli ping
```

#### Stop

```bash
docker compose stop redis
```

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://redis:6379` | Redis connection URL |
| `REDIS_HOST` | `redis` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |

---

### 3. MailHog SMTP Server

MailHog captures all outgoing emails in development for testing without sending real emails.

#### Setup

```bash
# Start MailHog (dev profile)
docker compose --profile dev up -d mailhog
```

#### Access

- **Web UI**: http://localhost:8025 (view captured emails)
- **SMTP**: localhost:1025 (send emails)

#### Stop

```bash
docker compose stop mailhog
```

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MAILHOG_WEB_PORT` | `8025` | Web UI port |
| `MAILHOG_SMTP_PORT` | `1025` | SMTP port |
| `SMTP_HOST` | `mailhog` | SMTP host for dev |

---

### 4. Caddy Reverse Proxy

Caddy handles HTTP/HTTPS routing, SSL termination, and serves the UI static files.

#### Setup

```bash
# Caddy starts automatically with docker compose
docker compose up -d caddy
```

#### Configuration

Edit `Caddyfile` to modify routing rules:

```caddyfile
:5173 {
    # API routes to backend
    handle /api/v1/auth/* {
        reverse_proxy bff-auth:3001
    }
    handle /api/* {
        reverse_proxy bff-platform:3000
    }
    # Everything else to UI
    handle {
        reverse_proxy ui-service:80
    }
}
```

#### Stop

```bash
docker compose stop caddy
```

#### Environment Variables (Production)

| Variable | Default | Description |
|----------|---------|-------------|
| `DOMAIN` | `localhost` | Production domain |
| `CADDY_EMAIL` | `admin@example.com` | Let's Encrypt email |
| `CADDY_HTTP_PORT` | `5173` | HTTP port |

---

### 5. n8n Workflow Automation

n8n orchestrates AI chat workflows, connecting user messages to Ollama LLM and handling responses.

#### Local Setup (Development)

```bash
# Install n8n globally
npm install -g n8n

# Start n8n
n8n start

# Access at http://localhost:5678
```

#### Import Workflow

1. Open n8n at http://localhost:5678
2. Import workflow from `be/n8n/NiyatiWorkflow.json`
3. Configure the webhook URL in the workflow

#### Mock n8n (CI)

For CI testing, a mock n8n service is available:

```bash
# Start with CI config (includes mock n8n)
docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d
```

The mock service runs `scripts/mock-n8n.js` which returns canned responses.

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `N8N_WEBHOOK_URL` | `/webhook/chat` | n8n webhook endpoint |
| `VITE_N8N_WEBHOOK_URL` | `/webhook/chat` | Frontend webhook URL |

---

### 6. ngrok Tunnel

ngrok exposes local services to the internet for webhook testing and mobile development.

#### Setup

```bash
# Install ngrok
brew install ngrok  # macOS

# Add auth token
ngrok config add-authtoken YOUR_TOKEN

# Start tunnel for n8n
ngrok http 5678
```

#### Configuration

Create `ngrok.yml` for multiple tunnels:

```yaml
tunnels:
  n8n:
    proto: http
    addr: 5678
  ui:
    proto: http
    addr: 5173
```

Start all tunnels:
```bash
ngrok start --all --config=ngrok.yml
```

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NGROK_AUTH_TOKEN` | (empty) | ngrok authentication token |

---

### 7. Backend Services

#### bff-auth (Port 3001)

Authentication service handling user registration, login, JWT tokens, and password reset.

```bash
# Start auth service
docker compose up -d bff-auth

# View logs
docker compose logs -f bff-auth

# Run tests
cd be/bff-auth && npm test
```

**API Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/auth/register` | POST | Register new user |
| `/api/v1/auth/login` | POST | Login user |
| `/api/v1/auth/token` | POST | Refresh access token |
| `/api/v1/auth/logout` | POST | Logout user |
| `/api/v1/auth/me` | GET | Get current user profile |
| `/api/v1/auth/request-password-reset` | POST | Request password reset |
| `/api/v1/auth/reset-password` | POST | Reset password |
| `/api/v1/telemetry/health` | GET | Health check |

#### bff-platform (Port 3000)

Business logic service for geocoding, astrology calculations, user profiles, and credits.

```bash
# Start platform service
docker compose up -d bff-platform

# View logs
docker compose logs -f bff-platform

# Run tests
cd be/bff-platform && npm test
```

**API Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/users/identify` | POST | Identify user by phone |
| `/api/v1/users/profile` | POST | Create/update profile |
| `/api/v1/users/deduct-credits` | POST | Deduct user credits |
| `/api/v1/users/add-credits` | POST | Add credits (payment) |
| `/api/v1/users/config` | GET | Get app configuration |
| `/api/v1/geocode` | POST | Geocode location |
| `/api/v1/geocode/current-location` | GET | Get current location |
| `/api/v1/astrology/compute` | POST | Calculate birth chart |
| `/api/v1/feedback` | POST | Submit feedback |
| `/api/v1/telemetry/health` | GET | Health check |

#### commons

Shared libraries used by both BFF services.

```bash
# Run commons tests
cd be/commons && npm test
```

#### worker

Background job processor for email sending, payment reconciliation, and scheduled tasks.

```bash
# Start worker (production profile)
docker compose --profile production up -d worker

# View logs
docker compose logs -f worker
```

---

### 8. Frontend UI (React)

React single-page application with Vite, TailwindCSS, and PWA support.

#### Setup

```bash
# Start UI service
docker compose up -d ui-service

# Or run locally for development
cd ui && npm install && npm run dev
```

#### Build

```bash
# Production build
cd ui && npm run build

# Preview build
cd ui && npm run preview
```

#### Test

```bash
cd ui && npm test
```

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_BFF_BASE_URL` | (empty) | API base URL |
| `VITE_N8N_WEBHOOK_URL` | `/webhook/chat` | n8n webhook URL |
| `VITE_DEBUG_MODE` | `false` | Enable debug mode |
| `VITE_API_URL` | `/api` | API path prefix |

---

## Environment Variables

All environment variables are configured in the root `.env` file.

### Core Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `BUILD_TARGET` | `development` | Docker build target |
| `IMAGE_TAG` | `local` | Docker image tag |
| `API_VERSION` | `v1` | API version prefix |

### Port Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `BFF_PLATFORM_PORT` | `3000` | Platform service port |
| `BFF_AUTH_PORT` | `3001` | Auth service port |
| `UI_DEV_PORT` | `5173` | UI development port |
| `UI_PROD_PORT` | `80` | UI production port |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `REDIS_PORT` | `6379` | Redis port |

### Security

| Variable | Default | Description |
|----------|---------|-------------|
| `ACCESS_TOKEN_SECRET` | (required) | JWT signing secret |
| `REFRESH_TOKEN_TTL_MS` | `2592000000` | Refresh token TTL (30 days) |
| `PASSWORD_RESET_TTL_MS` | `3600000` | Password reset TTL (1 hour) |

### External APIs

| Variable | Default | Description |
|----------|---------|-------------|
| `ASTRO_API_URL` | `https://json.freeastrologyapi.com` | Astrology API |
| `ASTRO_API_KEY` | (required) | Astrology API key |
| `GEOCODE_MAPS_KEY` | (required) | Geocode.maps.co API key |
| `GEOCODE_CACHE_TTL` | `86400` | Geocode cache TTL (24h) |

### Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |
| `STRICT_RATE_LIMIT_MAX_REQUESTS` | `20` | Strict limit for sensitive endpoints |

### CORS

| Variable | Default | Description |
|----------|---------|-------------|
| `CORS_ALLOWED` | `http://localhost:5173` | Allowed origins |
| `ALLOW_CROSS_SITE_COOKIES` | `false` | Allow cross-site cookies |

### Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `debug` | Log level (debug/info/warn/error) |
| `LOG_PRETTY_PRINT` | `true` | Pretty print logs (dev only) |

---

## Docker Commands Reference

### Start Services

| Command | Description |
|---------|-------------|
| `docker compose up -d` | Start all dev services |
| `docker compose up -d --build` | Start with rebuild |
| `docker compose up -d --build --force-recreate` | Fresh start |
| `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` | Start production |
| `docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d` | Start for CI |

### Stop Services

| Command | Description |
|---------|-------------|
| `docker compose down` | Stop all services |
| `docker compose down -v` | Stop and remove volumes |
| `docker compose down --rmi all` | Stop and remove images |
| `docker compose down -v --rmi all --remove-orphans` | Full cleanup |

### Monitor Services

| Command | Description |
|---------|-------------|
| `docker compose ps` | List running services |
| `docker compose logs -f` | View all logs |
| `docker compose logs -f bff-auth` | View specific service logs |

### Single Service Operations

| Command | Description |
|---------|-------------|
| `docker compose up -d postgres` | Start single service |
| `docker compose stop bff-auth` | Stop single service |
| `docker compose restart bff-platform` | Restart service |
| `docker compose build --no-cache ui-service` | Rebuild service |

---

## Scripts Reference

### scripts/docker-setup.sh
Initial setup script that creates environment files from examples.

```bash
./scripts/docker-setup.sh
```

### scripts/docker-dev.sh
Development helper for common Docker operations.

```bash
./scripts/docker-dev.sh up       # Start dev services
./scripts/docker-dev.sh down     # Stop services
./scripts/docker-dev.sh logs     # View logs
./scripts/docker-dev.sh build    # Rebuild all
./scripts/docker-dev.sh clean    # Stop + remove volumes
./scripts/docker-dev.sh health   # Check health
./scripts/docker-dev.sh shell-bff # Shell into BFF container
```

### scripts/db.sh
Database management operations.

```bash
./scripts/db.sh start    # Start PostgreSQL
./scripts/db.sh stop     # Stop PostgreSQL
./scripts/db.sh health   # Check health
./scripts/db.sh psql     # Connect to shell
./scripts/db.sh migrate  # Run migrations
./scripts/db.sh seed     # Seed test data
./scripts/db.sh backup   # Backup database
./scripts/db.sh restore  # Restore from backup
./scripts/db.sh reset    # Reset database
```

### scripts/smoke_test.sh
Run smoke tests against local containers.

```bash
./scripts/smoke_test.sh
```

### scripts/ci-run-tests.sh
CI test runner that handles Docker lifecycle and tests.

```bash
./scripts/ci-run-tests.sh
```

### scripts/deploy_niyati.sh
Production deployment script.

```bash
./scripts/deploy_niyati.sh --prod --project-name=niyati-prod
```

#### Deploy script notes

- The `deploy_niyati.sh` script supports the following useful flags:

  - `--prod` — use production compose overrides (`docker-compose.prod.yml`)
  - `--project-name=<name>` — set the Compose project name (`-p`) to ensure stable container naming across runs
  - `--dry-run` — print the commands the script would run without executing them
  - `--log-file=PATH` — append deploy output to `PATH`

- Idempotent start sequence (what the script does when starting services):

  1. `docker compose -p <project> down --remove-orphans` — removes any leftover or orphaned containers (prevents names like `niyati-caddy-1`).
  2. `docker compose -p <project> up -d --build` — starts the stack with freshly built images.

Example:

```bash
./scripts/deploy_niyati.sh --prod --project-name=niyati-prod --log-file=/tmp/deploy.log
```


---

## Testing

### Backend Tests

```bash
# All backend tests
cd be/bff-platform && npm test
cd be/bff-auth && npm test
cd be/commons && npm test
```

### Frontend Tests

```bash
cd ui && npm test
```

### E2E Tests

```bash
# Ensure all services are running first
docker compose up -d

# Run E2E tests
make e2e

# Or manually
cd e2e && npm test
```

### Integration Tests

```bash
# Run full integration suite
./scripts/ci-run-tests.sh
```

---

## Production Deployment

### 1. Create Secrets

```bash
mkdir -p secrets

# Generate secrets
echo -n "$(openssl rand -base64 32)" > secrets/postgres_password.txt
echo -n "$(openssl rand -hex 64)" > secrets/jwt_secret.txt
echo -n "your-smtp-user" > secrets/smtp_user.txt
echo -n "your-smtp-password" > secrets/smtp_password.txt
echo -n "$(openssl rand -hex 32)" > secrets/worker_token.txt

# Secure permissions
chmod 600 secrets/*.txt
```

### 2. Run Migrations

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile migration run --rm migrate
```

### 3. Deploy

```bash
# Stop existing services
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# Build production images
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache

# Start production services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate

# Optional: Start with proxy and backup
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile proxy --profile backup up -d
```

### 4. Verify

```bash
curl http://localhost:3001/api/v1/telemetry/health
curl http://localhost:3000/api/v1/telemetry/health
```

### Production Checklist

- [ ] All secrets created and secured
- [ ] Migrations applied
- [ ] `NODE_ENV=production` set
- [ ] `LOG_PRETTY_PRINT=false` set
- [ ] CORS configured for production domain
- [ ] SSL/TLS configured in Caddy
- [ ] Health checks passing
- [ ] Monitoring/alerting configured

---

## API Reference

### Authentication Flow

1. **Register/Login** → Receive access token (15min) + refresh token (30 days)
2. **API Requests** → Send `Authorization: Bearer <token>` header
3. **Token Refresh** → Call `/api/v1/auth/token` when access token expires
4. **Logout** → Call `/api/v1/auth/logout` to revoke tokens

### Credits System

- Free users: 10 credits/month, reset on 1st of month
- Horoscope query: 2 credits
- Premium query: 4 credits
- Payment: ₹10 = 1 credit

### Error Response Format

```json
{
  "code": "INVALID_CREDENTIALS",
  "message": "The credentials provided are invalid",
  "details": {},
  "requestId": "req_abc123"
}
```

---

## Specifications

### Functional Specification

Niyati is a conversational astrology assistant that delivers personalized horoscopes, birth-chart insights, and guidance through chat-based interactions.

**Core Flows:**
- **Sign Up/Sign In**: Email/password or OAuth authentication via bff-auth
- **Profile Management**: User profiles with birth details for personalization
- **Identify/Chat**: AI-powered chat with credit-based monetization
- **Credits/Billing**: UPI/QR-based payments with manual reconciliation

**Key Behaviors:**
- Returning users see personalized greetings based on location changes
- Free users limited to "today" horoscope queries
- Credits deducted only after successful bot response
- QR payment prompt shown when credits < 6

### Business Specification

**Monetization Model:**
- Free monthly allowance: 10 credits/month
- Horoscope cost: 2 credits
- Premium cost: 4 credits
- Payment: ₹500 minimum, 1 credit per ₹10

**User Segments:**
- Casual (Free): Daily horoscopes with monthly credit limit
- Engaged (Paid): Premium analyses and detailed predictions
- Power Users: Frequent queries with subscription bundles

### System Specification

**Data Model:**
- `users`: Profile, credits, payment history
- `app_config`: Business parameters (credits, costs, thresholds)
- `message_feedback`: User feedback (thumbs up/down)

**Key Technical Details:**
- Phone normalization: Queries use regex to strip non-digits
- Monthly reset: Credits reset on identify if month changed
- Atomic deductions: Single SQL UPDATE + RETURNING
- Config caching: In-memory cache with TTL

---

## PWA Features

The UI is a fully-featured Progressive Web App:

### Features
- **Installable**: Can be installed on device like native app
- **Offline Support**: Works without internet, cached data available
- **Automatic Updates**: Service worker detects and applies updates
- **Network Status**: Offline indicator banner

### Caching Strategy
- Static assets: Cache-first
- API requests: Network-first with 10s timeout
- Images: Cache-first with LRU eviction
- Navigation: Network-first with offline fallback

### Service Worker

Located at `ui/public/sw.js`:
- Precaches core assets
- Handles navigation with preload
- Manages cache size limits
- Rotates caches on version change

---

## Roadmap & TODOs

### Immediate Priorities

1. **Social Login**: Implement OAuth callbacks for Google & Instagram
2. **RAG Integration**: Store chat history for personalized responses
3. **Numerology**: Implement Pythagorean numerology calculator
4. **Premium Features**: Kundali generation, advanced reports

### Planned Improvements

- Rate limiting by phone (free: 5/day, paid: 50/day)
- Feedback mechanism (thumbs up/down)
- Multi-language support (Hindi)
- Analytics dashboards
- Payment verification automation
- Cloud deployment with Terraform/Pulumi

### Technical Debt

- TypeScript migration for type safety
- OpenAPI/Swagger documentation
- Database query optimization
- Comprehensive test coverage

---

## Troubleshooting

### Services Won't Start

```bash
# Check logs
docker compose logs bff-auth

# Clean restart
docker compose down -v && docker compose up -d --build
```

### Database Issues

```bash
# Check status
docker compose ps postgres

# View logs
docker compose logs postgres

# Test connection
docker compose exec postgres psql -U niyati -d niyati_dev -c "SELECT 1;"
```

### Port Conflicts

```bash
# Find what's using a port
lsof -i :3000

# Stop all environments
docker compose down
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```

### Stale Cache/Images

```bash
# Full cleanup
docker compose down -v --rmi all --remove-orphans

# Rebuild
docker compose up -d --build --force-recreate
```

### Health Check Failures

```bash
# Check individual service health
curl -v http://localhost:3001/api/v1/telemetry/health
curl -v http://localhost:3000/api/v1/telemetry/health

# Check container health status
docker inspect --format='{{.State.Health.Status}}' niyati-bff-auth-1
```

---

## Technology Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 19, Vite 7, TailwindCSS 3, PWA |
| **Backend** | Node.js 20, Express 4, PostgreSQL 15 |
| **AI/Automation** | Ollama, Llama3.1, n8n |
| **DevOps** | Docker, Docker Compose, Caddy |
| **Testing** | Jest, Playwright, Vitest |

---

**Built with ❤️ using React, Node.js, PostgreSQL, and Docker**




Niyati chats flow is: UI <--> Caddy <--> n8n, but that makes the client heavier with business logic. Make client lightweight with responsibilities to collect & validate inputs, render UI, and delegate business rules to trusted servers, by extending bff-platform client and accomodating following:

- Server/BFF First: Add a small backend endpoint (BFF) between the UI and n8n (or extend bff-platform) that:
- - Accepts UI payloads, normalizes metadata (ISO dateOfBirth, timeOfBirth, placeOfBirth, userName).
- - Computes derived fields (age, ageConfirmed) and stores authoritative state.
- - Decides isSystemContext and returns a short payload to UI for display.
- - Forwards a canonical request to n8n (so n8n always receives consistent, server-validated data).

- n8n as Orchestrator, not Validator: Keep n8n focused on conversation/memory and side effects:
- - n8n should persist memory (age, dob, name) and produce isBillable for responses.
- - Do any LLM-facing prompt control and output sanitization here (e.g., strip *smiles* in a post-process node).
- - Because n8n runs server-side, it can be the authoritative place to persist session memory that the agent reads before generating replies.

- Centralize Billing & Charge Decisions Server-side:
- - Only the backend (BFF or bff-platform) or n8n should decrement credits after validating isBillable and message type.
- - UI should never decide/perform the actual charge; it may optimistically show pending changes but must wait for server confirmation before committing.

- UI Responsibilities — keep them tiny:
- - Collect inputs and do minimal client-side validation (format DOB to ISO YYYY-MM-DD, basic syntactic checks).
- - Send raw canonical payload to BFF/n8n; do not implement business rules (age logic, billing rules).
- - Render messages; sanitize display (strip stage directions) as a defensive UX measure only.
- - Poll or fetch credit balance from backend when needed; show server-confirmed status.

- Auth, Trust & Idempotency:
- - Use short-lived tokens/session IDs so backend can validate requests.
- - Make charge endpoints idempotent (use request IDs) to avoid double deductions during retries.
- - Validate client-provided flags (like isSystemContext) server-side; treat them as hints, not authority.

- Observability & Safety:
- - Log parsed DOB/age and isBillable decisions server-side for audits.
- - Add feature flags for turning on/off server-side auto-confirmation or new heuristics without client changes.

- Quick migration path (minimal code changes):
1. Add BFF endpoint that accepts UI payloads and returns canonical payload.
2. Have useChat.js call BFF rather than n8n directly.
3. Move age compute + persistence + billing gate to BFF/n8n.
4. Update UI to display server-provided isBillable and credit-balance endpoints.

