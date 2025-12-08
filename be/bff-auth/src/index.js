const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const dotenv = require('dotenv');

// Load env from repo root .env by default
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Use shared commons from be/commons
const commons = require('../commons');
const { logger, sanitize, attachResponseHelpers } = commons;

// import the auth router from local copy
const authRouter = require('../lib/auth');
const telemetryRouter = require('../lib/telemetry');

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Attach response helpers and logger from commons
app.use(attachResponseHelpers);

// Mount auth and telemetry routes
const API_VERSION = process.env.API_VERSION || 'v1';
const apiRouter = express.Router();
apiRouter.use('/auth', authRouter);
apiRouter.use('/telemetry', telemetryRouter);
app.use(`/api/${API_VERSION}`, apiRouter);

app.get('/', (req, res) => res.json({ status: 'ok', service: 'bff-auth', version: API_VERSION }));

// Health endpoint
app.get('/api/v1/telemetry/health', (req, res) => res.json({ status: 'ok', service: 'bff-auth' }));

app.listen(PORT, () => {
  logger.info({ msg: `BFF Auth listening on http://localhost:${PORT}` });
});
