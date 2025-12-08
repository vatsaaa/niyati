# 🌟 Niyati

AI-powered astrology platform with personalized readings, geocoding, and authentication.

## 📋 Overview

Niyati is a modern full-stack application providing personalized astrological readings through an intuitive interface. The platform features:

- **React UI** - Modern, responsive interface with real-time interactions
- **Microservices Architecture** - Split BFF services for auth and platform features
- **PostgreSQL Database** - Secure user data and session management
- **Authentication** - JWT-based auth with refresh tokens
- **Astrology APIs** - Integration with external calculation services
- **Geocoding** - Location-based birth chart calculations
- **n8n Workflows** - Low-code automation and webhook handling
- **Ollama + Llama3.1** - Local LLM for AI-powered features
- **ngrok** - Secure tunneling for local development (webhooks)

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend (UI)                        │
│                    React + Vite + Tailwind                   │
│                      Port: 5173 (dev)                        │
└────────────────┬────────────────────────────────────────────┘
                 │
    ┌────────────┴────────────┐
    │                         │
┌───▼────────────┐    ┌───────▼──────────┐
│  BFF Auth      │    │  BFF Platform    │
│  Port: 3001    │    │  Port: 3000      │
│  - Login       │    │  - Geocoding     │
│  - Register    │    │  - Astrology     │
│  - Tokens      │    │  - Telemetry     │
└───┬────────────┘    └───────┬──────────┘
    │                         │
    │   ┌─────────────────────┘
    │   │
    │   │    ┌──────────────────┐
    └───┴────►   PostgreSQL     │
             │   Port: 5432     │
             │   - Users        │
             │   - Sessions     │
             │   - OAuth        │
             └──────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              AI & Workflow Automation Layer                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │   n8n Workflows  │────────►│ Ollama (Llama3.1)│          │
│  │   Port: 5678     │         │  Local LLM       │          │
│  │   - Webhooks     │         │  AI Processing   │          │
│  │   - Automation   │         │                  │          │
│  │   - AI Agent     │         │                  │          │
│  └────────┬─────────┘         └──────────────────┘          │
│           │                                                 │
│           │ (exposed via)                                   │
│           ▼                                                 │
│  ┌──────────────────┐                                       │
│  │      ngrok       │                                       │
│  │  Secure Tunnel   │                                       │
│  │  (Dev Only)      │                                       │
│  └──────────────────┘                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
niyati/
├── be/
│   ├── bff-auth/           # Authentication service (port 3001)
│   │   ├── lib/           # Auth-specific modules
│   │   ├── src/           # Entry point
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── bff-platform/      # Platform service (port 3000)
│   │   ├── lib/           # Platform routes
│   │   ├── services/      # Business logic
│   │   ├── src/           # Entry point
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── commons/           # Shared libraries
│   │   ├── lib/          # Logger, responses, sanitize, etc.
│   │   ├── config/       # Environment configs
│   │   └── index.js
│   ├── migrations/        # Database schema
│   └── scripts/          # Utility scripts
├── ui/                    # React frontend
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml     # Development setup
└── scripts/              # Helper scripts
```

## 🚀 Quick Start

### Prerequisites

- **Docker** and **Docker Compose** (recommended)
- OR **Node.js 20.x** + **PostgreSQL 15+** (manual setup)
- **Ollama** - For AI features ([Install Ollama](https://ollama.ai))
- **n8n** - For workflow automation (`npm install -g n8n`)
- **ngrok** - For webhook tunneling (dev only) ([Get ngrok](https://ngrok.com))

### Using Docker (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/vatsaaa/niyati.git
cd niyati

# 2. Create environment files
cp .env.example .env
cp .env.bff.auth.example .env.bff.auth
cp .env.bff.platform.example .env.bff.platform
cp .env.ui.example .env.ui

# 3. Edit environment files with your API keys
nano .env.bff.auth      # Add JWT secrets
nano .env.bff.platform  # Add astrology & geocoding API keys

# 4. Start all services
docker-compose up -d

# 5. Check service health
docker-compose ps
curl http://localhost:3001/api/v1/telemetry/health  # Auth service
curl http://localhost:3000/api/v1/telemetry/health  # Platform service

# 6. Start AI and Workflow services (optional, for AI features)
# Pull and run Llama3.1 model with Ollama
ollama pull llama3.1
ollama serve

# In a new terminal, start ngrok tunnel for n8n webhooks
ngrok http 5678
# Copy the forwarding URL (e.g., https://abc123.ngrok-free.app)

# In another terminal, start n8n with webhook URL
WEBHOOK_URL=https://your-ngrok-url.ngrok-free.app n8n start

# 7. Access the application
# UI: http://localhost:5173
# Auth API: http://localhost:3001
# Platform API: http://localhost:3000
# Database: localhost:5432
# n8n Editor: http://localhost:5678
# n8n Webhooks: https://your-ngrok-url.ngrok-free.app
```

### Manual Setup (Without Docker)

<details>
<summary>Click to expand manual setup instructions</summary>

#### 1. Database Setup

```bash
# Install PostgreSQL 15+
# Create database
createdb niyati_dev

# Run migrations
psql niyati_dev < be/migrations/20251206_01_create_users.up.sql
psql niyati_dev < be/migrations/20251206_02_create_refresh_tokens.up.sql
psql niyati_dev < be/migrations/20251206_03_create_oauth_accounts.up.sql
psql niyati_dev < be/migrations/20251206_04_create_password_resets.up.sql
```

#### 2. Auth Service Setup

```bash
cd be/bff-auth
npm install

# Create .env file
cat > .env << EOF
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://user:password@localhost:5432/niyati_dev
ACCESS_TOKEN_SECRET=your-secret-key-min-32-chars
REFRESH_TOKEN_TTL_MS=2592000000
EOF

npm run dev
```

#### 3. Platform Service Setup

```bash
cd be/bff-platform
npm install

# Create .env file
cat > .env << EOF
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/niyati_dev
ASTRO_API_KEY=your_astrology_api_key
GEOCODE_MAPS_KEY=your_geocode_api_key
EOF

npm run dev
```

#### 4. UI Setup

```bash
cd ui
npm install

# Create .env file
cat > .env << EOF
VITE_BFF_AUTH_URL=http://localhost:3001
VITE_BFF_PLATFORM_URL=http://localhost:3000
VITE_APP_VERSION=0.1.0-dev
EOF

npm run dev
```

</details>

## 🔧 Development

### Database Management

Use the provided `db.sh` script for database operations:

```bash
# Start PostgreSQL
./scripts/db.sh start

# Check database health
./scripts/db.sh health

# Connect to PostgreSQL shell
./scripts/db.sh psql

# Run migrations
./scripts/db.sh migrate

# Seed test data
./scripts/db.sh seed

# View database logs
./scripts/db.sh logs

# Backup database
./scripts/db.sh backup my_backup.sql

# Restore database
./scripts/db.sh restore my_backup.sql

# Reset database (WARNING: destructive)
./scripts/db.sh reset

# Use with production config
./scripts/db.sh start --prod
./scripts/db.sh health --prod
```

### Docker Commands

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f                    # All services
docker-compose logs -f bff-auth          # Auth service only
docker-compose logs -f bff-platform      # Platform service only
docker-compose logs -f ui-service        # UI only

# Development SMTP / Email
For local development you can run MailHog to capture outbound email sent by the BFF services:

```bash
# Start MailHog (MailHog is included in `docker-compose.yml` as service `mailhog`)
docker-compose up -d mailhog

# MailHog Web UI: http://localhost:8025
# SMTP port for apps: localhost:1025
```

Configure your BFF `.env` files (see `.env.bff.auth.example` / `.env.bff.platform.example`) to point to the SMTP host/port (`SMTP_HOST=mailhog` / `SMTP_PORT=1025`) when developing locally.

# Rebuild after code changes
docker-compose build bff-auth bff-platform ui-service
docker-compose up -d

# Stop services
docker-compose down

# Clean restart (removes volumes)
docker-compose down -v
docker-compose up -d
```

### Available Scripts

#### Auth Service
```bash
cd be/bff-auth
npm run dev              # Start dev server with hot reload
npm start                # Start production server
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint issues
```

#### Platform Service
```bash
cd be/bff-platform
npm run dev              # Start dev server with hot reload
npm start                # Start production server
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint issues
```

#### UI
```bash
cd ui
npm run dev              # Start Vite dev server (HMR enabled)
npm run build            # Build for production
npm run preview          # Preview production build
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint issues
npm test                 # Run Playwright tests
```

### Making Code Changes

- **Hot reload enabled**: Edit files and see changes instantly
- **BFF services**: Auto-restart on file changes
- **UI**: Vite HMR updates browser immediately
- **Database migrations**: Place in `be/migrations/` (auto-loaded on container start)

### Installing New Packages

```bash
# In running containers
docker-compose exec bff-auth npm install <package>
docker-compose exec bff-platform npm install <package>
docker-compose exec ui-service npm install <package>

# Then rebuild
docker-compose build bff-auth  # or bff-platform, ui-service
docker-compose up -d
```

## 🔒 Security

### Authentication Flow

1. User registers/logs in via `/api/v1/auth/register` or `/api/v1/auth/login`
2. Server returns:
   - **Access token** (JWT, 15min expiry) - for API requests
   - **Refresh token** (opaque, 30-day expiry) - for token renewal
3. Client stores tokens securely
4. Client sends access token in `Authorization: Bearer <token>` header
5. When access token expires, use refresh token at `/api/v1/auth/token` to get new tokens
6. Refresh tokens are rotated on each use (old token revoked, new one issued)

### Security Features

- **JWT-based authentication** with short-lived access tokens
- **Refresh token rotation** for enhanced security
- **Bcrypt password hashing** with configurable rounds
- **Rate limiting** on all endpoints
- **Helmet.js** security headers
- **CORS** configured per environment
- **Input sanitization** (XSS and injection protection)
- **Timing-safe comparisons** (prevents timing attacks)
- **Environment variable validation** (fail-fast on missing secrets)

### Environment Variables Security

**Never commit these files:**
- `.env`
- `.env.bff.auth`
- `.env.bff.platform`
- `.env.ui`

**Required secrets:**
```bash
# Auth Service
ACCESS_TOKEN_SECRET=<min-32-char-random-string>
REFRESH_TOKEN_TTL_MS=2592000000  # 30 days

# Platform Service
ASTRO_API_KEY=<your-key>
GEOCODE_MAPS_KEY=<your-key>

# Database
POSTGRES_PASSWORD=<strong-password>
```

## 🌍 Environment Configuration

The application supports environment-specific configurations:

- **development** - Local dev with verbose logging
- **staging** - Pre-production testing
- **production** - Live production with strict security

### Configuration Files

```
be/commons/config/
├── default.js       # Base configuration
├── development.js   # Dev overrides (verbose logging, relaxed limits)
├── staging.js       # Staging overrides
└── production.js    # Production overrides (strict limits, minimal logging)
```

### Key Differences

| Setting | Development | Production |
|---------|-------------|------------|
| Log Level | `debug` | `info` |
| Rate Limit (General) | 1000/min | 100/min |
| Rate Limit (Strict) | 200/min | 20/min |
| CORS | `localhost` | Configured domains |
| Pretty Logs | Yes | No (JSON) |

### Switching Environments

```bash
# Docker
NODE_ENV=production docker-compose up

# Manual
NODE_ENV=production npm start
```

## 📊 API Endpoints

### Auth Service (http://localhost:3001)

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/v1/auth/register` | POST | Register new user | No |
| `/api/v1/auth/login` | POST | Login user | No |
| `/api/v1/auth/token` | POST | Refresh access token | No |
| `/api/v1/auth/logout` | POST | Revoke refresh token | No |
| `/api/v1/auth/me` | GET | Get user profile | Yes |
| `/api/v1/auth/request-password-reset` | POST | Request password reset | No |
| `/api/v1/auth/reset-password` | POST | Reset password | No |
| `/api/v1/telemetry/health` | GET | Health check | No |
| `/api/v1/telemetry/info` | GET | System info | No |

### Platform Service (http://localhost:3000)

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/v1/geocode` | POST | Geocode location | No |
| `/api/v1/astrology/compute` | POST | Calculate birth chart | No |
| `/api/v1/telemetry/health` | GET | Health check | No |
| `/api/v1/telemetry/info` | GET | System info | No |

## 🛠️ Technology Stack

### Backend
- **Node.js 20-alpine** - JavaScript runtime
- **Express 4.x** - Web framework
- **PostgreSQL 15** - Relational database
- **Pino** - Structured logging
- **JWT** - Token-based auth
- **Bcrypt** - Password hashing
- **Helmet** - Security headers
- **Rate limiting** - API protection

### Frontend
- **React 19** - UI library
- **Vite 7** - Build tool & dev server
- **TailwindCSS 3** - Utility-first CSS
- **Axios** - HTTP client
- **Lucide React** - Icon library

### AI & Workflow Automation
- **Ollama** - Local LLM runtime
- **Llama3.1** - Open-source language model
- **n8n** - Workflow automation and webhook orchestration
- **ngrok** - Secure tunneling for local webhook testing

### DevOps
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration
- **GitHub Actions** - CI/CD (optional)

### Caching & Sessions
- **Redis** - Optional, recommended for production rate-limiting, sessions and caching

To enable Redis in development, the `docker-compose.yml` includes a `redis` service. In production, add `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT` in your environment and ensure `docker-compose.prod.yml` includes a `redis` service.

Example env vars:
```bash
REDIS_URL=redis://redis:6379
# or
REDIS_HOST=redis
REDIS_PORT=6379
```

If you want express-rate-limit to use Redis in production, install `rate-limit-redis` and update `be/commons/lib/rateLimiter.js` to use a Redis store. Example:

```javascript
const RedisStore = require('rate-limit-redis');
const redisClient = require('redis').createClient({ url: process.env.REDIS_URL });

const loginLimiter = rateLimit({
   store: new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args) }),
   windowMs: 15*60*1000,
   max: 5
});
```

## 🚢 Production Deployment

### Secrets Management

Production uses Docker secrets to avoid storing credentials in env files or compose config.

**1. Create secret files:**
```bash
# Create secrets directory (do this once)
mkdir -p secrets

# Generate and store secrets
echo -n "$(openssl rand -hex 32)" > secrets/postgres_password.txt
echo -n "$(openssl rand -hex 64)" > secrets/jwt_secret.txt
echo -n "$(openssl rand -hex 32)" > secrets/worker_token.txt

# SMTP credentials (if using email)
echo -n "smtp_user@example.com" > secrets/smtp_user.txt
echo -n "smtp_password_here" > secrets/smtp_password.txt

# AWS credentials (for backups)
echo -n "AKIAIOSFODNN7EXAMPLE" > secrets/aws_access_key_id.txt
echo -n "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" > secrets/aws_secret_access_key.txt

# Secure the files
chmod 600 secrets/*.txt
```

**2. On production server (recommended):**
```bash
# Store secrets outside repo in secure location
sudo mkdir -p /etc/niyati/secrets
sudo chmod 700 /etc/niyati/secrets

# Create secrets (example)
echo -n "production_password" | sudo tee /etc/niyati/secrets/postgres_password.txt
sudo chmod 600 /etc/niyati/secrets/*.txt

# Update docker-compose.prod.yml secret paths to point to /etc/niyati/secrets/
```

### Docker Production Build

```bash
# 1. Ensure secrets are created (see above)
ls -la secrets/  # Verify secret files exist

# 2. Set non-sensitive environment variables
export POSTGRES_USER=niyati_prod
export POSTGRES_DB=niyati_prod
export DOMAIN=yourdomain.com
export CADDY_EMAIL=admin@yourdomain.com

# Edit environment files with production values (non-secret only)
nano .env.bff.auth        # Add production config (NOT secrets)
nano .env.bff.platform    # Add production API URLs
nano .env.ui              # Add production API URLs

# 3. Run database migrations
docker-compose -f docker-compose.yml -f docker-compose.prod.yml run --rm migrate

# 4. Build and start services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 5. Verify health
curl https://yourdomain.com/health
curl https://yourdomain.com/api/v1/auth/health
curl https://yourdomain.com/api/v1/platform/health

# 6. Check logs
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f caddy
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f bff-auth
```

**Production Configuration Highlights:**
- **Secrets:** Stored in `./secrets/` (gitignored) or `/etc/niyati/secrets/`
- **TLS:** Caddy handles automatic HTTPS with Let's Encrypt
- **Reverse Proxy:** All traffic routes through Caddy
- Services use internal networking (no published ports except Caddy 80/443)
- PostgreSQL optimized for production workload
- Logging: JSON format, info level
- Automatic restart on failure
- Health checks on all services
- Persistent volumes for database, Redis, Caddy certs

### Production Checklist

**Pre-Deployment:**
- [x] Secrets management (Docker secrets configured)
- [x] Reverse proxy with TLS (Caddy added)
- [x] One-shot migrations service
- [x] Automated DB backups
- [ ] Update all `.env` files with production values (non-secrets)
- [ ] Set `DOMAIN` and `CADDY_EMAIL` for Caddy
- [ ] Configure DNS A record pointing to server
- [ ] Update CORS origins in `be/commons/config/production.js`
- [ ] Review rate limits
- [ ] Remove debug/test endpoints
- [ ] Run security audit (`npm audit`)

**Infrastructure:**
- [x] SSL/TLS certificates (Caddy auto-HTTPS)
- [x] Reverse proxy (Caddy)
- [x] Database backups (automated to S3)
- [ ] Configure log aggregation (optional)
- [ ] Set up monitoring/alerting (optional)
- [ ] Configure alerts (downtime, errors)
- [ ] Implement CDN for static assets
### Health Checks

```bash
# Service health (production)
curl http://localhost:3001/api/v1/telemetry/health  # Auth service
curl http://localhost:3000/api/v1/telemetry/health  # Platform service

# Database health
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres pg_isready -U niyati_prod

# Container status
docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f bff-auth
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f bff-platform
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f ui-service
```

### Reverse Proxy Setup (Nginx)

For production, use Nginx as a reverse proxy:

```nginx
# /etc/nginx/sites-available/niyati
server {
    listen 80;
    server_name your-domain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/ssl/certs/your-domain.crt;
    ssl_certificate_key /etc/ssl/private/your-domain.key;

    # Auth API
    location /api/v1/auth/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Platform API
    location /api/v1/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # UI
    location / {
        proxy_pass http://127.0.0.1:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```ost-Deployment:**
- [ ] Verify all services healthy
- [ ] Test authentication flow
- [ ] Test core features
- [ ] Monitor logs for errors
- [ ] Set up backup verification
- [ ] Document rollback procedure

### Health Checks

```bash
# Service health
curl http://localhost:3001/api/v1/telemetry/health
curl http://localhost:3000/api/v1/telemetry/health

# Database health
docker-compose exec postgres pg_isready -U niyati

# Container status
docker-compose ps
```

### Monitoring

**Key Metrics to Monitor:**
- Response times (p50, p95, p99)
- Error rates (4xx, 5xx)
- Request throughput (req/sec)
- Database connections
- Memory usage
- CPU usage
- Disk I/O

**Recommended Tools:**
- Prometheus + Grafana
- ELK Stack (logs)
- Sentry (error tracking)
- Uptime monitors

## 🧪 Testing

```bash
# UI tests (Playwright)
cd ui
npm test                      # Run all tests
npm test -- --headed          # Run with browser visible
npm test -- --debug           # Debug mode

# BFF tests (if configured)
cd be/bff-auth
npm test

cd be/bff-platform
npm test
```

## 🐛 Troubleshooting

### Services won't start

```bash
# Check logs
docker-compose logs bff-auth
docker-compose logs bff-platform
docker-compose logs postgres

# Verify environment variables
docker-compose exec bff-auth env | grep DATABASE_URL

# Clean rebuild
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

### Database connection issues

```bash
# Verify postgres is running
docker-compose ps postgres

# Check database logs
docker-compose logs postgres

# Test connection
docker-compose exec postgres psql -U niyati -d niyati_dev -c "SELECT 1;"
```

### Port conflicts

```bash
# Check what's using ports
lsof -i :3000  # Platform service
lsof -i :3001  # Auth service
lsof -i :5432  # PostgreSQL
lsof -i :5173  # UI dev server

# Change ports in docker-compose.yml if needed
```

## 📝 Development Guidelines

### Code Style

- **ESLint** - JavaScript linting
- **Prettier** - Code formatting
- Run `npm run lint:fix` before committing

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/your-feature

# Make changes and commit
git add .
git commit -m "feat: add feature description"

# Push and create PR
git push origin feature/your-feature
```

### Commit Message Format

```
type(scope): subject

Examples:
feat(auth): add password reset functionality
fix(geocode): handle empty location results
docs(readme): update deployment instructions
chore(deps): update dependencies
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run linting and tests
6. Submit a pull request

## 📄 License

This project is private and proprietary.

## 🙏 Support

For issues, questions, or contributions:
- Create an issue on GitHub
- Contact the development team

---

## 🤖 AI & Workflow Automation

### Ollama Setup (Local LLM)

```bash
# Install Ollama (macOS)
brew install ollama

# Or download from https://ollama.ai

# Pull Llama3.1 model
ollama pull llama3.1

# Start Ollama server
ollama serve

# Test the model
ollama run llama3.1 "Hello, how are you?"
```

### n8n Workflow Automation

```bash
# Install n8n globally
npm install -g n8n

# Start ngrok to expose n8n webhooks
ngrok http 5678
# Copy the forwarding URL (e.g., https://abc-123-def.ngrok-free.app)

# Start n8n with webhook URL
WEBHOOK_URL=https://your-ngrok-url.ngrok-free.app n8n start

# Access n8n editor
# Browser opens automatically, or visit http://localhost:5678
```

### n8n Workflow Configuration

1. **Import Niyati Workflow:**
   - Open n8n editor (http://localhost:5678)
   - Import `be/n8n/NiyatiWorkflow.json`

2. **Configure Webhook Nodes:**
   - Update webhook URLs with your ngrok URL
   - Test webhook endpoints

3. **Connect to Ollama:**
   - Configure AI agent nodes to use local Ollama
   - Model: `llama3.1`
   - Endpoint: `http://localhost:11434`

4. **Activate Workflow:**
   - Toggle workflow to "Active"
   - Monitor execution logs

### ngrok Configuration

```bash
# Sign up and get auth token from https://dashboard.ngrok.com
ngrok config add-authtoken YOUR_AUTH_TOKEN

# Start tunnel for n8n
ngrok http 5678

# Start tunnel for BFF (if needed for external testing)
ngrok http 3000  # Platform service
ngrok http 3001  # Auth service
```

### Development Workflow with AI

1. **Start all services:**
   ```bash
   # Terminal 1: Start Docker services
   docker-compose up -d
   
   # Terminal 2: Start Ollama
   ollama serve
   
   # Terminal 3: Start ngrok
   ngrok http 5678
   
   # Terminal 4: Start n8n
   WEBHOOK_URL=https://your-ngrok-url.ngrok-free.app n8n start
   ```

2. **Test AI features:**
   - Send requests to n8n webhooks
   - Monitor n8n execution logs
   - Check Ollama responses

3. **Debug workflow:**
   - Use n8n's built-in execution viewer
   - Check `be/n8n/ai_agent_prompt.txt` for AI instructions
   - Review webhook payloads in `be/scripts/sample_event.json`

---

**Built with ❤️ using React, Node.js, PostgreSQL, and Docker**
