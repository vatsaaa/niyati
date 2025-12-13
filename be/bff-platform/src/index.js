const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Use shared commons from be/commons
const commons = require('../commons');
const { logger, attachResponseHelpers } = commons;

// Import platform routers from local copies
const geocodeRouter = require('../lib/geocode');
const astrologyRouter = require('../lib/astrology');
const telemetryRouter = require('../lib/telemetry');
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
app.use(cors());
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

const fs = require('fs');
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

  const pool = new Pool({ connectionString });
  pool.on('error', (err, client) => {
    logger.error({ msg: 'Unexpected error on idle client (bff-platform)', err });
    process.exit(-1);
  });
  app.set('db', pool);
  logger.info({ msg: 'BFF Platform database pool initialized' });
} else {
  logger.warn({ msg: 'DATABASE_URL not set for bff-platform, DB features disabled' });
}

  // Attach response helpers and logger from commons
    app.use(attachResponseHelpers);

  // Also expose ErrorCodes for consistent error codes usage in this file
  const { ErrorCodes } = commons;

const API_VERSION = process.env.API_VERSION || 'v1';
const apiRouter = express.Router();
apiRouter.use('/geocode', geocodeRouter);
apiRouter.use('/astrology', astrologyRouter);
apiRouter.use('/telemetry', telemetryRouter);
// Users sync endpoint
const usersRouter = require('../lib/users');
apiRouter.use('/users', usersRouter);

// POST /api/v1/parse/date
// Expects JSON { text: string, ref?: ISODateString }
apiRouter.post('/parse/date', (req, res) => {
  const { text, ref } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.sendError(ErrorCodes.INVALID_INPUT, 'missing_or_invalid_text');
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

app.listen(PORT, () => {
  logger.info({ msg: `BFF Platform listening on http://localhost:${PORT}` });
});
