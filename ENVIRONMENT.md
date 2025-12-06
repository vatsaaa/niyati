# Environment Configuration Guide

This project supports environment-specific configurations for both the BFF (Backend-for-Frontend) and UI applications.

## Environment Types

- **development** - Local development with verbose logging and relaxed limits
- **staging** - Pre-production testing environment with production-like settings
- **production** - Live production environment with strict security and performance settings

## BFF (Backend-for-Frontend) Configuration

### Directory Structure

```
be/bff/config/
├── index.js         # Config loader with env variable override support
├── default.js       # Base configuration values
├── development.js   # Development overrides
├── staging.js       # Staging overrides
└── production.js    # Production overrides
```

### How It Works

1. Environment is determined by `NODE_ENV` environment variable
2. Config loader reads the corresponding file (e.g., `development.js` for `NODE_ENV=development`)
3. Environment variables can override any config value
4. Falls back to `default.js` if environment-specific file is missing

### Running the BFF

```bash
# Development (default)
npm run dev

# Staging
npm run start:staging

# Production
npm run start:prod
```

### Key Configuration Differences

| Setting | Development | Staging | Production |
|---------|-------------|---------|------------|
| Rate Limit (General) | 1000/min | 150/min | 100/min |
| Rate Limit (Strict) | 200/min | 30/min | 20/min |
| Logging Level | debug | info | info |
| Pretty Print Logs | Yes | No | No |
| Webhook Route | Enabled | Disabled | Disabled |
| Probe Endpoint | Enabled | Disabled | Disabled |
| CORS Origins | localhost | staging URLs | production URLs |
| Compression Level | 6 | 6 | 9 (max) |

### Environment Variable Overrides

Any config value can be overridden via environment variables:

```bash
# Override port
PORT=8080 npm run dev

# Override rate limits
RATE_LIMIT_MAX_REQUESTS=500 npm run start:prod

# Override log level
LOG_LEVEL=debug npm run start:staging
```

## UI Configuration

### Directory Structure

```
ui/src/config/
└── index.js         # Environment-specific config with Vite integration
```

### Environment Files

```
ui/
├── .env.development   # Development environment variables
├── .env.staging       # Staging environment variables
├── .env.production    # Production environment variables
└── .env.local         # Local overrides (git-ignored)
```

### Running the UI

```bash
# Development
npm run dev

# Build for staging
npm run build:staging

# Build for production
npm run build:prod

# Preview staging build
npm run preview:staging
```

### Key Configuration Differences

| Setting | Development | Staging | Production |
|---------|-------------|---------|------------|
| BFF Base URL | http://localhost:3000 | https://staging-api.example.com | (relative) |
| Debug Mode | Enabled | Disabled | Disabled |
| Verbose Logging | Yes | No | No |
| Dev Tools | Enabled | Disabled | Disabled |
| Version Info | Shown | Shown | Hidden |

### Using Config in Components

```javascript
import { config, BFF_BASE_URL, CACHE_CONFIG } from './config';

// Check environment
if (config.isDevelopment) {
  console.log('Running in development mode');
}

// Use config values
const apiUrl = `${BFF_BASE_URL}/api/endpoint`;
const ttl = CACHE_CONFIG.geocodeTtlDays;
```

## Environment Variables Reference

### BFF Required Variables

```bash
PORT=3000                    # Server port
ASTRO_API_URL=https://...    # Astrology provider URL
ASTRO_API_KEY=xxx            # Astrology API key
```

### BFF Optional Variables

```bash
GEOCODE_MAPS_KEY=xxx         # Geocoding API key
NODE_ENV=development         # Environment (development|staging|production)
LOG_LEVEL=info               # Logging level (debug|info|warn|error)

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
STRICT_RATE_LIMIT_WINDOW_MS=60000
STRICT_RATE_LIMIT_MAX_REQUESTS=20

# Caching & retry
GEOCODE_CACHE_TTL=86400      # Geocode cache TTL (seconds)
GEOCODE_RETRIES=3            # Retry attempts for geocoding
GEOCODE_BASE_DELAY_MS=400    # Retry base delay
GEOCODE_MAX_DELAY_MS=5000    # Max retry delay

# Server behavior
SHUTDOWN_TIMEOUT_MS=10000    # Graceful shutdown timeout
COMPRESSION_LEVEL=6          # Compression level (0-9)
```

### UI Variables (Vite)

All UI environment variables must be prefixed with `VITE_`:

```bash
VITE_APP_VERSION=0.1.0
VITE_BFF_BASE_URL=http://localhost:3000
VITE_N8N_WEBHOOK_URL=https://...
VITE_DEBUG_MODE=true
VITE_VERBOSE_LOGGING=true
```

## Deployment Checklist

### Staging Deployment

1. ✅ Set `NODE_ENV=staging`
2. ✅ Update CORS origins in `be/bff/config/staging.js`
3. ✅ Update BFF_BASE_URL in `ui/.env.staging`
4. ✅ Build UI: `npm run build:staging`
5. ✅ Start BFF: `npm run start:staging`

### Production Deployment

1. ✅ Set `NODE_ENV=production`
2. ✅ Update CORS origins in `be/bff/config/production.js`
3. ✅ Update webhook URL in `ui/.env.production`
4. ✅ Build UI: `npm run build:prod`
5. ✅ Start BFF: `npm run start:prod`
6. ✅ Verify debug endpoints are disabled (webhook, probe)
7. ✅ Verify rate limits are enforced
8. ✅ Check logs are in JSON format (not pretty-printed)

## Security Best Practices

### BFF

- ✅ Never commit `.env` files
- ✅ Use strict CORS origins in production (no wildcards)
- ✅ Disable debug endpoints in production via feature flags
- ✅ Use environment variables for all secrets
- ✅ Enable rate limiting in all environments
- ✅ Use JSON logs in production for aggregation

### UI

- ✅ Never commit `.env.local`
- ✅ Use relative URLs for same-origin API calls in production
- ✅ Disable debug mode and dev tools in production
- ✅ Verify sensitive config values are not exposed in build output

## Troubleshooting

### BFF won't start

- Check `NODE_ENV` is set correctly
- Verify required environment variables are present
- Check config file syntax (`be/bff/config/*.js`)
- Review startup logs for validation errors

### UI shows wrong API endpoints

- Verify `.env.*` file matches build mode
- Check `import.meta.env.MODE` in browser console
- Ensure `VITE_` prefix on all environment variables
- Rebuild after changing environment files

### Feature flags not working

- BFF: Check `config.features.*` values in correct environment file
- UI: Check `config.features.*` in `ui/src/config/index.js`
- Verify environment is detected correctly (`config.env`)

## Additional Resources

- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [Node.js Environment Variables](https://nodejs.org/api/process.html#process_process_env)
