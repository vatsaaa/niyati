require('dotenv').config();
const express = require('express');
const axios = require('axios');
const morgan = require('morgan');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

const PORT = process.env.PORT || 3003;
const REQUEST_TIMEOUT_MS = () => parseInt(process.env.BFF_REQUEST_TIMEOUT_MS || '60000', 10);


// Configure optional CORS origins for the health endpoint.
// Set HEALTH_CORS_ORIGINS to a comma-separated list of allowed origins (e.g. "https://app.example.com")
const healthCorsOrigins = process.env.HEALTH_CORS_ORIGINS;
let healthCors = null;
if (healthCorsOrigins) {
  const raw = healthCorsOrigins.trim();
  // Allow wildcard permissive origin when explicitly set to '*' or 'ALL'
  if (raw === '*' || raw.toUpperCase() === 'ALL') {
    healthCors = cors({ origin: true, methods: ['GET'], allowedHeaders: ['Content-Type'] });
  } else {
    const origins = healthCorsOrigins.split(',').map(s => s.trim()).filter(Boolean);
    healthCors = cors({
      origin: function(origin, callback) {
        // Allow non-browser requests (no origin) and exact matches
        if (!origin) return callback(null, true);
        if (origins.indexOf(origin) !== -1) return callback(null, true);
        return callback(new Error('Not allowed by CORS'), false);
      },
      methods: ['GET'],
      allowedHeaders: ['Content-Type']
    });
  }
}

app.get('/health', healthCors || ((req, res, next) => next()), (req, res) => {
  const uptime = process.uptime();
  const supportsChat = true;
  const n8nConfigured = Boolean(process.env.N8N_WEBHOOK_URL);
  return res.json({
    status: 'ok',
    service: 'bff-pthru',
    version: process.env.npm_package_version || '0.0.0',
    supportsChat,
    n8nConfigured,
    uptimeSeconds: Math.floor(uptime),
    timestamp: new Date().toISOString()
  });
});

app.post('/api/v1/chat', async (req, res) => {
  const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
  const N8N_TOKEN = process.env.N8N_TOKEN;

  if (!N8N_WEBHOOK_URL) {
    return res.status(502).json({ error: 'n8n webhook not configured' });
  }

  const correlationId = req.headers['x-correlation-id'] || uuidv4();

  const headers = {
    'X-Correlation-ID': correlationId,
    'Content-Type': 'application/json'
  };
  if (req.headers.authorization) headers.authorization = req.headers.authorization;
  if (N8N_TOKEN) headers['X-N8N-TOKEN'] = N8N_TOKEN;

  try {
    const response = await axios.post(N8N_WEBHOOK_URL, req.body || {}, {
      headers,
      timeout: REQUEST_TIMEOUT_MS(),
      validateStatus: () => true
    });

    res.status(response.status).set('X-Correlation-ID', correlationId).json(response.data);
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'timeout', correlationId });
    }
    return res.status(502).json({ error: 'bad_gateway', message: err.message, correlationId });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`bff-pthru listening on ${PORT}`);
  });
}

module.exports = app;
