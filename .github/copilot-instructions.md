# Copilot / AI agent instructions for Niyati

Purpose: help an AI coding agent become productive quickly in this repository.

- **Big picture**: Niyati is an AI-enabled web platform with a React/Vite frontend and two Node BFF services. Core components:
  - Frontend: [ui](ui) (Vite + React) served on port 5173 in dev.
  - Backend BFFs: [be/bff-platform](be/bff-platform) (port 3000) and [be/bff-auth](be/bff-auth) (port 3001).
  - Data/services: PostgreSQL, Redis, MailHog, optional n8n/ollama for AI workflows. See [README.md](README.md) and [docker-compose.yml](docker-compose.yml) for the full topology.

- **How services start / local dev**:
  - Primary, reproducible local flow uses Docker Compose: `docker compose up -d`. See [README.md](README.md) and [docker-compose.yml](docker-compose.yml).
  - E2E runs via `make e2e` (calls the `docker compose -f docker-compose.yml -f docker-compose.e2e.yml up --build e2e`). See [Makefile](Makefile) and [e2e/package.json](e2e/package.json).
  - Individual service dev: cd into `be/bff-platform` or `be/bff-auth` and use `npm run dev` (scripts in their package.json files: [be/bff-platform/package.json](be/bff-platform/package.json), [be/bff-auth/package.json](be/bff-auth/package.json)).

- **Tests & CI-relevant commands**:
  - Backend unit tests: `npm test` in each `be/*` service (Jest; backend jest runs `--runInBand`). See service package.json files.
  - Frontend tests: `npm test` in `ui` (Vitest). See [ui/package.json](ui/package.json).
  - E2E: Playwright under `e2e` (`npm test`) and containerized via `Makefile`.

- **Database & migrations**:
  - Migrations live in `be/migrations`. The containerized migration runner is `be/scripts/run_migrations.sh` which waits for Postgres and applies `*.up.sql` files. Reference: [be/scripts/run_migrations.sh](be/scripts/run_migrations.sh) and [be/migrations](be/migrations).

- **Common runtime conventions and patterns** (important for code changes):
  - Health/readiness endpoint: services expose `/api/v1/telemetry/health` (used by docker healthchecks). Check service entrypoints and docker healthcheck commands in [docker-compose.yml](docker-compose.yml).
  - Entrypoints often call `wait-for-db.sh` and use explicit healthcheck scripts (`healthcheck-http.sh`). Prefer updating these scripts when changing startup behavior.
  - Logging uses `pino` with `LOG_PRETTY_PRINT` toggle—preserve structured logs in integrations and tests (see service package.json and Dockerfiles).
  - Shared code is under `be/commons` and should be imported by the BFF services rather than duplicated.

- **Integration points to be aware of**:
  - n8n workflows (folder `n8n/NiyatiWorkflow.json`) are used for AI-powered automated chat with the user. niyati-ui does the minimal handling of chat with the user for determining user profile; then it hands over the chat and response generation to n8n.
  - ngrok is used for dev webhooks
  - Ollama (local LLM) is mandatory since LLM Agent in n8n workflow calls it for generating AI responses.
  - Worker (`be/worker`) uses Redis + nodemailer for background jobs; message flows come from the platform/auth services.

- **Project-specific conventions**:
  - JS-first repo: most code is plain JavaScript (no TypeScript). UI uses ESM modules (Vite + `type: module`).
  - Tests in backend use `--runInBand` (jest) to avoid parallel DB interference—keep this when changing test scripts.
  - Docker Compose uses `profiles` and multi-file overrides (`docker-compose.override.yml`, `docker-compose.prod.yml`, `docker-compose.e2e.yml`)—prefer adding override behavior rather than modifying the base file.
  - Sensitive values are provided via env files: `.env`, `.env.bff.auth`, `.env.bff.platform`, `.env.ui` (see README instructions for naming).

- **When editing code or adding features** (recommended quick checklist):
  - Run services with `docker compose up -d` if the change requires full-stack verification.
  - For backend unit changes, run `npm test` in the specific `be/*` folder; for UI, use `npm test` in `ui`.
  - If schema changes are required, add a new `YYYYMMDD_xx_description.up.sql` into `be/migrations` and ensure `run_migrations.sh` logic is satisfied.
  - Update or add health-check calls if new endpoints are introduced; keep `/api/v1/telemetry/health` compatibility where possible.

- **Where to look for examples**:
  - Startup & health patterns: [docker-compose.yml](docker-compose.yml)
  - Backend scripts and dependencies: [be/bff-platform/package.json](be/bff-platform/package.json), [be/bff-auth/package.json](be/bff-auth/package.json)
  - UI dev/build/test flows: [ui/package.json](ui/package.json)
  - E2E: [e2e/package.json](e2e/package.json) and [Makefile](Makefile)


**Code-level Pointers**

- `be/bff-platform/src/index.js`: main platform server bootstrap. Mounts API routers under `/api/${API_VERSION}` and exposes the explicit health route at `/api/v1/telemetry/health`. Also shows CORS setup, DB pool initialization, `attachResponseHelpers` usage, and graceful shutdown.

- `be/bff-platform/lib/telemetry.js`: telemetry router used at `/api/v1/telemetry/*`. Implements:
  - `POST /api/telemetry/log` — rate-limited telemetry ingestion with sampling and response headers (`X-RateLimit-*`, `X-Telemetry-Sampled`).
  - `GET /api/telemetry/health` — lightweight health check used by load balancers.
  - `GET /api/telemetry/info` — returns runtime info (version, memory, uptime).

- `be/bff-auth/src/index.js`: auth server bootstrap. Mounts auth/users/telemetry routers and exposes `/api/v1/telemetry/health` for health checks.

- `be/bff-auth/lib/telemetry.js`: auth service telemetry router — nearly identical semantics to platform telemetry (log, health, info).

- `be/commons/lib/responses.js`: centralized `attachResponseHelpers`, `sendSuccess`, `sendError`, and canonical `ErrorCodes`. All routes should use `res.sendSuccess()` / `res.sendError()` for consistent API shapes.

- `be/commons/lib/logger.js`: `pino` logger configuration and `reqIdFromReq()` helper. Logging redact rules and `LOG_PRETTY_PRINT` handling are here — do not bypass this for production-visible logs.

- `be/bff-platform/lib/validateEnv.js`: strict environment validation used at startup — tests rely on throwing behavior. When adding new required env vars, update this file and tests accordingly.

- `be/commons/*` and `be/*/lib/*` directories: look for canonical utilities (sanitize, rateLimiter, geocode, astrology, users). Prefer reusing `be/commons` exports rather than reimplementing logic.

Examples to inspect when working on feature changes:
- Telemetry ingestion test: `be/bff-platform/test/prod_integration.test.js` — shows expected telemetry responses and health checks.
- Docker healthcheck calls: see `docker-compose.yml` and `be/bff-platform/Dockerfile` / `be/bff-auth/Dockerfile` for `healthcheck-http.sh` usage.

If you'd like, I can expand any of the bullets above with exact line ranges, small code snippets, or add common PR checklist items (tests, migration, env updates).  
