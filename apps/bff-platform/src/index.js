const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const dotenv = require('dotenv');
const fs = require('fs');

// Load .env only for non-test environments to avoid overriding Jest's NODE_ENV
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
loadSecretFromFile('SERVICE_TOKEN', 'SERVICE_TOKEN_FILE');

// =============================================================================
// Now safe to import modules that validate auth config
// =============================================================================

// Use shared commons from the `@niyati/commons` package
const commons = require('@niyati/commons');
const { logger, attachResponseHelpers, createTelemetryRouter } = commons;

// Import platform routers from local copies
const geocodeRouter = require('../lib/geocode');
const astrologyRouter = require('../lib/astrology');
// chrono-node for server-side natural language date parsing
let chrono;
try {
  chrono = require('chrono-node');
} catch (e) {
  // If chrono isn't installed, route will return an informative error.
  chrono = null;
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(helmet());
// Configure CORS to allow specific origins and credentials for cross-site tunnels (ngrok)
const allowedOrigins = (process.env.CORS_ALLOWED || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0) return cb(null, true);
    return allowedOrigins.includes(origin) ? cb(null, true) : cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

const { Pool } = require('pg');

// Database initialization (optional)
if (process.env.DATABASE_URL) {
  let connectionString = process.env.DATABASE_URL;
  if (process.env.POSTGRES_PASSWORD_FILE && fs.existsSync(process.env.POSTGRES_PASSWORD_FILE)) {
    try {
      const password = fs.readFileSync(process.env.POSTGRES_PASSWORD_FILE, 'utf8').trim();
      const dbUrl = new URL(connectionString);
      dbUrl.password = password;
      connectionString = dbUrl.toString();
      logger.info({ msg: 'Using database password from secret file (bff-platform)' });
    } catch (e) {
      logger.warn({ msg: 'Failed to read POSTGRES_PASSWORD_FILE for bff-platform', err: e });
    }
  }

  const pool = new Pool({
    connectionString,
    max: 20, // Maximum pool size
    idleTimeoutMillis: 30000, // Close idle clients after 30s
    connectionTimeoutMillis: 10000, // Return error after 10s if connection cannot be established
  });

  pool.on('error', (err, client) => {
    logger.error({ msg: 'Unexpected error on idle client (bff-platform)', err: err?.message || err });
    // Don't exit immediately, log and let the app attempt recovery
  });

  // Verify connection on startup when this module is the main process.
  // Avoid running a networked verification during tests (module import time)
  if (process.env.NODE_ENV !== 'test' && require.main === module) {
    pool.query('SELECT 1').then(() => {
      logger.info({ msg: 'BFF Platform database pool initialized and verified' });
    }).catch((err) => {
      logger.error({ msg: 'Failed to verify database connection', err: err?.message || err });
      process.exit(1);
    });
  }

  app.set('db', pool);
  // Register DB pool for centralized shutdown to help tests/CI exit cleanly
  if (commons && typeof commons.registerShutdown === 'function') {
    try { commons.registerShutdown(pool); } catch (e) { logger.warn({ msg: 'failed_registering_pool_for_shutdown', err: e && e.message }); }
  }
} else {
  logger.warn({ msg: 'DATABASE_URL not set for bff-platform, DB features disabled' });
}

// Attach response helpers and logger from commons
app.use(attachResponseHelpers);
// Fail-fast environment validation (bff-platform)
// Only run during real process startup (not when required by tests or other modules)
if (process.env.NODE_ENV !== 'test' && require.main === module) {
  try {
    const { validateEnv } = require('@niyati/commons/lib/validateEnv');
    validateEnv({ service: 'bff-platform' });
  } catch (e) {
    console.error('Environment validation failed during bootstrap (bff-platform):', e && e.message);
    throw e;
  }
}

// Also expose ErrorCodes for consistent error codes usage in this file
const { ErrorCodes } = commons;

// Initialize telemetry router with service-specific config
const telemetryRouter = createTelemetryRouter({
  serviceName: 'bff-platform',
  packageJsonPath: '../package.json'
});

// Rate limiters for platform routes (skip in test environment to avoid flaky tests)
let chatLimiter, paymentSubmitLimiter, identifyLimiter, generalLimiter;
if (process.env.NODE_ENV !== 'test') {
  ({ chatLimiter, paymentSubmitLimiter, identifyLimiter, generalLimiter } = require('../lib/rateLimiters'));
}
const noop = (req, res, next) => next();

const API_VERSION = process.env.API_VERSION || 'v1';
const apiRouter = express.Router();
// Apply general rate limiter to all API routes (safety net)
if (generalLimiter) apiRouter.use(generalLimiter);
// Note: authentication is applied selectively to routes that require it.
// We will apply `authenticateOrReject` to the POST /api/v1/chat handler below
// so that lightweight public endpoints like `/api/v1/chat/classify` remain
// accessible without authentication.
apiRouter.use('/geocode', geocodeRouter);
apiRouter.use('/astrology', astrologyRouter);
apiRouter.use('/telemetry', telemetryRouter);
// Users sync endpoint
const usersRouter = require('../lib/users');
apiRouter.use('/users', usersRouter);

// Payment routes
const paymentsRouter = require('../lib/payments');
apiRouter.use('/payments', paymentsRouter);

// Chat history routes (message save + history retrieval)
const chatHistoryRouter = require('../lib/chatHistory');
apiRouter.use('/chat', chatHistoryRouter);

// Profile extraction endpoint (NLP-based field extraction)
const profileRouter = require('../lib/profileExtractor');
apiRouter.use('/profile', profileRouter);

// Import query classifier for billing classification and chat routes
const { getQueryCreditCost, getQueryType, isCasualConversation, getSubIntent } = require('../lib/nlpClassifier');
const chatRouter = require('../lib/chat');
const { computeAstroMetadata } = require('../lib/astrology');

// Mount chat router (authentication middleware applied earlier for /chat)
apiRouter.use('/chat', chatRouter);

// POST /api/v1/chat
// Acts as a lightweight BFF: normalizes metadata, computes derived fields (age, ageConfirmed),
// persists minimal authoritative state to users table (if DB available), and forwards
// a canonical payload to n8n. Returns canonical response to UI.
// Apply authenticateOrReject only to this route when available
// Apply chat rate limiter to POST /chat
const chatAuthMiddleware = (commons && commons.authenticateOrReject) ? commons.authenticateOrReject : (req, res, next) => next();
apiRouter.post('/chat', chatLimiter || noop, chatAuthMiddleware, async (req, res) => {
  try {
    const body = req.body || {};
    const message = (body.message || '').toString();
    const sessionId = (body.sessionId || '').toString();
    const metadata = (body.metadata && typeof body.metadata === 'object') ? body.metadata : {};

    if (!message) return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_message');
    if (!sessionId) return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_sessionId');

    // Structured user metadata is expected under metadata.user
    const mdUser = (metadata.user && typeof metadata.user === 'object') ? metadata.user : {};

    // Normalize birthDate to ISO YYYY-MM-DD if present
    let normalizedDob = null;
    if (mdUser.birthDate) {
      try {
        let d = new Date(mdUser.birthDate);
        if (isNaN(d.getTime()) && chrono && typeof chrono.parseDate === 'function') {
          d = chrono.parseDate(mdUser.birthDate);
        }
        if (d && !isNaN(d.getTime())) normalizedDob = d.toISOString().slice(0, 10);
      } catch (e) {
        // ignore - leave normalizedDob null
      }
    }

    // Normalize timeOfBirth to hh:mm (from metadata.user.timeOfBirth)
    let normalizedTob = mdUser.timeOfBirth || null;
    if (normalizedTob && typeof normalizedTob === 'string') {
      const m = normalizedTob.match(/(\d{1,2}:\d{2})/);
      if (m) normalizedTob = m[1];
    }

    const userName = mdUser.name || mdUser.userName || null;

    // Compute age (years) if dob known
    let age = null;
    if (normalizedDob) {
      const dobDate = new Date(normalizedDob + 'T00:00:00Z');
      const now = new Date();
      let years = now.getUTCFullYear() - dobDate.getUTCFullYear();
      const m = now.getUTCMonth() - dobDate.getUTCMonth();
      if (m < 0 || (m === 0 && now.getUTCDate() < dobDate.getUTCDate())) years--;
      age = years;
    }

    // Minor protection: block if age < 18
    if (age !== null && age < 18) {
      const canonical = {
        message: message,
        sessionId: sessionId,
        metadata: {
          user: {
            name: userName,
            birthDate: normalizedDob || null,
            age: age
          },
          reqId: metadata.reqId || null,
          source: 'bff-platform',
          isSystemContext: false,
          credits: metadata.credits || null,
          isPaid: !!metadata.isPaid
        }
      };
      logger.warn({ msg: 'blocking_minor', phone: sessionId, age });
      return res.sendSuccess({
        blockedMinor: true,
        message: 'Sorry, Niyati is available only for users 18 years and older. Since you are under 18, we cannot proceed.',
        canonical
      });
    }

    // Decide ageConfirmed: hint from client but validate server-side
    let ageConfirmed = false;
    if (typeof mdUser.ageConfirmed !== 'undefined') {
      ageConfirmed = !!mdUser.ageConfirmed; // treat as hint
    }
    // auto-confirm if timeOfBirth provided (higher confidence) - controlled by feature flag
    const autoConfirmAgeFlag = commons && commons.config && typeof commons.config.get === 'function'
      ? commons.config.get('features.chat.autoConfirmAge', 'FEATURE_CHAT_AUTO_CONFIRM_AGE', false)
      : false;
    if (!ageConfirmed && normalizedTob && autoConfirmAgeFlag) ageConfirmed = true;

    // Decide isSystemContext server-side (treat client-provided as hint)
    let isSystemContext = !!metadata.isSystemContext || !!mdUser.isSystemContext;
    if (!isSystemContext && typeof message === 'string' && message.startsWith('[SYSTEM')) isSystemContext = true;

    // Persist minimal authoritative state to users table if DB available
    const db = req.app.get('db');
    if (db) {
      try {
        const upsertSql = `
          INSERT INTO users (phone_number, name, date_of_birth, time_of_birth, place_of_birth, last_login_location, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6, now(), now())
          ON CONFLICT (phone_number) DO UPDATE SET
            name = COALESCE(EXCLUDED.name, users.name),
            date_of_birth = COALESCE(EXCLUDED.date_of_birth, users.date_of_birth),
            time_of_birth = COALESCE(EXCLUDED.time_of_birth, users.time_of_birth),
            place_of_birth = COALESCE(EXCLUDED.place_of_birth, users.place_of_birth),
            last_login_location = COALESCE(EXCLUDED.last_login_location, users.last_login_location),
            updated_at = now()
          RETURNING id, phone_number, name, date_of_birth, time_of_birth, place_of_birth, credits, total_paid_amount
        `;
        const params = [sessionId, userName || null, normalizedDob, normalizedTob, mdUser.placeOfBirth || null, mdUser.location || null];
        await db.query(upsertSql, params);
        logger.info({ msg: 'user_sync_from_chat', phone: sessionId, dob: normalizedDob, age, ageConfirmed });
      } catch (e) {
        logger.warn({ msg: 'user_sync_failed', err: e && e.message });
      }
    }

    // Build canonical payload for n8n using structured metadata.user
    // Enrich with astrological metadata when birth details are available
    let astroMeta = { sunSign: null, moonSign: null, ascendant: null, currentDasha: null };
    if (normalizedDob && mdUser.placeOfBirth) {
      try {
        astroMeta = await computeAstroMetadata({
          birthDate: normalizedDob,
          timeOfBirth: normalizedTob,
          lat: mdUser.placeOfBirth?.lat || mdUser.placeOfBirth?.latitude || mdUser.lat,
          lon: mdUser.placeOfBirth?.lng || mdUser.placeOfBirth?.lon || mdUser.placeOfBirth?.longitude || mdUser.lon,
          name: userName
        });
      } catch (e) {
        logger.warn({ msg: 'astro_metadata_failed', err: e && e.message });
      }
    }

    const canonical = {
      message: message,
      sessionId: sessionId,
      metadata: {
        user: {
          id: mdUser.id || null,
          name: userName,
          phoneNumber: mdUser.phoneNumber || null,
          birthDate: normalizedDob || null,
          timeOfBirth: normalizedTob || mdUser.timeOfBirth || mdUser.time_of_birth || null,
          placeOfBirth: mdUser.placeOfBirth || mdUser.place_of_birth || mdUser.pob || null,
          age: age,
          isAdult: (age !== null) ? (age >= 18) : null,
          gender: mdUser.gender || null,
          locale: mdUser.locale || null,
          timezone: mdUser.timezone || null,
          location: mdUser.location || null,
          preferences: mdUser.preferences || null,
          astrology: astroMeta
        },
        session: {
          id: sessionId,
          startedAt: new Date().toISOString()
        },
        reqId: metadata.reqId || null,
        source: 'bff-platform',
        isSystemContext: isSystemContext,
        credits: metadata.credits || null,
        isPaid: !!metadata.isPaid
      }
    };

    // Log parsed DOB/age and isSystemContext for observability/audit
    try { logger.info({ msg: 'chat_normalized', phone: sessionId, dob: canonical.metadata.user.birthDate, age: canonical.metadata.user.age, ageConfirmed: ageConfirmed, isSystemContext: canonical.metadata.isSystemContext, autoConfirmFlag: !!autoConfirmAgeFlag }); } catch (e) { }

    // Forward canonical payload to n8n (if configured)
    const n8nUrl = commons && commons.config && commons.config.n8n && commons.config.n8n.webhookUrl ? commons.config.n8n.webhookUrl : '';
    let n8nResp = null;
    if (n8nUrl) {
      try {
        const axios = require('axios');
        const headers = { 'Content-Type': 'application/json' };
        if (commons && commons.config && commons.config.n8n && commons.config.n8n.token) {
          headers['Authorization'] = `Bearer ${commons.config.n8n.token}`;
        }
        const resp = await axios.post(n8nUrl, canonical, { headers, timeout: 25000 });
        n8nResp = resp && resp.data ? resp.data : null;
      } catch (e) {
        logger.warn({ msg: 'failed_forward_to_n8n', err: e && e.message });
      }
    }

    return res.sendSuccess({ forwardedToN8n: !!n8nResp, n8nResponse: n8nResp, canonical });
  } catch (err) {
    logger.error({ msg: 'chat_bff_error', err: err && err.stack ? err.stack : err });
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'chat_bff_failed');
  }
});

// POST /api/v1/parse/date
// Expects JSON { text: string, ref?: ISODateString }
apiRouter.post('/parse/date', (req, res) => {
  const { text, ref } = req.body || {};

  // Enhanced input validation
  if (!text || typeof text !== 'string') {
    return res.sendError(ErrorCodes.INVALID_INPUT, 'missing_or_invalid_text');
  }
  if (text.length > 500) {
    return res.sendError(ErrorCodes.INVALID_INPUT, 'text_too_long', { maxLength: 500 });
  }
  if (ref && typeof ref !== 'string') {
    return res.sendError(ErrorCodes.INVALID_INPUT, 'invalid_reference_date');
  }

  if (!chrono) {
    return res.sendError(ErrorCodes.SERVICE_UNAVAILABLE, 'chrono_not_available');
  }

  try {
    const referenceDate = ref ? new Date(ref) : new Date();
    const results = chrono.parse(text, referenceDate);
    const parsed = results.map((r) => ({
      text: r.text,
      index: r.index,
      start: r.start ? r.start.date().toISOString() : null,
      end: r.end ? r.end.date().toISOString() : null,
      impliedValues: r.start ? (r.start.getImpliedComponents ? r.start.getImpliedComponents() : null) : null,
      tags: r.tags || {}
    }));

    return res.sendSuccess(parsed);
  } catch (err) {
    logger.error({ msg: 'parse_error', err: err && err.stack ? err.stack : err });
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'parse_failed', { details: err && err.message });
  }
});

app.use(`/api/${API_VERSION}`, apiRouter);

app.get('/', (req, res) => res.sendSuccess({ service: 'bff-platform', version: API_VERSION }));
app.get('/api/v1/telemetry/health', (req, res) => res.sendSuccess({ service: 'bff-platform' }));

// Centralized error handler: avoid leaking internals and return structured errors
app.use((err, req, res, next) => {
  try {
    const safeMessage = err && err.message ? err.message : 'internal_error';
    const code = (err && err.code) || (commons && commons.ErrorCodes && commons.ErrorCodes.INTERNAL_SERVER_ERROR) || 'internal_error';
    const status = (err && err.status) || 500;
    try { logger.error({ msg: 'unhandled_error', err: err && err.stack ? err.stack : err }); } catch (e) { console.error('unhandled_error', err); }
    if (res && res.sendError) return res.sendError(code, safeMessage);
    return res.status(status).json({ success: false, error: { code, message: safeMessage } });
  } catch (e) {
    console.error('Error in global error handler', e);
    return res.status(500).json({ success: false, error: { code: 'internal_error', message: 'internal_error' } });
  }
});

// Start server only when running this file directly (not when required by tests)
if (process.env.NODE_ENV !== 'test' && require.main === module) {
  const server = app.listen(PORT, () => {
    logger.info({ msg: `BFF Platform listening on http://localhost:${PORT}` });
  });

  // Graceful shutdown handler
  process.on('SIGTERM', async () => {
    logger.info({ msg: 'SIGTERM received, shutting down BFF Platform gracefully' });
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

// Wrap `app.listen` so tests that start servers via `app.listen()` get the server
// automatically registered for shutdown. This avoids leaking handles when tests forget to close.
try {
  const _originalListen = app.listen.bind(app);
  app.listen = (...args) => {
    const srv = _originalListen(...args);
    if (commons && typeof commons.registerShutdown === 'function') {
      try { commons.registerShutdown(srv); } catch (e) { logger.warn({ msg: 'failed_registering_server_for_shutdown', err: e && e.message }); }
    }
    return srv;
  };
} catch (e) {
  // ignore
}

// Export app for tests
module.exports = app;
