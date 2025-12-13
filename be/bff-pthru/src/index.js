require('dotenv').config();
const express = require('express');
const axios = require('axios');
const morgan = require('morgan');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { config, logger, attachResponseHelpers, ErrorCodes } = require('commons');

const app = express();
app.use(express.json({ limit: config.server.bodyLimit || '1mb' }));
// Attach standardized response helpers (res.sendError / res.sendSuccess)
app.use(attachResponseHelpers);
app.use(morgan('tiny'));

// Use centralized port configuration
const PORT = config.server.port;
const REQUEST_TIMEOUT_MS = () => config.get('bffPthru.requestTimeoutMs', 'BFF_REQUEST_TIMEOUT_MS', 60000);


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
  const n8nConfigured = Boolean(config.get('n8n.webhookUrl', 'N8N_WEBHOOK_URL', ''));
  return res.sendSuccess({
    service: 'bff-pthru',
    version: process.env.npm_package_version || '0.0.0',
    supportsChat,
    n8nConfigured,
    uptimeSeconds: Math.floor(uptime),
    timestamp: new Date().toISOString()
  });
});

app.post('/api/v1/chat', async (req, res) => {
  const N8N_WEBHOOK_URL = config.get('n8n.webhookUrl', 'N8N_WEBHOOK_URL', '');
  const N8N_TOKEN = config.get('n8n.token', 'N8N_TOKEN', '');

  if (!N8N_WEBHOOK_URL) {
    logger.error({ msg: 'n8n webhook not configured' });
    return res.sendError(ErrorCodes.PROVIDER_ERROR, 'n8n webhook not configured');
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

    // Propagate successful upstream responses via standardized success envelope.
    if (response.status >= 200 && response.status < 300) {
      return res.sendSuccess(response.data, { statusCode: response.status, reqId: correlationId });
    }

    // Non-2xx upstream responses become provider errors for clients.
    logger.warn({ msg: 'upstream_non200', status: response.status, reqId: correlationId });
    return res.sendError(ErrorCodes.PROVIDER_ERROR, 'upstream_error', { statusCode: response.status, details: response.data, reqId: correlationId });
  } catch (err) {
    if (err && err.code === 'ECONNABORTED') {
      return res.sendError(ErrorCodes.GATEWAY_TIMEOUT, 'timeout', { reqId: correlationId });
    }
    return res.sendError(ErrorCodes.PROVIDER_ERROR, 'bad_gateway', { details: err && err.message, reqId: correlationId, statusCode: 502 });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`bff-pthru listening on ${PORT}`);
  });
}

module.exports = app;
