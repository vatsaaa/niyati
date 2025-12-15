const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const fs = require('fs');

// Load env from repo root .env by default
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Use specific commons utilities to avoid circular re-export imports
const { logger } = require('../commons/lib/logger');
const { attachResponseHelpers } = require('../commons/lib/responses');
const { sanitize } = require('../commons/lib/sanitize');

// import the auth router from local copy
const authRouter = require('../lib/auth');
const usersRouter = require('../lib/users');
const telemetryRouter = require('../lib/telemetry');

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(require('cookie-parser')());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Attach response helpers and logger from commons
app.use(attachResponseHelpers);

// Fail-fast environment validation
try {
  // validateEnv is intentionally required from lib to validate early
  const { validateEnv } = require('../lib/validateEnv');
  validateEnv();
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
  });
  pool.on('error', (err, client) => {
    logger.error({ msg: 'Unexpected error on idle client', err });
    process.exit(-1);
  });
  app.set('db', pool);
  logger.info({ msg: 'Database pool initialized' });
} else {
  logger.warn({ msg: 'DATABASE_URL not set, DB features disabled' });
}

// Mount auth and telemetry routes
const API_VERSION = process.env.API_VERSION || 'v1';
const apiRouter = express.Router();
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/telemetry', telemetryRouter);
app.use(`/api/${API_VERSION}`, apiRouter);

app.get('/', (req, res) => res.json({ status: 'ok', service: 'bff-auth', version: API_VERSION }));

// Health endpoint
app.get('/api/v1/telemetry/health', (req, res) => res.json({ status: 'ok', service: 'bff-auth' }));

app.listen(PORT, () => {
  logger.info({ msg: `BFF Auth listening on http://localhost:${PORT}` });
});
