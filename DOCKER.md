# 🐳 Docker Setup Guide

This guide explains how to run Niyati using Docker for consistent development and production environments.

## 📋 Prerequisites

- Docker Engine 20.10+ ([Install Docker](https://docs.docker.com/get-docker/))
- Docker Compose 2.0+ (included with Docker Desktop)
- 4GB+ RAM allocated to Docker

## 🚀 Quick Start

### Development

```bash
# 1. Make helper script executable
chmod +x scripts/docker-dev.sh

# 2. Start all services
./scripts/docker-dev.sh up

# 3. Access the application
# UI: http://localhost:5173
# BFF: http://localhost:3000
```

That's it! The application is running with hot reload enabled.

### Production

```bash
# Build and start production services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Access the application
# UI: http://localhost:80
# BFF: http://localhost:3000
```

## 📁 Architecture

### Services

- **bff-service**: Node.js Express backend (port 3000)
- **ui-service**: React frontend with Vite dev server (port 5173) or Nginx (port 80)

### Network

All services run on a dedicated `niyati` bridge network for isolated communication.

```
┌─────────────────────────────────────────┐
│         Docker Network: niyati          │
│                                         │
│  ┌──────────────┐    ┌──────────────┐  │
│  │  bff-service │◄───┤  ui-service  │  │
│  │  (Node.js)   │    │  (Vite/Nginx)│  │
│  │  Port: 3000  │    │  Port: 5173  │  │
│  └──────────────┘    └──────────────┘  │
└─────────────────────────────────────────┘
          ▲                    ▲
    Host: 3000           Host: 5173
```

## 🛠️ Configuration

### Environment Variables

Two environment files control the services:

#### `.env.bff` (Backend)
```env
NODE_ENV=development
PORT=3000
ASTRO_API_KEY=your_key_here
GEOCODE_MAPS_KEY=your_key_here
LOG_LEVEL=debug
```

#### `.env.ui` (Frontend)
```env
VITE_BFF_BASE_URL=http://localhost:3000
VITE_APP_VERSION=0.1.0-dev
VITE_DEBUG_MODE=true
```

**Important**: Update `.env.bff` with your actual API keys before starting!

### Volume Mounts (Development)

Hot reload is enabled via volume mounts:

```yaml
bff-service:
  volumes:
    - ./be/bff:/app              # Source code
    - /app/node_modules          # Prevent host override

ui-service:
  volumes:
    - ./ui:/app                  # Source code
    - /app/node_modules          # Prevent host override
```

Changes to source code are reflected immediately without rebuilding.

## 📝 Common Commands

### Using Helper Script

```bash
# Start services
./scripts/docker-dev.sh up

# View all logs
./scripts/docker-dev.sh logs

# View BFF logs only
./scripts/docker-dev.sh logs-bff

# View UI logs only
./scripts/docker-dev.sh logs-ui

# Restart services
./scripts/docker-dev.sh restart

# Stop services
./scripts/docker-dev.sh down

# Rebuild images
./scripts/docker-dev.sh build

# Clean up (removes volumes)
./scripts/docker-dev.sh clean

# Open shell in BFF container
./scripts/docker-dev.sh shell-bff

# Open shell in UI container
./scripts/docker-dev.sh shell-ui

# Check service health
./scripts/docker-dev.sh health

# Show container status
./scripts/docker-dev.sh ps
```

### Using Docker Compose Directly

```bash
# Start services in background
docker-compose up -d

# View logs (follow mode)
docker-compose logs -f

# View logs for specific service
docker-compose logs -f bff-service

# Restart specific service
docker-compose restart ui-service

# Stop all services
docker-compose down

# Rebuild and restart
docker-compose up -d --build

# Remove volumes (clean slate)
docker-compose down -v

# Run command in container
docker-compose exec bff-service npm run lint
docker-compose exec ui-service npm run build
```

## 🔧 Development Workflow

### Making Code Changes

1. **Edit source files** - Changes are reflected immediately
2. **BFF**: Server restarts automatically with nodemon (if installed)
3. **UI**: Vite HMR updates browser without refresh

### Installing Dependencies

```bash
# BFF
docker-compose exec bff-service npm install <package>

# UI
docker-compose exec ui-service npm install <package>
```

Or edit `package.json` and rebuild:
```bash
docker-compose up -d --build
```

### Running Tests

```bash
# BFF tests
docker-compose exec bff-service npm test

# UI tests
docker-compose exec ui-service npm test

# Linting
docker-compose exec bff-service npm run lint
docker-compose exec ui-service npm run lint
```

### Debugging

**View logs:**
```bash
./scripts/docker-dev.sh logs-bff
```

**Open shell:**
```bash
./scripts/docker-dev.sh shell-bff
# or
docker-compose exec bff-service sh
```

**Inspect container:**
```bash
docker inspect niyati-bff-dev
```

## 🏗️ Multi-Stage Builds

### BFF Dockerfile Stages

1. **base** - Install dependencies
2. **development** - Include dev tools, source code mounted
3. **production** - Optimized, no devDependencies

### UI Dockerfile Stages

1. **deps** - Install all dependencies
2. **builder** - Build production bundle
3. **development** - Vite dev server with HMR
4. **production** - Nginx serving static files

## 🔒 Security Features

- **Non-root users** in all containers
- **Read-only mounts** for environment files
- **Security headers** in Nginx (CSP, X-Frame-Options)
- **Health checks** for monitoring
- **No secrets in images** - use environment files
- **Minimal base images** (Alpine Linux)

## 📊 Health Checks

Services include built-in health checks:

```bash
# Check BFF health
curl http://localhost:3000/api/v1/telemetry/health

# Check UI health (dev)
curl http://localhost:5173

# Check UI health (prod)
curl http://localhost:80/health
```

View health status:
```bash
docker-compose ps
```

## 🚢 Production Deployment

### Build Production Images

```bash
# Build with production target
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build
```

### Start Production Services

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Production Differences

- **UI**: Nginx serves pre-built static files (faster, more secure)
- **BFF**: No devDependencies, optimized for performance
- **Logging**: JSON format (not pretty-printed)
- **No hot reload**: Source code baked into images
- **Security**: Non-root users, minimal attack surface

### Production Checklist

- [ ] Update `.env.bff` with production API keys
- [ ] Set `NODE_ENV=production` in both env files
- [ ] Update `VITE_BFF_BASE_URL` for production domain
- [ ] Configure proper CORS origins in BFF config
- [ ] Set up SSL/TLS termination (external to Docker)
- [ ] Configure log aggregation
- [ ] Set up monitoring and alerting
- [ ] Use Docker secrets for sensitive data (Swarm/Kubernetes)

## 🧹 Cleanup

### Remove Stopped Containers
```bash
docker-compose down
```

### Remove Volumes
```bash
docker-compose down -v
```

### Remove Images
```bash
docker-compose down --rmi all
```

### Clean Everything (Docker-wide)
```bash
docker system prune -a --volumes
```

## ❓ Troubleshooting

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process or change port in .env.bff
PORT=3001
```

### Permission Denied

```bash
# Make helper script executable
chmod +x scripts/docker-dev.sh
```

### Node Modules Issues

```bash
# Clean rebuild
./scripts/docker-dev.sh clean
./scripts/docker-dev.sh build
./scripts/docker-dev.sh up
```

### Container Won't Start

```bash
# View detailed logs
docker-compose logs bff-service

# Check container status
docker-compose ps

# Inspect container
docker inspect niyati-bff-dev
```

### Changes Not Reflecting

1. **Check volume mounts**: `docker-compose ps` should show volumes
2. **Restart service**: `docker-compose restart bff-service`
3. **Rebuild**: `docker-compose up -d --build`

### Environment Variables Not Loading

1. **Check .env file exists**: `ls -la .env.bff .env.ui`
2. **Verify env_file in docker-compose.yml**
3. **Restart services**: `docker-compose down && docker-compose up -d`

## 📚 Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [Best Practices for Writing Dockerfiles](https://docs.docker.com/develop/dev-best-practices/)
- [Multi-stage Builds](https://docs.docker.com/build/building/multi-stage/)

## 💡 Tips

1. **Use helper script** - Simplifies common operations
2. **Check logs first** - Most issues are visible in logs
3. **Clean rebuild** - When in doubt, rebuild from scratch
4. **Health checks** - Monitor service health regularly
5. **Volume persistence** - Data in volumes survives container restarts

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines and Docker best practices.
