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

app.use(`/api/${API_VERSION}`, apiRouter);

app.get('/', (req, res) => res.json({ status: 'ok', service: 'bff-platform', version: API_VERSION }));
app.get('/api/v1/telemetry/health', (req, res) => res.json({ status: 'ok', service: 'bff-platform' }));

app.listen(PORT, () => {
  logger.info({ msg: `BFF Platform listening on http://localhost:${PORT}` });
});
