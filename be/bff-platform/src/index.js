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

  // Attach response helpers and logger from commons
  app.use(attachResponseHelpers);

const API_VERSION = process.env.API_VERSION || 'v1';
const apiRouter = express.Router();
apiRouter.use('/geocode', geocodeRouter);
apiRouter.use('/astrology', astrologyRouter);
apiRouter.use('/telemetry', telemetryRouter);

// POST /api/v1/parse/date
// Expects JSON { text: string, ref?: ISODateString }
apiRouter.post('/parse/date', (req, res) => {
  const { text, ref } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ status: 'error', message: 'missing_or_invalid_text' });
  }

  if (!chrono) {
    return res.status(500).json({ status: 'error', message: 'chrono_not_available' });
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

    return res.json({ status: 'ok', data: parsed });
  } catch (err) {
    logger.error({ msg: 'parse_error', err: err && err.stack ? err.stack : err });
    return res.status(500).json({ status: 'error', message: 'parse_failed' });
  }
});

app.use(`/api/${API_VERSION}`, apiRouter);

app.get('/', (req, res) => res.json({ status: 'ok', service: 'bff-platform', version: API_VERSION }));
app.get('/api/v1/telemetry/health', (req, res) => res.json({ status: 'ok', service: 'bff-platform' }));

app.listen(PORT, () => {
  logger.info({ msg: `BFF Platform listening on http://localhost:${PORT}` });
});
