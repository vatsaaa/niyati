# 🐳 Docker Quick Reference

## Initial Setup (One-time)

```bash
# Run the setup script
./scripts/docker-setup.sh

# OR manually:
cp .env.bff.example .env.bff
cp .env.ui.example .env.ui
# Edit .env.bff with your API keys
nano .env.bff
```

## Daily Commands

```bash
# Start everything
./scripts/docker-dev.sh up

# View logs (all services)
./scripts/docker-dev.sh logs

# View BFF logs only
./scripts/docker-dev.sh logs-bff

# View UI logs only
./scripts/docker-dev.sh logs-ui

# Stop everything
./scripts/docker-dev.sh down

# Restart after code changes
./scripts/docker-dev.sh restart
```

## Development Workflow

### Making Code Changes
- Edit files normally - changes auto-reload!
- **BFF**: Server restarts automatically
- **UI**: Vite HMR updates browser instantly

### Installing New Package
```bash
# BFF
docker-compose exec bff-service npm install <package>

# UI
docker-compose exec ui-service npm install <package>
```

### Running Commands in Containers
```bash
# BFF commands
docker-compose exec bff-service npm run lint
docker-compose exec bff-service npm test

# UI commands
docker-compose exec ui-service npm run build
docker-compose exec ui-service npm run lint
```

### Opening a Shell
```bash
# BFF shell
./scripts/docker-dev.sh shell-bff

# UI shell
./scripts/docker-dev.sh shell-ui
```

## Troubleshooting

### Services won't start
```bash
# Check what's running
docker-compose ps

# View detailed logs
docker-compose logs bff-service
docker-compose logs ui-service

# Clean rebuild
./scripts/docker-dev.sh clean
./scripts/docker-dev.sh build
./scripts/docker-dev.sh up
```

### Port already in use
```bash
# Find what's using the port
lsof -i :3000  # or :5173

# Kill the process or stop Docker services
./scripts/docker-dev.sh down
```

### Changes not reflecting
```bash
# Restart service
docker-compose restart bff-service

# Or full rebuild
docker-compose up -d --build
```

### Out of space
```bash
# Clean old images/containers
docker system prune -a

# Remove volumes (careful - deletes data!)
docker-compose down -v
```

## URLs

- **UI (Development)**: http://localhost:5173
- **BFF API**: http://localhost:3000
- **Health Check**: http://localhost:3000/api/v1/telemetry/health

## File Locations

```
📁 Docker Configuration
├── docker-compose.yml          # Dev environment
├── docker-compose.prod.yml     # Production overrides
├── .env.bff                    # BFF environment (gitignored)
├── .env.ui                     # UI environment (gitignored)
├── .dockerignore               # Global excludes
├── nginx.conf                  # Production nginx config
│
📁 BFF
├── be/bff/Dockerfile          # Multi-stage build
└── be/bff/.dockerignore       # BFF-specific excludes
│
📁 UI
├── ui/Dockerfile              # Multi-stage build
└── ui/.dockerignore           # UI-specific excludes
│
📁 Scripts
├── scripts/docker-setup.sh    # Initial setup
└── scripts/docker-dev.sh      # Helper commands
```

## Production

```bash
# Build production images
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

# Start production
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Production URLs
# UI: http://localhost:80
# BFF: http://localhost:3000
```

## Need More Help?

- Full documentation: [DOCKER.md](DOCKER.md)
- Contributing guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Project overview: [README.md](README.md)
- Helper script: `./scripts/docker-dev.sh help`
