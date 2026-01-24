const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load env from repo root .env by default (skip in tests to avoid overriding Jest's NODE_ENV)
if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

// =============================================================================
// Docker Secrets Support - Must run BEFORE any module that validates auth config
// =============================================================================
// Read secrets from _FILE env vars (Docker secrets pattern) and set the actual
// env vars so that downstream modules can use them.
function loadSecretFromFile(envVar, fileEnvVar) {
  const filePath = process.env[fileEnvVar];
  if (filePath && fs.existsSync(filePath)) {
    try {
      const value = fs.readFileSync(filePath, 'utf8').trim();
      process.env[envVar] = value;
      console.log(`[secrets] Loaded ${envVar} from ${fileEnvVar}`);
    } catch (e) {
      console.error(`[secrets] Failed to read ${fileEnvVar}:`, e.message);
    }
  }
}

// Load all secrets before importing modules that validate them
loadSecretFromFile('ACCESS_TOKEN_SECRET', 'ACCESS_TOKEN_SECRET_FILE');
loadSecretFromFile('JWT_SECRET', 'JWT_SECRET_FILE');

// =============================================================================
// Now safe to import modules that validate auth config
// =============================================================================
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { Pool } = require('pg');

// Use repository-relative commons to ensure consistent requires inside container
const commons = require('@niyati/commons');
const { logger, attachResponseHelpers, sanitize, createTelemetryRouter } = commons;

// import the auth router from local copy
const authRouter = require('../lib/auth');
const usersRouter = require('../lib/users');
const internalRouter = require('../lib/internal');

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

app.use(helmet());
// Configure CORS to allow specific origins and credentials for cross-site tunnels (ngrok)
const allowedOrigins = (process.env.CORS_ALLOWED || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    // Allow non-browser or same-origin requests (no origin)
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0) return cb(null, true);
    return allowedOrigins.includes(origin) ? cb(null, true) : cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(compression());
app.use(require('cookie-parser')());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Attach response helpers and logger from commons (defensive wrapper in case of partial export)
app.use((req, res, next) => {
  if (typeof attachResponseHelpers === 'function') return attachResponseHelpers(req, res, next);
  return next();
});

// Fail-fast environment validation
try {
  // validateEnv is intentionally required from commons to validate early
  const { validateEnv } = require('@niyati/commons/lib/validateEnv');
  validateEnv({ service: 'bff-auth' });
} catch (e) {
  // If validation fails, log and rethrow to stop startup
  console.error('Environment validation failed during bootstrap:', e && e.message);
  throw e;
}

// Database initialization
if (process.env.DATABASE_URL) {
  let connectionString = process.env.DATABASE_URL;

  // Handle Docker Secret for password (prod)
  if (process.env.POSTGRES_PASSWORD_FILE && fs.existsSync(process.env.POSTGRES_PASSWORD_FILE)) {
    try {
      const password = fs.readFileSync(process.env.POSTGRES_PASSWORD_FILE, 'utf8').trim();
      const dbUrl = new URL(connectionString);
      dbUrl.password = password;
      connectionString = dbUrl.toString();
      logger.info({ msg: 'Using database password from secret file' });
    } catch (e) {
      logger.warn({ msg: 'Failed to read POSTGRES_PASSWORD_FILE', err: e });
    }
  }

  const pool = new Pool({
    connectionString: connectionString,
    max: 20, // Maximum pool size
    idleTimeoutMillis: 30000, // Close idle clients after 30s
    connectionTimeoutMillis: 10000, // Return error after 10s if connection cannot be established
  });

  pool.on('error', (err, client) => {
    logger.error({ msg: 'Unexpected error on idle client', err: err?.message || err });
    // Don't exit immediately, log and let the app attempt recovery
  });

  // Verify connection on startup when running as main process (avoid network calls at import time during tests)
  if (process.env.NODE_ENV !== 'test' && require.main === module) {
    pool.query('SELECT 1').then(() => {
      logger.info({ msg: 'Database pool initialized and verified' });
    }).catch((err) => {
      logger.error({ msg: 'Failed to verify database connection', err: err?.message || err });
      process.exit(1);
    });
  }

  app.set('db', pool);
} else {
  logger.warn({ msg: 'DATABASE_URL not set, DB features disabled' });
}

// Mount auth and telemetry routes
const API_VERSION = process.env.API_VERSION || 'v1';
const apiRouter = express.Router();

// Initialize telemetry router with service-specific config
const telemetryRouter = createTelemetryRouter({
  serviceName: 'bff-auth',
  packageJsonPath: '../package.json'
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/internal', internalRouter);
apiRouter.use('/telemetry', telemetryRouter);
app.use(`/api/${API_VERSION}`, apiRouter);

app.get('/', (req, res) => res.sendSuccess({ service: 'bff-auth', version: API_VERSION }));

// Health endpoint
app.get('/api/v1/telemetry/health', (req, res) => res.sendSuccess({ service: 'bff-auth' }));

// Register DB pool for centralized shutdown (helps tests/CI)
if (app.get('db') && commons && typeof commons.registerShutdown === 'function') {
  try { commons.registerShutdown(app.get('db')); } catch (e) { logger.warn({ msg: 'failed_registering_auth_pool', err: e && e.message }); }
}

// Wrap app.listen to auto-register servers for cleanup in tests
try {
  const _origListen = app.listen.bind(app);
  app.listen = (...args) => {
    const srv = _origListen(...args);
    if (commons && typeof commons.registerShutdown === 'function') {
      try { commons.registerShutdown(srv); } catch (e) { logger.warn({ msg: 'failed_registering_auth_server', err: e && e.message }); }
    }
    return srv;
  };
} catch (e) { }

// Start server only when running directly (not during tests or when required)
if (process.env.NODE_ENV !== 'test' && require.main === module) {
  const server = app.listen(PORT, () => {
    logger.info({ msg: `BFF Auth listening on http://localhost:${PORT}` });
  });

  // Graceful shutdown handler
  process.on('SIGTERM', async () => {
    logger.info({ msg: 'SIGTERM received, shutting down gracefully' });
    server.close(async () => {
      const db = app.get('db');
      if (db) {
        await db.end().catch(err => logger.error({ msg: 'Error closing DB pool', err }));
      }
      process.exit(0);
    });

    // Force shutdown after 30s
    setTimeout(() => {
      logger.error({ msg: 'Forced shutdown after timeout' });
      process.exit(1);
    }, 30000);
  });
}
