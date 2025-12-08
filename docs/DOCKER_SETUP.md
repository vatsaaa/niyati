# Docker Setup Guide - Niyati

## Overview

The Niyati application uses Docker Compose for containerized deployment with the following services:
- **PostgreSQL** - Database (separate, persistent)
- **BFF** - Backend-for-Frontend API service
- **UI** - React frontend

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Niyati Network                      │
│                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────┐ │
│  │    UI    │───▶│   BFF    │───▶│   PostgreSQL     │ │
│  │  :5173   │    │  :3000   │    │     :5432        │ │
│  └──────────┘    └──────────┘    └──────────────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Files

- `docker-compose.yml` - Development configuration
- `docker-compose.prod.yml` - Production overrides
- `.env` - Root environment variables (DB credentials)
- `.env.bff` - BFF service environment variables
- `.env.ui` - UI service environment variables

## Quick Start

### 1. Setup Environment

```bash
# Copy environment templates
cp .env.example .env
cp .env.bff.example .env.bff
cp .env.ui.example .env.ui

# Edit .env files with your configuration
# IMPORTANT: Set ACCESS_TOKEN_SECRET in .env.bff
openssl rand -base64 32  # Generate secret
```

### 2. Start Services

```bash
# Start all services (development)
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### 3. Initialize Database

```bash
# Option 1: Using helper script
./scripts/db.sh migrate
./scripts/db.sh seed

# Option 2: Manual
docker exec -it niyati-bff-dev npm run migrate:test
docker exec -it niyati-bff-dev npm run seed:test
```

### 4. Verify Setup

```bash
# Check database health
./scripts/db.sh health

# Test BFF
curl http://localhost:3000/api/v1/telemetry/health

# Open UI
open http://localhost:5173
```

## PostgreSQL Service

### Separate & Isolated

The PostgreSQL service is:
- ✅ **Separate container** - Runs independently from BFF
- ✅ **Persistent storage** - Data survives container restarts
- ✅ **Health checks** - Ensures database is ready before BFF starts
- ✅ **Network isolated** - Only accessible within Docker network
- ✅ **Production-ready** - Optimized settings for prod deployment

### Configuration

#### Development
```yaml
# From docker-compose.yml
postgres:
  image: postgres:15-alpine
  environment:
    POSTGRES_USER: niyati
    POSTGRES_PASSWORD: niyati_dev_pass
    POSTGRES_DB: niyati_dev
  volumes:
    - postgres-data:/var/lib/postgresql/data
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U niyati -d niyati_dev"]
```

#### Production
```yaml
# From docker-compose.prod.yml
postgres:
  environment:
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?must be set}
  ports:
    - "127.0.0.1:5432:5432"  # Only localhost access
  volumes:
    - postgres-data-prod:/var/lib/postgresql/data
```

### Performance Tuning

The PostgreSQL service includes optimized settings:

**Development**:
- `max_connections=100`
- `shared_buffers=256MB`
- `effective_cache_size=1GB`

**Production**:
- `max_connections=200`
- `shared_buffers=1GB`
- `effective_cache_size=3GB`
- `max_parallel_workers=4`
- Query logging for slow queries (>1s)

### Database Management

Use the provided helper script:

```bash
# Start/stop database
./scripts/db.sh start
./scripts/db.sh stop
./scripts/db.sh restart

# Check health
./scripts/db.sh health
./scripts/db.sh status

# Database operations
./scripts/db.sh psql           # Connect to psql shell
./scripts/db.sh migrate        # Run migrations
./scripts/db.sh seed           # Insert test data
./scripts/db.sh logs           # View logs

# Backup/restore
./scripts/db.sh backup backup.sql
./scripts/db.sh restore backup.sql

# Reset (WARNING: destructive)
./scripts/db.sh reset

# Production mode
./scripts/db.sh start --prod
./scripts/db.sh psql --prod
```

## Service Dependencies

### Startup Order

1. **PostgreSQL** starts first
   - Health check waits for `pg_isready`
   - Migrations directory mounted (optional init)

2. **BFF** starts after PostgreSQL is healthy
   - `depends_on.postgres.condition: service_healthy`
   - Connects via `DATABASE_URL` environment variable
   - Connection pooling with `pg.Pool`

3. **UI** starts after BFF
   - Proxies API requests to BFF
   - No direct database access

### Connection String

The BFF connects to PostgreSQL using:

```bash
# Development
DATABASE_URL=postgresql://niyati:niyati_dev_pass@postgres:5432/niyati_dev

# Production  
DATABASE_URL=postgresql://niyati_prod:${POSTGRES_PASSWORD}@postgres:5432/niyati_prod
```

**Note**: The hostname is `postgres` (Docker service name), not `localhost`.

## Volumes & Persistence

### PostgreSQL Data

**Development**:
```bash
# Volume name: postgres-data
docker volume inspect niyati_postgres-data

# Data persists across container recreations
docker-compose down      # Containers removed, data persists
docker-compose up -d     # Data restored from volume
```

**Production**:
```bash
# Volume name: postgres-data-prod
docker volume inspect niyati_postgres-data-prod

# Backup volume
docker run --rm -v niyati_postgres-data-prod:/data -v $(pwd):/backup \
  alpine tar czf /backup/postgres-backup.tar.gz /data
```

### Complete Reset

```bash
# Remove containers and volumes (WARNING: data loss)
docker-compose down -v

# Remove only database volume
docker volume rm niyati_postgres-data
```

## Networking

All services communicate via the `niyati` bridge network:

```bash
# Inspect network
docker network inspect niyati

# Service discovery
# - postgres:5432 (database)
# - bff-service:3000 (API)
# - ui-service:5173 (frontend)
```

### Port Mapping

| Service    | Internal Port | Host Port | Access             |
|------------|---------------|-----------|-------------------|
| PostgreSQL | 5432          | 5432      | localhost:5432    |
| BFF        | 3000          | 3000      | localhost:3000    |
| UI         | 5173          | 5173      | localhost:5173    |

**Production**: PostgreSQL only exposed to `127.0.0.1:5432` (localhost only).

## Development Workflow

### Live Reload

Both BFF and UI support hot reload:

```yaml
# Source code mounted as volume
volumes:
  - ./be/bff:/app
  - /app/node_modules  # Prevent overwrite
```

Changes to source code automatically reload the service.

### Running Migrations

```bash
# Inside BFF container
docker exec -it niyati-bff-dev npm run migrate:test

# Or using helper script
./scripts/db.sh migrate
```

### Accessing Services

```bash
# Connect to PostgreSQL
./scripts/db.sh psql

# Or directly
docker exec -it niyati-postgres-dev psql -U niyati -d niyati_dev

# Execute commands in BFF
docker exec -it niyati-bff-dev npm test

# View logs
docker-compose logs -f postgres
docker-compose logs -f bff-service
```

## Production Deployment

### 1. Prepare Environment

```bash
# Generate strong password
export POSTGRES_PASSWORD=$(openssl rand -base64 32)

# Set in .env
echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" >> .env

# Set ACCESS_TOKEN_SECRET in .env.bff
export ACCESS_TOKEN_SECRET=$(openssl rand -base64 32)
echo "ACCESS_TOKEN_SECRET=$ACCESS_TOKEN_SECRET" >> .env.bff
```

### 2. Deploy

```bash
# Pull images (if using registry)
docker-compose -f docker-compose.yml -f docker-compose.prod.yml pull

# Start services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Check health
./scripts/db.sh health --prod
curl http://localhost:3000/api/v1/telemetry/health
```

### 3. Run Migrations

```bash
# Production migrations
docker exec -it niyati-bff-prod npm run migrate:test
```

### 4. Monitor

```bash
# View logs
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Check resource usage
docker stats
```

## Troubleshooting

### Database Connection Issues

**Problem**: BFF can't connect to PostgreSQL

```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Check health
./scripts/db.sh health

# Check BFF logs
docker logs niyati-bff-dev

# Verify DATABASE_URL
docker exec niyati-bff-dev env | grep DATABASE_URL
```

### Port Conflicts

**Problem**: Port already in use

```bash
# Find process using port
lsof -ti:5432  # PostgreSQL
lsof -ti:3000  # BFF
lsof -ti:5173  # UI

# Change port in docker-compose.yml
ports:
  - "15432:5432"  # Map to different host port
```

### Data Persistence Issues

**Problem**: Data lost after restart

```bash
# Check volumes exist
docker volume ls | grep niyati

# Inspect volume
docker volume inspect niyati_postgres-data

# Verify mount
docker inspect niyati-postgres-dev | grep -A 10 Mounts
```

### Migration Failures

**Problem**: Migrations fail

```bash
# Check database is accessible
./scripts/db.sh psql

# Run migration script manually
docker exec -it niyati-bff-dev node scripts/run_migrations.js

# Check migration files
docker exec -it niyati-bff-dev ls -la migrations/

# View migration logs
docker logs niyati-bff-dev
```

## Security Considerations

### Production Checklist

- [ ] Strong `POSTGRES_PASSWORD` set (32+ characters)
- [ ] `ACCESS_TOKEN_SECRET` set (32+ characters)
- [ ] PostgreSQL not exposed externally (127.0.0.1 only)
- [ ] `.env` files not committed to Git
- [ ] SSL/TLS enabled for PostgreSQL connections
- [ ] Regular database backups configured
- [ ] Resource limits set on containers
- [ ] Secrets managed via Docker secrets or vault

### Network Security

```bash
# Production: Don't expose PostgreSQL to host
ports:
  # - "5432:5432"  # REMOVE THIS
  - "127.0.0.1:5432:5432"  # Only localhost

# Or remove port mapping entirely (internal only)
# ports: []
```

### Backup Strategy

```bash
# Automated backup script
#!/bin/bash
BACKUP_DIR=/backups
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker exec niyati-postgres-prod pg_dump -U niyati_prod -d niyati_prod \
  | gzip > $BACKUP_DIR/niyati_$TIMESTAMP.sql.gz

# Keep last 7 days
find $BACKUP_DIR -name "niyati_*.sql.gz" -mtime +7 -delete
```

## Advanced Configuration

### Custom PostgreSQL Configuration

Create `be/bff/postgres.conf`:

```conf
# Custom PostgreSQL settings
max_connections = 150
shared_buffers = 512MB
```

Mount in docker-compose.yml:

```yaml
postgres:
  volumes:
    - ./be/bff/postgres.conf:/etc/postgresql/postgresql.conf:ro
  command: postgres -c config_file=/etc/postgresql/postgresql.conf
```

### SSL/TLS

Enable SSL for PostgreSQL:

```yaml
postgres:
  environment:
    POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256"
  volumes:
    - ./certs/server.crt:/var/lib/postgresql/server.crt:ro
    - ./certs/server.key:/var/lib/postgresql/server.key:ro
  command: |
    postgres
    -c ssl=on
    -c ssl_cert_file=/var/lib/postgresql/server.crt
    -c ssl_key_file=/var/lib/postgresql/server.key
```

### Resource Limits

Set container resource limits:

```yaml
services:
  postgres:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '1.0'
          memory: 1G
```

## References

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL Docker Hub](https://hub.docker.com/_/postgres)
- [PostgreSQL Configuration](https://www.postgresql.org/docs/15/runtime-config.html)
- [Docker Networking](https://docs.docker.com/network/)

## Support

For issues or questions:
1. Check logs: `docker-compose logs -f`
2. Verify health: `./scripts/db.sh health`
3. Review this guide
4. Check `docs/AUTH_SECURITY.md` for auth setup
