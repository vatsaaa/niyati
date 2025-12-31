# 🌟 Niyati

AI-powered astrology platform with personalized readings, geocoding, and authentication.

## 🏗️ Architecture

```
                    ┌────────────────────────────────────┐
                    │       Frontend (UI) :5173          │
                    │       React + Vite + Tailwind      │
                    └───────────────┬────────────────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              ▼                                           ▼
┌─────────────────────────┐               ┌─────────────────────────┐
│   BFF Auth :3001        │               │   BFF Platform :3000    │
│   • Login/Register      │               │   • Geocoding           │
│   • JWT Tokens          │               │   • Astrology APIs      │
│   • Password Reset      │               │   • Telemetry           │
└───────────┬─────────────┘               └───────────┬─────────────┘
            │                                         │
            └─────────────────┬───────────────────────┘
                              ▼
              ┌───────────────────────────┐
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

## 🚀 Quick Start (Docker)

### Prerequisites

- **Docker** and **Docker Compose** (required)
- **Ollama** for AI features ([ollama.ai](https://ollama.ai)) (optional)
- **n8n** for workflow automation (optional)

### 1. Clone and Configure

```bash
git clone https://github.com/vatsaaa/niyati.git
cd niyati

# Create environment files from examples
cp .env.example .env
cp .env.bff.auth.example .env.bff.auth
cp .env.bff.platform.example .env.bff.platform
cp .env.ui.example .env.ui

# Edit with your API keys
nano .env.bff.auth      # JWT secrets
nano .env.bff.platform  # Astrology & geocoding API keys
```

### 2. Start Services

```bash
# Stop any existing services first (prevents port conflicts)
docker-compose down

# Start all services (PostgreSQL, BFF services, UI, MailHog, Redis)
docker-compose up -d

# Verify services are running
docker-compose ps
```

### 3. Verify Health

```bash
curl http://localhost:3001/api/v1/telemetry/health  # Auth service
curl http://localhost:3000/api/v1/telemetry/health  # Platform service
```

### 4. Access the Application

| Service | URL |
|---------|-----|
| **UI** | http://localhost:5173 |
| **Auth API** | http://localhost:3001 |
| **Platform API** | http://localhost:3000 |
| **MailHog (Email)** | http://localhost:8025 |
| **Database** | localhost:5432 |

### 5. (Optional) Start AI Services

```bash
# Terminal 1: Run Ollama
ollama pull llama3.1 && ollama serve

# Terminal 2: Start ngrok tunnel for webhooks
ngrok http 5678

# Terminal 3: Start n8n with webhook URL
WEBHOOK_URL=https://your-ngrok-url.ngrok-free.app n8n start
```


---
## 📁 Project Structure

```
niyati/
├── be/
│   ├── bff-auth/        # Auth service (port 3001)
│   ├── bff-platform/    # Platform service (port 3000)
│   ├── commons/         # Shared libraries
│   ├── migrations/      # Database schema
│   └── worker/          # Background jobs
├── ui/                  # React frontend (port 5173)
├── docker-compose.yml          # Base configuration (all services)
├── docker-compose.override.yml.example # Dev overrides (auto-loaded)
├── docker-compose.prod.yml     # Production overrides
└── docker-compose.e2e.yml      # E2E test overrides
```

---

## 🔧 Docker Commands

### 🚀 Start Services

```bash
# Development (default)
docker compose up -d

# Production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# With rebuild
docker compose up -d --build

# E2E Tests
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up --build e2e
```

### 🛑 Stop Services

```bash
# Development
docker compose down

# Production
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# E2E
docker compose -f docker-compose.yml -f docker-compose.e2e.yml down

# Stop all + remove volumes (⚠️ deletes data)
docker compose down -v
```

### 🔍 Monitor Services

```bash
# List running services
docker compose ps

# View all logs
docker compose logs -f

# View specific service logs
docker compose logs -f bff-auth
docker compose logs -f bff-platform
docker compose logs -f ui-service

# Check health
curl http://localhost:3001/api/v1/telemetry/health  # Auth
curl http://localhost:3000/api/v1/telemetry/health  # Platform
```

### 🔨 Build & Rebuild

```bash
# Rebuild specific service
docker compose build bff-auth
docker compose up -d bff-auth

# Rebuild all
docker compose build

# Force rebuild (no cache)
docker compose build --no-cache
```

### 🧹 Clean Up

```bash
# Stop and remove containers
docker compose down

# Remove volumes too (⚠️ loses data)
docker compose down -v

# Remove images
docker compose down --rmi all

# Complete cleanup (containers, volumes, images, orphans)
docker compose down -v --rmi all --remove-orphans

# Manual image removal
docker images | grep niyati | awk '{print $3}' | xargs docker rmi -f
```

### 🎯 Individual Services

```bash
# Start single service
docker compose up -d postgres

# Stop single service
docker compose stop bff-auth

# Restart service
docker compose restart bff-platform

# View service logs
docker compose logs -f ui-service
```

### 🗄️ Database Operations

```bash
./scripts/db.sh health            # Check database health
./scripts/db.sh psql              # Connect to PostgreSQL shell
./scripts/db.sh migrate           # Run migrations
./scripts/db.sh backup backup.sql # Backup database
./scripts/db.sh reset             # Reset database (destructive!)
```

---

## 📊 API Endpoints

### Auth Service (localhost:3001)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/auth/register` | POST | Register user |
| `/api/v1/auth/login` | POST | Login user |
| `/api/v1/auth/token` | POST | Refresh token |
| `/api/v1/auth/logout` | POST | Logout |
| `/api/v1/auth/me` | GET | Get profile (auth required) |
| `/api/v1/auth/request-password-reset` | POST | Request reset |
| `/api/v1/auth/reset-password` | POST | Reset password |
| `/api/v1/telemetry/health` | GET | Health check |

### Platform Service (localhost:3000)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/geocode` | POST | Geocode location |
| `/api/v1/astrology/compute` | POST | Calculate birth chart |
| `/api/v1/telemetry/health` | GET | Health check |

---

## 🔒 Security

### Authentication Flow

1. Register/login → receive access token (15min) + refresh token (30 days)
2. Send `Authorization: Bearer <token>` with API requests
3. Refresh tokens at `/api/v1/auth/token` when access token expires
4. Tokens are rotated on refresh (old revoked, new issued)

### Required Secrets

```bash
# .env.bff.auth
ACCESS_TOKEN_SECRET=<min-32-char-random-string>

# .env.bff.platform
ASTRO_API_KEY=<your-key>
GEOCODE_MAPS_KEY=<your-key>

# .env
POSTGRES_PASSWORD=<strong-password>
```

> ⚠️ Never commit `.env`, `.env.bff.auth`, `.env.bff.platform`, or `.env.ui` files.

---

## 🌍 Environment Configuration

| Setting | Development | Production |
|---------|-------------|------------|
| Log Level | `debug` | `info` |
| Rate Limit | 1000/min | 100/min |
| CORS | `localhost` | Configured domains |
| Logs | Pretty print | JSON |

Switch environments:
```bash
NODE_ENV=production docker-compose up
```

---

## 🚢 Production Deployment

### 1. Create Secrets

```bash
mkdir -p secrets
echo -n "$(openssl rand -hex 32)" > secrets/postgres_password.txt
echo -n "$(openssl rand -hex 64)" > secrets/jwt_secret.txt
echo -n "your-smtp-user" > secrets/smtp_user.txt
echo -n "your-smtp-password" > secrets/smtp_password.txt
echo -n "$(openssl rand -hex 32)" > secrets/worker_token.txt
chmod 600 secrets/*.txt
```

### 2. Deploy

```bash
# Stop all existing services first
docker compose down
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# Run migrations (with migration profile)
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile migration run --rm migrate

# Start production services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Optional: Start with proxy, backup, and worker
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile proxy --profile backup up -d

# Verify health
curl http://localhost:3001/api/v1/telemetry/health
curl http://localhost:3000/api/v1/telemetry/health
```

### Production Features

- **TLS**: Caddy handles automatic HTTPS with Let's Encrypt
- **Secrets**: Docker secrets (no env files)
- **Health checks**: All services monitored
- **Persistent volumes**: Database, Redis, Caddy certs

---

## 🐛 Troubleshooting

### Services Won't Start

```bash
docker-compose logs bff-auth          # Check logs
docker-compose down -v && docker-compose up -d  # Clean restart
```

### Database Issues

```bash
docker-compose ps postgres            # Check status
docker-compose logs postgres          # View logs
docker-compose exec postgres psql -U niyati -d niyati_dev -c "SELECT 1;"
```

### Port Conflicts

```bash
lsof -i :3000   # Check what's using a port
```

---

## 🧪 Testing

```bash
# UI tests (Playwright)
cd ui && npm test

# BFF tests
cd be/bff-auth && npm test
cd be/bff-platform && npm test
```

---

## 🛠️ Technology Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 19, Vite 7, TailwindCSS 3 |
| **Backend** | Node.js 20, Express 4, PostgreSQL 15 |
| **AI/Automation** | Ollama, Llama3.1, n8n |
| **DevOps** | Docker, Docker Compose, Caddy |

---

## 📝 Development Guidelines

### Available Scripts

```bash
# BFF services
npm run dev        # Start with hot reload
npm run lint:fix   # Fix linting issues

# UI
npm run dev        # Vite dev server with HMR
npm run build      # Production build
npm test           # Playwright tests
```

### Git Commit Format

```
type(scope): subject

# Examples:
feat(auth): add password reset
fix(geocode): handle empty results
docs(readme): update instructions
```

---

<details>
<summary><strong>📖 Manual Setup (Without Docker)</strong></summary>

### Database

```bash
createdb niyati_dev
psql niyati_dev < be/migrations/20251206_01_create_users.up.sql
psql niyati_dev < be/migrations/20251206_02_create_refresh_tokens.up.sql
psql niyati_dev < be/migrations/20251206_03_create_oauth_accounts.up.sql
psql niyati_dev < be/migrations/20251206_04_create_password_resets.up.sql
```

### Services

```bash
# Auth service
cd be/bff-auth && npm install
cat > .env << EOF
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://user:password@localhost:5432/niyati_dev
ACCESS_TOKEN_SECRET=your-secret-key-min-32-chars
REFRESH_TOKEN_TTL_MS=2592000000
EOF
npm run dev

# Platform service
cd be/bff-platform && npm install
cat > .env << EOF
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/niyati_dev
ASTRO_API_KEY=your_key
GEOCODE_MAPS_KEY=your_key
EOF
npm run dev

# UI
cd ui && npm install
cat > .env << EOF
VITE_BFF_AUTH_URL=http://localhost:3001
VITE_BFF_PLATFORM_URL=http://localhost:3000
EOF
npm run dev
```

</details>

---

**Built with ❤️ using React, Node.js, PostgreSQL, and Docker**

---

## 📋 Quick Reference: All Docker Commands

### Start Services

| What | Command |
|------|---------|
| **Dev (all services)** | `docker compose up -d` |
| **Prod (all services)** | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` |
| **E2E tests** | `docker compose -f docker-compose.yml -f docker-compose.e2e.yml up --build e2e` |
| **Single service** | `docker compose up -d postgres` |
| **With rebuild** | `docker compose up -d --build` |

### Stop Services

| What | Command |
|------|---------|
| **Dev** | `docker compose down` |
| **Prod** | `docker compose -f docker-compose.yml -f docker-compose.prod.yml down` |
| **E2E** | `docker compose -f docker-compose.yml -f docker-compose.e2e.yml down` |
| **All + delete data** | `docker compose down -v` |
| **All + delete images** | `docker compose down --rmi all` |
| **Nuclear (everything)** | `docker compose down -v --rmi all --remove-orphans` |

### Monitor & Debug

| What | Command |
|------|---------|
| **List services** | `docker compose ps` |
| **View all logs** | `docker compose logs -f` |
| **View service logs** | `docker compose logs -f bff-auth` |
| **Check health** | `curl http://localhost:3001/api/v1/telemetry/health` |

### Common Workflows

| Task | Commands |
|------|----------|
| **Fresh start** | `docker compose down -v && docker compose up -d --build` |
| **Switch dev→prod** | `docker compose down && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` |
| **Rebuild service** | `docker compose build bff-auth && docker compose up -d bff-auth` |
| **Reset database** | `docker compose down -v postgres && docker compose up -d postgres` |

---

## 🆘 Troubleshooting

### "Port already in use"
```bash
# Find and stop conflicting services
docker compose down
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
docker compose -f docker-compose.yml -f docker-compose.e2e.yml down
```

### "Cannot connect to database"
```bash
# Check if postgres is healthy
docker compose ps postgres
docker compose logs postgres

# Restart database
docker compose restart postgres
```

### "Image won't delete"
```bash
# Stop all containers first
docker compose down
docker ps -aq | xargs docker rm -f

# Then remove images
docker images | grep niyati | awk '{print $3}' | xargs docker rmi -f
```

> **⚠️ Important:** Development and Production services share a Docker network. **Never run both environments simultaneously** to avoid port conflicts and data issues.

### Understanding the Compose Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Base configuration (dev mode) |
| `docker-compose.prod.yml` | Production overrides (extends base) |

Production requires **both files** together. This is Docker Compose's [override pattern](https://docs.docker.com/compose/how-it-works/#understanding-the-compose-file-model).

---

### 🔧 Development Environment

```bash
# 1. Stop all containers (dev + prod)
docker-compose down
docker-compose -f docker-compose.yml -f docker-compose.prod.yml down

# 2. Remove all niyati images (optional - forces full rebuild)
docker rmi $(docker images 'niyati-*' -q) 2>/dev/null || true

# 3. Build all images
docker-compose build

# 4. Start all containers
docker-compose up -d

# Verify
docker-compose ps
```

**One-liner (stop + build + start):**
```bash
docker-compose down && docker-compose up -d --build
```

---

### 🚀 Production Environment

```bash
# 1. Stop all containers (both environments)
docker-compose down
docker-compose -f docker-compose.yml -f docker-compose.prod.yml down -v

# 2. Remove all niyati images (optional - forces full rebuild)
docker rmi $(docker images 'niyati-*' -q) 2>/dev/null || true

# 3. Build all images
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

# 4. Run database migrations
docker-compose -f docker-compose.yml -f docker-compose.prod.yml run --rm migrate

# 5. Start all containers
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Verify
docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

**One-liner (stop + build + start):**
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml down && \
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

### 🧹 Full Cleanup (Reset Everything)

```bash
# Stop all containers
docker-compose down -v
docker-compose -f docker-compose.yml -f docker-compose.prod.yml down -v

# Remove all niyati containers, images, and volumes
docker rm $(docker ps -aq --filter "name=niyati-") 2>/dev/null || true
docker rmi $(docker images 'niyati-*' -q) 2>/dev/null || true
docker volume rm $(docker volume ls -q --filter "name=niyati") 2>/dev/null || true

# Verify cleanup
docker ps -a --filter "name=niyati-"
docker images 'niyati-*'
```