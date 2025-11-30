const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const geocodeRouter = require('./routes/geocode');
const astrologyRouter = require('./routes/astrology');
const telemetryRouter = require('./routes/telemetry');
const { logger, reqIdFromReq } = require('./lib/logger');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(bodyParser.json({ limit: '500kb' }));
app.use(bodyParser.urlencoded({ extended: false }));

// Request ID middleware: honor incoming `x-request-id` or generate one,
// attach to `req._niyati_reqId`, echo it back in the response headers,
// and log a single incoming_request line for easy correlation.
app.use((req, res, next) => {
  try {
    const incoming = req.headers['x-request-id'] || req.headers['x-correlation-id'] || reqIdFromReq(req);
    const reqId = incoming || `niyati-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    req._niyati_reqId = reqId;
    // Echo back for clients / downstream correlators
    res.setHeader('x-request-id', reqId);
    logger.info({ msg: 'incoming_request', method: req.method, path: req.originalUrl || req.url, reqId });
  } catch (e) {
    // best-effort logging; don't block the request
  }
  return next();
});

// API routes
app.use('/api/geocode', geocodeRouter);
app.use('/api/astrology', astrologyRouter);
app.use('/api/telemetry', telemetryRouter);

app.get('/', (req, res) => res.json({ status: 'ok', msg: 'Niyati BFF running' }));

app.listen(PORT, () => {
  logger.info({ msg: `Niyati BFF listening on http://localhost:${PORT}`, port: PORT });
});
